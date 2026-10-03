---
name: resolving-merge-conflicts
description: Resolve a git merge, rebase or cherry-pick that stopped on conflicts, hunk by hunk from why each side made its change, then run the repo's checks and finish the operation. Use when git reports conflicts or leaves conflict markers in the tree, including while bringing a branch up to date with its base.
---

# Resolving merge conflicts

A conflict is two intents meeting, not two blocks of text. A resolution picked by `--ours`, `--theirs` or by deleting whichever block looks less important can compile and still drop a change somebody made on purpose. So each hunk is resolved from the **primary sources** behind each side, and the result is checked before it is committed.

## Steps

1. **Survey** the operation: `git status` names it (merge, rebase, cherry-pick) and the conflicted files, and `git log --merge` or the rebase's todo shows the commits on each side. Read the goal the operation serves: the pull request being updated, the base being caught up with. Done when you can name every conflicted file and the commits that touched it on each side.
2. **Read the primary sources** for each conflict: the commit messages on both sides, the pull requests and issues they cite, and any ADR or SPEC under `docs/` they change or obey. Done when you can say in a sentence what each side meant to do, for every hunk.
3. **Resolve each hunk** so both intents survive wherever they are compatible. Where they are not, the side that serves the operation's goal wins, and the trade-off goes in the commit body. When the goal does not decide it, ask the user which behaviour is wanted. Behaviour that was on neither side stays out. Done when no conflict markers are left (`git diff --check`) and every dropped intent is written down.
4. **Run the checks** the repo itself runs: its Git hooks, its CI workflows and the scripts they call. Fix what the merge broke, as part of the same resolution. Done when they pass.
5. **Finish** the operation: stage the resolved files and `git commit` for a merge, or `git rebase --continue` and `git cherry-pick --continue`, repeating steps 1 to 4 for each commit that stops. Carry it through to the end: whether the operation should happen at all is settled before it starts, so stopping half-way only brings the same conflict back. Done when `git status` shows a clean tree and no operation in progress.

## Branches already pushed

Bring a pushed branch up to date by merging its base into it. A rebase would rewrite commits reviewers have seen and need a force push, which `AGENTS.md` sends back to the user.

The method here (primary sources before hunks, both intents kept, the checks run before the commit, the operation always finished) is adapted from `resolving-merge-conflicts` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). Upstream removed that skill in v1.3.0; the text here is written for this repository.
