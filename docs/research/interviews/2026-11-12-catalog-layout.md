# Interview: the catalog layout, grilled

**Kind:** stakeholder
**Date:** 2026-11-12
**Participant:** Yaroslav Zhmayev, maintainer of the harness
**Interviewer:** Claude, running the `grilling` skill through the question tool, in three rounds and a confirmation
**Context:** RFC-0001 accepted OPT-1 on 2026-11-09 and asked for an ADR recording the catalog layout and the profile table. SPEC-0004 held its catalog sections (D-6, D-7) until that ADR existed. Phases 1 and 2 had shipped `plan` and the MCP switch-off, so fail-open and the switch-off were already built when the session ran. He started it with "/grill-with-docs for the catalog-layout ADR".
**Record:** transcript of the session

## Questions and answers

1. **One ADR or several?** One, covering the catalog, the generated links, the profile table with fail-open, the MCP switch-off, and `Roles` and `Unit type`, as RFC-0001's resolution asks. Two ADRs, and one for the layout alone, were turned down.
2. **Where does the catalog live?** `.agents/catalog/skills/<name>/` and `.agents/catalog/agents/<name>.md`. Sibling folders (`.agents/skills-catalog/`) and a `catalog/` folder at the repository root were turned down.
3. **Are the links to the active set committed or generated?** Generated on each clone and untracked. Committed links were turned down: a clone with `core.symlinks=false` checks a committed link out as a text file, verified on this checkout on 2026-11-11, so every harness would lose every skill there.
4. **What values does `Roles` take?** Agent names from the catalog, comma-separated. Free role labels mapped by the table were turned down.
5. **What does `apply` write where a relative symlink is refused?** An absolute junction for a skill folder, which Windows makes without a privilege and `npx skills` already writes; a copy for an agent file, which a junction cannot point at, and for a platform with neither. Each run rewrites a stale junction or a copy that drifted. A copy for everything, and no fallback, were turned down.
6. **Where are the generated links ignored?** In a block of `.git/info/exclude` that `apply` owns. A block in `.gitignore`, which every fact change would rewrite and two branches with different profiles would conflict in, and static `.gitignore` rules for every catalog name were turned down.
7. **A target's tracked entry has a catalog entry's name: which wins?** The target's. `apply` links nothing over it and `plan` reports the shadow. Refusing until it is renamed, and replacing it with a link, were turned down.
8. **Which tracked folders does the migration remove?** Each one the catalog now holds that the upstream also shipped at the receipt's base, edited or not. Removing only unedited ones, and leaving all in place, were turned down.
9. **What happens to a skill added with `npx skills add`?** `apply` moves it into the catalog and links it, and it needs a profile row before commits pass. Leaving it a tracked folder outside the profile was turned down.
10. **What do the rows of an unanswered fact do?** Stay active, with `plan` and session-start naming the open fact. Failing closed was turned down.
11. **Is `Unit type` free text or a closed list?** Free text, with the wider list offered by `project-init` and rows matching the first word. A closed list was turned down.
12. **Which terms go into the glossary?** All four offered: Catalog, Profile and Active set, Generated link, Shadow. Skill roster is widened to include the catalog.

## Also heard

- The interviewer proposed the junction after finding that `scripts/repo-edit.js` makes only `dir` symlinks and that `scripts/skills.js` already handles the junctions `npx skills` writes. That a junction needs no privilege on Windows was given from the interviewer's knowledge of Node's `fs.symlinkSync` and not tested in the session.
- The junction answer revises SPEC-0004/D-6, which had a copy as the only fallback.
- Shared understanding confirmed before anything was written, with the SPEC revision in the same change as the ADR.
