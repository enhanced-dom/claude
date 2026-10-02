// One-shot installer: drops the teams-scrape Claude Code Skill (Microsoft
// Teams chat scraper — SKILL.md, FORMAT.md, the parsing/persistence CLI, and
// the Swift scroll tool, all shipped alongside this file by postbuild) into
// .claude/skills/teams-scrape/. Unlike react/code/architecture-diagram, this
// skill ships its own frontmatter (it's user-invocable, not a "USE WHEN"
// convention doc) and has companion files, so this installer just copies the
// payload as-is instead of synthesizing a SKILL.md.
//
// Skill payload originates from
// https://github.com/nathanvale/side-quest-marketplace-old/tree/2fceea129cbab4612b7939343b04c4c4fb7325dc/plugins/teams-scrape/skills/teams-scrape,
// modified for this repo.
//
// Also registers the macos_automator MCP server (.mcp.json, or ~/.claude.json
// with --global) the skill depends on for driving Teams via execute_script.

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { fileURLToPath } from 'url'

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url))
const PAYLOAD_FILES = ['SKILL.md', 'FORMAT.md', 'cli.ts', 'scroll-teams.swift']

const claudeSubdir = (isGlobal: boolean) => (isGlobal ? path.join(os.homedir(), '.claude') : path.join(process.cwd(), '.claude'))
const skillDir = (isGlobal: boolean) => path.join(claudeSubdir(isGlobal), 'skills', 'teams-scrape')

const installSkillFiles = (isGlobal: boolean, force: boolean) => {
  const dest = skillDir(isGlobal)
  fs.mkdirSync(dest, { recursive: true })

  for (const name of PAYLOAD_FILES) {
    const filePath = path.join(dest, name)
    if (fs.existsSync(filePath) && !force) {
      console.log(`Skipping ${path.relative(process.cwd(), filePath)} (already exists, use --force to overwrite)`)
      continue
    }
    fs.copyFileSync(path.join(SOURCE_DIR, name), filePath)
    console.log(`Wrote ${path.relative(process.cwd(), filePath)}`)
  }
}

// the skill drives Teams via macos-automator's execute_script tool; without
// this server registered, the Swift scroll tool / clipboard capture steps in
// SKILL.md have nothing to call
const MCP_SERVER_NAME = 'macos_automator'

const ensureMcpConfig = (isGlobal: boolean, force: boolean) => {
  const mcpPath = isGlobal ? path.join(os.homedir(), '.claude.json') : path.join(process.cwd(), '.mcp.json')
  const mcp = fs.existsSync(mcpPath) ? JSON.parse(fs.readFileSync(mcpPath, 'utf8')) : {}
  mcp.mcpServers ??= {}
  if (mcp.mcpServers[MCP_SERVER_NAME] && !force) {
    console.log(`Skipping ${MCP_SERVER_NAME} in ${path.relative(process.cwd(), mcpPath)} (already configured, use --force to overwrite)`)
    return
  }
  mcp.mcpServers[MCP_SERVER_NAME] = {
    command: 'npx',
    args: ['-y', '--package', '@steipete/macos-automator-mcp@0.4.1', 'macos-automator-mcp'],
  }
  fs.writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n')
  console.log(`Updated ${path.relative(process.cwd(), mcpPath)}`)
}

export const install = ({ global, force }: { global: boolean; force: boolean }) => {
  installSkillFiles(global, force)
  ensureMcpConfig(global, force)
}
