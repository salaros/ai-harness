# TODO

- [ ] Installing into a repo that already has a `.claude/skills` folder of vendored skills fails, with `--adopt` and without it #deferred (scripts/update-harness.js:542)
  - [ ] The fix in mind: drop the existing folder, reinstall from the merged lock, and commit the `.claude/skills` symlink before `docs-check.js` runs
  - [ ] A skill the project wrote itself, recorded in neither file, must survive that reinstall rather than being wiped with the rest
  - [ ] Read `skills.json` as well as `skills-lock.json`, transforming the former into a lock while adopting
- [ ] Seven deepening candidates from the 22 Sep architecture review are still open; candidate 2, one target adapter for reads and writes, is the recommended first #deferred (.scratch/reviews/architecture-2026-09-22.md)
