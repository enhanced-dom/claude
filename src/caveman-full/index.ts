// One-shot installer: ensures the `caveman` CLI (https://github.com/JuliusBrussee/caveman)
// is installed, then delegates to its own setup: `caveman setup --install` (MCP
// server/proxy) followed by `caveman setup --agent-native claude` (hooks,
// statusline, plugin) — the CLI treats these as separate steps, not alternatives;
// skipping --install first leaves `caveman-mcp not found`. Then `caveman mcp
// install claude --server caveman` registers the recovery-tools MCP server,
// without which streaming/Pro-Max sessions pass through uncompressed. Only
// wires up Claude Code — that's the only agent this package deals with.
//
// Unlike rtk, caveman manages its own Claude Code integration entirely via its
// own global config (~/.claude.json, ~/.claude/settings.json) rather than this
// project's .mcp.json or a Skill file, so this wrapper only needs to ensure the
// CLI exists before delegating — there's nothing project-local to migrate.

import { spawnSync } from 'child_process'

const hasCommand = (cmd: string) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).error === undefined

const installCavemanCli = () => {
  if (!hasCommand('npm')) {
    throw new Error(
      'caveman not found and npm is not available to install it. Install it manually (see https://github.com/JuliusBrussee/caveman) and re-run this command.',
    )
  }
  console.log('caveman not found, installing via npm...')
  const result = spawnSync('npm', ['install', '-g', '@caveman-ai/cli'], { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error('npm install -g @caveman-ai/cli failed.')
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match ConfigDef.install
export const install = (_: { global: boolean; force: boolean }) => {
  if (!hasCommand('caveman')) installCavemanCli()

  const installResult = spawnSync('caveman', ['setup', '--install'], { stdio: 'inherit' })
  if (installResult.status !== 0) throw new Error(`caveman setup --install failed with status ${installResult.status}`)

  const result = spawnSync('caveman', ['setup', '--agent-native', 'claude'], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`caveman setup --agent-native claude failed with status ${result.status}`)

  const mcpResult = spawnSync('caveman', ['mcp', 'install', 'claude', '--server', 'caveman'], { stdio: 'inherit' })
  if (mcpResult.status !== 0) throw new Error(`caveman mcp install claude --server caveman failed with status ${mcpResult.status}`)

  // telemetry is on by default (opt-out) upstream; this installer opts back out
  spawnSync('caveman', ['telemetry', 'off'], { stdio: 'inherit' })
}
