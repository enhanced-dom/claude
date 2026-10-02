// One-shot installer: drops the react Claude Code Skill (best-practice
// conventions for React code — structure, styling, file layout, docs,
// testing; see React.md shipped alongside this file by postbuild) into
// .claude/skills/, and points CLAUDE.md at it so it loads only when React
// code is actually being written instead of on every session.

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url))

const claudeMdPath = (isGlobal: boolean) =>
  isGlobal ? path.join(os.homedir(), '.claude', 'CLAUDE.md') : path.join(process.cwd(), 'CLAUDE.md')
const claudeSubdir = (isGlobal: boolean) => (isGlobal ? path.join(os.homedir(), '.claude') : path.join(process.cwd(), '.claude'))
const skillDir = (isGlobal: boolean) => path.join(claudeSubdir(isGlobal), 'skills', 'react')
const skillPath = (isGlobal: boolean) => path.join(skillDir(isGlobal), 'SKILL.md')

const SKILL_DESCRIPTION =
  'Best-practice conventions for React code — component/file structure, styling (CSS variables, no px), module boundaries, documentation, and test naming. USE WHEN writing, reviewing, or refactoring React components.'

const skillFrontmatter = () => `---
name: react
description: ${SKILL_DESCRIPTION}
---

`

const RULE_START = '<!-- #region @enhanced-dom/claude - react -->'
const RULE_END = '<!-- #endregion @enhanced-dom/claude - react -->'

const RULE_BLOCK = `${RULE_START}
## React code

**Whenever writing, reviewing, or refactoring React code**, use the \`react\` skill for this project's conventions on component/file structure, styling, module boundaries, documentation, and testing.
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
    const body = fs.readFileSync(path.join(SOURCE_DIR, 'React.md'), 'utf8')
    fs.writeFileSync(dest, skillFrontmatter() + body)
    console.log(`Wrote ${path.relative(process.cwd(), dest)}`)
  }

  ensureRuleInClaudeMd(isGlobal)
}
