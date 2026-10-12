# Interview: the executable BDD decision, grilled

**Kind:** stakeholder
**Date:** 2026-10-12
**Participant:** Yaroslav Zhmayev, maintainer of the harness
**Interviewer:** Claude, running `grill-with-docs` through the question tool, in three rounds and a confirmation
**Context:** The session of the same day had built the executable BDD stage from one sentence of his and recorded, in `docs/research/interviews/2026-10-12-executable-bdd.md`, four choices it made without asking. He ran `/grill-with-docs` to record the decision as an ADR. Each question put what had been built against its alternatives, recommending the built one where it still looked right; two questions recommended changing it.
**Record:** transcript of the session

## Questions and answers

1. **What is the record of a scenario, the document or a feature file?** The document, with `tests/features/` a generated copy ignored by Git. Turned down: committing the generated copy, and the feature file as the record with the document pointing at it.
2. **How does a SPEC cite one scenario?** A `# SC-n` comment line directly above it. Turned down: an `@SC-n` tag, which would need the validator to count tags, and no ids at all.
3. **One runner per stack, or one for every stack?** The native one each: Reqnroll, cucumber-js with cucumber-tsflow, pytest-bdd. Turned down: cucumber-js everywhere.
4. **Where do the feature files live?** One `tests/features/` for every stack, which the .NET project links. Turned down: a folder inside each runner's project, with `--out` on .NET.
5. **What happens on a step nobody bound?** The run fails. Turned down: Reqnroll's pending outcome, which passes.
6. **May the Gherkin keywords be in another language?** No: English keywords, the prose language in titles and step text, and a `# language:` line other than `en` refused. This changes what was built, which wrote such a document unchecked. Turned down: keeping that, and vendoring Gherkin's dialect table.
7. **Where is a document that would not run caught?** At commit, by the chain check the pre-commit hook already runs, which also changes what was built. Turned down: at test time only.
8. **Which test framework hosts Reqnroll?** xUnit, the framework of the scaffold's unit tests. Turned down: NUnit, Reqnroll's default, and TUnit.
9. **Is the extractor part of each test command?** No, a separate step before the runner, with Node's `test:acceptance` script the one convenience. Turned down: an MSBuild target and a pytest conftest calling it, which would need Node on every stack.
10. **Which terms does the glossary gain?** All three offered: feature file, scenario id, and acceptance test, the one not recommended.
11. **Does a Git hook ever regenerate the feature files?** No, the test step only. Turned down: the post-merge hook running the extractor when a merge touched `docs/bdd/`.
12. **Is that the shared understanding?** Yes, everything in one commit: the ADR, the glossary, this record, and the code changes of questions 6 and 7.

## Also heard

- The four choices the first record listed as unasked, its items 3 to 6, were put as questions 1 to 4 and confirmed as built.
- Every recommended answer was taken; question 10 added the term that was not recommended.
- The .NET and Python wiring stays unverified after the session, and its line stays in `TODO.md`.
