# SPEC-0001: Repo view and repo edit

**Derived from:** ADR-0001, .scratch/reviews/architecture-2026-09-22.md

## Context and motivation

An install is files in, files out, and today it cannot be exercised that way. The installer reads the target through `fsTarget()` (`scripts/update-harness.js:263`) and writes to it through raw `fs` calls in `perform()` (`:612`) and `carryMode()` (`:604`), neither of which is exported or reachable except by spawning the installer at a real checkout. The suite therefore has exactly one end-to-end install, against an empty repo (`.agents/hooks/tests/self-checks.js:151`), costing 18.5s of an 18.5s run — while every install bug of the last ten commits came from a target that already held files.

ADR-0001 settles where the seam goes. This document designs the two modules.

**Goals:** any target shape becomes a decision-table row; one read seam for the whole repo; every target write in one implementation with a substitutable adapter; the run reports what was done rather than what was planned.

**Non-goals for v1:** the spawned finishers (`githooks-init`, `skills.js relink`, `skills.js notices`) stay processes. `threeWay` keeps its temp directory and its `git merge-file`; ADR-0002 records why it stays there rather than going behind a seam. Two of this list's original entries have since been done and are no longer non-goals: `relink` writes through `worktreeEdit` alone, and the named constructors for a plan entry live in `scripts/plan-entry.js`, so an entry's shape is that module's to state and this one says only what `apply()` requires of one.

## The read interface

`scripts/repo-view.js` keeps its four questions and gains three. Paths are repo-relative with forward slashes throughout, and nothing in the module writes, prints or exits.

### R-1 The interface

| Question | Returns | Notes |
| --- | --- | --- |
| `exists(rel)` | boolean | unchanged: a file, or a folder holding one |
| `isFile(rel)` | boolean | unchanged |
| `read(rel)` | text, or `null` | unchanged contract; never a Buffer |
| `list(rel)` | names directly inside a folder, sorted; `[]` | unchanged |
| `bytes(rel)` | Buffer, or `null` | new; the only method that may return bytes |
| `lstat(rel)` | `{ link }` or `null` | new; `link` is the POSIX target of a symlink, else `null`. Working tree only |
| `modes()` | `[{ file, mode, object, link, exec }]` | new; the recursive listing `indexModes` already produces |
| `recorded(paths)` | the same rows, or `null` | new in S-3; what a commit would record under `paths`. The working tree asks Git's index; a view that is already a record answers with its own rows |

`bytes` is a method of its own rather than a flag on `read`, so that no adapter can satisfy it by re-encoding a string — which is exactly how `memoryTarget.read(file, true)` came to return `Buffer.from(<utf8 string>)` where the real one returns the file's actual bytes.

### R-2 The adapters

`worktree(root)`, `index(root, paths)`, `staged(root, paths)` and `fromMap(files)` stay. `commit(root, sha)` is added: the same questions answered against one commit of a checkout, backed by `git ls-tree` and `git cat-file --batch` with the existing per-file `git show` fallback.

`modes()` is meaningful for the git-backed adapters and for `fromMap`; `worktree` derives it from the filesystem. `lstat()` is a working-tree question: a link that is in the way may be untracked, so the git-backed adapters answer from mode `120000` and `fromMap` from its entry's shape.

### R-3 What it replaces

`fsTarget()` in `scripts/update-harness.js` and `memoryTarget()` in `.agents/hooks/tests/tables/installer.js` are deleted: the target is read through this view. `gitUpstream()` and `memoryUpstream()` stay, narrowed to what a view cannot answer on its own -- which commit is which. Each keeps `at(sha)`, vending `repoView.commit` and `repoView.fromMap` rather than reading trees itself, beside `has(sha)` and `history(file)`, the two questions that are about the commit graph rather than about a tree.

## The write interface

`scripts/repo-edit.js` is the mirror: a repo as a run changes it.

### W-1 The interface

`apply(entries)` takes a finished plan and returns one result per entry that asked for work:

```
{ file, kind, done, why }
```

