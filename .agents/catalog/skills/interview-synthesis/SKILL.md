---
name: interview-synthesis
description: Weigh several interview records under docs/research/interviews/ against each other and write what they add up to as a synthesis under docs/research/syntheses/, which a PDD cites as its evidence. Use after a round of user or stakeholder interviews, when someone asks what several interviews add up to or what recurs across them; before a PDD that rests on more than one conversation.
---

# Interview synthesis

One interview is an anecdote; five that say the same thing unprompted are evidence. This skill reads the interview records `interview-notes` wrote and turns them into one file: the themes that recur, how many people each rests on, the quotes that show it, what the themes mean, and what to do about them. The file is a **source**, not a stage of the chain: a PDD names its path on its `**Derived from:**` line, and its `EV-n` lines cite the themes.

Files live in `docs/research/syntheses/YYYY-MM-DD-<slug>.md`, dated by the synthesis. A later round of interviews gets a new synthesis that names the one it supersedes, rather than an edit that erases what the earlier one concluded.

Recommendations here are advice. The verdict belongs to the PDD and to the user who gives it; a recommendation that the evidence does not carry is marked low confidence, not left out.

## Steps

1. **Gather** the records: every file under `docs/research/interviews/` on the topic, and the research question they were meant to answer. A conversation not yet on the record goes through `interview-notes` first, since a synthesis quotes files, never memory. Done when every record is listed with a label (`P1`, `P2`, …), its kind and its date, and the question is one sentence.
2. **Tag** each record: mark every observation in it with a topic, in the participant's own words where the words matter. Keep `user` and `stakeholder` records apart: a sponsor's belief about users is evidence about the sponsor. Done when nothing in any record's answers or "Also heard" is untagged.
3. **Group** the tags into themes (`TH-n`). A theme needs at least two participants; what one person said is a signal and is listed as one. Count each theme as "X of Y participants", count a participant who said the opposite as a contradiction rather than dropping them, and flag answers about "most people" as the speaker's view, as the records do. Done when every theme has a count, its contradictions and at least one verbatim quote per participant counted.
4. **Interpret**: turn themes into insights (`IN-n`), each a sentence that says why, not what ("they re-key jobs because the two systems share no identifier", not "they mentioned re-keying"), citing the themes it rests on. Then recommendations (`REC-n`), each citing its insights, with a confidence of high, medium or low set by how many participants and how much contradiction lie under it. Done when every recommendation traces back to quotes.
5. **Clarify** with the user through the question tool, a few items per round: themes that could be read two ways, a count that hangs on how one answer is read, and a quote that sits in the wrong theme. Done when no theme depends on a reading the user has not seen.
6. **Write** the file with the template below and show it to the user. Done when they confirm it says what the records say.
7. **Hand off** to `pdd`: its `**Derived from:**` line names this file, each `EV-n` names the theme it rests on (`EV-1: <what was observed> (docs/research/syntheses/<file>.md, TH-2)`), and its risks take the limitations. Say which question the interviews left open and who could answer it.

## Template

```md
# Synthesis: <topic>

**Date:** YYYY-MM-DD
**Question:** <what these interviews were meant to find out>
**Supersedes:** <an earlier synthesis, or none>

## Participants

| ID | Record | Kind | Who | Date |
| --- | --- | --- | --- | --- |
| P1 | docs/research/interviews/<file>.md | user | <role, segment, situation> | YYYY-MM-DD |

## Themes

### TH-1 <theme, in a phrase>

**Prevalence:** X of Y participants (P1, P3, P4); contradicted by P2

<Two or three sentences on what the theme is.>

- P1: "<verbatim quote>"
- P3: "<verbatim quote>"
- P2, against: "<verbatim quote>"

## Signals

- <What only one participant said, and who: worth another interview, not a theme yet.>

## Insights

- IN-1: <Why, in one sentence.> Rests on TH-1, TH-3.

## Recommendations

| ID | Recommendation | From | Confidence |
| --- | --- | --- | --- |
| REC-1 | <what to do or find out next> | IN-1 | high, medium or low, and why |

## Limitations

- <Who was not interviewed, what was not asked, what skews the sample, and what each gap would take to close.>
```

## Quality bar

- Every quote is verbatim and can be found in the record its label points to. A paraphrase is written as one, without quotation marks.
- Every count is honest: "3 of 7" rather than "most", and the four who did not say it are part of the finding.
- Contradictions are kept. A theme with its dissent is stronger evidence than one with the dissent removed.
- User and stakeholder evidence are never pooled into one count.
- Real names are allowed, as in the records; nothing is added that the records left out.
- No invented interviews, and no themes from general knowledge of the market: only what the records hold.

This skill is written for this repository and copies no text. Its shape (participants, themes with prevalence and attributed quotes, insights that explain why, recommendations with a confidence each, limitations) is adapted from `discover-interview-synthesis` in [product-on-purpose/pm-skills](https://github.com/product-on-purpose/pm-skills), licensed [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0).
