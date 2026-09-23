# ADR-0001: One read seam, and a sibling for writes

**Derived from:** .scratch/reviews/architecture-2026-09-22.md, scripts/repo-view.js, scripts/update-harness.js:263

The harness had two read seams over one idea. `scripts/repo-view.js` answers four questions about a repo-relative path from the working tree, Git's index, a staged mix or a map a test names, and the checks and hooks read through it. The installer read the target through `fsTarget()` instead, three methods of its own, and wrote through raw `fs` calls beside it. Ten of the twenty commits before this one fixed the installer against a target that already had files, and none of those targets could be expressed in the suite, because the write side of the target had no seam at all and the read side had a hand-written stand-in that had drifted from the thing it imitated.

### D-1 repo-view is the only read seam

`fsTarget` and its stand-in `memoryTarget` are deleted. The installer reads the target through a repo view like every check already does. repo-view gains `bytes(rel)` beside its unchanged `read(rel)`, an `lstat(rel)` for working-tree symlinks, `modes()` for the recursive listing with link and executable flags that `git ls-files -s` already provides, and a `commit(root, sha)` adapter, which is what the upstream half needs.

The alternative was a second pair of adapters in a module of the installer's own. It was rejected on the deletion test: deleting `fsTarget` concentrates complexity in repo-view, while deleting a new installer-shaped wrapper would concentrate nothing. Two seams over one idea is what produced the drift in the first place.

### D-2 the upstream is a commit, read through the same view

`gitUpstream.files()` and `.blob()` become `modes()` and `bytes()` on a commit view, and `memoryUpstream` gives way to the existing `fromMap`. This fixes by construction the divergence that made the installer's binary branches unreachable from the suite: the stand-in returned `e.link || e.text`, always a string, where the real one returns a Buffer whenever the blob holds a zero byte. `hasCommit` and `history` are commit-graph questions rather than path questions and stay a separate two-function reader.

### D-3 writes live in a sibling module, not in repo-view

`scripts/repo-edit.js` is the mirror of repo-view: a repo as a run changes it. Two adapters, `worktreeEdit(root)` backed by `fs` and `git`, and `mapEdit(files)`. Its interface is `apply(entries)`, which performs a finished plan and returns per-entry mechanical facts — done, failed, and why — leaving the run to name the outcome and the summary bucket.

repo-view's header states that nothing in it writes, prints or exits, and that rule is kept rather than retired: 35 harness invariants and every hook depend on a module that cannot mutate the tree it is inspecting. Putting writes there would have given one object to pass around at the price of that guarantee.

### D-4 the adapter reports mechanically and never names an outcome

`perform()` re-decided what the run said: a failed `symlinkSync` was caught and the plan's verdict replaced with `{outcome: "yours", bucket: "kept"}`, and `apply()` then overrode the entry, so a planned entry and a reported entry could differ. The bucket vocabulary belongs to the install policy, so the edit reports what happened and the run translates. An install then reports what was done rather than what was intended.

### D-5 the executable bit is read before it is written

`carryMode` ran `git add --chmod=+x` with no way to know the bit was already set, because neither seam could read the target's mode. That is how a project's own `.githooks/task-runner.json` was staged executable. With `modes()` behind the seam an entry marks only what is not already marked, and "the mode was already right" becomes a row rather than an invisible no-op.

## Consequences

`check-harness.check` and `skills.readRoster` take a view rather than a root, which makes the 35 invariants substitutable and is the largest part of the work. The receipt stays an ordinary file: the view knows paths and `main()` knows which one is `harness-lock.json`, so repo-view and repo-edit remain reusable by modules that have no receipt.

`threeWay` still creates a temp directory and spawns `git merge-file` from inside a policy decision, which is how the in-memory decision table touches real disk. It writes to an OS temp directory rather than to the target, so it sits outside this seam. ADR-0002 records why it stays there.
