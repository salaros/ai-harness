# Issue tracker: local Markdown, until a project has one

A tracker is optional, and a clone starts without one: `MEMORY.md` records `Issue tracker: none`, and issues, drafts and work items live as Markdown under `.scratch/`, committed with the code. Documents in the BRD → SPEC chain live under `docs/<stage>/` (see `docs/README.md`) either way. A skill that needs a tracker says so instead of guessing at one.

The conventions below are the ones every clone follows. The Jira section at the end is what `setup-matt-pocock-skills` writes over them when the project does have a tracker, and the shape to adapt for a tracker that is not Jira.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `docs/spec/NNNN-<slug>.md`, like every SPEC in the chain in `AGENTS.md`; the feature folder links to it rather than holding a copy
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## When the project has a tracker: Jira (Atlassian MCP)

Issues and specs for this repo live in Jira. Agents reach Jira through the **Atlassian Rovo MCP server** (`https://mcp.atlassian.com/v2/mcp`), registered in `.mcp.json` (Claude Code, Cursor) and `opencode.json` (OpenCode) at the repo root; the server must be authorised once per tool (OAuth in the tool's MCP settings). Tool names below are the v2 names. If the project uses Jira and no Jira tools are available in your session, tell the user to authorise the Atlassian connector rather than falling back to another tracker.

**Project key:** `TODO-PROJECT-KEY` _(replace with the Jira project key, e.g. `CC`; every operation below is scoped to it)._
**Key format:** _(optional. Set it to a regular expression in backticks when this tracker's references are not `KEY-123`: `` `#\d+` `` for GitHub Issues, `` `\d{10,}` `` for Asana. The `commit-msg` hook uses it to decide whether a message cites an issue; left unset, the project key above scopes the check.)_

## Conventions

- **Create an issue**: `createJiraIssue` with the project key, an issue type of `Bug` or `Task` (`Story` if the project uses it), the summary, and the Markdown body from the skill's issue template. Add labels in the same call.
- **Read an issue**: `getJiraIssue` for fields, description and labels; comments are included in the issue payload.
- **List issues**: `searchJiraIssuesUsingJql`, e.g. `project = TODO-PROJECT-KEY AND labels = needs-triage ORDER BY created ASC`. Unlabeled issues: `project = TODO-PROJECT-KEY AND labels IS EMPTY AND statusCategory != Done`.
- **Comment**: `addOrEditJiraIssueComment`. Every comment written during triage starts with the disclaimer line the `triage` skill prescribes.
- **Apply / remove labels**: `editJiraIssue` on the `labels` field. Labels are the triage vocabulary (see `triage-labels.md`); do not change workflow status to express triage state.
- **Close**: `listJiraIssueTransitions`, then `transitionJiraIssue` to the project's Done or Won't Do transition, after posting the closing comment.
- **Blocking edges** between tickets: `createJiraIssueLink` with the `Blocks` link type. Where linking is unavailable, write `Blocked by: KEY-1, KEY-2` at the top of the description.
- **Find the project** if the key is in doubt: `listJiraProjects`.
- **Resolve a bare reference** like `#42` or `42` as `TODO-PROJECT-KEY-42`.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if external PRs should run through triage; `triage` reads this flag. PRs live in the Git host, not Jira, so the PR commands come from that host's CLI.)_

## When a skill says "publish to the issue tracker"

Create one Jira issue per ticket in dependency order (blockers first) so each ticket's `Blocked by` can name real keys, then link them with `Blocks`. Apply the `ready-for-agent` label unless told otherwise. Drafts written before publishing live under `.scratch/<feature-slug>/issues/`.

## When a skill says "fetch the relevant ticket"

`getJiraIssue` on the key the user gave. Read the description and all comments before acting.
