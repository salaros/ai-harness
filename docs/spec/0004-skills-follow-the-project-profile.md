# SPEC-0004: Skills, agents and MCP servers follow the project profile

**Derived from:** RFC-0001, ADR-0009

Every target exposes every vendored skill, all six agents and both MCP servers to every session, whatever the project is. RFC-0001 accepted OPT-1: a decision table, `scripts/profiles.tsv`, and one pure selector decide the active set from the project facts in `MEMORY.md`, and three adapters expose it. This is the design, rolled out in five phases that each leave a working harness.

## Goals and non-goals

**Goals:** the reference profile loads at most half of today's description characters (RFC-0001/G-1, RFC-0001/C-1); the active set is a function of the project facts (RFC-0001/G-2); a new language, unit type or role is a row (RFC-0001/G-3, RFC-0001/C-5); every harness sees the same set (RFC-0001/C-2); a fact change applies offline (RFC-0001/C-3); updates still merge (RFC-0001/C-4); a newly vendored skill fails a check until it is classified (RFC-0001/C-6); agents and MCP servers go through the same table (RFC-0001/C-7); and a project that only gathers requirements can turn the coding skills off.

**Non-goals:** user-level plugins (RFC-0001/C-8), which the harness does not own; `TODO.md` holds the question of whether the budget target should count them. Trimming vendored descriptions. Choosing the skills a new stack needs: each stack adds its own rows later. Rewording C-4 for vendored edits (RFC-0001/Q-1), which stays with the decider in `TODO.md`. A Claude Code session on a clone that cannot make symlinks: `.claude/skills` is already a text file there, and this design does not change that.

## Constraints

- **Reads through a repo view, writes through a repo edit** (ADR-0001). The selector reads facts and the table from a view, so the hooks, the checks and the installer can all ask it; only `apply` writes, through `scripts/repo-edit.js`, and a link the platform refuses is reported, not thrown.
- **A licence inside a skill marks a copy** (ADR-0006). The catalog keeps each skill's folder whole, so the licence signal moves with it, and the notice reads the catalog.
- **One reader per table**, as `scripts/stacks.js` is for `stacks.tsv` and the `onlyTheStacksReaderNamesTheTable` invariant enforces: `scripts/profiles.js` is the only module that names `profiles.tsv`.
- **The installer ships three scripts in the npm package** (`update-harness.js`, `lib.js`, `project-facts.js`). It runs `profiles.js` from the target's own `scripts/` after writing it, as it runs `skills.js relink` today.
- **Fail open.** A clone with no `MEMORY.md`, the upstream included, keeps every skill, agent and server. A profile can only narrow what a project already has; it never hides a skill because a fact is missing.
- **No harness switch for skills, no vendored edit.** RFC-0001/Q-5 asks whether OpenCode's `permission.skill` and Codex's `skills.config` hide a skill, and whether `npx skills` checks `computedHash`. This design relies on none of them: it hides a skill by not linking it, and it edits no vendored file, so no hash goes stale.
- **The catalog layout is ADR-0009.** D-6 and D-7 follow it: the catalog under `.agents/catalog/`, generated links ignored per clone, a junction where a symlink is refused, a project's entry shadowing the catalog, and the migration rule.

## Architecture

```
MEMORY.md ─┐                       ┌─ plan ─── prints the active set and its size
           ├─ profiles.js ─ select ┤
profiles.tsv ┘   (one reader)       └─ apply ─┬─ MCP adapter    .claude/settings.json, opencode.json
                                              ├─ agent adapter  .agents/agents/<name>.md  -> .agents/catalog/agents/
                                              └─ skill adapter  .agents/skills/<name>     -> .agents/catalog/skills/

apply runs from: project-init (last step), update-harness (after relink), the post-merge hook
(stacks.tsv row), skills.js install (after restoring), and session-start (only when stale)
```

`select` is a pure function of the facts and the rows. `plan` and `apply` read through a repo view; `apply` alone writes. Each adapter takes the selection and the view, and returns repo-edit entries plus the lines it reports, so a test can run every adapter against a map.

## Design

### D-1 The profile table

`scripts/profiles.tsv`, tab-separated, `#` lines are comments, with a header comment naming the columns as `stacks.tsv` does:

| Column | Holds |
| --- | --- |
| name | the skill's folder name, the agent's file name without `.md`, or the MCP server's key |
| kind | `skill`, `agent` or `mcp` |
| when | the condition under which it is active |

