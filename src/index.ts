#!/usr/bin/env node
// Combined installer: runs one or more of this package's configs (react,
// code, agent, architecture-diagram, teams-scrape, rtk, devcontainer,
// caveman-full, caveman-lite, code-review-graph) in sequence, sharing
// --global/--force flags across all of them. Replaces the 8 standalone
// @enhanced-dom-* bins this package used to expose — each config's install()
// now only throws on failure instead of calling process.exit, so one
// failing config doesn't kill the rest.

import yargs from 'yargs'
import * as readline from 'readline/promises'

import { install as installReact } from './react'
import { install as installCode } from './code'
import { install as installAgent } from './agent'
import { install as installArchitectureDiagram } from './architecture-diagram'
import { install as installTeamsScrape } from './teams-scrape'
import { install as installRtk } from './rtk'
import { install as installDevcontainer } from './devcontainer'
import { install as installCavemanFull } from './caveman-full'
import { install as installCavemanLite } from './caveman-lite'
import { install as installCodeReviewGraph } from './code-review-graph'

interface IConfigDef {
  name: string
  description: string
  supportsGlobal: boolean
  supportsForce: boolean
  install: (opts: { global: boolean; force: boolean }) => void | Promise<void>
}

const CONFIGS: IConfigDef[] = [
  {
    name: 'react',
    description:
      'Drops the react Claude Code Skill (best-practice conventions for React code) into .claude/skills/ and points CLAUDE.md at it.',
    supportsGlobal: true,
    supportsForce: true,
    install: installReact,
  },
  {
    name: 'code',
    description:
      'Drops the code Claude Code Skill (best-practice conventions for general code) into .claude/skills/ and points CLAUDE.md at it.',
    supportsGlobal: true,
    supportsForce: true,
    install: installCode,
  },
  {
    name: 'agent',
    description:
      'Drops the agent Claude Code Skill (general agent collaboration conventions — delegation, verbosity, work flow) into .claude/skills/ and points CLAUDE.md at it.',
    supportsGlobal: true,
    supportsForce: true,
    install: installAgent,
  },
  {
    name: 'architecture-diagram',
    description:
      'Drops the architecture-diagram Claude Code Skill (SVG box+arrow diagram conventions) into .claude/skills/ and points CLAUDE.md at it.',
    supportsGlobal: true,
    supportsForce: true,
    install: installArchitectureDiagram,
  },
  {
    name: 'teams-scrape',
    description:
      'Drops the teams-scrape Claude Code Skill (Microsoft Teams chat scraper) into .claude/skills/ and registers the macos_automator MCP server.',
    supportsGlobal: true,
    supportsForce: true,
    install: installTeamsScrape,
  },
  {
    name: 'rtk',
    description: 'Ensures the rtk CLI is installed and delegates to rtk init to wire up the Claude Code hook + CLAUDE.md instructions.',
    supportsGlobal: true,
    supportsForce: true,
    install: installRtk,
  },
  {
    name: 'devcontainer',
    description: 'Copies devcontainer template files into .devcontainer/ (project-local only).',
    supportsGlobal: false,
    supportsForce: true,
    install: installDevcontainer,
  },
  {
    name: 'caveman-full',
    description: 'Ensures the caveman CLI is installed and wires up its Claude Code integration (supports neither --global nor --force).',
    supportsGlobal: false,
    supportsForce: false,
    install: installCavemanFull,
  },
  {
    name: 'caveman-lite',
    description:
      'Installs only the caveman Skill (concise-responses rule file) — no CLI/proxy, no MCP, no hooks. Uses the claude CLI plugin system when available, otherwise fetches the skill file from GitHub directly.',
    supportsGlobal: true,
    supportsForce: true,
    install: installCavemanLite,
  },
  {
    name: 'code-review-graph',
    description: 'Wires up code-review-graph (project-local .venv, MCP server, project code graph).',
    supportsGlobal: false,
    supportsForce: true,
    install: installCodeReviewGraph,
  },
]

const CONFIG_NAMES = CONFIGS.map((config) => config.name)

const main = async () => {
  const argv = yargs(process.argv)
    .choices('configs', [...CONFIG_NAMES, 'all'])
    .array('configs')
    .demandOption('configs', 'Specify which configs to install, or "all"')
    .boolean('global')
    .alias('global', 'g')
    .default('global', false)
    .boolean('force')
    .default('force', false)
    .boolean('confirm')
    .default('confirm', false)
    .parseSync()

  const { global, force, confirm, configs: configNames } = argv

  const selected = configNames.includes('all') ? CONFIGS : CONFIGS.filter((config) => configNames.includes(config.name))

  const unsupportedGlobal = global ? selected.filter((config) => !config.supportsGlobal) : []
  const unsupportedForce = force ? selected.filter((config) => !config.supportsForce) : []

  if (unsupportedGlobal.length > 0 || unsupportedForce.length > 0) {
    console.warn('Warning: some selected configs do not support all requested flags:')
    for (const config of unsupportedGlobal) {
      console.warn(`  - ${config.name} (does not support --global): ${config.description}`)
    }
    for (const config of unsupportedForce) {
      console.warn(`  - ${config.name} (does not support --force): ${config.description}`)
    }

    if (!confirm) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const answer = await rl.question('Continue? [y/N] ')
      rl.close()
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log('Aborted.')
        process.exit(1)
      }
    }
  }

  const results: { name: string; error?: Error }[] = []

  for (const config of selected) {
    console.log(`> Installing ${config.name}...`)
    try {
      await config.install({ global, force })
      results.push({ name: config.name })
    } catch (err) {
      results.push({ name: config.name, error: err as Error })
    }
  }

  console.log('\nSummary:')
  for (const result of results) {
    console.log(result.error ? `✗ ${result.name} — ${result.error.message}` : `✓ ${result.name}`)
  }

  process.exit(results.some((result) => result.error) ? 1 : 0)
}

main()
