# TODO

- [ ] The docs portal renders and links the root GLOSSARY.md only; a glossary beside each context's CONTEXT.md in a multi-context repo is checked by the hooks but has no page and no links #deferred (tools/docs-site/glossary.mjs)
- [ ] Build SPEC-0004 in five phases, each shippable and reversible on its own, then release 0.10.0 #deferred (docs/spec/0004-skills-follow-the-project-profile.md)
  - [ ] Phase 4, skills by group: move frontend to the catalog first, then the rest, with the migration in update-harness.js and the invariants
  - [ ] Phase 5, requirements-only profile: Language != none on the coding skills
- [ ] npx skills experimental_install either writes through a link into the catalog or replaces the link with a folder, both of which apply handles; phase 4 checks which on a scratch target #assumption (docs/spec/0004-skills-follow-the-project-profile.md)
- [ ] Should C-4 say that a project's edits to vendored skills are overwritten by an update, since no option keeps them? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Should the skill-budget target count user-level plugins too, making C-8 a must? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
