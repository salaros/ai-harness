# TODO

- [ ] The docs portal renders and links the root GLOSSARY.md only; a glossary beside each context's CONTEXT.md in a multi-context repo is checked by the hooks but has no page and no links #deferred (tools/docs-site/glossary.mjs)
- [ ] Record the catalog layout, the generated links and the profile table as an ADR: the user runs /grill-with-docs citing RFC-0001/OPT-1 and SPEC-0004/D-6, before phase 3 builds the catalog #deferred (docs/spec/0004-skills-follow-the-project-profile.md)
- [ ] Build SPEC-0004 in five phases, each shippable and reversible on its own, then release 0.10.0 #deferred (docs/spec/0004-skills-follow-the-project-profile.md)
  - [ ] Phase 1, dry run: profiles.tsv, the pure selector and a profiles.js plan command that prints the active set and its description size, changing nothing
  - [ ] Phase 2, MCP: the apply command, and the Atlassian and Figma servers switched off by their rows in .claude/settings.json and opencode.json
  - [ ] Phase 3, agents: the agent catalog and generated links, the Roles fact, the stacks.tsv row and the session-start check
  - [ ] Phase 4, skills by group: move frontend to the catalog first, then the rest, with the migration in update-harness.js and the invariants
  - [ ] Phase 5, requirements-only profile: Language != none on the coding skills
- [ ] Claude Code honours disabledMcpjsonServers in a project's shared .claude/settings.json; phase 2 checks it with claude mcp list before the release #assumption (docs/spec/0004-skills-follow-the-project-profile.md)
- [ ] npx skills experimental_install either writes through a link into the catalog or replaces the link with a folder, both of which apply handles; phase 4 checks which on a scratch target #assumption (docs/spec/0004-skills-follow-the-project-profile.md)
- [ ] Should C-4 say that a project's edits to vendored skills are overwritten by an update, since no option keeps them? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Should the skill-budget target count user-level plugins too, making C-8 a must? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
