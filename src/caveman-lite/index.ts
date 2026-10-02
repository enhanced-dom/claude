// One-shot installer: adds only the `caveman` Skill
// (https://github.com/JuliusBrussee/caveman) — an MIT-licensed rule file
// that makes agents respond more concisely, saving output tokens — without
// touching caveman's CLI/proxy (separately licensed BSL-1.1), its MCP
// server, or any hooks.
//
// Prefers Claude Code's own plugin system (`claude plugin marketplace add` +
// `claude plugin install`), which manages its own idempotency and never
// touches this project's or the user's raw config files directly. But the
// `claude` CLI isn't guaranteed to be on PATH — a machine that only ever
// drives Claude Code through the VS Code/JetBrains extension may not expose
// it there. When it's missing, falls back to fetching the skill's SKILL.md
// straight from GitHub and dropping it into .claude/skills/caveman/ (or
// ~/.claude/skills/caveman/ with --global) ourselves, same shape as the
// react/code/architecture-diagram installers — except this file already
// ships its own frontmatter upstream, so it's written through unmodified.

import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const hasCommand = (cmd: string) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error === undefined

const MARKETPLACE_SOURCE = 'JuliusBrussee/caveman'
const PLUGIN = 'caveman@caveman'

const run = (args: string[]) => {
  console.log(`$ claude ${args.join(' ')}`)
  const result = spawnSync('claude', args, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`claude ${args.join(' ')} failed.`)
  }
}

const installViaPlugin = (global: boolean) => {
  const scope = global ? 'user' : 'project'
  run(['plugin', 'marketplace', 'add', MARKETPLACE_SOURCE, '--scope', scope])
  // `claude plugin install` (this CLI's version) has no --yes/confirm flag —
  // it installs directly, no prompt to skip.
  run(['plugin', 'install', PLUGIN, '--scope', scope])
}

// Mirrors upstream's own skills/caveman/SKILL.md, kept in sync by their
// .github/workflows/sync-skill.yml — fetched fresh rather than vendored so
// this installer never ships a stale copy.
const SKILL_RAW_URL = 'https://raw.githubusercontent.com/JuliusBrussee/caveman/main/skills/caveman/SKILL.md'

const claudeSubdir = (isGlobal: boolean) => (isGlobal ? path.join(os.homedir(), '.claude') : path.join(process.cwd(), '.claude'))
const skillDir = (isGlobal: boolean) => path.join(claudeSubdir(isGlobal), 'skills', 'caveman')
const skillPath = (isGlobal: boolean) => path.join(skillDir(isGlobal), 'SKILL.md')

const fetchText = async (url: string): Promise<string> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed with status ${res.status}`)
  return res.text()
}

const installViaFetch = async (global: boolean, force: boolean) => {
  console.log('claude CLI not found on PATH — falling back to fetching the caveman Skill directly from GitHub.')

  const dest = skillPath(global)
  if (fs.existsSync(dest) && !force) {
    console.log(`${path.relative(process.cwd(), dest)} already exists — skipping (use --force to overwrite).`)
    return
  }

  const body = await fetchText(SKILL_RAW_URL)
  fs.mkdirSync(skillDir(global), { recursive: true })
  fs.writeFileSync(dest, body)
  console.log(`Wrote ${path.relative(process.cwd(), dest)}`)
}

export const install = async ({ global, force }: { global: boolean; force: boolean }) => {
  if (hasCommand('claude')) {
    installViaPlugin(global)
    return
  }

  await installViaFetch(global, force)
}