A condition is one or more clauses joined by ` or `, each clause one or more tests joined by ` and `. A test is `always`, or `<fact> = <value>` or `<fact> != <value>`. A fact is a label from `FACTS` in `scripts/project-facts.js`, written as `MEMORY.md` writes it (`Issue tracker`, `Runtime / package manager`), plus `Roles` from D-10.

Matching, case-insensitive throughout: a fact's value is split on `,` and `/` into items, and an item matches a value when its first word equals it. `Language = C#` holds for `C#`, `C# 13` and `TypeScript, C#`; `Frontend != none` holds for `React` and fails for `none`; `Roles = marketing` holds for `engineer, marketing`.

Every shipped skill, agent and server has exactly one row. The first rows, from the groups RFC-0001 measured:

| Rows | when |
| --- | --- |
| the chain, harness, writing and coding skills | `always` |
| frontend and Figma, 9 skills; the `figma` server | `Frontend != none` |
| .NET, 6 skills | `Language = C#` |
| marketing, 9 skills | `Roles = marketing` |
| `analytics`, `launch`, `product-marketing`, `pre-mortem` and `release-notes`, which both roles route | `Roles = marketing or Roles = product-manager` |
| product management, 8 skills | `Roles = product-manager` |
| the three DevOps skills | `Roles = devops` |
| the `atlassian` server | `Issue tracker = Jira` |
| each agent | `Roles = <its name>` |

On the reference profile this leaves 54 of 85 skills and 13,085 of 28,525 description characters active (measured 2026-11-11).

Failure modes: an unknown kind, an unknown fact, an operator other than `=` and `!=`, an empty condition, or a name listed twice for one kind is an error naming the line. `plan` prints the errors and exits 1; `apply` changes nothing while the table has one.

Satisfies: RFC-0001/G-3, RFC-0001/C-5, RFC-0001/C-7.

### D-2 The selector

`select(facts, rows)` returns each row with `active` and `open`, and nothing else; it reads no file. A test is true when its fact is answered and matches. When the fact has no line or is unanswered (`project-facts.js` gives `null` or `""`), the test is true and the fact is added to `open`: the row is active because the project has not said otherwise, not because it matched. `always` is true and opens nothing.

So the upstream, which has no `MEMORY.md`, selects everything; a target that answers `Frontend: none` loses the frontend rows; and a target that never answered `Roles` keeps every role's skills until it does, with `plan` naming `Roles` as the open fact.

Satisfies: RFC-0001/G-2.

### D-3 The plan command

`node scripts/profiles.js plan` reads the table, the facts and each skill's frontmatter, and prints, changing nothing:

```
skills: 54 of 85 active, 13,085 of 28,525 description characters (46%)
agents: 2 of 6 active
mcp: 0 of 2 active
open facts: none
inactive skills: ads, analytics, ... (one line per kind)
```

The character count is the length of each active skill's `description`, skipping skills with `disable-model-invocation: true`, which no harness lists. `--json` prints the same as one object for the tests and for session-start. Exit 0, or 1 when the table has errors.

Phase 1 ships this alone: a dry run any target can run to see what the profile would do.

Satisfies: RFC-0001/C-1.

### D-4 Apply and the adapter seam

`node scripts/profiles.js apply [--dry-run]` selects, hands the selection to the three adapters in the order MCP, agents, skills, and applies the entries they return through one repo edit. `--dry-run` prints the entries instead. Each adapter is `(selection, view) → { entries, lines }` and returns nothing for a kind whose rows are all active and whose files are already in that state, so a second run changes nothing.

An adapter whose files are missing (no `opencode.json`, no catalog yet) returns nothing for them and says nothing. A refused write is reported by path, the run goes on, and the exit code is 1.

Satisfies: RFC-0001/C-3, RFC-0001/C-7.

### D-5 The MCP adapter

A server is switched off, never removed, so turning it back on needs nothing from the network or the upstream:

- **Claude Code:** `disabledMcpjsonServers` in `.claude/settings.json` lists the inactive servers that have rows. A name in that list without a row is the project's and stays; a row's name is added or removed. `mergeSettings` keeps the key on every update, because it is not one of the harness's hooks.
- **OpenCode:** each `mcp.<name>` in `opencode.json` that has a row gets `enabled` set to whether it is active. A server the file does not hold is not added.

`.mcp.json` is not edited, so its keyed merge with the upstream never sees a change. Phase 2 ships this adapter with the two server rows.

Failure modes: a settings file or `opencode.json` that is not JSON is left as it is and reported.

