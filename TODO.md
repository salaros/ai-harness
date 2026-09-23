# TODO

- [ ] Installing into a repo that already has a `.claude/skills` folder of vendored skills fails, with `--adopt` and without it #deferred (scripts/update-harness.js:542)
  - [ ] The fix in mind: drop the existing folder, reinstall from the merged lock, and commit the `.claude/skills` symlink before `docs-check.js` runs
  - [ ] A skill the project wrote itself, recorded in neither file, must survive that reinstall rather than being wiped with the rest
  - [ ] Read `skills.json` as well as `skills-lock.json`, transforming the former into a lock while adopting
- [ ] `threeWay` creates a temp directory and spawns `git merge-file` from inside a policy decision, which is why the in-memory decision table still touches real disk #deferred (scripts/update-harness.js:381)
