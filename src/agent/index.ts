// One-shot installer: drops the agent Claude Code Skill (general agent
// collaboration conventions — task delegation, verbosity, work flow; see
// Agent.md shipped alongside this file by postbuild) into .claude/skills/,
// and points CLAUDE.md at it so it loads only when agent collaboration is
// actually relevant instead of on every session.

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url))

const claudeMdPath = (isGlobal: boolean) =>
  isGlobal ? path.join(os.homedir(), '.claude', 'CLAUDE.md') : path.join(process.cwd(), 'CLAUDE.md')
const claudeSubdir = (isGlobal: boolean) => (isGlobal ? path.join(os.homedir(), '.claude') : path.join(process.cwd(), '.claude'))
const skillDir = (isGlobal: boolean) => path.join(claudeSubdir(isGlobal), 'skills', 'agent')
const skillPath = (isGlobal: boolean) => path.join(skillDir(isGlobal), 'SKILL.md')

const SKILL_DESCRIPTION =
  'Conventions for general agent collaboration — delegating tasks to sub-agents, verbosity, and work flow (persisting plans, locating CLAUDE_CONFIG_DIR). USE WHEN delegating to sub-agents, deciding how verbose to be, or planning work.'

const skillFrontmatter = () => `---
name: agent
description: ${SKILL_DESCRIPTION}
---

`

const RULE_START = '<!-- #region @enhanced-dom/claude - agent -->'
const RULE_END = '<!-- #endregion @enhanced-dom/claude - agent -->'

const RULE_BLOCK = `${RULE_START}
## Agent collaboration

**Whenever delegating to sub-agents, deciding how verbose to be, or planning work**, use the \`agent\` skill for this project's conventions.
${RULE_END}
`

const ensureRuleInClaudeMd = (isGlobal: boolean) => {
  const mdPath = claudeMdPath(isGlobal)
  const contents = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
  if (contents.includes(RULE_START)) return
  const separator = contents.trim().length > 0 ? '\n\n' : ''
  fs.writeFileSync(mdPath, contents.replace(/\n*$/, '') + separator + RULE_BLOCK)
}

export const install = ({ global, force }: { global: boolean; force: boolean }) => {
  const isGlobal = global
  const dest = skillPath(isGlobal)
  if (fs.existsSync(dest) && !force) {
    console.log(`${path.relative(process.cwd(), dest)} already exists — skipping (use --force to overwrite).`)
  } else {
    fs.mkdirSync(skillDir(isGlobal), { recursive: true })
    const body = fs.readFileSync(path.join(SOURCE_DIR, 'Agent.md'), 'utf8')
    fs.writeFileSync(dest, skillFrontmatter() + body)
    console.log(`Wrote ${path.relative(process.cwd(), dest)}`)
  }

  ensureRuleInClaudeMd(isGlobal)
}
