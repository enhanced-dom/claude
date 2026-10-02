// One-shot installer: ensures the `rtk` CLI (https://www.rtk-ai.app/) is
// installed, then delegates to its own `rtk init` to wire up the
// Claude Code hook + CLAUDE.md instructions. All flags are forwarded to
// `rtk init` unchanged (e.g. --global, --claude-md).
//
// This project keeps the RTK instructions out of CLAUDE.md entirely: instead
// of the inline block `rtk init` writes there, they live in a Claude Code
// Skill (.claude/skills/rtk/SKILL.md) that only loads into context when a
// dev command is actually being run, instead of on every session. `rtk init`
// doesn't know about Skills, so this script moves its inline block into the
// skill file after delegating, and skips re-running `rtk init` (which would
// re-inline the block into CLAUDE.md) once the skill already exists.

import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const hasCommand = (cmd: string) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error === undefined

const installRtkCli = () => {
  if (!hasCommand('brew')) {
    throw new Error(
      'rtk not found and Homebrew is not available to install it. Install it manually (see https://www.rtk-ai.app/) and re-run this command.',
    )
  }
  console.log('rtk not found, installing via Homebrew...')
  const result = spawnSync('brew', ['install', 'rtk'], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error('brew install rtk failed.')
  }
}

// Global CLAUDE.md already lives inside ~/.claude, so the skill sits right
// next to it there. Local CLAUDE.md lives at the project root, so its skill
// goes into the project's own .claude/ folder instead of littering the root.
const claudeMdPath = (isGlobal: boolean) =>
  isGlobal ? path.join(os.homedir(), '.claude', 'CLAUDE.md') : path.join(process.cwd(), 'CLAUDE.md')
const claudeSubdir = (isGlobal: boolean) => (isGlobal ? path.join(os.homedir(), '.claude') : path.join(process.cwd(), '.claude'))
const skillDir = (isGlobal: boolean) => path.join(claudeSubdir(isGlobal), 'skills', 'rtk')
const skillPath = (isGlobal: boolean) => path.join(skillDir(isGlobal), 'SKILL.md')

const SKILL_DESCRIPTION =
  'Token-optimized CLI proxy for dev commands (git, gh, build/test tooling, package managers, docker/kubectl, file search). USE WHEN running shell commands for git, builds, tests, linting, GitHub, Docker/Kubernetes, npm/pnpm, or file search/read/grep — prefix the command with `rtk` for 60-90% smaller output.'

const skillFrontmatter = () => `---
name: rtk
description: ${SKILL_DESCRIPTION}
allowed-tools:
  - Bash
---

`

// `rtk init` (and the old RTK.md) always ship a Golden Rule that assumes rtk
// is installed unconditionally. Ours checks first and falls back to the bare
// command. It also has to be known *before* Claude decides to run any dev
// command at all, so unlike the rest of the command reference it can't live
// in the skill (which only loads once such a command is already underway) —
// it stays in CLAUDE.md, always loaded, wrapped in its own markers so the
// rtk-instructions migration never touches it.
const RTK_RULE_START = '<!-- #region @enhanced-dom/claude - rtk -->'
const RTK_RULE_END = '<!-- #endregion @enhanced-dom/claude - rtk -->'

const RTK_RULE_HEADING = 'RTK usage (Golden Rule)'
const RTK_RULE_BLOCK = `${RTK_RULE_START}
## ${RTK_RULE_HEADING}

**Always prefix commands with \`rtk\` if it is installed, otherwise run the command directly.** If RTK has a dedicated filter, it uses it. If not, it passes through unchanged.

Check once per session whether RTK is available, before doing the first command you might otherwise do with rtk:
\`\`\`bash
command -v rtk &>/dev/null && echo "rtk available" || echo "rtk not installed — use commands directly"
\`\`\`

**Important**: Even in command chains with \`&&\`, use \`rtk\` when available:
\`\`\`bash
# ❌ Wrong (when rtk is installed)
git add . && git commit -m "msg" && git push

# ✅ Correct (when rtk is installed)
rtk git add . && rtk git commit -m "msg" && rtk git push

# ✅ Correct (when rtk is NOT installed)
git add . && git commit -m "msg" && git push
\`\`\`

**Important**: if an agent is spawned, it needs to be instructed to use \`rtk\`, if available

See the \`rtk\` skill for the full command reference, but load it only if you need to run a cli command.
${RTK_RULE_END}
`

// Drops whatever Golden Rule shipped in the block being migrated into the
// skill — the skill only carries the command reference now.
const stripRTKRule = (block: string) => {
  const heading = `## ${RTK_RULE_HEADING}\n`
  const start = block.indexOf(heading)
  if (start === -1) return block
  const end = block.indexOf('\n## ', start + heading.length)
  return block.slice(0, start) + (end === -1 ? '' : block.slice(end))
}

