# TODO

- [ ] The docs portal renders and links the root GLOSSARY.md only; a glossary beside each context's CONTEXT.md in a multi-context repo is checked by the hooks but has no page and no links #deferred (tools/docs-site/glossary.mjs)
- [ ] Record the catalog layout and profile table as an ADR: the user runs /grill-with-docs citing RFC-0001/OPT-1, before the SPEC that designs it #deferred (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Write the SPEC for RFC-0001 with the spec skill, once the ADR exists: the profiles.tsv grammar, the selector, the skill, agent and MCP adapters, the migration in update-harness.js, the lock and skills.js install moved to the catalog, and the two new harness invariants. Roll it out in phases, each shippable and reversible on its own #deferred (docs/rfc/0001-skills-follow-the-project-profile.md)
  - [ ] Phase 1, dry run: profiles.tsv, the pure selector and a profiles.js plan command that prints the active set and its description size against the C-1 cap, changing nothing
  - [ ] Phase 2, MCP: the Atlassian server in .mcp.json and opencode.json only when the issue tracker is Jira, the largest cut with no links and no layout change
  - [ ] Phase 3, agents: link only the agents the Roles fact names
  - [ ] Phase 4, skills by group: move frontend to the catalog first, then .NET, PHP and the role groups, leaving unmoved skills as plain folders the link adapter ignores; the lock and skills.js install move with the first group, and that first move answers the Windows symlink question on 9 skills
  - [ ] Phase 5, requirements-only profile: once phases 3 and 4 can turn the coding groups off
- [ ] Does a Windows clone without Developer Mode or core.symlinks need a copy fallback, since under OPT-1 it checks every skill link out as a text file and no harness sees any skill? A test on such a clone settles it, before the SPEC fixes the link adapter #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Do OpenCode's permission.skill and Codex's skills.config hide a skill from the listing, and does npx skills check computedHash? Each tool's documentation settles it, before the SPEC relies on either #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] The SPEC for RFC-0001 must cover a requirements-only profile: with Unit type, Language and Runtime set to none, the coding and development skills go inactive, and scripts/check-initialised.js must accept none for those three facts, which it requires today #deferred (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Should C-4 say that a project's edits to vendored skills are overwritten by an update, since no option keeps them? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
- [ ] Should the skill-budget target count user-level plugins too, making C-8 a must? #question (docs/rfc/0001-skills-follow-the-project-profile.md)
