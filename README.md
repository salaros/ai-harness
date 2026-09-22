# AI harness

A starting point for projects built with AI coding agents. It gives every agent the same instructions, skills, safety hooks and documentation workflow, whether you use Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI or OpenCode.

It assumes no language or framework. What you put in `src/` decides the stack.

## What you get

- **`AGENTS.md`**: one instruction file that every agent reads.
- **Skills**: 60 vendored [agent skills](https://skills.sh) for requirements, design, testing, code review and more.
- **Agents**: `engineer`, `business-analyst`, `devops` and `assistant`, each routing work to the right skills.
- **Hooks**: agent hooks block dangerous shell commands and check every edit. Git hooks check commit messages, the documentation chain and formatting.
- **A documentation chain**: BRD → PRD → EARS → BDD → ADR → SPEC → TDD → plan → code, with a checker that keeps every document traceable to the one before it.

## Requirements

- [Node.js](https://nodejs.org) 22 or newer
- Git
- On Windows: Developer Mode on, and `git config --global core.symlinks true` set **before** you clone

## Installation

### Start a new project

```bash
git clone https://github.com/salaros/ai-harness.git my-project
cd my-project
node scripts/githooks-init.js
```

Then open the folder in your AI tool and run the `project-init` skill (`/project-init` in Claude Code). It asks what the project is, where its requirements live, its stack and its issue tracker, and records the answers in `MEMORY.md`. The Git hooks refuse commits until it has run.

### Add the harness to an existing repository

From the repository's root:

```bash
npx @salaros/ai-harness
```

The installer adds the harness files and leaves your own work alone: it never writes `README.md` or `LICENSE`, and it adds a folder README only where one is missing. It records the upstream commit it installed in `harness-lock.json`, then points Git at the harness's hooks in this clone. Other clones run `node scripts/githooks-init.js` once.

If the repository already has agent files of its own, the first install keeps them and adds what the harness needs:

| File | What the first install does |
| --- | --- |
| `AGENTS.md`, `docs/README.md` | Writes the harness's version and appends yours under `## This project`, for you to fold in |
| `CLAUDE.md` | Adds `@AGENTS.md` at the top if it's missing |
| `.claude/settings.json` | Merges by key: replaces the harness's hooks, keeps your permissions and hooks (on every update, too) |
| `.mcp.json` | Adds the harness's MCP servers; yours win where both define one |
| `.gitignore` | Appends the harness's patterns you don't have, under a comment |

Run the same command again to update. Files you haven't edited take the new version, files you have edited keep your changes and gain the new ones, and a real conflict is written with conflict markers and reported.

| Option | Effect |
| --- | --- |
| `--dry-run` | Show what would change, write nothing |
| `--quiet` | Print only the summary |
| `--ref <tag>` | Install a fixed version instead of the latest `master` |
| `--adopt` | Replace every harness file with the upstream's, for repos installed before `harness-lock.json` existed. Discards your edits to those files. |
| `--astro-docs` | Also install `tools/docs-site/`, a website that renders your documentation |
| `--no-check` | Skip the check the installer runs after writing |
| `--help` | Print the options and exit. Any argument not listed here stops the installer before it writes. |

The npm package holds only the installer. It fetches the harness from `master` at run time, so two runs a month apart may install different skills. Use `--ref` when you need the same result every time.

## Usage

Talk to your agent as usual. `AGENTS.md` tells it which skill fits the task. You can also call a skill or an agent by name:

```text
/grilling            stress-test an idea before writing requirements
/brd                 write a business requirements document
/tdd                 build a feature test-first
use the engineer agent to implement docs/spec/0001-billing.md
```

Everyday commands:

```bash
node scripts/docs-check.js                         # check the documentation chain
node scripts/check-harness.js                      # check the harness itself
npx skills add <owner/repo> -s <skill> -a claude-code codex -y
node scripts/skills.js relink                      # run after adding or updating skills
```

Claude Code works as soon as you clone. Other tools need a small config file for hooks and agents; [.agents/README.md](.agents/README.md#files-per-ai-tool) lists the files for each tool.

## Documentation

- [AGENTS.md](AGENTS.md): the rules every agent follows, including the documentation chain.
- [docs/README.md](docs/README.md): what each document in the chain must contain.
- [.agents/README.md](.agents/README.md): reference for the layout, skills, hooks, agents, per-tool setup and what each skill expects.
- `src/`, `tests/`, `scripts/`, `tools/` and `docs/` each have a README saying what belongs in them.

## Releasing

Maintainers publish the installer to npm by pushing an annotated version tag on `master`:

```bash
git tag -a 0.2.8 -m "0.2.8" && git push origin 0.2.8
```

The [release workflow](.github/workflows/release.yml) runs the tests, writes the tag's version into `package.json` and publishes. Leave the version in `package.json` at `0.0.0`.

## License

MIT; see [LICENSE](LICENSE). Vendored skills keep their own licences, listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Contact

Maintained by CODECAVE. Report problems and suggestions in [GitHub issues](https://github.com/salaros/ai-harness/issues).
