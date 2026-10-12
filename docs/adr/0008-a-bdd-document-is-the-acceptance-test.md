# ADR-0008: A BDD document is the acceptance test

**Derived from:** docs/research/interviews/2026-10-12-executable-bdd-grilled.md, docs/research/interviews/2026-10-12-executable-bdd.md, https://github.com/reqnroll/Reqnroll, scripts/feature-file.js

A BDD document held Gherkin that nothing ran. The `bdd-scenarios` skill wrote scenarios into fenced blocks, `docs-check` walked their citations, and a project created from the template had no runner to execute them, so the stage ended where the prose did. The maintainer asked for a SpecFlow-like runner as part of what the template scaffolds.

## Decision

### D-1 the document is the record, and the feature file a generated copy

A scenario lives in `docs/bdd/NNNN-<slug>.md`, in a ```gherkin block, and nowhere else. `scripts/bdd-features.js` writes each document's blocks out as `tests/features/NNNN-<slug>.feature`, headed by the document it came from. The folder is ignored by Git and is the extractor's own: it removes a file it wrote for a document since renamed and leaves a hand-written `.feature` alone. Nobody edits a feature file.

### D-2 a scenario is cited by the `# SC-n` line above it

Each scenario carries `# SC-n` on the line directly above it, above its tags, at the start of the line. Gherkin reads it as a comment and the chain reads it as an item, so a SPEC cites `BDD-NNNN/SC-n` and the validator changes nothing. The line stays in the feature file, where the runner's report shows it.

### D-3 every stack runs its own Gherkin runner

Each scaffold row in `scripts/stacks.tsv` installs the runner native to its stack: Reqnroll on xUnit for .NET and Aspire, cucumber-js with cucumber-tsflow through tsx for npm, pnpm and yarn, pytest-bdd for Python. `project-init` wires each one after the scaffold has run.

### D-4 one `tests/features/` folder for every stack

The extractor has one default output folder, whatever the stack. The .NET acceptance project links it through a `ReqnrollFeatureFile` item with `ReqnrollUseIntermediateOutputPathForCodeBehind` on, which Reqnroll supports from 3.3, rather than having the extractor write into the project.

### D-5 the extractor is a step before the runner, and no hook runs it

`node scripts/bdd-features.js` runs before the runner, locally and in CI. Node's `test:acceptance` script wraps the two because Node is there anyway; `dotnet test` and `pytest` read what the folder holds and need no Node. The post-merge hook does not regenerate the folder.

### D-6 a step without a definition fails the run

Reqnroll's `missingOrPendingStepsOutcome` is `Error`, cucumber-js runs strict, and pytest-bdd raises. A scenario written before its code is a red test.

### D-7 the keywords are English

`Feature:`, `Scenario:`, `Given`, `When` and `Then` are syntax and stay English. The prose language `MEMORY.md` names goes in the titles and the step text. A `# language:` line naming anything but `en` is refused.

### D-8 a document that would not run is refused at commit

The shape a feature file needs, one Feature, every scenario with an id, no id twice, no other dialect, is a rule of the chain. `scripts/feature-file.js` holds it once: `docs-check` reports a document that breaks it, the edit hook says so after a change, the pre-commit hook refuses the commit, and the extractor writes by the same rule.

## Why

- `docs-check` reads only Markdown under `docs/`. A feature file as the record would leave the BDD stage outside the chain, uncited and ungated. Committing the generated copy beside the document would be two files per scenario to keep in step, and a stale copy that is rebuilt costs one command.
- A tag such as `@SC-1` is the idiomatic Gherkin id, and nothing in the chain counts a tag as an item. The comment line costs no validator change and reaches the runner's report as it is.
- One runner for every stack would be cucumber-js, which puts a Node toolchain into every .NET and Python project and its step definitions in a language the project does not use. Three runners cost three sets of wiring to keep working, which `project-init` carries.
- One folder is one `.gitignore` entry, one sentence in the docs and one `--out` nobody passes. Reqnroll evaluates its feature items before any target runs, so no MSBuild target could call the extractor and compile its output in one build; linking the shared folder keeps the extractor outside the build on every stack alike.
- A generated artifact belongs to the step that needs it. A hook that writes to the working tree after a pull does a second kind of job, and surprises whoever did not ask for it.
- A pending scenario that passes the run hides work nobody did, and CI goes green on scenarios with no code behind them. Red is where `tdd` starts.
- Supporting every Gherkin dialect means vendoring its keyword table and keeping it current, for a case no project has. Writing such a document unchecked, as the first version did, left one kind of document the rules could not see. The keywords are code; the words are the project's.
- A document the extractor refuses at test time has already been reviewed and merged. The pre-commit hook already runs `docs-check` over the staged chain, and one more rule there is what keeps a broken document from landing.

## Consequences

- The vendored `bdd-scenarios` skill writes no `# SC-n` line. The rule lives in `docs/agents/chain.md`, and the edit hook names the scenario that lacks one the moment the document is written.
- `project-init` gains a step that wires the runner, and `scripts/stacks.tsv` says every scaffold installs one. The .NET and Python wiring was written from the runners' documentation and not run; `TODO.md` carries that.
- A prototype repo, which has only a PRD and BDD documents, is held to the same shape.
- CI runs the extractor before the runner on every stack. `--check` stays for a developer who wants to know whether the local folder is current.
- The terms feature file, scenario id and acceptance test are in `GLOSSARY.md`.
- Whether the docs portal anchors a `BDD-NNNN/SC-n` citation to a line inside a fenced block is untried; `TODO.md` carries the question.
