---
name: spec
description: Write or revise a SPEC, the technical design document that says how the system satisfies its requirements. Use when the requirements are agreed (EARS and BDD, and an accepted RFC or ADRs where a choice was argued) and engineering needs the architecture, data model, interfaces and test strategy written down before an implementation plan. Not for requirements (trd), for comparing options (rfc) or for recording a decision (grill-with-docs).
---

# Technical design (SPEC)

A SPEC answers **how the system satisfies the requirements**: the design engineering builds from. It takes the "shall" statements and scenarios as given and says what components exist, how they talk, what data they keep and how the result will be tested. It argues no options and records no decisions: an argument between designs is an RFC, and a choice that is hard to reverse is an ADR, both written before this and cited here.

It sits after ADR in the chain (`AGENTS.md`) and cites backwards only: the EARS and BDD documents it satisfies, the ADRs it obeys and the accepted RFC it implements. `create-implementation-plan` refines its `### D-n` sections into ordered steps.

Read `docs/agents/chain.md` first, then `CONTEXT.md` if it exists, the ADRs touching the area, and any earlier SPEC under `docs/spec/` so components keep their names.

## Steps

1. **Collect the inputs.** The EARS document (its `REQ-n` or equivalent items), the BDD scenarios, every ADR that binds the area, and the RFC whose Resolution chose this design, if there was one. A requirement with no agreed upstream is written first, never assumed. Work on the harness or the tooling itself, with no product requirement behind it, derives from the ADR or the review that raised it, as `SPEC-0001` does. Done when every input has an ID for the `**Derived from:**` line and no requirement the design must meet is missing from it.
2. **Frame the design** with `grilling`: goals as the requirements it satisfies, non-goals as what it leaves for later, the constraints the ADRs and TRD impose, and the seams where the design meets code that already exists. Done when the user agrees the goals and non-goals.
3. **Draft** `docs/spec/NNNN-<slug>.md`, numbered after the highest existing file, with the template below. Each part of the design a plan will later refine is a `### D-n` section, and each cites the requirements it meets as `DOC-ID/ITEM`. Done when every requirement in the inputs is met by at least one `D-n`, and every `D-n` names what it meets.
4. **Confirm** with the user and fix what they change. A SPEC carries no status line: it is agreed once it is confirmed, and the plan that refines it is the record of that. Done when `node scripts/docs-check.js` is clean.
5. **Hand off.** `tdd` writes the failing tests the test strategy names, and `create-implementation-plan` turns the `D-n` sections into the IPLAN, citing `SPEC-NNNN/D-n`.

## Template

```md
# SPEC-NNNN: <title>

**Derived from:** EARS-NNNN, BDD-NNNN, ADR-NNNN, RFC-NNNN

## Goals and non-goals
**Goals:** <the requirements this design satisfies, cited: EARS-NNNN/REQ-n, BDD-NNNN/SC-n>
**Non-goals:** <what it leaves out, and where that goes>

## Constraints
<What the design must live within: the ADRs it obeys (ADR-NNNN), the TRD targets carried through EARS, the code it must fit.>

## Architecture
<The components, what each owns, and how they connect. A diagram in text where the words would be longer.>

## Design

### D-1 <component or concern>
<What it does, its interface, its data, its failure modes. Satisfies: EARS-NNNN/REQ-n.>

### D-2 <...>

## Data model
<Entities, their fields and their lifetimes; what is stored, what is derived, what is migrated.>

## Interfaces
<Between modules, and with the outside: endpoints, messages, files, commands, each with its shape and its errors.>

## Risks
- R-1: <what could make this design fail, how likely, and what is done about it>

## Test strategy
<What `tdd` pins first: which requirements each test level covers, what is faked and what runs for real, and how the BDD scenarios map onto tests.>
```

## Quality bar

- Every requirement in the inputs is cited by the `D-n` that meets it, and a `D-n` meeting nothing is cut.
- The design is specific: names, shapes and limits ("a queue of at most 1,000 entries, oldest dropped"), never "an appropriate buffer".
- Decisions are cited, not re-argued: a paragraph weighing two designs belongs in an RFC.
- Non-goals say where the excluded work goes, so scope is narrowed on purpose rather than forgotten.
- Failure modes are written for each `D-n`: what happens when its input is wrong, its dependency is down or its limit is hit.
- The test strategy is concrete enough that `tdd` can start without asking.

The shape of the sections (goals and non-goals first, behaviour before implementation, acceptance stated so it can be tested) follows `design-doc` from [diskd-ai/design-doc](https://github.com/diskd-ai/design-doc) (MIT), which this skill replaced.
