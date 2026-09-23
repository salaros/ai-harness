# TODO

- [ ] A move whose destination Git accepts and whose source Git then refuses leaves the rename done and the index rewritten, with the entry reporting `done: false`; no input was found that makes the second `git add` fail, so the rollback the first one has is unwritten and uncheckable #deferred (scripts/repo-edit.js:207)
