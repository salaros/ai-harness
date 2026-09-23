---
name: rfc
description: Write a Request for Comments (RFC), a technical proposal that compares genuine alternatives and argues them out before anyone commits to a design. Use when a technical problem has two or more viable solutions and no obvious winner, when someone asks "how should we solve X" or "what are our options", or wants a proposal debated before an ADR or SPEC is written.
---

# Request for Comments

An RFC answers **how should we solve this technical problem, and what do the objections say**. It states the problem, sets the criteria before the options, gives each viable option its strongest honest case, has agents argue them out inside the file, and ends with the user's Resolution. It records the debate; the ADR records the decision it produced and the SPEC the design.

It is cross-cutting in the chain (`AGENTS.md`), like an ADR: open one the moment a choice needs arguing, at any stage, and derive it from whatever raised it. It is optional. A design with one sensible answer goes straight to the SPEC, and a decision nobody disputes straight to an ADR.

Read `docs/agents/chain.md` first, then `CONTEXT.md` and the ADRs touching the area, and any earlier RFCs under `docs/rfc/`: a rejected one may already have argued this.

## Status

`Draft` while writing, `Open` while the debate runs and the user weighs it, then one of `Accepted`, `Rejected` (no option is taken) or `Withdrawn` (the question went away). A later RFC replacing an accepted one sets the older one's status to `Superseded by RFC-NNNN`. Once closed, the file is frozen apart from that line: a changed mind is a new RFC, not an edit.

`docs-check` holds every RFC to one of these values, and refuses a SPEC that cites an RFC which is not `Accepted`. An ADR may cite any RFC, since "we rejected RFC-0002" is itself a decision.

## Steps

1. **Frame.** Interview with `grilling`: the problem and why now, the constraints (a TRD's `TR-n` items if one exists), what has been tried or rejected already, who decides. Done when the problem fits in three sentences and names no solution.
2. **Set criteria before options**, `C-n`, each with a weight (must, should, could). Options are then judged against criteria nobody bent to fit a favourite. Done when the user agrees the list.
3. **Draft options**, `OPT-n`, two or more and each genuinely viable, one of them doing nothing or the smallest change. Give every option its real strengths: a reader who prefers it should feel it was represented honestly. Save the file as `Draft`. Done when each option is scored against every criterion.
4. **Debate** (below), status `Open`. Done when the three rounds are in the Discussion section.
5. **Resolve.** Put the debate to the user with the question tool: which option, or reject, or withdraw. Write their Resolution, what it gives up, and the follow-ups, and set the status. The user decides; no agent closes an RFC. Done when `node scripts/docs-check.js` is clean.
6. **Hand off.** An accepted RFC produces an ADR per hard-to-reverse choice it settled (`grill-with-docs`, citing `RFC-NNNN/OPT-n`) and a SPEC for the design (`design-doc`, citing the RFC). Name them in the Resolution's follow-ups.

## Debate

The debate is between agents, because the people who would comment on a team's RFC are mostly not there. It runs three rounds, and only you, the writing agent, edit the file: each debater returns text, and you paste it under its heading, signed with its role.

1. **Positions.** One advocate per option, each given the RFC with the criteria and told to make the strongest case for its option alone: how it meets each criterion, what it costs, why the others fall short. At most 300 words each.
2. **Critique.** One critic, given the RFC and every position, told to attack all of them: the weakest claim in each, the criterion each quietly ignores, the risk nobody priced. It favours no option.
3. **Rebuttal.** Each advocate answers the critic once, conceding what is true. At most 150 words each.

Where the harness can start sub-agents, start each advocate and the critic as its own sub-agent, the advocates of a round in parallel, so no debater sees a position it should not have yet. Where it cannot, play each role in turn and write each position before reading the next; say so at the top of the Discussion, since one mind arguing every side is a weaker debate.

## Template

```md
# RFC-NNNN: <Title as a question: How should we ...?>

**Status:** Draft | Open | Accepted | Rejected | Withdrawn | Superseded by RFC-NNNN
**Derived from:** <what raised it: TRD-NNNN/TR-n, EARS-NNNN, ADR-NNNN, a URL, a path, jira:KEY-123>
**Decider:** <who resolves it>

## Abstract
<Three to five sentences: the problem, the options, what is being asked. A reader decides from this whether to read on.>

## Problem
<Why this needs solving now, and what happens if nothing is done.>

## Goals and non-goals
**Goals:** <specific and falsifiable>
**Non-goals:** <what this RFC will not settle>

## Criteria
- C-1 (must): <what any acceptable option has to satisfy>
- C-2 (should): <...>

## Options

### OPT-1: <name>
<How it works, concretely: components, interfaces, data, rollout.>

| Criterion | Assessment |
| --- | --- |
| C-1 | <meets / partly / fails, and why> |

**Strengths:** <...> **Costs and risks:** <...>

### OPT-2: <do nothing, or the smallest change>

## Discussion

### Round 1: positions
**Advocate for OPT-1:** <...>

### Round 2: critique
**Critic:** <...>

### Round 3: rebuttals
**Advocate for OPT-1:** <...>

## Open questions
- Q-1: <what the debate could not settle, and who can>

## Resolution
<Filled by the decider: the option taken, or why none was; what it gives up; the date.>

**Follow-ups:** <ADR to record each hard-to-reverse choice; the SPEC to write>
```

## Quality bar

- Criteria come before options and none is written to fit one option.
- Every option could win: if nobody would argue for one, drop it rather than keep it as a strawman.
- Targets are numbers, not adjectives: "p99 under 300 ms", not "low latency".
- The Discussion is the debaters' words, not your summary of them.
- The Resolution says what the chosen option gives up.

Some of the writing guidance here (fair comparison of approaches, falsifiable goals, concrete service targets) follows `dev-rfc` from [pproenca/dot-skills](https://github.com/pproenca/dot-skills) (MIT).
