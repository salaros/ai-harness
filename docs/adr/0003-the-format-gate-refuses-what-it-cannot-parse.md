# ADR-0003: The format gate refuses what it cannot parse

**Derived from:** scripts/stacks.tsv, .agents/hooks/tests/tables/stacks.js

The `format` cell of a stack row is a check-only command the `pre-push` hook runs over the files a push would publish, the ones the `formats` cell claims. The prettier rows could pass `--ignore-unknown`, and the obvious reading is that they should: it is what stops prettier erroring on a file it has no parser for.

## Decision

### D-1 the prettier rows pass no `--ignore-unknown`

The `formats` cell is the contract, and the `format` command trusts it. An extension prettier cannot parse fails the push loudly rather than being skipped, and the `formats` list is only ever extended to an extension prettier can actually read.

### D-2 an extension whose parser is a plugin is scaffolded with that plugin

The npm, pnpm and yarn rows list `.astro`, and each of their scaffolds installs `prettier-plugin-astro` and then names it in the project's prettier config. The extension and its plugin travel together, asserted both ways in `.agents/hooks/tests/tables/stacks.js`: a row listing the extension installs and declares the plugin, and a row installing the plugin lists the extension. The declaration names a position in the plugin list, so a row declaring a second plugin names a second position; the same check refuses a collision, which would otherwise drop the first plugin without a word.

## Why

`--ignore-unknown` skips a file whose extension prettier cannot parse **and still reports success**. So a row listing an extension with no parser to hand under `formats` would buy a gate that checked nothing and said it had — the worst of the three possible outcomes, because it is indistinguishable from a passing check by anyone reading the output, including the person who added the extension in the hope of having it checked.

Failing loudly is recoverable: whoever hits it learns in one push that the extension has no parser, and either installs the plugin or takes it off the list. Passing silently is not, because nothing ever tells them.

This is what `.vue` turned on. Prettier parses `.vue` itself, so it belongs on the list the moment the row formats anything. `.astro` does not: its parser is a plugin, which is why D-2 pairs the two rather than leaving the extension on a list nothing can read.

Declaring the plugin is not a detail of that pairing but half of it. Prettier 3 dropped plugin auto-discovery, so an installed plugin it has not been told about is a plugin it never loads: `prettier --check Page.astro` answers `No parser could be inferred` and the push is blocked over a file nothing could have formatted. Installing without declaring buys the loud failure and none of the checking.

`.razor` stays off every list, and its own line in the check keeps it there. It has no prettier plugin, and `dotnet format` is no substitute: run over a misformatted `.razor` file it leaves it byte-identical, while the same `@code` body written into a `.cs` file beside it is reformatted, so the tool was working and simply does not read Razor markup. Nothing on hand can check it, so nothing claims to.

The same reasoning is why the cell is a check-only command: a formatter that rewrites files during a hook changes what is in front of the author after they approved it, and a partially staged edit is how lint-staged came to need a stash and a restore. The hook reports and blocks, and `git push --no-verify` is the escape hatch.

## Consequences

- A project the harness scaffolds can check `.astro` from the start. One that predates the scaffold cannot: its first push touching an `.astro` file fails with prettier's own `No parser could be inferred for file "..."`, and stays failing until the project installs `prettier-plugin-astro` and names it in its prettier config, or drops `*.astro` from its row. That is the loud failure D-1 chose. The hook reports prettier's message rather than explaining it, so this decision is what the message leads back to.
- An extension added to a shared `formats` cell now costs a scaffold step in every project the row creates, so the list grows only where the plugin is worth carrying everywhere.
- Adding an extension to a `formats` cell is a decision about whether a parser exists, not a formatting preference. Getting it wrong is a failing push rather than a silent gap, which is the trade this records.
- If prettier ever gains a flag that skips an unparseable file and *fails*, that flag is worth having and this is the decision to revisit.
- `scripts/stacks.tsv` points here rather than carrying the argument in its header comment, per `CODING_STANDARDS.md`.
