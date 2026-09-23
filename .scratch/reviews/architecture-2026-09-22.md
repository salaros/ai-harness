# Architecture review, 22 Sep 2026

Deepening candidates for `ai-harness`, in the vocabulary of the `codebase-design` skill: **module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**.

- Reviewed: `master` at `381153f`, with 488 checks and 35 invariants passing.
- Scope, taken from churn: 10 of the last 20 commits are `fix(installer)`, each one a target repo that behaved unlike the upstream. `scripts/update-harness.js` is the largest module at 804 lines and the most-changed code in the repo.
- No ADRs exist yet, so nothing here re-litigates a recorded decision.
- Written by `improve-codebase-architecture`. The HTML view of this review is a way to look at it, not the artifact, and lives in the temp directory only.

## 1. Make a run a value — Strong

**Files:** `scripts/update-harness.js:747` `main()`, `:661` `finish()`, `:682` `selfCheck()`, `:693` `report()`, `:113` `say()`

**Problem:** two-thirds of the installer is reachable only through a spawned process, and that is where every ordering and exit-code fix has landed. `say` is `console.log` at 23 call sites, so what a run said is assertable only as captured stdout.

**Solution:** one module whose interface is a run: it takes the upstream, the target and the options, and returns what happened instead of printing it. `run({ upstream, target, options })` yields `{ entries, notices, lines, checks, verdict }`; the command line becomes the one adapter that prints the lines and exits on the verdict.

**Benefits:** a run's outcome is decided in one module (locality); one interface makes every scenario a table row (leverage); 11 test-only exports are absorbed and step ordering becomes assertable rather than observed.

**Evidence:** all three installer fixes of 22 Sep landed in `main` / `finish` / `report`, the untested region. The suite has one real install, `tests/self-checks.js:151`, costing 18.5s of an 18.5s run.

## 2. One target adapter, reads and writes — Strong (top recommendation)

**Files:** `scripts/update-harness.js:263` `fsTarget()`, `:612` `perform()`, `:604` `carryMode()`, `.agents/hooks/tests/tables/installer.js:48` `memoryUpstream` / `memoryTarget`

**Problem:** the target is read through a seam and written through a hole beside it, so a plan is a table row but an install is a spawned process and a temp repo.

**Solution:** extend the target adapter to cover writing, linking and marking executable; back it with `fs` + `git` in a run and with a map in the suite.

**Benefits:** two adapters justify the seam; any target shape becomes a row (leverage); every write lands in one implementation (locality); the stand-ins stop drifting from the real ones.

**Evidence:** the one end-to-end install targets an empty repo, while every install bug of 22 Sep came from a target that already had files — its own `CLAUDE.md`, an ESM `package.json`, Husky.Net's `.githooks/task-runner.json`. The stand-ins have already drifted: `memoryUpstream.blob` returns `e.link || e.text`, always a string, so `plan()`'s binary branch at `:507` and `planSkills`' at `:572` are never exercised. The policy's own `decideBinary` is covered separately, with real Buffers.

## 3. Give the install plan's entry an interface — Strong

**Files:** `scripts/update-harness.js:418` (the comment), `:467` the plan loop, `:518` skeletons, `:544` `planSkills`, `:612` `perform`, `:634` `apply`, `:693` `report`

**Problem:** the entry record has eleven optional keys, three producers and three consumers, and what a producer must set and what a consumer may assume exists only as a comment block. `apply` calls `policy.padEnd(9)` on any entry not marked `silent`.

**Solution:** a small set of named constructors for the kinds of thing an install does to a path — `written(file, policy, text)`, `linked(file, to)`, `marked(file)`, `heading(phase)` — so the record's rules are in code and a consumer reads only what a kind offers.

**Benefits:** the interface is stated once rather than per producer; the entry's rules sit beside the entry (locality); a malformed entry becomes impossible to construct rather than a crash at print time.

## 4. Move the skills policy behind the policy seam — Strong

**Files:** `scripts/update-harness.js:490`, `:504` (the escapes), `:544` `planSkills`, `scripts/install-policy.js:294` `POLICIES`, `CONTEXT.md` "Install policy"

**Problem:** `plan()` leaks around its own policy seam twice, and the biggest policy lives in the caller. `CONTEXT.md` lists `skills` as an install policy beside `merge`, `reconcile` and `union`; it is the only one the seam does not answer for.

**Solution:** let the seam answer for a whole folder as well as a path, and move `planSkills` behind it. A folder-shaped decision needs the roster, not one path, which is the shape the seam has to grow to take.

**Benefits:** every policy is decided in one module; the glossary and the code agree again; the installer loses 50 lines of decision.

## 5. Split the verdict from the summary — Worth exploring

**Files:** `scripts/update-harness.js:693` `report()`, `:694` the bucket literal, `:734` the exit code, `scripts/install-policy.js` (~15 bucket returns)

