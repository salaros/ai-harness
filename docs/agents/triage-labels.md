# Triage Labels

The skills speak in terms of five canonical triage roles. Without a tracker, which is where a clone starts (see `issue-tracker.md`), a role is a `Status:` line near the top of the issue file under `.scratch/<feature-slug>/issues/`; with a tracker it is a label on the issue. Both use the string in the middle column.

| Role in the skills | `Status:` value or label | Meaning                                  |
| ------------------ | ------------------------ | ---------------------------------------- |
| `needs-triage`     | `needs-triage`           | Maintainer needs to evaluate this issue  |
| `needs-info`       | `needs-info`             | Waiting on reporter for more information |
| `ready-for-agent`  | `ready-for-agent`        | Fully specified, ready for an AFK agent  |
| `ready-for-human`  | `ready-for-human`        | Requires human implementation            |
| `wontfix`          | `wontfix`                | Will not be actioned                     |

When a skill says "apply a label", set the file's `Status:` line, or apply the label in the tracker. The category goes beside it, on a `Type:` line or as a second label: `bug` or `enhancement`. In a tracker these are plain labels rather than workflow statuses: an issue keeps its workflow status and carries exactly one state value and one category.

Edit the middle column if the tracker already uses other names.
