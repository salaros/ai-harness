# ADR-0005: Discovery comes before the business case

**Derived from:** docs/research/interviews/2026-09-23-trd-rfc-chain.md, ADR-0004, AGENTS.md

The chain started at the BRD, which assumes the business already wants the thing and asks only why and how it will know it worked. Nothing recorded whether the idea deserved a business case at all, and the conversations that answered that question were either lost or saved to `.scratch/`, where a merged feature's folder is deleted. The chain now starts PDD → BRD, and interviews are kept under `docs/research/`.

## Decision

### D-1 a PDD before the BRD, optional, ending in a verdict

A Product Discovery Document assesses an opportunity with Cagan's ten questions and ends in `Go`, `No-go` or `Parked`, a verdict the user gives. A BRD may build only on a PDD that is `Go`. The rule is one row in the `AGENTS.md` table, `Draft, **Go**, No-go, Parked`, which ADR-0004 made possible without a change to `docs-check`.

### D-2 the BRD becomes an entry stage

A BRD may still derive from a source alone, however many PDDs exist, because a need settled by a contract, a regulation or a decision taken elsewhere has nothing left to discover. So the PDD is optional, and the table marks both it and the BRD `backwards or source`.

### D-3 interviews are sources under `docs/research/interviews/`, not a stage

One conversation per file, `YYYY-MM-DD-<slug>.md`, of kind `user` or `stakeholder`, written with `interview-notes`. They are cited by path, like any source, so `docs-check` needs no rule for them. `brd`'s interviews move there from `.scratch/<slug>/interview.md`. Real names are allowed.

## Why

- An idea turned down with its reasons on record is worth as much as one that goes ahead, and without a stage for it the reasons are lost.
- A mandatory PDD would put discovery ceremony in front of work nobody doubts, so the BRD keeps its old way in.
- Interviews are evidence, not a refinement of anything: they have no upstream to cite and nothing refines them item by item. A stage would demand a `**Derived from:**` line they cannot honestly carry.
- `.scratch/` is working space that is deleted once the work merges; an interview a BRD cites has to outlive the feature.

## Considered options

- **Discovery inside the BRD, as an opening section.** This costs no new stage, but a BRD that concludes "do not build this" is a contradiction, and the verdict could not gate anything.
- **A mandatory PDD.** This guarantees discovery even for a contract already signed.
- **Interview notes as a stage of their own.** They would be ordered, but they are inputs to several stages (PDD, BRD, TRD, ADR), so no single position fits.
- **Pseudonymised interviews.** These are safer if the repository is ever public, but they cost the provenance a stakeholder record exists for. What a participant asks to keep off the record stays off it instead.

## Consequences

- A `grilling` session that settles something a document will cite is recorded under `docs/research/interviews/` too, as the record behind ADR-0004 and this ADR already is.
- Weighing several interviews against each other is a job for the PDD that cites them. A synthesis skill that does it across many records is deferred, and `TODO.md` carries it.
- The SRS decided in the same interview stays a generated view, not a stage, and is still deferred in `TODO.md`.
