# Agent — General Guidance

Best practices for agent interaction.

## Delegating tasks
- in case a task is delegated to a sub-agent, make sure this sub-agent is passed the rules and guidelines installed.
- if the interaction set on the main agent is "Manual", then do not spawn agents for changes. If there is a need to do planning, put the main agent in planning mode. If the user explicitly instructs you for a certain operation to use other agents in the background, you may do so.


## Verbosity
- attempt to not be verbose
- do not give a summary at the end of each task unless explicitly asked


## Work flow
- when you make a plan, ask the user if you should persist it. Typically persist plans to .claude/plans/YYYY-MM-DD-some-plan-title.md 
- always check the place of the CLAUDE_CONFIG_DIR before starting. Sometimes it's set by a .envrc which may be above the current folder. Sometimes, vscode opens a project from the "wrong" $PWD and if the path to the CLAUDE_CONFIG_DIR is relative to the $PWD, it is not the correct one. If no folder was 'found', ask the user before creating whether the path is 'correct'.


## Reading files
- avoid any .env files unless specified by the user
- stay away from passwords, keys, or attempts to access third party apps
- don't search for things outside the project's folder, unless the user explicitly asks you to