**Problem:** the installer's whole contract with CI and `npx` is one expression inside an unexported printer taking eight parameters, so the only way to ask "would this run fail?" is to run it and read stdout. The bucket vocabulary is produced in one module and consumed as a literal in another.

**Solution:** `verdict(result) -> { failed, why[] }` as the one place that knows what makes an install fail, and `summarise(result) -> lines[]` that reads the verdict and never computes it. Bucket names are owned where they are produced, in the install policy.

**Benefits:** one answer to "why exit 1?" (locality); the four failure reasons stop scattering; buckets are named once, beside the policy.

## 6. Relinking: discovery fused with mutation — Worth exploring

**Files:** `scripts/skills.js:224` `relink()`, `:172` `readRoster()`, `.agents/hooks/tests/tables/harness.js:174` (skipped without symlinks)

**Problem:** `relink` classifies five link shapes and unlinks, rmdirs and symlinks inline, so the only way to reach it is real symlinks — and the check skips where the OS refuses, which is this repo's own platform. The harness's central promise, every skill visible to the agent, rests on a module whose checks skip on the maintainer's machine.

**Solution:** decide the relink as a value from the skill roster, `relinkPlan(roster)`, and write it through the target adapter of candidate 2.

**Benefits:** copies, whole-folder and dangling cases get rows; coverage stops depending on Developer Mode; it reuses the write seam from candidate 2.

## 7. The suite runner: isolation and registration — Worth exploring

**Files:** `.agents/hooks/test.js:86` the loop, `.agents/hooks/tests/self-checks.js:218` `everyCheckIsRegistered`, `scripts/check-harness.js:370` (the model to borrow)

**Problem:** the most-changed file in the repo runs every check in one loop with no isolation, so one throw aborts the run and prints no tally. Registration is policed by `matchAll(/^function (\w+)\(t\b/gm)` over source text, so a check written `const foo = (t) =>` is invisible to the check that exists to catch exactly that.

**Solution:** wrap each check the way `check-harness.js:370` already wraps the harness invariants, and make registration a property of the exported values rather than of the source text.

**Benefits:** a Windows path bug costs one check, not the tally; the runner borrows a pattern already in the repo.

## Also noted, not worth a card

- `scripts/check-harness.js:31` — `PATHS` (what triggers the invariants on edit) and `INVARIANTS` (what reads files) are two lists kept together by prose. An invariant added without its path silently never fires on edit and still passes CI.
- `scripts/docs-check.js:169` — `check()` is 93 lines with numbered comment sections 1, 2, 4, 5. Sections 4 and 5 read project facts, not the documentation chain.
- `scripts/install-policy.js:286` — a standing TODO admitting `seed` and `skeleton` differ only because they grew apart.
- `scripts/update-harness.js:212` — `treeBlobs` walks `git cat-file --batch` output by byte offset with no check of its own; a parsing bug degrades silently to the per-file path.

## Top recommendation

**2. One target adapter, reads and writes.** It is the enabler. Ten of the last twenty commits fixed the installer against a target that already had files, and none of those targets can be expressed in the suite today because the write side of the target has no seam. Close it and a whole install becomes files in, files out: the Husky.Net data file, the ESM `package.json` and a project's own `CLAUDE.md` all become rows. Candidates 1, 3 and 6 get cheaper once it exists, and candidate 1 is the natural follow-on.

## Status

Candidate 2 was taken up on 22 Sep and grilled to an empty frontier. The decision is ADR-0001 and the design is SPEC-0001, which narrowed it on the way: `scripts/repo-view.js` already was a read seam with four adapters, so the work deletes the installer's second one rather than adding a third, and the writes go to a sibling, `scripts/repo-edit.js`. Candidate 6's relink is expected to reuse that sibling.

The other six were taken up over 22-23 Sep and all of them have landed, so this review is closed and
`TODO.md` no longer carries a `#deferred` line naming it:

| Candidate | Landed as |
| --- | --- |
| 1. Make a run a value | `a65195f` |
| 2. One target adapter, reads and writes | ADR-0001, SPEC-0001, `e05b179`..`9cf196c` |
| 3. Give the install plan's entry an interface | `bf878d2`, `scripts/plan-entry.js` |
| 4. Move the skills policy behind the policy seam | `de26d4b` |
| 5. Split the verdict from the summary | `dbcb4c5` |
| 6. Relinking: discovery fused with mutation | `ace4982`, reusing `scripts/repo-edit.js` as expected |
| 7. The suite runner: isolation and registration | `10bb2eb`, `25d09d7` |

The four items under "Also noted" were not cards and were not taken up; `scripts/install-policy.js:286`
still holds its standing TODO. Anything reopened from here is a new review rather than this one.
