# ADR-0003: The format gate refuses what it cannot parse

**Derived from:** scripts/stacks.tsv:2, .agents/hooks/tests/tables/stacks.js, TODO.md

The `format` cell of a stack row is a check-only command the `pre-commit` hook runs over the staged files the `formats` cell claims. The prettier rows could pass `--ignore-unknown`, and the obvious reading is that they should: it is what stops prettier erroring on a file it has no parser for.

## Decision

### D-1 the prettier rows pass no `--ignore-unknown`

The `formats` cell is the contract, and the `format` command trusts it. An extension prettier cannot parse fails the commit loudly rather than being skipped, and the `formats` list is only ever extended to an extension prettier can actually read.

## Why

`--ignore-unknown` skips a file whose extension prettier cannot parse **and still reports success**. So a row listing `.astro` or `.razor` under `formats` would buy a gate that checked nothing and said it had — the worst of the three possible outcomes, because it is indistinguishable from a passing check by anyone reading the output, including the person who added the extension in the hope of having it checked.

Failing loudly is recoverable: whoever hits it learns in one commit that the extension has no parser, and either installs the plugin or takes it off the list. Passing silently is not, because nothing ever tells them.

This is what `.vue` turned on. Prettier parses `.vue` itself, so it belongs on the list; `.astro` needs `prettier-plugin-astro`, which the harness does not install, and `.razor` has no prettier plugin at all. Both stay off it, as `TODO.md` records.

The same reasoning is why the cell is a check-only command: a formatter that rewrites files during a commit hook changes what is being committed after the author approved it. The hook reports and blocks, and `git commit --no-verify` is the escape hatch.

## Consequences

- A project wanting `.astro` checked installs `prettier-plugin-astro` and extends its own row. The harness does not install prettier plugins.
- Adding an extension to a `formats` cell is a decision about whether a parser exists, not a formatting preference. Getting it wrong is a failing commit rather than a silent gap, which is the trade this records.
- If prettier ever gains a flag that skips an unparseable file and *fails*, that flag is worth having and this is the decision to revisit.
- `scripts/stacks.tsv` points here rather than carrying the argument in its header comment, per `CODING_STANDARDS.md`.
