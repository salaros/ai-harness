# ADR-0009: A catalog on disk and a profile pick the active set

**Derived from:** RFC-0001, docs/research/interviews/2026-11-12-catalog-layout.md

Every target exposed every skill, every agent and both MCP servers to every session, and the descriptions alone cost about 28,500 characters of context whatever the project was. RFC-0001 argued four ways to narrow that and accepted OPT-1: keep everything on disk, and let the project facts decide what each harness sees. This records the shape that changes in every target, the layout most of all, since moving it again would mean a second migration of every target.

## Decision

### D-1 everything the upstream ships lives in a catalog

Every shipped or vendored skill is a folder under `.agents/catalog/skills/<name>/`, and every agent a file at `.agents/catalog/agents/<name>.md`, tracked, active or not. `skills-lock.json` stays at the root with its union merge. A skill added with `npx skills add` lands in `.agents/skills` as before, and `apply` moves it into the catalog.

### D-2 the harness folders hold generated links to the active set

`.agents/skills/` and `.agents/agents/` hold, beside the project's own entries, one link per active catalog entry. `apply` makes them on each clone and never commits them; it lists them in a block of `.git/info/exclude` that it owns and rewrites. A relative symlink comes first. Where the clone refuses one, a skill folder gets an absolute junction and an agent file a copy, and each run rewrites a junction gone stale or a copy that drifted from the catalog.

### D-3 a project's own entry shadows the catalog

A tracked entry in `.agents/skills/` or `.agents/agents/` with a catalog entry's name is the project's. Nothing is linked over it, and `plan` reports the shadow.

### D-4 one table and one selector decide

`scripts/profiles.tsv` gives every catalog entry and every MCP server one row with a condition on the project facts, and `scripts/profiles.js` alone reads it. A test on a fact with no answer is true and the fact is reported as open, so a profile only ever narrows what a target has. An MCP server the profile does not need is switched off in each harness's settings, never removed, and `.mcp.json` is never edited.

### D-5 two facts carry the profile

`Roles` is an optional fact listing the agents the project runs by their catalog names. `Unit type` stays free text; `project-init` offers service, library (npm, NuGet or Composer), console, desktop, daemon, microservices and none, and a row matches the first word of an answer.

### D-6 an update moves an existing target once

An update from before the catalog removes each tracked folder in `.agents/skills` that the catalog now holds and that the upstream shipped at the receipt's base, edited or not. A name the upstream never shipped stays, as a shadow.

## Why

- Committed links fail on the clones least able to recover: with `core.symlinks=false` Git checks a link out as a text file (seen on this checkout, where `.claude/skills` became a 17-byte file), and every harness then loses every skill. A link made on the clone itself can fall back to what that clone can do.
- The ignore list belongs to the clone because the links do. A block in `.gitignore` would change a tracked file on every fact change, and two branches with different answers would conflict there over nothing.
- A junction keeps one copy of each skill where symlinks are refused, and `npx skills` already writes them on Windows. It is absolute, which a committed link cannot be and a generated one may. A junction cannot point at a file, so agents fall back to a copy.
- The catalog sits under `.agents/` because everything the harness owns does; a root `catalog/` folder would sit in every target beside `src/` and `docs/`.
- A shadow lets a team override a vendored skill on purpose. Refusing the clash would block commits for a deliberate choice; replacing the entry would delete tracked work.
- The migration replaces an edited vendored skill because an update already does that today (RFC-0001/Q-1): keeping the edit only now would freeze that skill against every later update.
- Failing open keeps the upstream, which has no `MEMORY.md`, and every unconfigured clone exactly as they were. A skipped question costs context; a skill hidden by a question nobody asked costs a capability nobody knows is missing.
- Roles are agent names because the agents are what they switch on: one vocabulary, offered as choices, and a new agent is a new role with no new mapping.

## Consequences

- Every existing target changes layout on its first update past 0.9: the vendored folders leave `.agents/skills`, and links that `git status` does not show replace them.
- A fresh clone has no links until `apply` runs. Session-start runs it when a link is missing or stale, `project-init` and the installer run it, and the post-merge hook runs it when `MEMORY.md` or the table changes.
- `scripts/harness-files.tsv` gives `.agents/catalog/` the skills policy and makes `.agents/skills/` and `.agents/agents/` template paths: the upstream ships nothing there any more.
- `relink` leaves alone a junction or copy that `apply` listed in its exclude block, so the two do not undo each other on a clone without symlinks.
- A skill vendored into a target needs a profile row before its commits pass, as it already needs a licence row (ADR-0006), and its folder moves whole, licence included.
- `GLOSSARY.md` gains Catalog, Profile, Active set, Generated link and Shadow, and Skill roster covers the catalog.
- SPEC-0004/D-6 adds the junction to its fallback.