Satisfies: RFC-0001/C-2, RFC-0001/C-3, RFC-0001/C-7.

### D-6 The catalog and the link adapter

Everything the upstream ships moves to a catalog, and the folders the harnesses read hold links into it for the active set:

| Path | Holds | Tracked |
| --- | --- | --- |
| `.agents/catalog/skills/<name>/` | every shipped and vendored skill, active or not | yes |
| `.agents/catalog/agents/<name>.md` | every agent | yes |
| `.agents/skills/<name>` | a relative link to the catalog for each active skill, beside the project's own skills | links no, the project's skills yes |
| `.agents/agents/<name>.md` | a relative link for each active agent, beside the project's own | the same |

The links are generated, not committed. `apply` lists each one it made in a block of `.git/info/exclude` that it owns and rewrites:

```
# ai-harness profiles: written by scripts/profiles.js apply
/.agents/skills/tdd
/.agents/agents/engineer.md
# end ai-harness profiles
```

This answers RFC-0001/Q-3. A clone made with `core.symlinks=false` checks a committed link out as a text file (verified 2026-11-11: `.claude/skills` became a 17-byte file holding `../.agents/skills`), so a committed per-skill link would hide every skill from every harness there. A generated one is made on the clone itself. Where `core.symlinks` is false or repo edit reports it could not create the symlink, `apply` falls back by kind (ADR-0009/D-2): a skill folder gets an absolute junction, which Windows makes without a privilege, and an agent file, which a junction cannot point at, gets a copy, as does a skill where the junction is refused too. Both are excluded the same way. Each run rewrites a junction that no longer points at this clone's catalog, as after the repository folder moved, and a copy whose files differ from the catalog's. Nothing a clone generates reaches a commit, so a copy is never mistaken for an edit. Repo edit gains a junction write beside its `dir` symlink, and `relinkPlan` leaves alone any entry listed in the exclude block: the junctions it rewrites as relative links are the ones `npx skills` wrote, not the ones `apply` made.

A name the project holds as a tracked folder or file is the project's: the adapter neither replaces nor links over it, and `plan` reports it as shadowing the catalog entry. `relinkPlan` keeps linking the harness folders (`.claude/skills` and the rest) to `.agents/skills`, unchanged.

Phase 3 builds the adapter for agents, phase 4 for skills.

Satisfies: RFC-0001/C-2, RFC-0001/C-3, RFC-0001/C-4.

### D-7 Collecting, restoring and migrating skills

Three ways a real folder lands in `.agents/skills` where the adapter expects a link, and what `apply` does with each:

- **`npx skills add`** writes an untracked folder and a lock entry. `apply` moves an untracked folder whose name the lock records into the catalog, replacing any copy there, then links it. Until the skill has a row it stays active, as an unlisted one does everywhere else (D-1 fails open), and the invariants fail until the row exists (D-8).
- **`npx skills update`** and **`node scripts/skills.js install`**, which restores every locked skill with `npx skills experimental_install`, replace a generated link with a folder rather than writing through it (R-3, checked in phase 4). `apply` collects such a folder too when it differs from the catalog and the clone still holds a generated link, since there `apply` never writes a copy, and links only the active ones. The catalog copy it replaces stays in the index, so the new version shows as a change to review. The lock stays at the root and keeps its union merge; nothing about `npx skills` changes.
- **An update from a release before the catalog** finds the vendored skills as tracked folders in `.agents/skills`. A post-apply step in `update-harness.js`, before `profiles.js apply`, removes each tracked folder whose name the catalog now holds and the upstream shipped at the receipt's base, read through the base reader update-harness already has. That is the outcome an update gives an edited vendored skill today (RFC-0001/Q-1): the upstream's version replaces it. A name the upstream never shipped is the project's and stays, shadowing the catalog entry (D-6).

`scripts/harness-files.tsv` gains `.agents/catalog/skills/` with the `skills` policy ("added and updated, never removed"), while the catalog agents stay under the `.agents/` merge row, the first matching row winning; and `.agents/skills/` and `.agents/agents/` become `template`: the upstream ships nothing there, and the project's own entries are its own.

Phase 4 moves the skills group by group, as consecutive commits, frontend first; each commit leaves the unmoved skills as plain folders the adapter does not manage.

Failure modes: a lock entry whose folder `npx skills` did not restore is reported by `skills.js missing`, as today. A move that fails leaves the folder where it was and is reported.

