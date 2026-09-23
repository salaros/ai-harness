---
name: interview-notes
description: Put one interview on the record as a file under docs/research/interviews/, which later documents cite as a source. Use after talking to a user, a customer or a stakeholder; when someone pastes a transcript, call notes or a voice-memo dump; or when a grilling session that settled requirements should leave a record a PDD, BRD, ADR or any other document can derive from.
---

# Interview notes

An interview that is not written down soon is remembered as the interviewer wished it had gone. This skill turns one conversation into one short file, with the other person's exact words kept, gaps marked honestly, and surprises kept even when they fit no question. The file is a **source**, not a stage of the chain: a PDD, a BRD, an ADR or any other document names its path on its `**Derived from:**` line.

Files live in `docs/research/interviews/YYYY-MM-DD-<slug>.md`, dated by the conversation, not by the writing. There are two kinds:

- **user**: someone who has the problem: a customer, a prospect, an end user. It feeds a PDD's evidence.
- **stakeholder**: someone who decides or pays: a sponsor, the product owner, the maintainer. A `grilling` session that settles requirements or a decision is one: `brd` writes its interview here, and so does any other session a document will cite.

Real names are allowed. Leave out anything the participant asked to keep off the record, and anything no later reader needs: contact details, health, finances.

## Steps

1. **Intake.** Gather the raw material (a transcript, notes, or the interviewer's dictated memory) and record its provenance, since later readers weigh a transcript above a recollection. Get the date, who the participant is and their role, and how the conversation came about. If there was a question list, get that too. Done when the header below can be filled in.
2. **Sweep** the material in question order. For each question, write down what was answered, what was asked and not answered, or what was never asked, and never infer an answer that was not given. Then sweep again for everything that fit no question: off-script stories, the participant's own words for things, workarounds, emotional moments, commitments. Done when every question has one of the three outcomes and nothing interesting is left only in the raw material.
3. **Clarify** with the interviewer through the question tool, a few items per round: ambiguous passages offered as "X or Y?", answers the notes compress past use, questions that are blank because they were not asked or were not written down, and once, "did anything surprise you that is not in these notes?". Mark what comes back as from memory. Done when no blank is unexplained.
4. **Write** the file with the template below and show it to the user. Done when they confirm it says what happened.
5. **Hand off**: name the document that will cite it: a PDD for user interviews, a BRD, TRD or ADR for a stakeholder session. Draw no conclusions here: a single conversation records evidence, and weighing it against other interviews is the job of the document that cites them.

## Template

```md
# Interview: <topic>

**Kind:** user | stakeholder
**Date:** YYYY-MM-DD
**Participant:** <name or label>, <role, segment, situation>
**Interviewer:** <who asked, and with which skill if an agent ran it>
**Context:** <how the conversation came about, and anything that colours the answers>
**Record:** <transcript | notes taken during the call | reconstructed from memory>

## Questions and answers

1. **<Question>** <One to three lines of answer, with "their key phrases" verbatim.>
2. **<Question>** Not asked.
3. **<Question>** Asked, no real answer: <dodged | did not know | ran out of time>.

## Also heard

- <What fit no question: verbatim where the words matter.>
- Surprise: <what surprised the interviewer, and what prompted it.>
- Commitment: <what the participant agreed to do next, if anything.>
```

## Quality bar

- Facts, not interpretation. "We tried Asana and quit after two months" is a note; "Asana is too complex for them" is a conclusion for the PDD.
- Exact words kept where they carry meaning: what people call their work, the tool, the pain. A paraphrase of someone's vocabulary loses it.
- An answer about "most people" rather than the participant is recorded but marked as such, because it is evidence about the speaker, not the market.
- One conversation per file. A dump covering several is split, one file each.
- No invented interviews: a role-played or simulated conversation is not evidence and is not recorded here.

Some of the method here (one record per conversation, an addenda for what fits no question, blanks marked honestly, the market-guru flag) follows `asb-interview-debrief` from [asmartbear/asb-skills](https://github.com/asmartbear/asb-skills) (CC BY 4.0), and the list of what to capture follows `mom-test` from [wondelai/skills](https://github.com/wondelai/skills) (MIT).
