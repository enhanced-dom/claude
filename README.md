Boilerplate for some selected claude skills to use, plus some custom skills and guidance files. Idea is to have an install-all-needed for a certain 'flavor' of working.

## Usage

Install one or more configs into the current project:

```bash
npx @enhanced-dom-claude --configs react code
```

Install every config, into the user's global `~/.claude` instead of the project, overwriting anything already there:

```bash
npx @enhanced-dom-claude --configs all --global --force
```

Flags:

- `--configs <name...|all>` (required) — one or more of `react`, `code`, `architecture-diagram`, `teams-scrape`, `rtk`, `devcontainer`, `caveman-full`, `caveman-lite`, `code-review-graph`, or `all`. `caveman-full` installs the full caveman CLI/proxy/MCP integration; `caveman-lite` installs only its Skill (a concise-responses rule file), with no proxy, MCP server, or hooks. `caveman-lite` uses the `claude` CLI's plugin system when it's on PATH, and otherwise falls back to fetching the skill file straight from GitHub and dropping it into `.claude/skills/caveman/` (or `~/.claude/skills/caveman/` with `--global`) — so it works even from a VS Code/JetBrains-only setup where `claude` isn't reachable on PATH.
- `--global`, `-g` — install into `~/.claude` instead of the project (ignored by configs that don't support it, e.g. `devcontainer`).
- `--force` — overwrite existing files/config (ignored by configs that don't support it, e.g. `caveman-full`).
- `--confirm` — skip the confirmation prompt shown when `--global`/`--force` doesn't apply to every selected config.

Selected configs run in sequence; if one fails the rest still run, and a final summary reports success/failure per config with a non-zero exit code if any failed.