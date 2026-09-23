---
name: docs-check
description: Verify and repair the documentation chain under docs/. Use after writing or editing any BRD, PRD, TRD, EARS, BDD, RFC, ADR or SPEC document, after changing MEMORY.md's Requirements line, when a citation such as PRD-0002/FR-3 looks wrong, or when asked whether the docs are traceable.
---

# Docs check

The chain in `AGENTS.md` ("Documentation") only pays off when every document can be walked back to the business need. `scripts/docs-check.js` verifies that mechanically: file names give IDs, first headings carry them, every document says what it was derived from, and every citation resolves to an existing document or item earlier in the chain. `MEMORY.md`'s `Requirements` line is checked the same way, because it is the entry point to the chain.

## Steps

1. Run it from the repo root:

   ```bash
   node scripts/docs-check.js
   ```

   Done when you have the full list of problems, one per line, or the line saying there are none.

2. **Repair** each problem in the document it names, never by deleting the citation:
   - a missing or wrong first heading: make it `# <ID>: <title>` where the ID comes from the file name (`docs/ears/0003-x.md` is `EARS-0003`);
   - a missing `**Derived from:**` line: add it under the heading, citing the upstream document IDs;
   - a `**Derived from:**` line naming no reference: put a real one on it. Upstream document IDs where the chain has them, otherwise a source, meaning a URL, a repo-relative path that exists (`path:line` allowed, a folder written `src/`), or `jira:KEY-123` in upper case. Prose alone does not count, a bare folder name or a lower-case key reads as prose, and a path that is not there is reported by name;
   - a source-only line where an upstream document exists: the named document was written after this one, so cite it instead. This is the message you get after adding a BRD behind an existing PRD;
   - a `Requirements` line in `MEMORY.md` that names nothing valid: give it sources, comma-separated, or the BRD's ID once one exists;
   - a citation to a document that does not exist: find the intended file and fix the number, or write the missing upstream document first;
   - a citation to a missing item: add the ID to the item's line in the upstream document (`- FR-3: …`) if the item exists without an ID, otherwise fix the reference;
   - a forward citation: the document is citing a later stage; move that content downstream or drop the reference. A stage whose `Cites` column in `AGENTS.md` says `any` (ADR, RFC) is exempt in both directions, so this never fires on one;
   - a missing or unlisted `**Status:**`: give the document one of the values its stage's `Status` column lists;
   - a citation to a document whose status a later stage may not build on (a SPEC citing an RFC that is not `Accepted`): ask the user whether the RFC is resolved, and never change its status yourself; until it is, the SPEC waits.

   Done when the script prints "no problems".

3. Report what you changed, per file.
