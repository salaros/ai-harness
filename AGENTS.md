# AI harness

An AI-agnostic agent harness in a language-agnostic repository: layout, Git hooks, skills and agents. There is no product code yet; whatever lands in `src/` defines the stack.

## Layout

Each folder's README says what belongs in it and how it is organised: `src/`, `tests/`, `scripts/`, `tools/`, `docs/`. Read the one for the folder you are about to touch.

## Project

`MEMORY.md` at the root holds the facts no file derives: what the project is, where its requirements live, the stack, and the issue tracker if the project has one. Read it first. The `project-init` skill writes it; until it exists this is still an unconfigured clone, and that skill is the first thing to run. The `pre-commit` and `pre-push` hooks refuse to let work leave a clone whose `MEMORY.md` is missing or still holds `<placeholders>`, unless an empty `.skip-project-init` at the root says this clone has no project to configure.

## Documentation

The `docs/` folder contains all the relevant information. Depending on the scope of this repo it will store either documentation for a single library, module, microservice or an entire monolith.
This repo and its skills can be used to crack down business requirements in order to develop a prototype of even an MVP.

The following documentation pipeline should be followed:
BRD → PRD → EARS → BDD → ADR → SPEC → TDD → IPLAN → Code

Each stage answers one question, refines the stage before it, and is written with one skill:

| Stage | Answers | Lives in | Skill |
| --- | --- | --- | --- |
| BRD | why the business wants it, and how it will know it worked | `docs/brd/` | `brd` |
| PRD | what the product does for whom | `docs/prd/` | `prd` |
| EARS | each requirement as one testable "shall" statement | `docs/ears/` | `feature-forge` |
| BDD | behaviour as Given/When/Then scenarios | `docs/bdd/` | `bdd-scenarios` |
| ADR | decisions that are hard to reverse | `docs/adr/` | `domain-modeling` |
| SPEC | the technical design that satisfies the requirements | `docs/spec/` | `design-doc` |
| TDD | the failing tests that pin the behaviour | `tests/` | `tdd` |
| IPLAN | ordered implementation steps | `.scratch/` | `create-implementation-plan`; `to-tickets` publishes it to Jira |
| Code | | `src/` | `implement` |

Rules of the chain:

- Start a stage only from the agreed artifact of the stage before it. A missing upstream document is written first, never skipped.
- Write each artifact to the folder in the table, named `NNNN-<slug>.md`, even when the skill's own instructions name another place (`feature-forge` says `specs/`, `create-implementation-plan` says `/plan/`).
- The file name gives the document its ID: `docs/ears/0003-<slug>.md` is `EARS-0003`, and its first heading is `# EARS-0003: <title>`. Anything inside a document that a later stage will refine carries a short ID at the start of its line (`- BR-2: …`, `- FR-3: …`, `- AC-1: …`, `### D-1 …`).
- Every document, the BRD included, has a `**Derived from:**` line naming at least one reference: an upstream document ID, or a **source**. Other words on that line are free. Elsewhere it cites the items it refines as `DOC-ID/ITEM` (`PRD-0002/FR-3`). Citations point backwards along the chain only, and every one must resolve.
- A source is where something outside the chain came from: a URL, a repo-relative path that exists, or `jira:KEY-123`. It stands in for an upstream document only while the chain holds nothing earlier, so a prototype's PRD may cite one, and must cite the BRD instead once a BRD exists. `MEMORY.md`'s `Requirements` follows the same rule, naming at least one source or document ID, or `none yet`, with the other words on the line free.
- An ADR is cross-cutting: a decision can be forced before the chain starts or during implementation, so it may cite any document or a source at any time, and anything may cite it. Every other pair points backwards.
- `node scripts/docs-check.js` verifies all of this, reading the stages from the table above; the edit hook runs it after every change under `docs/` or to this file, the `pre-commit` Git hook runs it over the staged content and blocks a commit that breaks the chain (`git commit --no-verify` to override), and the `docs-check` skill repairs what it reports. The chain covers `docs/` at the repo root only: a repo split into contexts is out of scope.
- Sharpen a fuzzy ask with `grilling` before the BRD or PRD, and run `domain-modeling` the moment a term or decision lands, whatever the stage. An interview leaves a file: `brd` writes `.scratch/<slug>/interview.md` and the BRD derives from that path, so requirements gathered live still have provenance.
- A prototype needs only PRD and BDD, then the `prototype` skill. An MVP runs the whole chain.

## Skills

Skills live in `.agents/skills/<name>/SKILL.md`, vendored by `npx skills` and recorded in `skills-lock.json`. If your harness has not surfaced them, read the `description` line of each `SKILL.md` and load the ones that match the task. The agents in `.agents/agents/` route a task through them: `engineer`, `devops`, `business-analyst`, `assistant`. A row two or three of them read lives in `.agents/routing.md`, in a section per audience, with the rule for what earns a row at the top of that file; what every agent needs is in "Working here" below instead.

