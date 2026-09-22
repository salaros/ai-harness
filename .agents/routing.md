# Routing

Route rows more than one agent reads. Four agents live in `agents/` beside this file and a row copied into two or three of their tables drifts in two or three directions. Each section below names the agents that read it, and each agent's own file names the sections that apply to it.

What **every** agent needs is not here: it is in `AGENTS.md` ("Working here"), which every session loads whether or not an agent is running. This file holds the middle ground, the rows shared by some agents and not all.

**A row earns its place by carrying what a skill's own `description` cannot.** The harness loads a skill whose description matches the request, so a row that restates the description changes nothing. Four things a description cannot carry:

- a **gate**: the row fires only on what `MEMORY.md`, an ADR or the project's own manifest records.
- an **ordering**: which skill runs first, and what it hands the next one.
- a **boundary**: where this skill stops and the one beside it starts.
- a **hand-off**: the work belongs to another agent.

There is a fifth, and it is not a matter of judgement: a skill whose frontmatter carries `disable-model-invocation: true` is unreachable except through a row. `node scripts/skills.js list` prints which those are; cull nothing without checking it.

**Keep a row under 200 characters.** Length costs more in a table than in prose, because past a line or two the trigger and the skill stop lining up in the reader's eye. Detail that does not fit goes under the table as prose, read once by the agent that got that far.

**The agent's own row wins.** Where an agent's table and a section here cover one trigger, follow the agent's table: that is the specific case and this is the general one.

## Working the chain

Read by `business-analyst`, `devops` and `engineer`.

| The ask is… | Skill(s) |
| --- | --- |
| an ask, plan or decision that is not yet sharp | `grilling`; `grill-with-docs` where terms and decisions should be recorded as they land, which adds `domain-modeling` |
| a settled plan that needs breaking into work | `to-tickets`, when `MEMORY.md` names a tracker |

Write the interview to `.scratch/<slug>/interview.md`: a document derived from a conversation cites that path as its source.

Hand `to-tickets` the open `#deferred` entries from `TODO.md` alongside the plan, and delete each entry whose ticket now exists. With no tracker, the drafts it writes under `.scratch/<feature-slug>/issues/` are the work items; say where they are.

## Building and running code

Read by `devops` and `engineer`.

| The request is… | Skill(s) |
| --- | --- |
| behaviour to build or fix | `tdd`; `implement` when working from a spec or tickets; `ponytail` throughout |
| a decision hard to reverse, or a design to write down before it is built | `grill-with-docs` writes the ADR, `design-doc` the SPEC, `create-implementation-plan` the IPLAN; `docs-check` after each |
| code or tooling being designed or restructured | `codebase-design` for the vocabulary; `improve-codebase-architecture` to scan the whole repo for candidates |
| something over-built, or that works but reads badly | `ponytail-audit` ranks what to delete or replace; `code-simplification` where there is nothing to delete |
| an issue or external PR to classify | `triage` |
| "what did we agree to fix later" | `duck-debt` for the `TODO`, `FIXME`, `HACK` and `XXX` comments; `ponytail-debt` for the `ponytail:` ones |
| "that did not land" | `wait-what` |
| the end of a session | `duck-debt`, then `retro` to improve this harness, then `handoff` for a successor |

An ADR is cross-cutting: write it the moment a decision is forced, whatever stage you are at, and derive it from whatever forced it.

`duck-debt` tiers what it finds by whether each comment carries an issue link. Run it first at the end of a session, so the retrospective opens on what was actually deferred rather than on what anyone remembers.