`kind` is `write`, `link`, `mkdir`, `mark` or `move`; `done` is whether the tree now holds what the entry asked for; `why` is the mechanical reason it does not, or `null`. No outcome word and no summary bucket appears anywhere in this module: those belong to the install policy, and the run translates the results into them.

### W-2 Ordering is the edit's job

`apply` creates a parent directory before writing into it, removes what stands in the way before creating a symlink, marks a mode after the content it applies to exists, and performs a `move` before anything else. A caller orders entries for readability, never for correctness.

`move` is why that last clause is not free. A move empties a path, so an entry linking something at where it came from reads naturally after it -- and read in that order the link went first, took the project's own work out of its way, and the move then carried the link off to the destination, with both entries reporting `done`. The order is the edit's to get right, so the edit sorts moves to the front rather than asking a caller to. The one thing this costs, and the only ordering fact a caller has to know: a move's source is a path already in the tree, never one an earlier entry in the same plan writes.

### W-3 The adapters

`worktreeEdit(root)` writes with `fs` and marks with `fs.chmodSync` followed by `git add --chmod=+x`, as `carryMode` does today. A `move` is `fs.renameSync`, and then `git add` when the source was one Git already tracked: the rename is the filesystem's but its record is Git's, and an index still naming the old path contradicts the disk until somebody says otherwise. The destination is offered to Git first and alone, because `git add` given both paths stages the source's deletion before it fails on the destination; if Git refuses it the rename goes back, so a refusal leaves the repository as it was found. A source nothing tracked leaves nothing to correct and a root with no index has nothing to keep in step, so neither is staged and neither is an error. `mapEdit(files)` applies the same entries to a map and exposes the resulting tree, so a check asserts on files rather than on a directory.

### W-4 A mark that is already correct is not a write

An entry marking a file executable is satisfied without touching the index when `modes()` already reports `exec` for it. The result is `{ done: true, why: null }` with no `git add`, and the run reports it as unchanged. This is the defect that staged a project's own `.githooks/task-runner.json` executable, closed at the seam rather than by filtering file names.

### W-5 A failure is a value, not a rewrite

A symlink the platform refuses leaves `{ done: false, why: "symlink refused" }`. The edit does not catch-and-relabel the entry the way `perform()` does at `:621`, and `apply()` at `:642` no longer overwrites the plan's outcome. The run decides that a refused link means the target keeps its own copy.

## How it lands

### S-1 Move

Lift the read side onto repo-view: add `bytes`, `lstat`, `modes` and `commit`, switch the installer from `fsTarget`/`gitUpstream` to views, switch the suite's tables from `memoryTarget`/`memoryUpstream` to `fromMap` and `commit`-shaped fixtures. No behaviour changes; the suite stays green throughout, and the six divergences recorded in the review disappear because there is no second implementation left to diverge.

### S-2 Extend

Add `scripts/repo-edit.js` with both adapters, move `perform` and `carryMode` behind it, and have the run translate results into outcomes and buckets.

### S-3 Migrate the readers

The receipt read at `:756` and the target discovery at `:124`/`:753` go through a view; `check-harness.check` and `skills.readRoster` take one, and `docs-check.readChain` drops the root it never used. `check-harness` then reads no files itself at all.

Two invariants ask what Git's index records rather than what the disk shows, which is the whole point of them on Windows, so the view answers that too: `recorded(paths)` above. `check()` still accepts a root string, because it is the one interface here that crosses a version boundary -- the installer runs the upstream's copy against a target, and the `update-harness.js` doing the running is the target's.

## Tests

Replacement, not layering. The hand-written stand-ins go with the modules they imitated. New rows sit at the two interfaces: a target that already holds its own `CLAUDE.md`, an ESM `package.json`, a data file beside the hooks, a file whose mode is already right, a symlink the platform refuses, and binary content — which becomes reachable for the first time, since `plan()`'s binary branch at `:507` and `planSkills`' at `:572` have never run in the suite. The single end-to-end install in `self-checks.js` stays as the one check that the real adapters are wired up.
