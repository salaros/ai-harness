# TODO

- [ ] The docs portal renders and links the root GLOSSARY.md only; a glossary beside each context's CONTEXT.md in a multi-context repo is checked by the hooks but has no page and no links #deferred (tools/docs-site/glossary.mjs)
- [ ] `node scripts/skills.js install` rewrites skills-lock.json: npx skills@latest bumps it to version 2 with new hashes, so the post-merge hook leaves the lock modified #question (scripts/skills.js)
- [ ] npx skills experimental_install fails to restore retro: its lock entry points at skills/in-progress/retro/SKILL.md, which mattpocock/skills seems to have moved #deferred (skills-lock.json)
- [ ] Should C-4 say that a project's edits to vendored skills are overwritten by an update, since no option keeps them? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Should the skill-budget target count user-level plugins too, making C-8 a must? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] The local suite passes on state a fresh clone lacks: check-edit skips a path that does not exist, so its vendored-skill fixtures went green here and red in CI. Point the fixtures at the committed catalog path, or run them in a temporary clone #deferred (.agents/hooks/check-edit.js:78)
- [ ] The real-install self-check installs HEAD but reads the installer and its tables from the working tree, so it fails on uncommitted installer changes; install from a `git stash create` commit, or skip with a reason #deferred (.agents/hooks/tests/self-checks.js:187)
- [ ] A commit reused the previous commit's message once, when a script failed before rewriting the message file; check-commit-msg.js could refuse a subject identical to HEAD's #deferred (scripts/check-commit-msg.js)
- [ ] `npx --yes skills remove --help` ran until stopped by hand; say in the skills doc to run the skills CLI with a timeout or in the background #deferred (docs/agents/skills.md)
