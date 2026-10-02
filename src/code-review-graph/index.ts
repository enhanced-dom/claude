// One-shot installer: wires up code-review-graph
// (https://github.com/tirth8205/code-review-graph) in the project this
// package is installed in:
// - creates a project-local .venv and installs uv into it (which provides
//   the `uvx` launcher)
// - adds .venv to .gitignore
// - runs code-review-graph's own `install` for Claude Code, which drops its
//   bundled skills/hooks under .claude/ and injects its rules
// - overwrites .mcp.json's code-review-graph entry with the venv's absolute
//   uvx path and this project's cwd, since `install` writes a bare command
//   name that MCP host processes (which don't always inherit the shell's
//   PATH) may fail to resolve
// - builds the project's code graph
//
// A project-local .venv (rather than a global pipx/pip install of
// code-review-graph itself) is used so the absolute uvx path above always
// resolves. uvx runs code-review-graph from its own cache, so it never
// needs a separate install/upgrade step.
//
// Like rtk, code-review-graph's own installer doesn't know about Skills — it
// always inlines its full tool reference into CLAUDE.md. This wrapper moves
// that block into a Skill (loads on demand) and replaces it with a short
// always-on pointer, so re-running `install` upstream can't bloat every
// session again.

import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const MCP_SERVER_NAME = 'code-review-graph'

const ROOT = process.cwd()
const VENV_DIR = path.join(ROOT, '.venv')
const VENV_BIN = path.join(VENV_DIR, process.platform === 'win32' ? 'Scripts' : 'bin')
const PIP = path.join(VENV_BIN, process.platform === 'win32' ? 'pip.exe' : 'pip')
const UVX = path.join(VENV_BIN, process.platform === 'win32' ? 'uvx.exe' : 'uvx')

const run = (cmd: string, args: string[]) => {
  console.log(`$ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed.`)
  }
}

const ensureVenv = (force: boolean) => {
  if (fs.existsSync(VENV_DIR)) {
    if (!force) {
      console.log('.venv already exists, skipping creation (use --force to recreate)')
      run(PIP, ['install', '--upgrade', 'pip'])
      run(PIP, ['install', 'uv'])
      return
    }
    console.log('.venv already exists, removing (--force)')
    // VENV_DIR may be a mount point (devcontainer gives it its own volume) —
    // rmSync-ing the dir itself fails with EBUSY there, so clear its
    // contents instead of the directory.
    for (const entry of fs.readdirSync(VENV_DIR)) {
      fs.rmSync(path.join(VENV_DIR, entry), { recursive: true, force: true })
    }
  }
  run('python3', ['-m', 'venv', VENV_DIR])
  run(PIP, ['install', '--upgrade', 'pip'])
  run(PIP, ['install', 'uv'])
}

const ensureGitignoreEntry = (entry: string) => {
  const gitignorePath = path.join(ROOT, '.gitignore')
  const contents = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : ''
  if (contents.split('\n').some((line) => line.trim() === entry)) return
  fs.writeFileSync(gitignorePath, contents.replace(/\n*$/, '\n') + `${entry}\n`)
  console.log(`Added "${entry}" to .gitignore`)
}

const ensureMcpConfig = () => {
  const mcpPath = path.join(ROOT, '.mcp.json')
  const mcp = fs.existsSync(mcpPath) ? JSON.parse(fs.readFileSync(mcpPath, 'utf8')) : {}
  mcp.mcpServers ??= {}
  mcp.mcpServers[MCP_SERVER_NAME] = {
    command: UVX,
    args: ['code-review-graph', 'serve'],
    cwd: ROOT,
    type: 'stdio',
  }
  fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n')
  console.log(`Updated ${mcpPath}`)
}

const CLAUDE_MD_PATH = path.join(ROOT, 'CLAUDE.md')
const SKILL_DIR = path.join(ROOT, '.claude', 'skills', 'code-review-graph')
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md')