Skills are vendored: add or update them with `npx skills` instead of editing them in place. `.claude/skills` is one link to `.agents/skills`, so a skill written by hand is visible the moment it is saved. Run `node scripts/skills.js relink` after vendoring anyway: it repairs the links in any other harness folder this clone wires up, which `npx skills` recreates absolute where Git needs them relative. A skill from an upstream nothing here has used before also needs a row in `scripts/skill-licences.tsv`, then `node scripts/skills.js notices`: vendoring copies the work, and the licence notice does not come with it.

## Agent skills

### Issue tracker

Optional, and not tied to one product. `MEMORY.md` names the tracker, `docs/agents/issue-tracker.md` holds its conventions and the tools that reach it, and `to-tickets`, `triage` and `code-review` read that file rather than knowing any tracker themselves. The harness ships it configured for Jira through the Atlassian MCP server; `setup-matt-pocock-skills` rewrites it for another. A project may also plan entirely in `docs/`, recording `Issue tracker: none`.

### Triage labels

The five default role names as plain Jira labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.

### Coding standards

`CODING_STANDARDS.md`, read by `code-review` only. Whitespace, encoding, line endings and analyzer severities are enforced by `.editorconfig`, `.gitattributes` and the stack's own tool configs at the root, not restated there.

## Domain language

`CONTEXT.md` holds the glossary and `docs/adr/` the decisions. Both are created lazily by the `domain-modeling` skill; use their terms when they exist.

## Working here

- Install the Git hooks once per clone: `node scripts/githooks-init.js`.
- Hook scripts for agent harnesses are in `.agents/hooks/`; a blocked command means the guard there fired, so ask the user rather than working around it.
- Write commit messages as conventional commits: `<type>(<scope>)?!?: <description>`, type one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, subject at most 72 characters with no full stop, and a description of at least four words: "fixing bugs" and "implemented some stuff" are rejected. Every commit also carries a body, separated from the subject by a blank line — the subject says what changed, the body says why. Git's own trailers are metadata, so a body that is only a `Refs:` line does not count. Cite the Jira issue key in the subject or a trailing `Refs: AB-42` line; leaving it out is a warning, not a rejection, and a project whose `MEMORY.md` records `Issue tracker: none` is not warned at all. The `git-commit` skill writes these messages; the `commit-msg` Git hook rejects anything that is not a conventional commit, and `git commit --no-verify` overrides it.
- Write prose a person will read with `writing-clearly-and-concisely`, before you hand it over or commit it: a document in `docs/`, a commit message, a pull request description, an email, anything published on the user's behalf. Active voice, concrete language, statements in positive form, needless words out, and none of the inflated claims, sales language, stock AI words or filler it catalogues. Files written for agents are the exception: `AGENTS.md`, `SKILL.md` and the agent route tables follow `writing-for-agents` instead.
- Write what this project owns in the language `MEMORY.md` gives as `Prose language`, and reply to the developer in it: the `docs/` chain, `CONTEXT.md`, `TODO.md`, `MEMORY.md`'s own values and the README's Project section. A missing line means English. The harness stays English whatever that line says -- `AGENTS.md`, `docs/agents/`, the route tables and every `SKILL.md` -- because an update merges those from upstream and would overwrite a translation or collide with it. Commit messages stay English too, so one log reads the same in every repo. The chain's markers are English and ASCII whatever language the prose is, because `docs-check` parses them: `docs/prd/0001-billing.md` with a Russian title and body passes, while `0001-биллинг.md` fails its file-name rule and a translated `**Derived from:**` reads as missing.
- Record a loose end the moment it arises, in `TODO.md` at the root: a question nobody answered, an assumption taken on trust, or work knowingly left undone. The file follows the todo-md standard, opening with `# TODO`, one entry per line as `- [ ] <text> #<tag> (<source>)` with the tag one of `#question`, `#assumption`, `#deferred` and the source a URL, a repo-relative path that exists, or `jira:KEY-123`. Something with a line of code to mark gets a `// TODO:` comment there instead, where `duck-debt` finds it; something that blocks the work gets asked rather than filed. An entry is deleted in the commit that resolves it, whether it was done or declined, rather than kept as todo-md's `[x]` or `[-]`. The `loose-ends` skill has the rest, and the `pre-commit` hook checks the shape.
- Four skills are tied to no particular kind of work, so no agent's route table owns them: `teach` to learn or practise a topic or tool, `loop-me` to write up a chore that keeps coming back as a workflow spec, `agent-browser` to search, fill in, check or drive a website, and `find-skills` when nothing installed covers the ask. `teach` and `loop-me` run only when invoked by name.
- Ask questions through the harness's question tool, never as plain text: every interview a skill runs (`grilling`, `grill-with-docs`, `brd`, `prd`, `feature-forge`, `project-init`, `to-questionnaire`, `teach` and any other), and every confirmation before acting. One call per round, the recommended answer first. Tool names per harness and the fallback for a harness without one are in `docs/agents/questions.md`.
