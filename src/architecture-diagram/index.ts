// One-shot installer: drops the architecture-diagram Claude Code Skill
// (conventions for hand-authored SVG box+arrow diagrams, see
// ArchitectureDiagram.md shipped alongside this file by postbuild) into
// .claude/skills/, and points CLAUDE.md at it so it loads only when a
// diagram is actually being drawn instead of on every session.

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url))

const claudeMdPath = (isGlobal: boolean) =>
  isGlobal ? path.join(os.homedir(), '.claude', 'CLAUDE.md') : path.join(process.cwd(), 'CLAUDE.md')
const claudeSubdir = (isGlobal: boolean) => (isGlobal ? path.join(os.homedir(), '.claude') : path.join(process.cwd(), '.claude'))
const skillDir = (isGlobal: boolean) => path.join(claudeSubdir(isGlobal), 'skills', 'architecture-diagram')
const skillPath = (isGlobal: boolean) => path.join(skillDir(isGlobal), 'SKILL.md')

const SKILL_DESCRIPTION =
  'Conventions for hand-authored SVG architecture diagrams (grouped boxes + arrows) — structure, padding, color, and arrow routing/labeling. USE WHEN creating, editing, or reviewing an architecture diagram.'

const skillFrontmatter = () => `---
name: architecture-diagram
description: ${SKILL_DESCRIPTION}
---

`

const RULE_START = '<!-- #region @enhanced-dom/claude - architecure-diagram -->'
const RULE_END = '<!-- #endregion @enhanced-dom/claude - architecure-diagram -->'

const RULE_BLOCK = `${RULE_START}
## Architecture diagrams

**Whenever an architecture diagram is required** (creating, editing, or reviewing a hand-authored SVG box+arrow diagram), use the \`architecture-diagram\` skill for the conventions on structure, padding, color, and arrow routing.
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
    const body = fs.readFileSync(path.join(SOURCE_DIR, 'ArchitectureDiagram.md'), 'utf8')
    fs.writeFileSync(dest, skillFrontmatter() + body)
    console.log(`Wrote ${path.relative(process.cwd(), dest)}`)
  }

  ensureRuleInClaudeMd(isGlobal)
}
