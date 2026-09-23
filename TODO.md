# TODO

- [ ] A skill written here that declares `license:` in its own frontmatter is read as a copy from somewhere and refuses the notice until somebody records an origin it does not have; the signal is taken as worth its false positives, since the failure it replaces was a written claim of authorship over another's work, and the message offers removing the line as the other way out #assumption (scripts/skills.js)
- [ ] The pnpm and yarn scaffolds declare the prettier plugin with `npm pkg set`, so both rows need npm on the path; `npx tsc --init` in the same cells already did, so no row is newly broken, but a corepack-only environment fails at both #deferred (scripts/stacks.tsv)
