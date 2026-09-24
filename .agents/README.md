# Harness reference

How the harness is put together: what each file is for, how skills, hooks and agents work, how to wire each AI tool, and what each skill expects to find. The root `README.md` covers installing and using the harness; this file holds the detail.

## Layout

| Path | What it is |
| --- | --- |
| `src/`, `tests/`, `scripts/`, `tools/`, `docs/` | Product code, tests, repo automation, dev utilities and documents. Each folder's README says what belongs in it. |
| `AGENTS.md` | The file every agent reads: layout, skills, the documentation chain and the working rules. |
| `CLAUDE.md` | One line, `@AGENTS.md`, because Claude Code reads `CLAUDE.md` instead of `AGENTS.md`. |
| `MEMORY.md` | The project facts, one per line: name, purpose, prose language, requirements, stack, and the issue tracker if there is one. The `project-init` skill writes it. |
| `INTENT.md` | Optional. The product's intent in the [INTENT.md format](https://www.intentdocs.com/intent-md): product, MVP stories with their done-when criteria, and optionally personas, the user journey and later releases. When present, its `## Product` gives the name and purpose `MEMORY.md` would otherwise hold, and `docs-check` requires its `# INTENT.md` title, `## Product` and `## MVP stories`. The harness neither ships nor requires one; `project-init` offers to write it. |
| `CONTEXT.md`, `CONTEXT-MAP.md` | The domain glossary, written by `domain-modeling`. A `microservices` repo adds `CONTEXT-MAP.md` and one `CONTEXT.md` per service; see `docs/agents/domain.md`. |
| `TODO.md` | Loose ends: unanswered questions, unverified assumptions and deferred work, in the [todo-md](https://github.com/todo-md/todo-md) format. The `loose-ends` skill writes it. A settled entry is deleted, not ticked. |
| `CODING_STANDARDS.md` | Rules the `code-review` skill applies. Anything a tool enforces stays out of it. |
| `skills-lock.json` | Source, path and hash of every vendored skill, written by `npx skills`. |
| `THIRD-PARTY-NOTICES.md`, `scripts/skill-licences.tsv` | Licence notices for vendored skills. The TSV holds one row per upstream; `node scripts/skills.js notices` regenerates the notice from it. |
| `.agents/README.md` | This file. |
| `.agents/skills/` | The vendored skills. |
| `.agents/agents/`, `.agents/routing.md` | Agent definitions, and the route rows several agents share. |
| `.agents/hooks/` | Hook scripts for AI tools. See [Agent hooks](#agent-hooks). |
| `.claude/` | Claude Code wiring: `skills` and `agents` link into `.agents/`, and `settings.json` wires the hooks. |
| `.githooks/`, `scripts/githooks-init.js` | Git hooks and their installer. See [Git hooks](#git-hooks). |
| `docs/agents/` | Configuration the skills read: the issue tracker, triage labels, domain-doc rules and the question tool per harness. |
| `scripts/update-harness.js`, `scripts/harness-files.tsv`, `harness-lock.json` | The installer, the table of what it installs and how, and the receipt naming the upstream commit a repo last took. |
| `.mcp.json`, `opencode.json` | MCP server registrations: Atlassian for Jira, Figma for designs. Both optional. |
| `.editorconfig`, `.gitattributes`, `.gitignore`, `stylecop.json` | Encoding, indentation, line endings, ignored files and analyzer settings. Stack-specific entries stay when they are harmless on other stacks. |
| `.skip-project-init` | Untracked and created by hand. Tells the Git hooks this clone has no project to configure. |
| `workflows/` | Workflow specs written by `loop-me`. |
| `.scratch/` | Committed working files: feature notes, ticket drafts, plans. |

## Skills

A skill is a folder with a `SKILL.md` whose frontmatter carries a `name` and a `description`, plus optional reference files. The [`skills` CLI](https://skills.sh) manages them. Commit `skills-lock.json`, `.agents/skills` and the `.claude/skills` link together.

```bash
npx skills add mattpocock/skills -s wait-what -a claude-code codex -y   # add a skill
npx skills remove wait-what -y                                         # remove one
npx skills update                                                      # update all
node scripts/skills.js relink                                          # after any of the above
node scripts/skills.js list                                            # what is installed, and who routes it
```

- **Relink after every change.** `.claude/skills` is one link to `.agents/skills`, so Claude Code sees every skill already. Relink repairs per-skill links in other harness folders and turns the absolute junctions `npx skills` creates on Windows into relative symlinks Git can store.
- **Don't edit a vendored skill.** The next update overwrites it. Fork it under another name, or change it upstream.
- **New upstream, new licence row.** Add a row to `scripts/skill-licences.tsv`, then run `node scripts/skills.js notices`. `node scripts/check-harness.js` fails until you do.
- **Update now and then.** The lock file stores only a hash, so an upstream going private goes unnoticed. Run `npx skills update`, then `node scripts/check-harness.js`, and read the diff before committing. The `skills-update` workflow does this weekly.
- **A skill needs valid frontmatter.** `node scripts/check-harness.js` fails when a folder under `.agents/skills` has no `SKILL.md`, a `name` that differs from the folder or breaks the [Agent Skills](https://agentskills.io/specification) rules, or a `description` that is missing or over 1024 characters. A tool silently ignores such a skill.
- **Two kinds of skill.** An agent picks a model-invoked skill by its description. A user-invoked skill (`disable-model-invocation: true`) runs only when you type `/name`.

## Agent hooks

Three Node scripts in `.agents/hooks/`. Each reads the tool's JSON payload on stdin and prints a message. Exit `0` means fine; exit `2` blocks the action or sends the message back to the agent.

| Script | Event | What it does |
| --- | --- | --- |
| `session-start.js` | session start | Prints the branch, whether Git hooks are installed, skills missing from disk, and whether `CONTEXT.md`, `docs/adr/` and the issue-tracker config exist. On a GitHub clone with `gh` signed in, it also lists the open pull requests by number, so the agent can offer `pr-sweep`. |
| `guard-command.js` | before a shell command | Blocks force pushes, `git reset --hard`, `git clean -f`, `git branch -D` and recursive deletes of `/`, `~`, `.git` or `*`, and tells the agent to ask you instead. |
| `chain-skill.js` | before a file is created | Asks for the skill that writes that stage of the chain, reading the mapping from `AGENTS.md`'s table: a PRD with `prd`, a SPEC with `design-doc`, a new module under `src/` with `implement` and `codebase-design`. Only a creation fires it, and only when the session's transcript shows the skill was never loaded. |
| `check-edit.js` | after a file edit | Syntax-checks `*.js`, validates `*.json`, runs `docs-check.js` after changes to `docs/` or `AGENTS.md`, runs `check-harness.js` after harness changes, and refuses edits to vendored skills. |

`lib.js` turns whatever a tool sends (Claude Code, Cursor, Copilot, Gemini CLI) into one hook event: the repo root, the edited paths, the command text, and the raw input. A payload in no shape it knows is noted on stderr and never blocks an edit; for the command guard, every string in it counts as the command, so an unfamiliar tool is scanned rather than waved through.

`node .agents/hooks/test.js` runs the fixtures in `.agents/hooks/tests/cases.tsv`, then a decision table per module under `tests/tables/`, then the checks in `tests/self-checks.js` that can only be made from outside a module: a real shell, a real install, this checkout itself. The harness invariants run there too, against this checkout, the same functions a target runs. The suite exists only in the upstream repository; an installed repo runs `node scripts/check-harness.js`.

## Git hooks

`node scripts/githooks-init.js` points `core.hooksPath` at `.githooks/` once per clone. Each hook is a short `sh` wrapper around `scripts/githook.js`. `--no-verify` skips any of them.

| Hook | Checks |
| --- | --- |
| `pre-commit` | The project is initialised: `MEMORY.md` exists and holds no `<placeholder>`, with the name and purpose taken from `INTENT.md` when there is one. No staged line opens a merge conflict (`<<<<<<< `). `TODO.md` follows the ledger format. Staged documents, `MEMORY.md` and `INTENT.md` keep the documentation chain intact. |
| `commit-msg` | The message is a conventional commit: `<type>(<scope>)?!?: <description>`, subject at most 72 characters, at least four words, and a body. A missing issue key is a warning, not an error, and so are a hashed key (`#AB-42`) and a smart-commit command in the subject; none of them warn when `MEMORY.md` records `Issue tracker: none`. |
| `pre-push` | The project is initialised, and the pushed files pass the stack's formatter from `scripts/stacks.tsv`. It reports and blocks, never rewrites, and skips a formatter that is not installed. |
| `post-merge` | Restores dependencies when a manifest changed: skills, npm, pnpm, yarn, NuGet or uv, as `scripts/stacks.tsv` says. |

## Agents

Agent definitions live in `.agents/agents/*.md`: frontmatter with `name` and `description`, then the system prompt. Each agent routes a request to the skills it owns. A route several agents share lives in `.agents/routing.md`; a rule every agent needs lives in `AGENTS.md`.

| Agent | For |
| --- | --- |
| `engineer` | Engineering work bigger than a one-line edit, and the TRD, RFC, ADR, SPEC, TDD, IPLAN and Code stages of the chain |
| `business-analyst` | Requirements, process design, interface contracts, interviews, and the PDD, BRD, PRD, EARS and BDD stages of the chain |
| `devops` | Containers, CI/CD, Kubernetes, infrastructure as code, rollouts and incidents |
| `assistant` | Non-technical colleagues |

## Files per AI tool

Only the Claude Code wiring ships in the repository and has been tested. The other rows follow each tool's documentation.

### Claude Code

| Need | File | In repo |
| --- | --- | --- |
| Instructions | `CLAUDE.md` containing `@AGENTS.md` | yes |
| Skills | `.claude/skills`, a symlink to `../.agents/skills` | yes |
| Hooks | `.claude/settings.json`: `SessionStart`, `PreToolUse` (matcher `Bash`), `PostToolUse` (matcher `Edit\|Write\|MultiEdit`), each loading `.agents/hooks/<hook>.js` from the root `git rev-parse --show-toplevel` gives | yes |
| Agents | `.claude/agents`, a symlink to `../.agents/agents` | yes |
| Personal overrides | `.claude/settings.local.json`, ignored by Git | no |

On Windows the symlinks need Developer Mode and `git config --global core.symlinks true`. Without symlinks, run `npx skills add … --copy` and copy `.agents/agents/*.md` into `.claude/agents/`.

### Other tools

| Tool | Instructions | Skills | Hooks | Agents | MCP |
| --- | --- | --- | --- | --- | --- |
| OpenAI Codex | `AGENTS.md` | `.agents/skills/` | create `.codex/hooks.json` ([docs](https://developers.openai.com/codex/hooks)) | create `.codex/agents/<name>.toml` | `[mcp_servers.atlassian]` in `.codex/config.toml`, then `codex mcp login atlassian` |
| Cursor | `AGENTS.md` | `.agents/skills/` | create `.cursor/hooks.json`: `sessionStart`, `beforeShellExecution`, `afterFileEdit` ([docs](https://cursor.com/docs/agent/hooks)) | copy or link into `.cursor/agents/` | create `.cursor/mcp.json` |
| GitHub Copilot | `AGENTS.md` | `.agents/skills/` | none: the CLI and VS Code read `.claude/settings.json` ([docs](https://docs.github.com/en/copilot/reference/hooks-reference)) | copy into `.github/agents/<name>.agent.md` | create `.vscode/mcp.json` |
| Gemini CLI | point `.gemini/settings.json` at `AGENTS.md` | `.agents/skills/` | `hooks` in `.gemini/settings.json`: `SessionStart`, `BeforeTool`, `AfterTool` ([docs](https://geminicli.com/docs/hooks/)) | copy or link into `.gemini/agents/` | `mcpServers` in `.gemini/settings.json` |
| OpenCode | `AGENTS.md` | `.agents/skills/` | a JS plugin in `.opencode/plugins/` that runs the scripts ([docs](https://opencode.ai/docs/plugins/)) | none | `opencode.json`, in repo |
| Anything else | `AGENTS.md` | load each `SKILL.md` whose description matches | run the scripts on the tool's events: payload on stdin, exit 2 blocks | paste an agent file as the system prompt | the tool's own file |

The hook commands find the scripts with `node -e` asking `git rev-parse --show-toplevel`, not through `$CLAUDE_PROJECT_DIR`. Only Claude Code sets that variable. Copilot reads the same file without setting it and denies a tool whose pre-tool hook errors, so a command built on the variable blocked every shell command there. Each command ends `; exit $LASTEXITCODE`, because PowerShell reports a hook's exit 2 as 1, which VS Code treats as a warning and runs the tool anyway. Bash, WSL2, cmd.exe, Windows PowerShell and PowerShell 7 all run the command as written: bash exits with the last status, and cmd.exe passes the two words to `node -e`, which ignores them. A WSL2 shell on a checkout under `/mnt/c` needs Git to trust it (`git config --global --add safe.directory <path>`), or the root lookup fails and Copilot blocks. VS Code ignores the matchers, so there every hook runs on every tool call, and each script lets through a call it does not handle.

The command text is written once, in `scripts/check-harness.js`, and the harness invariants hold `.claude/settings.json` to it: each of the three scripts launched once, on its event, behind its matcher. Nothing read that file back before, so an update that mangled an entry left the session quietly unchecked. A hook or a permission the project added beside ours is left alone. Inside the scripts the root is `lib.root()`'s, the one precedence every entry point follows: `--root=<dir>`, then the project-dir variable a harness sets, then the checkout the file lives in.

Codex sends edits as `apply_patch` commands, which `check-edit.js` does not read yet.

Two MCP servers are registered, both optional: Atlassian for Jira (conventions in `docs/agents/issue-tracker.md`) and Figma at `https://mcp.figma.com/mcp` for the `figma` skills. Authorise only the ones you use. `docs/agents/questions.md` lists the question tool of each harness.

## What each skill expects

Most skills need only `AGENTS.md` and their own folder. The files in `docs/agents/` ship with the harness; skills create everything else when they first need it.

### Issue tracker

A tracker is optional: a project can plan entirely in `docs/` and record `Issue tracker: none`. The harness ships configured for Jira through the Atlassian MCP server:

- `issue-tracker.md` names the MCP tools that create, read, label, link and close issues. Replace `TODO-PROJECT-KEY` with your project key, or let `project-init` do it.
- `triage-labels.md` maps the five triage roles to Jira labels of the same names.
- `domain.md` tells skills to read `CONTEXT.md` and `docs/adr/` first.
- `questions.md` names the question tool of each harness.

To switch to GitHub, GitLab or local Markdown, run `/setup-matt-pocock-skills`.

### Per skill

| Skill | Reads | Writes |
| --- | --- | --- |
| `code-review` | `issue-tracker.md`, `CODING_STANDARDS.md`, the originating spec | nothing |
| `pr-sweep` | open pull requests through `gh`, their review comments, what `code-review` reads | fixes on each pull request's branch, the merge |
| `to-tickets` | `issue-tracker.md` | drafts in `.scratch/<feature>/`, then tracker issues |
| `triage` | `issue-tracker.md`, `triage-labels.md`, `.out-of-scope/` | `.out-of-scope/<concept>.md`, labels and comments |
| `grill-with-docs` | the ask being sharpened | nothing of its own: it calls `grilling` and `domain-modeling` |
| `domain-modeling` | `CONTEXT.md`, `docs/adr/` | `CONTEXT.md`, `docs/adr/NNNN-<slug>.md` |
| `brd`, `prd`, `feature-forge`, `bdd-scenarios`, `design-doc`, `create-implementation-plan` | the document one stage upstream, `CONTEXT.md` | `docs/<stage>/NNNN-<slug>.md`, or `.scratch/<feature>/` for the plan |
| `docs-check` | the `AGENTS.md` chain table, `docs/`, `MEMORY.md`, `INTENT.md` | repairs in place |
| `loose-ends` | `TODO.md` | `TODO.md` |
| `project-init` | your answers, `INTENT.md` if present | `MEMORY.md`, `INTENT.md` if you accept one, the Project section of `README.md`, `issue-tracker.md`, and `CONTEXT-MAP.md` for `microservices` |
| `teach` | the working directory | `MISSION.md`, `RESOURCES.md`, `NOTES.md` and lesson folders |
| `loop-me` | `NOTES.md` | `workflows/<name>.md`, `NOTES.md` |
| `implement`, `tdd`, `prototype` | a spec or tickets, the stack's tooling | code in `src/` and `tests/` |
| `agent-browser` | the `agent-browser` CLI | nothing |
