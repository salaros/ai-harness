# Vendored skills

Skills live in `.agents/skills/<name>/SKILL.md`, recorded in `skills-lock.json`. Codex, Cursor, Copilot and OpenCode all read that path natively, which is why this clone wires up no folder of their own: only Claude Code reads somewhere else, so only `.claude/skills` is linked. A skills folder anywhere else is read by nothing.

Add or update a skill with `npx skills` rather than editing it in place, and remove one with `npx skills remove <name>`. `.claude/skills` is one link to `.agents/skills`, so a skill written by hand is visible the moment it is saved.

After vendoring:

- `node scripts/skills.js relink` repairs the links in any other harness folder this clone wires up, which `npx skills` recreates absolute where Git needs them relative.
- A skill from an upstream nothing here has used before needs a row in `scripts/skill-licences.tsv`, then `node scripts/skills.js notices`, which rewrites `THIRD-PARTY-NOTICES.md`. Vendoring copies the work; the licence notice does not come with it. `node scripts/check-harness.js` fails until the row exists.
- Removing the last skill of an upstream takes its licence row with it.
