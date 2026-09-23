---
name: trd
description: Write or revise a Technical Requirements Document (TRD), the chain's home for non-functional requirements and technical constraints. Use when requirements are about performance, availability, security, compatibility, compliance, limits or operability rather than behaviour; when a PRD's quality goals need measurable targets; or when engineering-driven work (a migration, an upgrade, a hardening pass) needs requirements and has no business or product document to start from.
---

# Technical Requirements Document

The TRD answers **what the system must satisfy**, technically: each requirement a measurable target, a constraint the design must live within, or an obligation it must meet. It holds no design, so "p95 under 200 ms" belongs here and "put a cache in front of the API" belongs in an RFC or the SPEC.

It sits after the PRD in the chain (`AGENTS.md`) and is an entry stage: it may derive from a source alone even when earlier documents exist, because engineering-driven work has no BRD or PRD behind it. EARS cites its items as it cites the PRD's.

Read `docs/agents/chain.md` first, then `CONTEXT.md` if it exists, and any earlier documents under `docs/trd/` so numbering and vocabulary stay consistent.

## Steps

1. **Find what it refines.** A PRD's `NFR-n` lines are quality goals in the user's words ("search feels instant"); each becomes one or more `TR-n` with a number. With no PRD behind the work, the source is whatever forced it: an incident, a vendor's end-of-life notice, an audit finding, a review under `.scratch/reviews/`. Done when every input has a reference you can put on the `**Derived from:**` line.
2. **Interview** with `grilling`, walking the categories below: for each, does anything apply, what is the target, how is it measured, what happens when it is missed. Done when every category is either filled or marked not applicable with a reason.
3. **Draft** `docs/trd/NNNN-<slug>.md`, numbered after the highest existing file, with the template below. Done when every `TR-n` has a target, a measurement and a priority.
4. **Confirm** with the user, fix what they change, and set `Status` to agreed. Done when `node scripts/docs-check.js` is clean.
5. **Hand off**: EARS (`feature-forge`) turns the `TR-n` items into "shall" statements citing `TRD-NNNN/TR-n`; a requirement with more than one viable way to meet it is a candidate for an RFC (`rfc`).

## Categories

The ISO/IEC 25010 quality characteristics, plus the constraints that are not qualities:

- **Performance efficiency**: latency, throughput, resource use, capacity.
- **Reliability**: availability, fault tolerance, recoverability (RPO, RTO), durability.
- **Security**: authentication, authorisation, confidentiality, integrity, audit, secrets.
- **Compatibility**: platforms, browsers, runtimes, versions, interoperability, data formats.
- **Maintainability and portability**: supported environments, upgrade paths, deployability.
- **Usability and accessibility**, where it is technical: WCAG level, locales, offline use.
- **Operability**: logging, metrics, tracing, alerting, runbooks.
- **Constraints**: mandated technology, hosting, budget, licences, data residency.
- **Compliance**: regulation or standard, with the clause that applies.

## Template

```md
# TRD-NNNN: <Title>

**Status:** draft | agreed | superseded by TRD-NNNN
**Derived from:** <PRD-NNNN, or the source that forced the work: a URL, a path, jira:KEY-123>

## Context
<One paragraph: what system or change this constrains, and why these requirements now.>

## Requirements
| ID | Category | Requirement | Target | Measured by | Priority | Refines |
| --- | --- | --- | --- | --- | --- | --- |
| TR-1 | Performance | Search responds under load | p95 < 200 ms at 50 rps | k6 run in CI against staging | must | PRD-NNNN/NFR-2 |

## Constraints
- TR-10: <A constraint the design must live within, and who imposed it>

## Not applicable
- <Category>: <why nothing applies>

## Open questions
- <What nobody could answer yet, and who can>
```

## Quality bar

- Every `TR-n` is falsifiable: a number, a named standard, or a list someone can check. "Fast", "secure" and "scalable" are goals, not requirements.
- Every target says how it is measured and where, so a test in the TDD stage can pin it.
- A requirement refining a PRD cites `PRD-NNNN/NFR-n` in its row; one with no PRD behind it names its source in `Refines` instead.
- No design: a TR says what must hold, never which component makes it hold.
