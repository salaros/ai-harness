# TODO

- [ ] Installing into a repo that already has a `.claude/skills` folder of vendored skills fails, with `--adopt` and without it #deferred (scripts/update-harness.js:542)
  - [ ] The fix in mind: drop the existing folder, reinstall from the merged lock, and commit the `.claude/skills` symlink before `docs-check.js` runs
  - [ ] A skill the project wrote itself, recorded in neither file, must survive that reinstall rather than being wiped with the rest
  - [ ] Read `skills.json` as well as `skills-lock.json`, transforming the former into a lock while adopting
- [ ] `threeWay` creates a temp directory and spawns `git merge-file` from inside a policy decision, which is why the in-memory decision table still touches real disk #deferred (scripts/update-harness.js:381)
- [ ] Six deepening candidates from the 22 Sep architecture review are still open, candidate 2 having become ADR-0001 and SPEC-0001 #deferred (.scratch/reviews/architecture-2026-09-22.md)
- [ ] `format-changed.js` filters the changed paths with `existsSync`, which says yes to the `.claude/skills` symlink; prettier refuses a symlink named on its command line, so a push that touches it fails as "not formatted". umnico-crm had written `lstatSync().isFile()` locally and the 0.5.2 merge conflicted with it #deferred (scripts/format-changed.js:99)
