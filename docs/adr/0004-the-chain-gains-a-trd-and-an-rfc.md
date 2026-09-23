# ADR-0004: The chain gains a TRD and an RFC

**Derived from:** docs/research/interviews/2026-09-23-trd-rfc-chain.md, AGENTS.md, scripts/docs-check.js

The chain ran BRD → PRD → EARS → BDD → ADR → SPEC. It had three gaps. Non-functional requirements had nowhere to become measurable. Engineering-driven work had no way in except through a business document. And a design could be committed without anyone arguing its alternatives. The chain now runs BRD → PRD → TRD → EARS → BDD → RFC → ADR → SPEC, and the rules that make it work live in the table, not in code.

## Decision

### D-1 a TRD after the PRD, and an entry stage

A TRD holds the technical requirements as measurable `TR-n` items: quality attributes, constraints, compliance. It holds no design. It refines a PRD's `NFR-n` goals when a PRD exists, and it may derive from a source alone when none does: an incident, an end-of-life notice, an audit finding. EARS cites it as it cites the PRD.

### D-2 an RFC, cross-cutting, argued inside the file

An RFC sets its criteria before its options and gives every option its strongest case. Agents then debate inside the file: an advocate per option, a critic, and one rebuttal each. The user writes the Resolution. The RFC argues and the ADR records: once an RFC is accepted it is frozen, each hard-to-reverse choice it settled becomes an ADR citing it, and its design becomes a SPEC. It is optional and cross-cutting, as an ADR is.

### D-3 the table says what a stage may cite, and which statuses it builds on

The chain table in `AGENTS.md` gains a `Cites` column, with the values `backwards`, `backwards or source` and `any`, and a `Status` column that lists a stage's statuses with the buildable ones in bold. `docs-check` reads both, so ADR's exemption is no longer written into the code. Every RFC carries a listed status, and a SPEC may cite only an `Accepted` RFC. An ADR may cite any RFC, because rejecting one is a decision too.

## Why

The case against was put first. A TRD looked like it duplicated EARS or the SPEC. An RFC looked like a pull-request review with a file attached, and a second cross-cutting stage looked like it would weaken the backwards-only rule. Each objection lost to a need nothing else met:

- EARS writes a requirement as a sentence but gives it no home before that sentence is written.
- A PRD cannot be the way in for a migration, because a migration has no product in it.
- The harness is mostly one person and agents, so the comments a team would leave on a pull request never come. The debate has to be produced, and a debate produced by agents has to be kept in the file.

Keeping the stage rules in the table follows from the table already being the only list of stages. Hard-coding a second exemption beside `adr` in `docs-check.js` would have made two places that must agree.

## Considered options

- **Technical requirements as `NFR-n` lines in EARS, and no TRD.** This is the cheapest option, but it leaves engineering-driven work with no way in.
- **A TRD that replaces EARS.** This throws away the one-sentence "shall" form that the BDD stage builds on.
- **An RFC as an ADR status (`proposed`) plus a review in the pull request.** This fits a team, but not a repo whose reviewers are agents.
- **An RFC required before every SPEC or every ADR.** This buys a guaranteed debate for trivial designs as well, at the cost of ceremony. The rule instead is two or more viable designs and no obvious winner.
- **Vendoring `dev-rfc` for the `rfc` skill.** Vendored skills are never edited in place, and its description claims design and architecture documents, so it would compete with `design-doc` for SPEC requests. Both skills are written here instead.

## Consequences

- An AGENTS.md table with no `Cites` column still reads as it used to, with the ADR as the only cross-cutting stage, so a project that has not reconciled the table keeps working.
- `design-doc`'s vendored description still claims TRDs and RFCs, so `.agents/routing.md` names `trd` and `rfc` explicitly, and `TODO.md` carries the gap.
- The next pull request adds a PDD before the BRD, and its Go status gates the BRD. Adding it takes only a table row and a skill, with no code change: this decision is what makes that possible.
