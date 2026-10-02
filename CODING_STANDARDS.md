# Coding standards

Read during review (`code-review`), not during implementation. Every rule here is one the reviewer applies to a diff; anything a linter, formatter or type checker already enforces does not belong here.

The template has no stack yet. Add rules under the headings below as the first code lands, one line each, phrased as what to do. If a rule needs more than a line, put the detail in `docs/` and link it.

Mechanical rules live elsewhere: encoding, indentation and line endings in `.editorconfig` and `.gitattributes`, ignored output in `.gitignore`, and analyzer or formatter settings in each tool's own config at the root (for example `stylecop.json`). Whatever those enforce stays out of this file.

## Structure

- Organise `src/` by feature or domain, not by file type (see `src/README.md`).
- Name modules, types and tests with the terms in `GLOSSARY.md`; avoid the synonyms it lists.

## Tests

- Tests exercise public interfaces at the seams agreed for the change; no test reaches into internals (see the `tdd` skill).
- Expected values come from an independent source (a known-good literal, the spec), never recomputed the way the code does it.

## Commits and reviews

- One logical change per commit, with the issue key in the message when there is one.
- Record hard-to-reverse, surprising trade-offs as an ADR in `docs/adr/` rather than in a comment.
