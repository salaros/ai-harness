---
name: pr-sweep
description: Take the open pull requests through to merged -- review each on both axes, fix what the review finds and what reviewers left unresolved, bring it up to date with its base, and merge it once its checks pass. Use when the session brief lists new pull requests and the user agrees to sweep them, right after opening a pull request, or when the user asks to review, fix and merge the open PRs.
---

# PR sweep

Takes each open pull request from "opened" to "merged": reviewed, fixed, up to date with its base branch and green. It is the one place that merges on the user's behalf, so it merges only what the user agreed to sweep and stops at anything it cannot fix without guessing.

The session brief (`.agents/hooks/session-start.js`) lists the open pull requests nobody has offered to sweep yet. Ask the user through the question tool whether to sweep them. Offer "all of them" first, then each one on its own, then "not now". Ask the same way right after you open a pull request yourself. Never start a sweep because a pull request exists; start it because the user said yes.

Works through `gh`. A repository hosted elsewhere, or a `gh` that is not signed in, gets a sentence saying so and no sweep.

## Steps

1. **List** the pull requests the user chose: `gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,isCrossRepository,mergeable,author`. Leave out drafts, and pull requests from forks, which this clone cannot push to. Name each one you skip and why. Done when every chosen pull request is on the list or has been named as skipped.
2. **Order** them so that each merge leaves the others as they were: those with no shared files first, and a pull request based on another's branch after its base. Done when the order is written down.
3. **For each pull request**, in that order:
   1. **Check out** its branch in this worktree (`git switch <head>`, after `git fetch`). Done when `HEAD` is the pull request's head.
   2. **Update** it from its base: merge `origin/<base>` in (the `ccd_host` `sync_with_base_branch` tool when this session runs in an app-made worktree), resolve conflicts by keeping the intent of both sides, and run the suite. Never rebase a pushed branch or push with `--force`. When a conflict comes down to which side's behaviour is wanted, ask rather than pick. Done when the branch merges cleanly and the suite passes.
   3. **Review** it with `code-review`. The fixed point is `origin/<base>`. The spec is the issue the pull request or its commits reference, or else the pull request's own description. Review critically: look for a finding before you conclude there is none. Done when both axes have reported.
   4. **Read** what reviewers left: `gh pr view <n> --comments` and the unresolved review threads (`gh api repos/{owner}/{repo}/pulls/<n>/comments`). Done when every unresolved comment is listed with the change it asks for.
   5. **Fix** every finding and every comment you agree with. For a comment you disagree with, say why in a reply to it rather than leaving it unanswered. Commit with `git-commit` and push. Done when the suite passes and each comment has either a fix or a reply.
   6. **Wait** for the pull request's checks: `gh pr checks <n>`, checked again after a pause, never a `--watch` that blocks the session. A failure the fixes caused is fixed. A failure they did not cause, or a check that needs a person's approval, stops this pull request, and the sweep goes on to the next. Done when every check has passed, or the pull request is marked as stopped with the reason.
   7. **Merge** with `gh pr merge <n> --merge`, keeping the branch's commits as they are. Never add `--admin` to get past branch protection. Done when `gh pr view <n>` reports it merged.
4. **Verify** the base branch once everything is merged: fetch it, check it out detached and run the suite. A failure here is reported, not fixed quietly. Done when the suite has passed on the merged base, or its failure is in the report.
5. **Report**: per pull request, whether it was merged, skipped or stopped, the findings and comments with what was done about each, and the result on the base branch.

## Stops

Stop and ask the user, rather than working around it, when:

- a hook rejects a commit or a push;
- a push would need `--force`;
- branch protection or a required review blocks the merge;
- a fix would change behaviour the pull request did not set out to change.
