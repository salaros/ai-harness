# Tests

All automated tests are stored in this folder.

## Types of tests

- **Unit tests** — test a single function, class, or module in isolation.
  External dependencies are mocked. Fast, no I/O.
- **Integration tests** — test how several modules work together, or how the
  code interacts with real dependencies (database, filesystem, HTTP API).
  Slower, may require a running service or test environment.
- **End-to-end (E2E) tests** — exercise the whole application the way a user
  would, from entry point to output. Slowest, run less frequently (e.g. before
  a release).
- **Smoke tests** — a minimal subset that verifies the application starts and
  its core paths work. Run after every deploy.
- **Acceptance tests** — the scenarios of the BDD documents, run as written.
  `node scripts/bdd-features.js` writes each `docs/bdd/NNNN-<slug>.md` out as
  `tests/features/NNNN-<slug>.feature`, generated and ignored by Git, and the
  stack's Gherkin runner executes them against the step definitions kept here
  (`<Name>.Acceptance/` with Reqnroll on .NET, `acceptance/` with cucumber-js
  and cucumber-tsflow on Node or with pytest-bdd on Python). Run the extractor
  before the runner, locally and in CI. A scenario whose step has no
  definition fails rather than passing as pending, and a feature file is never
  edited by hand: the document is.

## Coverage

Code coverage measures how much of the source code is executed while the tests
run, typically reported as a percentage of lines, branches, functions, and
statements. A coverage report shows which parts of the codebase are never
touched by any test, which helps find untested logic.

High coverage does not guarantee correctness — a line can be executed without
its behaviour being asserted — but low coverage is a reliable sign of gaps.
Coverage reports are generated into `coverage/` and are not committed.