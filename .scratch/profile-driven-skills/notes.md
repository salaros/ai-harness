# Profile-driven skills (RFC-0001 OPT-1)

Work that outlives one context window: the SPEC, five phases, then release 0.10.0.

## Decisions

- 2026-11-10: the user chose to build all five phases before releasing 0.10.0 (not ship now, not phases 1-2 only). Release = annotated tag on master, release.yml publishes to npm (README.md:100-106). Last tag 0.9.1.
- 2026-11-10: the SPEC cites RFC-0001 directly (an accepted RFC may be cited by a SPEC). The ADR for the catalog layout is written by the user with /grill-with-docs before phase 3, the first step that needs the catalog (agents need one too).
- Phases, from TODO.md: 1 dry run (profiles.tsv, selector, profiles.js plan), 2 MCP gated by facts, 3 agents by Roles, 4 skills to .agents/catalog/ by group (frontend first), 5 requirements-only profile.
- 2026-11-11: the selector fails open: a clause over a fact that has no line or is unanswered is true, so the upstream (no MEMORY.md) and an unconfigured clone keep everything.
- 2026-11-11: MCP is gated by switching servers off, not by removing entries: `disabledMcpjsonServers` in .claude/settings.json (a project key, which mergeSettings keeps) and `enabled: false` in opencode.json. Nothing to re-add, so no MCP catalog is needed.
- 2026-11-11: the SPEC proposes generated, untracked links in .agents/skills and .agents/agents (listed in .git/info/exclude, copies where the platform cannot link). That answers Q-3 without a tracked-file fallback. Hard to reverse, so the ADR decides it.
- 2026-11-11: the lock stays at the root. skills.js install and npx skills add write real folders into .agents/skills; apply collects an untracked, lock-recorded real folder into the catalog, then links it.
- 2026-11-11: the migration in update-harness removes a tracked real folder in .agents/skills only if the upstream shipped that name at the receipt's base; any other is the project's and stays.

## Verified facts

- duck-debt was dropped in 41d0d47; loose-ends step 5 sweeps comments.
- check-initialised accepts `none` already: it is an answer. The requirements-only TODO entry is wrong to say otherwise.
- A clone made with core.symlinks=false checks .claude/skills out as a 17-byte text file holding `../.agents/skills`: Claude Code sees no skill on such a clone today.
- opencode.json is `template` in harness-files.tsv (never shipped); .mcp.json is `keyed`; .claude/settings.json is `settings` (mergeKeys: the project's keys stay).
- stacks.tsv patterns: `*` matches within one path segment, by full path or basename.
- check-harness has `skillsFolderHoldsSkillsNotLinks` (line 236), which phase 4 must change.
- Git hooks: commit-msg, post-merge, pre-commit, pre-push. No post-checkout.
- Phase 1 done: the reference profile selects 54 of 85 skills, 13,085 of 28,525 description characters (cap 14,300). No C# or PHP skill is in the repo (csharp-*, php-pro are user-level).
- package.json `files` ships only the installer scripts; profiles.js reaches a target through the scripts/ merge row.
- 2026-11-11: Claude Code honours `disabledMcpjsonServers` in the project's shared `.claude/settings.json` (checked with `claude mcp list`), so R-4 is closed.
- 2026-11-11: phase 2 on a scratch install: `update-harness.js` ends with `profiles: nothing to change`; with no tracker and no frontend `apply` switches atlassian and figma off, a second run changes nothing, and Jira switches atlassian back on. The installer targets its own checkout unless given `--target`, so a scratch install runs `node <upstream>/scripts/update-harness.js --from <upstream> --target <dir>`.
- 2026-11-12: ADR-0009 records the layout (grilled, docs/research/interviews/2026-11-12-catalog-layout.md). It changed one thing in the SPEC: where a symlink is refused, a skill folder gets an absolute junction and an agent file a copy, and relinkPlan must leave apply's excluded entries alone. Phase 3 is unblocked.
- 2026-11-12: phase 3 on this checkout: the six agents moved to .agents/catalog/agents, apply linked them and listed them in .git/info/exclude, git status shows no link, and a second run says `nothing to change`. Session-start remade a deleted link and said so in one line. The installer removes a tracked agent the base shipped (or every catalog name under --adopt with no base); a link, a name never shipped and the project's own stay.
- 2026-11-12: scratch update 0.9.1 -> phase 3: the six shipped agents are removed and their deletions staged (an edited one too), mine.md stays, Roles links only engineer and devops, `git add -A` stages no link, a second apply changes nothing, self check 43 passed. Without staging, the links showed as type changes of tracked files (fixed in f92a956). To install an old release, use `--from` a clone checked out at the tag: `--from` installs that checkout's HEAD whatever `--ref` says.
