# Scratch

Committed working files that are not product code: implementation plans, ticket drafts, the notes of an iteration in progress, and throwaway prototypes that have not yet earned a branch.

- One folder per feature or iteration: `.scratch/<slug>/`
- The implementation plan, written by `create-implementation-plan`, lives in that folder. The SPEC it implements is `docs/spec/NNNN-<slug>.md`, like every document of the chain; the folder links to it rather than holding a copy.
- Tickets drafted before they are published, or the work items themselves when the project has no tracker (`docs/agents/issue-tracker.md`): `.scratch/<slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order
- The notes of an iteration that outlives one context window: `.scratch/<slug>/notes.md`, below
- The candidates an architecture review found: `.scratch/reviews/architecture-<date>.md`, written by `improve-codebase-architecture` and cited as a source by the ADR and the SPEC of whichever candidate is taken up
- `code-review` looks here for the spec of a branch when the commits reference no issue.

Delete a feature folder once the work is merged and its tickets, if any, live in the tracker.

## Notes

Work that runs longer than one context window loses what it learned when the window is compacted, and the transcript it would read back is a hundred times the size of what mattered. `notes.md` is what mattered, written as it lands rather than at the end:

- a decision, with its reason, the moment it is taken
- a fact verified, with the command that verified it, the moment it is
- the step in progress, replaced as the work moves

It is not a plan (the IPLAN beside it), not a loose end (`TODO.md`), not a brief for a successor (`/handoff`), and not a log. A line whose content has reached a commit body, an ADR or a document of the chain is deleted, so the file stays under a screen. The session brief names every `notes.md` a clone holds; an agent resuming after a compaction, or starting a session on work someone left, reads it before the transcript or the commit log. The chain hook leaves it alone: it is not the IPLAN, whatever folder it shares.