Satisfies: RFC-0001/C-3, RFC-0001/C-4.

### D-8 Harness invariants

- **Every shipped entry has a row.** Phase 1 holds the upstream to it in the decision table `.agents/hooks/tests/tables/profiles.js`, which runs on this checkout: every folder under `.agents/skills`, every agent and every `.mcp.json` server has exactly one row. From phase 4 it is a harness invariant over the catalog, so a target that vendors a skill with `npx skills add` is told to classify it, as it is told to add a licence row.
- **Every row names an entry.** A row whose name is in no catalog, no skills folder and no MCP file is reported, so a renamed skill does not leave a dead row.
- **A routed skill is in the catalog.** `everyRoutedSkillIsInstalled` accepts a skill that is in the catalog, active or not, since a profile may switch a routed skill off.
- **The skills folder holds skills or generated links.** `skillsFolderHoldsSkillsNotLinks` becomes: every link under `.agents/skills` is untracked and points into the catalog; a tracked link is reported.
- **The reference profile fits.** The same table runs `plan` on the RFC's reference profile (daemon, C#, no frontend, no tracker, roles engineer and devops) and fails above 14,300 description characters.

`readRoster` reads the catalog beside `.agents/skills`, so the notice and the frontmatter checks cover inactive skills too.

Satisfies: RFC-0001/C-1, RFC-0001/C-6.

### D-9 When apply runs

- **`project-init`** runs it as its last step, once the facts are written.
- **`update-harness.js`** runs it after `skills.js relink` among its post-apply steps, so a fact change and an update in one merge resolve the same way in either order: `apply` reads the final state.
- **The post-merge hook**, through a `stacks.tsv` row: `profiles`, triggered by `MEMORY.md scripts/profiles.tsv .agents/catalog/skills/*/SKILL.md .agents/catalog/agents/*.md`, needing nothing, restoring with `node scripts/profiles.js apply`.
- **`skills.js install`** runs it after restoring (D-7).
- **`session-start.js`** runs `plan --json` and, when a generated link is missing or stale, runs `apply` and says so in one line: a fresh clone, a cloud session included, gets its links before the agent reads a skill. It also names any open fact, so a target that never answered `Roles` learns why it still loads every role.

Satisfies: RFC-0001/C-3.

### D-10 The Roles and Unit type facts

`Roles` joins `FACTS` as an optional fact: the agents this repo runs, comma-separated, from the names under `.agents/catalog/agents/`. Optional, so a target that never answers it keeps every agent (D-2). `project-init` asks it after `Issue tracker`, offering the agents as choices.

`Unit type` stays free text, and `project-init` offers the wider list RFC-0001 named: `service`, `library (npm)`, `library (NuGet)`, `library (Composer)`, `console`, `desktop`, `daemon`, `microservices`, `none`. Rows match its first word (D-1), so `library` matches all three registries.

Phase 3 ships both with the agent adapter.

Satisfies: RFC-0001/G-3, RFC-0001/C-5.

### D-11 The requirements-only profile

A project that gathers requirements and writes no code answers `Unit type`, `Language` and `Runtime / package manager` with `none`. `check-initialised.js` already accepts that: `none` is an answer. The coding skills (`tdd`, `implement`, `codebase-design`, `code-review`, the language groups and the rest) get `Language != none` as their condition, and the `engineer` and `devops` agents go off through `Roles`. The chain skills up to SPEC stay `always`.

Phase 5 ships the rows once phases 3 and 4 can turn the coding groups off.

Satisfies: RFC-0001/G-2.

### D-12 Routing to an inactive skill

A route row may name a skill the profile switched off. `.agents/routing.md` tells agents to skip such a row: a skill not under `.agents/skills` is inactive for this project, and the agent says so if the user asks for it, naming the fact that would turn it on. Nothing loads its description, so it costs no context.

Satisfies: RFC-0001/C-1.

## Data model

- **The profile table:** `scripts/profiles.tsv`, one row per name and kind, shipped by the upstream under the `merge` policy of `scripts/`, so a project may add rows for its own vendored skills.
- **A selection:** derived, never stored. `{ name, kind, when, active, open }` per row, plus the table's errors.
- **Generated entries:** links or copies under `.agents/skills` and `.agents/agents`, and the block in `.git/info/exclude`. Local to a clone, rewritten by every `apply`, never committed.
- **Switches:** `disabledMcpjsonServers` in `.claude/settings.json` and `enabled` in `opencode.json`. Committed, since they follow the committed facts.
- **The catalog:** `.agents/catalog/skills/` and `.agents/catalog/agents/`, tracked, written by the installer under the `skills` policy and by `apply` when it collects a vendored skill.

