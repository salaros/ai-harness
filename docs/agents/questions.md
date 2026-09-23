# Asking the user

Every question to the user goes through the harness's question tool: the interviews that `grilling`, `grill-with-docs`, `pdd`, `interview-notes`, `brd`, `prd`, `feature-forge`, `project-init`, `to-questionnaire`, `teach` and any other skill run, and every confirmation before acting ("proceed?", "which one?", "drop these?"). Plain-text questions are the fallback for a harness that has no such tool, never a shortcut.

## Rules

- **One call per round.** A grilling round is the whole frontier: put every question of the round in one call, up to the tool's limit, and split a bigger round into consecutive calls before reading any answer.
- **Recommended answer first**, labelled `(Recommended)`, with a one-line description of the trade-off on every option. Two to four options; the tool adds "Other" for free text.
- **Decisions are the user's, facts are yours.** Look a fact up before asking; a question that a file or command can answer is not a question.
- **Answers are the record.** After the round, restate the settled decisions in prose once, then move on; do not ask the same question twice.

## Tool per harness

| Harness | Tool | Shape | Notes |
| --- | --- | --- | --- |
| Claude Code | `AskUserQuestion` | 1 to 4 questions per call, 2 to 4 options each, `multiSelect` per question, `header` chip of up to 12 characters | Always available. |
| OpenCode | `question` | Several questions per call, each with `header`, question text and options; single or multi select; custom answer allowed | Always available. |
| Gemini CLI | `ask_user` | 1 to 4 questions per call, types `choice` (with `multiSelect`), `text`, `yesno`; `header` up to 16 characters | Always available; see the [Ask User tool page](https://geminicli.com/docs/tools/ask-user/). |
| OpenAI Codex | `request_user_input` | 1 to 3 questions per call, 2 to 3 options each, recommended option first | Plan mode only unless the `default_mode_request_user_input` feature flag is on. In Default mode without the flag, use the fallback. |
| Cursor | `AskQuestion` | Multiple-choice card in chat | Plan mode only; reports of answers not reaching the agent. Use the fallback outside Plan mode. |
| GitHub Copilot CLI | `ask_user` | Pauses for input; `--no-ask-user` disables it in automation | Exact question shape unverified; when the tool is absent, use the fallback. |

Names are as the model sees them. When your harness lists a tool with the same purpose under another name, use it and add the row here.

## Fallback: a plain-text round

When no tool exists, write the round the way `grilling` formats it, all questions of the round in one message, then stop and wait:

```
❓ **Q1** - **<title>**: <question, with lettered options where there are options>

➡️ <recommended answer>

---

❓ **Q2** - …
```

Never mix: a round is either one tool call (or consecutive calls) or one plain-text message, not a question in prose followed by a tool call for the rest.
