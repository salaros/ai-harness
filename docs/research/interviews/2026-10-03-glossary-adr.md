# Interview: the glossary decision, grilled

**Kind:** stakeholder
**Date:** 2026-10-03
**Participant:** Yaroslav Zhmayev, maintainer of the harness
**Interviewer:** Claude, running the `grilling` skill through the question tool, in four rounds
**Context:** The glossary work of 2026-10-02 left its decision unrecorded, because an ADR is written with `/grill-with-docs` and only the maintainer starts that. He ran it the next day with "Record as an ADR that a repo's terms live in GLOSSARY.md, apart from CONTEXT.md and in either of two formats". The code was already on the branch, so several questions put what had been built against its alternatives.
**Record:** transcript of the session

## Questions and answers

1. **Once the terms leave, what is `CONTEXT.md` for?** Asked twice. The first time he answered with a question, "which skills depend on the presence of Context.md?". The answer given: eight vendored skills read or write it and `domain-modeling` recreates it when absent; five local skills read it for terms; nothing requires it to exist. Asked again with that, he chose boundary and signpost: what the context is, where it ends, and a line sending the reader to `GLOSSARY.md`, with no term defined in it. Retiring the file and keeping it as a pointer only were the options turned down.
2. **How long may terms stay under `## Language` in `CONTEXT.md`?** Read forever and never refused, with the session brief counting them. Refusing them once `GLOSSARY.md` has terms, and refusing them always, were turned down.
3. **Does one of the two formats become the one a new glossary starts in?** Neither. One format per file, and whoever writes the first entry chooses.
4. **What may an alias be?** Another form of the term's own name: an abbreviation, its long form, a plural. A synonym goes under `_Avoid_`.
5. **How do the vendored skills, which say to write terms to `CONTEXT.md`, get sent to `GLOSSARY.md`?** Asked twice. The first time he asked "can CONTEXT.md say @GLOSSARY.md?". The answer given: it can as text, but the `@` import expands only in Claude Code's memory files, so in `CONTEXT.md` it loads nothing, and in `AGENTS.md` it would load the whole glossary into every session in that one harness. Asked again, he chose the plain signpost with the rule in `AGENTS.md`. The literal `@GLOSSARY.md`, importing the glossary into memory, and a local fork of `domain-modeling` were turned down.
6. **Where do terms live in a multi-context repo?** A glossary per context, beside each `CONTEXT.md`, the root pair being the Shared context. One root glossary grouped by context was turned down.
7. **How is the glossary `teach` writes kept apart from the project's?** `teach` runs from a folder of its own. Exempting `.scratch/` from the shape check was turned down.
8. **Which glossary changes go in with the ADR?** All three offered: tighten "Glossary", add "Alias", add "Context".

## Also heard

- The interviewer corrected its own work of the day before: `docs/agents/domain.md` said `CONTEXT.md` keeps relationships, example dialogue and flagged ambiguities, which the vendored format does not have, and the five local skills still sent readers to `CONTEXT.md` for terms.
- The answer about the `@` import was given from the interviewer's knowledge of Claude Code and not checked against its documentation in the session.
- Shared understanding confirmed before anything was written, with the local skills, `project-init`'s context-map template and the `domain.md` correction in the same change as the ADR.
