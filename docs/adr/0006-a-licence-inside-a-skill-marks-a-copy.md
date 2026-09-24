# ADR-0006: A licence inside a skill marks a copy

**Derived from:** docs/research/interviews/2026-09-24-licence-signal.md, scripts/skills.js, THIRD-PARTY-NOTICES.md, scripts/skill-licences.tsv

`THIRD-PARTY-NOTICES.md` is generated from `skills-lock.json` and `scripts/skill-licences.tsv`, and its last section names the skills written for this repository. A skill copied in by hand has no lock entry, so without a further rule that section would claim it: the notice would state authorship of work this repository did not write, which is the one failure the file exists to prevent.

## Decision

### D-1 a licence signal inside a skill folder means the skill came from somewhere

A file named `LICENSE`, `LICENCE`, `NOTICE` or `COPYING`, in any case, on its own or followed by an extension or a suffix such as `-MIT`, or a `license:` line in `SKILL.md`'s frontmatter, is a licence signal. A skill written here is covered by the `LICENSE` at the root and has no reason to restate it, so a licence inside the folder is the fingerprint of a copy, whatever it says.

### D-2 the lock is the only record of provenance

A skill carrying a licence signal with no `skills-lock.json` entry is an orphan, and the notice is not written while one exists. Nothing else records where a skill came from: no row in `scripts/skill-licences.tsv` keyed by skill name, no lock entry written by hand.

### D-3 an orphan is re-vendored or is this repository's own

The way out is `npx skills` from somewhere it can fetch, which writes the lock entry with the source and hash, followed by a licence row for that source; or, when the skill really was written here, the removal of the licence it should never have carried. A skill from a place `npx skills` cannot fetch, a private repository, a gist, a zip from a colleague, is not vendored here.

### D-4 the rule holds in every target

`scripts/skill-licences.tsv` is installed by union and each target generates its own notice, so a target's `check-harness` refuses an orphan the same way. A team's own skill carrying a licence fails there until it is vendored or the licence goes.

## Why

- The frontmatter `license:` field is legitimate metadata, and an author here could fill it in honestly. It counts anyway, because the cost of the two mistakes differs: a signal read too widely costs one deleted line, a signal missed costs a notice that lies. Stripping an MIT or Apache licence from a real copy is itself a breach, so the deletion is only ever the right fix for a skill written here.
- A second record of provenance beside the lock, a per-skill row or a hand-written entry, would have to be kept current with no hash to check it against. The lock has the hash, `npx skills` computes it, and one record is enough to keep.
- Turning away an unfetchable skill is the price of D-2. Publishing it somewhere fetchable is a small step for whoever holds it, and a skill nobody may publish is one this repository should not carry either.
- A target that could carry an unrecorded copy would ship a notice as false as the one D-1 refuses upstream, under the target's name.

## Consequences

- `COPYING` joins the signal names, so a GPL skill copied by hand, the case the rule is most for, is caught on arrival.
- The orphan message says what D-3 says: vendor it with `npx skills`, or remove the licence if it really is this repository's own. It no longer asks for an origin to be "recorded", since there is nowhere to record one but the lock.
- A skill legitimately carrying its own `LICENSE.txt`, as every skill from `openai/skills` and `anthropics/skills` does, is untouched: it has a lock entry, so it is vendored, and the licence row for its source keeps it out of the orphans.
- `CONTEXT.md` carries the two terms, licence signal and orphan, so the code and the notice can use them without redefining them.
