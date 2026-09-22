# Scratch

Committed working files that are not product code: feature specs, locally drafted tickets, and throwaway prototypes that have not yet earned a branch.

- One folder per feature: `.scratch/<feature-slug>/`
- The spec: `.scratch/<feature-slug>/spec.md`
- The interview behind it: `.scratch/<feature-slug>/interview.md`, written by `brd` and cited by the BRD's `**Derived from:**` line, so requirements gathered in conversation keep their provenance
- Tickets drafted before they are published to Jira: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in dependency order
- The candidates an architecture review found: `.scratch/reviews/architecture-<date>.md`, written by `improve-codebase-architecture` and cited as a source by the ADR and the SPEC of whichever candidate is taken up
- `code-review` looks here for the spec of a branch when the commits reference no issue.

Delete a feature folder once its tickets live in Jira and the work is merged.