## Interfaces

`scripts/profiles.js`, a module first, as `skills.js` is:

| Export | Shape |
| --- | --- |
| `FILE` | `"scripts/profiles.tsv"` |
| `parse(text)` | `{ rows: [{ line, name, kind, when, clauses }], errors: [{ line, message }] }` |
| `select(facts, rows)` | `[{ ...row, active, open: [label] }]` |
| `plan(view)` | `{ kinds: { skill, agent, mcp: { active: [name], inactive: [name] } }, chars: { active, total }, open: [label], shadowed: [name], errors }` |
| `apply(root, { dryRun })` | `{ entries, lines, refused: [path] }` |

The command line, exiting 0 on success, 1 on table errors or refused writes, and 2 on bad usage:

```
node scripts/profiles.js plan [--json]
node scripts/profiles.js apply [--dry-run]
```

`scripts/project-facts.js` gains the `Roles` fact; `scripts/skills.js` gains catalog reading in `readRoster`; `scripts/update-harness.js` gains the migration step and the `apply` step; `scripts/stacks.tsv` gains the `profiles` row; `.agents/hooks/session-start.js` gains the stale check.

## Rollout

Each phase is a commit or a few, leaves every test passing, and reverts on its own. The release waits for all five.

| Phase | Ships | Reverting it |
| --- | --- | --- |
| 1 | D-1, D-2, D-3, the self-check half of D-8 | deletes two files |
| 2 | D-4 and D-5: the `apply` command and the MCP switches; of D-9, the `stacks.tsv` row and the runs from `update-harness.js` and `project-init` | `apply` with every row `always` clears the switches |
| 3 | D-6 for agents, D-10 and the session-start check of D-9 | moves the agents back to `.agents/agents/` |
| 4 | D-6 and D-7 for skills, the rest of D-8 and D-9, D-12 | per group: moves that group's folders back |
| 5 | D-11 | sets the rows back to `always` |

## Risks

- R-1: the reference profile's headroom is about 900 characters, and one more always-on skill of average size uses half of it. The self-check in D-8 fails before a release does, and `plan` prints the margin.
- R-2: a fresh clone that never ran a session hook or `apply` has no generated links, so a harness started without hooks sees only the project's own skills. Likely for a tool with no session-start wiring (Codex, Cursor). `session-start.js` covers Claude Code and OpenCode; `githooks-init.js` runs `apply` too, and the session brief tells the others to.
- R-3: `npx skills experimental_install` may write through a link into the catalog, or replace the link with a folder. D-7 handles both: a write through the link updates the catalog in place, and a folder is collected. Settled in phase 4 on a scratch clone: it replaces the link with a folder.
- R-4: Claude Code may ignore `disabledMcpjsonServers` in a project's shared settings. Checked on 2026-11-11 with `claude mcp list` on this checkout: it honours the list. Had it not, the adapter would have fallen back to removing the entry from `.mcp.json` and restoring it from the upstream's copy.
- R-5: an existing target that never answers `Roles` saves nothing from the role groups. The open-fact line in the session brief says why, and `project-init` asks it on its next run.

## Test strategy

- **The selector** is a decision table, `.agents/hooks/tests/tables/profiles.js`: parsing (each error kind, by line), matching (`C# 13`, a list, `none`, case), `and` and `or`, and failing open (no line, an empty value, a placeholder).
- **`plan`** runs against a `files` repo view with a small table, facts and three skills, and its JSON is compared whole; the character count skips a user-only skill.
- **Each adapter** runs against `repo-view` and `repo-edit`'s `mapEdit`: the MCP switches with a project's own disabled server kept, a non-JSON settings file left; links made, a link refused (`mapEdit` with links off) turning into a junction for a skill and a copy for an agent, a junction refused too turning into a copy, a tracked name shadowing, a second run changing nothing.
- **Collect and migrate** run in `update-harness`'s tables against a fake upstream with a receipt: a vendored folder removed, a project's folder of the same name kept, an untracked lock-recorded folder collected.
- **On this checkout**, in the same table: every shipped entry has one row, every row names an entry, and the reference profile fits under 14,300 with no fact left open.
- **For real**, once per phase on this checkout: `plan` before and after, and in phase 4 a scratch target updated from 0.9.1, with `git status` clean afterwards.