const ensureRTKRuleInClaudeMd = (isGlobal: boolean) => {
  const mdPath = claudeMdPath(isGlobal)
  const contents = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
  if (contents.includes(RTK_RULE_START)) return
  const separator = contents.trim().length > 0 ? '\n\n' : ''
  fs.writeFileSync(mdPath, contents.replace(/\n*$/, '') + separator + RTK_RULE_BLOCK)
}

const alreadySplit = (isGlobal: boolean) => fs.existsSync(skillPath(isGlobal))

// Pre-skill convention: CLAUDE.md imported a standalone RTK.md via `@RTK.md`
// / `@.claude/RTK.md`. Fold that file into the new skill and drop the import
// line so projects set up before Skills existed get upgraded in place.
const importLine = (isGlobal: boolean) => (isGlobal ? '@RTK.md' : '@.claude/RTK.md')

const migrateDefaultRTKSectionToSkill = (isGlobal: boolean) => {
  const oldRtkMdPath = path.join(claudeSubdir(isGlobal), 'RTK.md')
  if (!fs.existsSync(oldRtkMdPath) || alreadySplit(isGlobal)) return false

  const block = stripRTKRule(
    fs
      .readFileSync(oldRtkMdPath, 'utf8')
      .replace(/^<!-- rtk-instructions v2 -->\n/, '')
      .replace(/<!-- \/rtk-instructions -->\n?$/, ''),
  )
  fs.mkdirSync(skillDir(isGlobal), { recursive: true })
  fs.writeFileSync(skillPath(isGlobal), skillFrontmatter() + block)
  fs.unlinkSync(oldRtkMdPath)

  const mdPath = claudeMdPath(isGlobal)
  if (fs.existsSync(mdPath)) {
    const contents = fs.readFileSync(mdPath, 'utf8')
    const line = importLine(isGlobal)
    fs.writeFileSync(
      mdPath,
      contents
        .split('\n')
        .filter((l) => l.trim() !== line)
        .join('\n'),
    )
  }
  ensureRTKRuleInClaudeMd(isGlobal)
  return true
}

// `rtk init` always inlines its instructions block into CLAUDE.md; it has no
// flag to write a Skill instead. Move that block into .claude/skills/rtk/
// ourselves and strip it back out of CLAUDE.md so the skill loads on demand.
const BLOCK_START = '<!-- rtk-instructions v2 -->'
const BLOCK_END = '<!-- /rtk-instructions -->'

const moveInstructionsIntoSkill = (isGlobal: boolean) => {
  const mdPath = claudeMdPath(isGlobal)
  const contents = fs.readFileSync(mdPath, 'utf8')
  const start = contents.indexOf(BLOCK_START)
  const end = contents.indexOf(BLOCK_END)
  if (start === -1 || end === -1) return
  const block = stripRTKRule(contents.slice(start + BLOCK_START.length, end).replace(/^\n/, ''))
  fs.mkdirSync(skillDir(isGlobal), { recursive: true })
  fs.writeFileSync(skillPath(isGlobal), skillFrontmatter() + block)
  fs.writeFileSync(mdPath, contents.slice(0, start) + contents.slice(end + BLOCK_END.length))
  ensureRTKRuleInClaudeMd(isGlobal)
}

// rtk's own docs (docs/TELEMETRY.md) say the consent prompt is triggered by
// `rtk init` / `rtk telemetry enable`, and that this env var "blocks
// telemetry regardless of consent" — set on every rtk invocation below as a
// sequencing-independent guarantee, on top of `telemetry disable` itself.
const RTK_ENV = { ...process.env, RTK_TELEMETRY_DISABLED: '1' }

export const install = ({ global, force }: { global: boolean; force: boolean }) => {
  if (!hasCommand('rtk')) installRtkCli()

  // Opt out up front — telemetry is on by default (opt-out) upstream, and
  // rtk prompts for consent the first time it runs otherwise. Doing this
  // before `rtk init` below means that first run never asks.
  spawnSync('rtk', ['telemetry', 'disable'], { stdio: 'inherit', env: RTK_ENV })

  const isGlobal = global

  if (migrateDefaultRTKSectionToSkill(isGlobal)) {
    console.log(
      `Migrated RTK instructions into ${path.relative(process.cwd(), skillPath(isGlobal))} (loads on demand instead of every session).`,
    )
  }

  if (!force && alreadySplit(isGlobal)) {
    console.log('RTK skill already exists — skipping rtk init to avoid duplicating instructions.')
    console.log('Edit the SKILL.md directly, or re-run with --force to let rtk init manage it again.')
    return
  }

  // `rtk init -g` fails outright if ~/.claude doesn't exist yet.
  if (isGlobal) fs.mkdirSync(claudeSubdir(true), { recursive: true })

  const result = spawnSync('rtk', ['init', ...(isGlobal ? ['--global'] : [])], { stdio: 'inherit', env: RTK_ENV })
  if (result.status !== 0) throw new Error(`rtk init failed with status ${result.status}`)

  moveInstructionsIntoSkill(isGlobal)
}
