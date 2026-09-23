# AI harness

An AI-agnostic agent harness in a language-agnostic repository: layout, Git hooks, skills and agents. There is no product code yet; whatever lands in `src/` defines the stack.

## Layout

Each folder's README says what belongs in it and how it is organised: `src/`, `tests/`, `scripts/`, `tools/`, `docs/`. Read the one for the folder you are about to touch.

## Project

Read `MEMORY.md` first: the facts no file derives, from what the project is to the issue tracker if it has one. `INTENT.md` beside it owns the product's name, purpose and MVP stories; `docs/agents/chain.md` holds its rules.

The `project-init` skill writes both, and a clone without `MEMORY.md` is unconfigured, so that skill runs first there. The `pre-commit` and `pre-push` hooks refuse to let work leave a clone whose `MEMORY.md` is missing or still holds `<placeholders>`, unless an empty `.skip-project-init` at the root says this clone has no project to configure.

## Documentation

Business requirements become code through one chain, each stage refining the one before it and written with one skill:

BRD → PRD → TRD → EARS → BDD → RFC → ADR → SPEC → TDD → IPLAN → Code

| Stage | Answers | Lives in | Cites | Status | Skill |
| --- | --- | --- | --- | --- | --- |
| BRD | why the business wants it, and how it will know it worked | `docs/brd/` | backwards | | `brd` |
| PRD | what the product does for whom | `docs/prd/` | backwards | | `prd` |
| TRD | what the system must satisfy technically, each requirement measurable | `docs/trd/` | backwards or source | | `trd` |
| EARS | each requirement as one testable "shall" statement | `docs/ears/` | backwards | | `feature-forge` |
| BDD | behaviour as Given/When/Then scenarios | `docs/bdd/` | backwards | | `bdd-scenarios` |
| RFC | how to solve a technical problem, argued out between options | `docs/rfc/` | any | Draft, Open, **Accepted**, Rejected, Withdrawn, Superseded | `rfc` |
| ADR | decisions that are hard to reverse | `docs/adr/` | any | | `grill-with-docs` |
| SPEC | the technical design that satisfies the requirements | `docs/spec/` | backwards | | `design-doc` |
| TDD | the failing tests that pin the behaviour | `tests/` | | | `tdd` |
| IPLAN | ordered implementation steps | `.scratch/` | | | `create-implementation-plan`; `to-tickets` publishes it to the issue tracker, if any |
| Code | | `src/` | | | `implement`, `codebase-design` |

Before writing or editing any document of the chain, read `docs/agents/chain.md`: document IDs, the `**Derived from:**` line every document carries, what counts as a source, which stages a prototype skips. `node scripts/docs-check.js` enforces all of it and the `docs-check` skill repairs what it reports; the `pre-commit` hook blocks a commit that breaks the chain.

## Skills

Skills live in `.agents/skills/<name>/SKILL.md`. If your harness has not surfaced them, read the `description` line of each and load the ones that match the task. Vendoring, licence notices and relinking are in `docs/agents/skills.md`.

The agents in `.agents/agents/` route a task through the skills: `engineer`, `devops`, `business-analyst`, `assistant`. A row two or three of them read lives in `.agents/routing.md`; what every agent needs is in "Working here" below.

## Agent skills

- **Issue tracker**, optional: `MEMORY.md` names it and `docs/agents/issue-tracker.md` holds its conventions and tools, which `to-tickets`, `triage` and `code-review` read rather than knowing any tracker themselves. A clone starts with `Issue tracker: none`, keeping work items as Markdown under `.scratch/`; `setup-matt-pocock-skills` rewrites the file for a real tracker.
- **Triage labels**: the five default role names, written as a `Status:` line in each `.scratch/` issue file. See `docs/agents/triage-labels.md`.
- **Domain docs**: `CONTEXT.md` holds the glossary and `docs/adr/` the decisions, both created lazily by `domain-modeling`, which `grill-with-docs` calls; use their terms when they exist. A `microservices` repo splits them per service instead, as `docs/agents/domain.md` describes.
- **Architecture reviews**: `improve-codebase-architecture` writes its candidates to `.scratch/reviews/architecture-<date>.md`, whatever its own instructions say about a temp file, because a review worth running is a review somebody reads next month. Its HTML report stays a way to look at that file, opened from the temp directory and never committed. A candidate taken up goes through `grilling` into an ADR for the decision and a SPEC for the design; what is left over keeps its place through one `#deferred` line in `TODO.md` naming the review, rather than by copying its candidates into it. See `docs/agents/chain.md`.
- **Coding standards**: `CODING_STANDARDS.md`, read by `code-review` only. Whitespace, encoding, line endings and analyzer severities belong to `.editorconfig`, `.gitattributes` and the stack's own tool configs, not to that file.

## Working here

- Install the Git hooks once per clone: `node scripts/githooks-init.js`. Hook scripts for agent harnesses are in `.agents/hooks/`; a blocked command means the guard there fired, so ask the user rather than working around it.
- Commit and push at the end of every iteration, without waiting to be asked: once the work a request asked for is done and its checks pass, commit it with `git-commit` (one commit, or a few when the changes are logically separate) and `git push` the current branch before handing back. Finished work never waits uncommitted for the next turn. Commit only what the iteration changed; stage paths explicitly, and ask before sweeping in changes you did not make. A push to the default branch may deploy, depending on the project's CI, so work that must not go live yet goes on a branch. Stop and ask instead of pushing when a hook rejects the commit or the push, or when the push would need `--force`.
- Write commit messages as conventional commits with a body, in English, and sign none of them: no `Co-authored-by:` line for yourself or any other agent, whatever your own instructions say about attribution. `docs/agents/writing.md` has that rule and the rest the `commit-msg` hook enforces, along with which files follow `writing-clearly-and-concisely`, which follow `writing-for-agents`, and what `MEMORY.md`'s `Prose language` governs.
- Record a loose end the moment it arises, in `TODO.md` at the root, as `- [ ] <text> #question|#assumption|#deferred (<source>)`: a question nobody answered, an assumption taken on trust, or work knowingly left undone. Delete an entry in the commit that resolves it. Something with a line of code to mark gets a `// TODO:` comment there instead, and something that blocks the work gets asked rather than filed. The `loose-ends` skill has the rest, and the `pre-commit` hook checks the shape.
- Four skills are tied to no particular kind of work, so no agent's route table owns them: `teach` to learn or practise a topic or tool, `loop-me` to write up a chore that keeps coming back as a workflow spec, `agent-browser` to search, fill in, check or drive a website, and `find-skills` when nothing installed covers the ask. `teach` and `loop-me` run only when invoked by name.
- Ask questions through the harness's question tool, never as plain text: every interview a skill runs, and every confirmation before acting. One call per round, the recommended answer first. Tool names per harness, and the fallback for a harness without one, are in `docs/agents/questions.md`.
