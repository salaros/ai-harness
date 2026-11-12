# TODO

- [ ] The docs portal renders and links the root GLOSSARY.md only; a glossary beside each context's CONTEXT.md in a multi-context repo is checked by the hooks but has no page and no links #deferred (tools/docs-site/glossary.mjs)
- [ ] Build SPEC-0004 in five phases, each shippable and reversible on its own, then release 0.10.0 #deferred (docs/spec/0004-skills-follow-the-project-profile.md)
  - [ ] Phase 5, requirements-only profile: Language != none on the coding skills
- [ ] `node scripts/skills.js install` rewrites skills-lock.json: npx skills@latest bumps it to version 2 with new hashes, so the post-merge hook leaves the lock modified #question (scripts/skills.js)
- [ ] npx skills experimental_install fails to restore retro: its lock entry points at skills/in-progress/retro/SKILL.md, which mattpocock/skills seems to have moved #deferred (skills-lock.json)
- [ ] Should C-4 say that a project's edits to vendored skills are overwritten by an update, since no option keeps them? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Should the skill-budget target count user-level plugins too, making C-8 a must? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
