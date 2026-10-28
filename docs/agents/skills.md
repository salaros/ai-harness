# Vendored skills

Skills live in `.agents/skills/<name>/SKILL.md`, recorded in `skills-lock.json`. Codex, Cursor, Copilot and OpenCode all read that path natively, which is why this clone wires up no folder of their own: only Claude Code reads somewhere else, so only `.claude/skills` is linked. A skills folder anywhere else is read by nothing.

Add or update a skill with `npx skills` rather than editing it in place, and remove one with `npx skills remove <name>`. `.claude/skills` is one link to `.agents/skills`, so a skill written by hand is visible the moment it is saved.

After vendoring:

- `node scripts/skills.js relink` repairs the links in any other harness folder this clone wires up, which `npx skills` recreates absolute where Git needs them relative.
- A skill from an upstream nothing here has used before needs a row in `scripts/skill-licences.tsv`, then `node scripts/skills.js notices`, which rewrites `THIRD-PARTY-NOTICES.md`. Vendoring copies the work; the licence notice does not come with it. `node scripts/check-harness.js` fails until the row exists.
- Removing the last skill of an upstream takes its licence row with it.
- A skill copied in by hand, with a licence file or a `license:` line in its folder and no `skills-lock.json` entry, fails the same check: the lock is the only record of where a skill came from. Vendor it with `npx skills` from somewhere it can fetch, or remove the licence when the skill really was written here. ADR-0006 has the argument.

## What `computedHash` is worth

Nothing, for telling a changed skill from an unchanged one. The lock records where each skill came from; its `computedHash` cannot be reproduced from the files on disk, so no script here reads it, and `npx skills experimental_install` (which `node scripts/skills.js install` runs, and the post-merge hook after a merge that changed the lock) treats most skills as changed and fetches them again from upstream HEAD. Review what such a run changes as an update, never as a restore.

Two upstream bugs make it so. The CLI hashes each file's raw bytes, and Git for Windows' default `core.autocrlf=true` turns the CLI's own temporary clone CRLF before the copy into `.agents/skills/`, which this repo's `eol=lf` never touches; a hash written on Windows therefore matches no LF checkout (vercel-labs/skills#781). Skills fetched through the GitHub API carry a snapshot hash of the download instead, which matches no reading of the folder at all (vercel-labs/skills#806). Measured on 2026-10-13 over 74 skills: 36 matched only CRLF bytes, 26 matched nothing, 12 matched either way. A fresh clone holds LF on every OS, so 62 of the 74 would reinstall.
