# TODO

- [ ] The skills reinstall on Windows in a00acdd rewrote about 33 computedHash values in skills-lock.json for skills whose files did not change; check whether line endings or the skills CLI version cause it, and whether a clone on another OS then sees every skill as modified #question (skills-lock.json)
- [ ] The docs portal renders and links the root GLOSSARY.md only; a glossary beside each context's CONTEXT.md in a multi-context repo is checked by the hooks but has no page and no links #deferred (tools/docs-site/glossary.mjs)
- [ ] An install receipt older than the skeleton list is taken to know every skeleton, so such a target gains no GLOSSARY.md from an update and keeps its terms in CONTEXT.md until someone moves them #assumption (scripts/update-harness.js)
- [ ] The two interview records for the glossary, of 2026-10-02 and 2026-10-03, were written from the sessions' answers and not shown to the maintainer before they were committed; confirm they say what was asked and answered #assumption (docs/research/interviews/)
