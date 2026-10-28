# Interview: making the BDD stage executable

**Kind:** stakeholder
**Date:** 2026-10-12
**Participant:** Yaroslav Zhmayev, maintainer of the harness
**Interviewer:** Claude, in a working session; no interview skill ran, and the questions after the second were never put to him
**Context:** He asked whether the chain's BDD documents could be formalised with a Gherkin runner, read the assessment, and then asked for it to be part of what the template scaffolds. The session built it from that one sentence: an extractor that writes `docs/bdd/` out as feature files, a runner in every scaffold row, and the wiring in `project-init`. The decision is hard to reverse once projects are created from the template, so it needs an ADR, which only he can start with `/grill-with-docs`; this record is what the ADR will derive from, and items 3 to 6 are the session's own choices for him to confirm or overturn there.
**Record:** transcript of the session

## Questions and answers

1. **Can SpecFlow, cucumber-tsflow and the like formalise the BDD documents?** His words: "can we use SpecFlow, cucumber-tsflow etc to formalize BDDs?". The assessment given: yes, since the `bdd-scenarios` skill already writes Gherkin in fenced blocks, so a runner can execute what the document holds; SpecFlow is end-of-life and Reqnroll is its successor on .NET; cucumber-js with cucumber-tsflow covers Node and pytest-bdd covers Python; the open question was whether the document or a feature file is the record.
2. **Should it be part of the scaffolded stack?** His words: "I want to make specflow-like BDD part of the development stack scaffolded in new projects". Taken as the decision: every stack row in `scripts/stacks.tsv` installs its Gherkin runner, and `project-init` wires it.
3. **Is the document or the feature file the record?** Not asked. Taken: the document, because `docs-check` reads only `.md` under `docs/` and a feature file kept by hand would drift from it. `scripts/bdd-features.js` writes each document's gherkin blocks out as `tests/features/NNNN-<slug>.feature`, generated and ignored by Git, and refuses a document whose shape would not run. The alternative turned down without him: feature files committed under `tests/` as the record, with the document pointing at them.
4. **How does a SPEC cite a scenario?** Not asked. Taken: a `# SC-n` comment line directly above each scenario, above its tags, at the start of the line. Gherkin reads it as a comment and `docs-check` reads it as an item, so `BDD-NNNN/SC-n` resolves with no change to the validator. The alternative turned down without him: a tag such as `@SC-1`, which `docs-check` does not count as an item.
5. **One runner for every stack, or the native one each?** Not asked. Taken: the native one each, Reqnroll with xUnit on .NET, cucumber-js with cucumber-tsflow through tsx on Node, pytest-bdd on Python, so the acceptance tests run with the stack's own test command and the developer learns no second tool. The alternative turned down without him: one runner, cucumber-js, for every stack, which would put Node in every project.
6. **Where do the feature files live on .NET, which compiles them?** Not asked. Taken: one `tests/features/` folder for every stack, which the `tests/{Name}.Acceptance` project links through a `ReqnrollFeatureFile` item with `ReqnrollUseIntermediateOutputPathForCodeBehind` on, so the extractor has one output folder and nothing copies files. The alternative turned down without him: `--out=tests/{Name}.Acceptance/Features` on .NET, which the extractor supports and which keeps the files inside the project.

## Also heard

- Surprise: Reqnroll evaluates its feature items before any target runs, so an MSBuild target calling the extractor cannot include the files it just wrote in the same build; the extractor stays a separate step before the runner, on every stack.
- Only the Node wiring was run in the session: the extractor wrote the feature, cucumber-js ran the bound scenario and failed the run on the one without a step definition. The .NET and Python wiring in `project-init` was written from Reqnroll's and pytest-bdd's documentation.
- Commitment: he runs `/grill-with-docs` to record the decision as an ADR deriving from this file; `TODO.md` carries the `#deferred` line for it and the `#assumption` lines for items 3 to 6.