const SKILL_DESCRIPTION =
  'Reference for the code-review-graph MCP tools — query_graph_tool, detect_changes_tool, get_review_context_tool, get_impact_radius_tool, get_affected_flows_tool, semantic_search_nodes_tool, get_architecture_overview_tool, refactor_tool. USE WHEN exploring code, tracing callers/callees/imports/tests, reviewing a change, or assessing impact — instead of Grep/Glob/Read.'

const skillFrontmatter = () => `---
name: code-review-graph
description: ${SKILL_DESCRIPTION}
---

`

const RULE_START = '<!-- #region @enhanced-dom/claude - code-review-graph -->'
const RULE_END = '<!-- #endregion @enhanced-dom/claude - code-review-graph -->'

const RULE_BLOCK = `${RULE_START}
## MCP Tools: code-review-graph

**This project has a knowledge graph. Start with the code-review-graph MCP tools to narrow scope before Grep/Glob/Read, then read the source.** The graph is cheaper than scanning files and gives you structural context (callers, dependents, test coverage) that file search cannot.

See the \`code-review-graph\` skill for the full tool reference, but load it only if you're actually exploring code, tracing dependencies, or reviewing a change. \`code-review-graph install\` also drops these task-specific skills — load whichever matches instead:
- \`explore-codebase\` — navigate and understand codebase structure using the graph
- \`debug-issue\` — systematically debug an issue via call chains and impact radius
- \`refactor-safely\` — plan and execute a refactor using dependency analysis
- \`review-changes\` — a structured code review using change detection and impact
${RULE_END}
`

const ensureRuleInClaudeMd = () => {
  const contents = fs.existsSync(CLAUDE_MD_PATH) ? fs.readFileSync(CLAUDE_MD_PATH, 'utf8') : ''
  if (contents.includes(RULE_START)) return
  const separator = contents.trim().length > 0 ? '\n\n' : ''
  fs.writeFileSync(CLAUDE_MD_PATH, contents.replace(/\n*$/, '') + separator + RULE_BLOCK)
}

// code-review-graph's own installer marks its block with these; drop
// everything between them into the skill and leave our short pointer instead.
const BLOCK_START = '<!-- code-review-graph MCP tools -->'
const BLOCK_END = '<!-- /code-review-graph MCP tools -->'

const moveInstructionsIntoSkill = () => {
  const contents = fs.existsSync(CLAUDE_MD_PATH) ? fs.readFileSync(CLAUDE_MD_PATH, 'utf8') : ''
  const start = contents.indexOf(BLOCK_START)
  const end = contents.indexOf(BLOCK_END)
  if (start === -1 || end === -1) return
  const block = contents.slice(start + BLOCK_START.length, end).replace(/^\n/, '')
  fs.mkdirSync(SKILL_DIR, { recursive: true })
  fs.writeFileSync(SKILL_PATH, skillFrontmatter() + block)
  fs.writeFileSync(CLAUDE_MD_PATH, contents.slice(0, start) + contents.slice(end + BLOCK_END.length))
  ensureRuleInClaudeMd()
  console.log(`Migrated code-review-graph instructions into ${path.relative(ROOT, SKILL_PATH)} (loads on demand instead of every session).`)
}

export const install = ({ force }: { global: boolean; force: boolean }) => {
  ensureVenv(force)
  ensureGitignoreEntry('.venv')
  // -y: auto-confirm the "inject instructions into CLAUDE.md?" prompt —
  // moveInstructionsIntoSkill() below immediately relocates whatever gets
  // injected into a Skill file anyway, so there's nothing to review here.
  run(UVX, ['code-review-graph', 'install', '--platform', 'claude-code', '-y'])
  ensureMcpConfig()
  run(UVX, ['code-review-graph', 'build'])
  moveInstructionsIntoSkill()

  console.log('\nDone. Restart Claude Code to pick up the code-review-graph MCP server.')
}
