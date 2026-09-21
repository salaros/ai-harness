# Writing rules

## Commit messages

Conventional commits: `<type>(<scope>)?!?: <description>`, type one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, subject at most 72 characters with no full stop, and a description of at least four words: "fixing bugs" and "implemented some stuff" are rejected.

Every commit carries a body, separated from the subject by a blank line: the subject says what changed, the body says why. Git's own trailers are metadata, so a body that is only a `Refs:` line does not count.

Cite the issue key in the subject or a trailing `Refs: AB-42` line. Leaving it out is a warning, not a rejection, and a project whose `MEMORY.md` records `Issue tracker: none` is not warned at all.

Keys follow Jira's [smart commits](https://support.atlassian.com/bitbucket-cloud/docs/use-smart-commits/): write the key bare, `AB-42`, never `#AB-42`, because a `#` word is a command. Commands are optional and go on trailing lines after the key, one line each, never in the subject: `Refs: AB-42 #comment ready for review`, `Refs: AB-42 #time 1h 30m`, `Refs: AB-42 #start-progress` for a transition, hyphenating a name of several words. The hook warns about a hashed key and about a command in a subject that cites a key. A project whose `Key format:` is `#\d+`, as on GitHub Issues, keeps its hash.

The `git-commit` skill writes these messages, the `commit-msg` Git hook rejects anything else, and `git commit --no-verify` overrides it.

## Prose

Prose a person will read follows `writing-clearly-and-concisely`, before you hand it over or commit it: a document in `docs/`, a commit message, a pull request description, an email, anything published on the user's behalf. Active voice, concrete language, statements in positive form, needless words out, and none of the inflated claims, sales language, stock AI words or filler it catalogues.

Files written for agents are the exception, and follow `writing-for-agents` instead: `AGENTS.md`, every `SKILL.md`, and the agent route tables.

## Language

Write what this project owns in the language `MEMORY.md` gives as `Prose language`, and reply to the developer in it: the `docs/` chain, `INTENT.md`, `CONTEXT.md`, `TODO.md`, `MEMORY.md`'s own values and the README's Project section. A missing line means English.

The harness stays English whatever that line says -- `AGENTS.md`, `docs/agents/`, the route tables and every `SKILL.md` -- because an update merges those from upstream and would overwrite a translation or collide with it. Commit messages stay English too, so one log reads the same in every repo.

The chain's markers are English and ASCII whatever language the prose is, because `docs-check` parses them: `docs/prd/0001-billing.md` with a Russian title and body passes, while `0001-биллинг.md` fails its file-name rule and a translated `**Derived from:**` reads as missing.
