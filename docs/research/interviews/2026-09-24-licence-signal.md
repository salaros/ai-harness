# Interview: a licence inside a skill

**Kind:** stakeholder
**Date:** 2026-09-24
**Participant:** Yaroslav Zhmayev, maintainer of the harness
**Interviewer:** Claude, running the `grilling` skill
**Context:** `TODO.md` deferred an ADR on the rule in `scripts/skills.js` that a licence inside a skill folder marks a copy, until the maintainer ran `/grill-with-docs`. This is that session.
**Record:** transcript of the session

## Questions and answers

1. **Which signals mean "came from somewhere"?** Both a licence file in the folder and a `license:` line in the frontmatter, though the Agent Skills spec allows the field and an author here could fill it in honestly. A skill written here is covered by the root `LICENSE` and has no reason to restate it.
2. **Should a third record of provenance exist**, a row in `scripts/skill-licences.tsv` naming a hand-copied skill's origin without a lock entry? No. The lock is the one record; a hand copy is re-vendored with `npx skills` or, if it really is this repository's own, loses its licence.
3. **Does the rule hold in target repos?** Yes, the same rule everywhere: a target's notice makes the same claim about its own skills, and a false one there is the same failure.
4. **Does `COPYING` count?** Yes. A GPL skill copied in by hand is the case the rule exists for, and `COPYING` is how it arrives.
5. **What happens to a skill from a place `npx skills` cannot fetch** (a private repository, a gist, a zip) that arrives with its licence? It is not vendored here. Stripping an MIT or Apache licence from a real copy is a breach, so removal is only for a skill written here; publishing the skill somewhere fetchable is the way in.
6. **Glossary terms?** Add both: **licence signal** for the fingerprint of a copy, and **orphan** for a skill the notice cannot account for, in either shape.

## Outcome

Shared understanding confirmed, and one branch to carry it: ADR-0006, the two `CONTEXT.md` terms, `COPYING` in the signal names with a table row, the orphan message reworded, and the `TODO.md` entry deleted.
