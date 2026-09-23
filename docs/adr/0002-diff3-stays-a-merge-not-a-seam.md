# ADR-0002: diff3 stays a merge, not a seam

**Derived from:** docs/adr/0001-one-read-seam-and-a-sibling-for-writes.md, scripts/update-harness.js:342, .scratch/reviews/architecture-2026-09-22.md

ADR-0001 put every read of a repo behind `scripts/repo-view.js` and every write behind `scripts/repo-edit.js`, so that an install's decisions are values a check can make without a filesystem. One thing was left outside both, and ADR-0001 said so: `threeWay` in `scripts/update-harness.js` makes a temp directory and spawns `git merge-file --diff3` from inside a policy decision. It is the only reason the otherwise in-memory decision table touches real disk.

## Decision

It stays where it is. No seam is introduced for merging, and no stand-in for diff3 is written.

## Why

The seam would buy a decision table that runs entirely in memory. What it would cost is the only coverage in that table worth having.

Every interesting case here is a question about what diff3 actually does: which edits it takes from which side, where it decides a hunk conflicts, how it marks the conflict, what it does with a file that lost its trailing newline. Those are questions about the merge algorithm, and only the merge algorithm can answer them. A stand-in would answer whatever it was written to answer, and the checks would then pin the stand-in rather than the behaviour a project's files get put through. A green suite over a fake merge is worse than no suite, because it reads as assurance.

The usual argument for a seam is speed, and it was measured rather than assumed: the installer's plan table is 211ms of a 46-second suite. There is nothing to buy.

## Consequences

- The decision table is in-memory apart from this. A reader who notices the temp directory should find this file rather than wonder whether it was an oversight; `scripts/update-harness.js` points here at the function.
- `threeWay` depends on Git being installed. The target already needs Git for everything else the installer does, so this adds no requirement.
- If a merge ever has to work somewhere Git is absent, this is the decision to revisit, and a real diff3 implementation is the thing to reach for before a seam is.
- ADR-0001's consequence that the exception "is recorded in `TODO.md` instead" is superseded by this file.
