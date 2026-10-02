# SPEC-0003: A glossary the hooks check and the portal links

**Derived from:** ADR-0001, docs/research/interviews/2026-10-02-glossary-file.md

A repo's terms were a section of `CONTEXT.md`, `## Language`, in a format only `domain-modeling` wrote and nothing read. The interview settled three things: the terms get a file of their own, `GLOSSARY.md`; an entry is written in either of two formats, the heading format of glossarify-md or the bold format the vendored skills write; and support goes as far as linking a term to its definition in the docs portal. This is the design that follows. The decision that a glossary is its own file is not recorded as an ADR yet; `TODO.md` holds that.

## Goals and non-goals

**Goals:** one reader that turns either format into the same model; a check on a glossary's shape, run where the other shape checks run, after an edit and before a commit; a repo's terms readable as its glossary while they still sit in `CONTEXT.md`; `GLOSSARY.md` created in a target by the installer and never overwritten there; a glossary page in the portal and a link to it from a term's first mention in each chain document.

**Non-goals:** checking prose against the glossary. A document using a word the glossary avoids is not reported, since a word avoided as a term is often plain English elsewhere; `code-review` reads `CODING_STANDARDS.md`, which names the glossary, and that is where the judgement stays. Running glossarify-md itself: the heading format is its format so that a repo may run it, and nothing here depends on it. Rendering the glossary of each context in a multi-context repo: the portal covers the root glossary, as the chain covers the root `docs/`, and `TODO.md` holds the rest. Moving a repo's terms for it: the split is an edit somebody makes, and the session brief says how many terms are waiting.

## Constraints

- A repo is read through a repo view (ADR-0001), so the glossary is read the same way from the working tree, the index or a repo held in memory, and the decision tables touch no disk.
- `domain-modeling` and `teach` are vendored and are not edited in place. What they write must already be a glossary this design reads, and a rule that overrides their instructions lives in `AGENTS.md` and `docs/agents/domain.md`.
- `tools/docs-site` is deleted whole by a repo that does not want it, so the page and the linking are files inside that folder, built on a model that lives outside it, and the suite skips their cases when the folder is gone.
- `markdownFor()` with no glossary in the model renders exactly what it rendered before, which `markdownForWithoutOptionsIsUnchanged` already pins.
- The harness invariant `theDocsPortalReadsTheChainModel` keeps the portal from reading the disk on its own, and the glossary is held to the same rule: `collect()` hands the model in.

## Architecture

`scripts/check-glossary.js` owns the model: `parse()` reads one file's text, `check()` reports what is wrong with it, `read()` gives a repo's glossary through a view. `scripts/githook.js` and `.agents/hooks/check-edit.js` call `check()`, `.agents/hooks/session-start.js` and `tools/docs-site/chain.mjs` call `read()`. `tools/docs-site/glossary.mjs` presents the model: `glossaryPage()` is the page and `linkTerms()` is the link, which `markdownFor()` in `chain.mjs` applies to a document's prose. `scripts/update-harness.js` carries the skeleton a target starts from.

## Design

### D-1 One model for two formats

A file is in the bold format when one line of it outside fenced code is `**Term**:`, and in the heading format otherwise. In the heading format every heading below the title with text under it is a term, and a heading with nothing under it but deeper headings is a group; an HTML comment holding an `aliases:` line, on one line or several, lists the term's other names. In the bold format a term is the bold name with its colon, its definition is the lines after it up to the next term or heading, and an `_Avoid_:` line lists the words not to use for it; headings group the entries. An aliases comment works in a bold entry and an `_Avoid_` line in a heading one, so the model is the same whichever was written: `term`, `line`, `aliases`, `avoid`, `definition`, a `slug` unique in the file, and `names`, the lower-cased names the entry answers to. A term written `Short (Long form)` answers to either half. Satisfies: the interview's second answer, that both formats are accepted.

### D-2 The shape check

`check(text, root, file)` returns `{ problems, terms, summary }` and reports: a file that does not open with a `# <title>` heading; a term with no definition; an aliases comment or an `_Avoid_` line that names nothing; a name, term or alias, already defined on an earlier line; a word that is both a name of a term and one it avoids. It never asks for a term to exist: a glossary with a title and no entries is well formed, since that is the honest state of a repo that has settled nothing. Every message names the line, and a failing command ends by pointing at `docs/agents/domain.md`, which holds the two formats. Satisfies: the interview's third answer, the shape check.

### D-3 Where the check runs

`isGlossary(file)` is true for any `GLOSSARY.md` except one under `.agents/`, `.claude/` or `node_modules/`, so a context's glossary is checked like the root's and a vendored skill's example is not. The edit hook checks the file just written and sends the problems back to the agent. The `pre-commit` hook checks each staged glossary as the index holds it, skips one being deleted, and blocks the commit; `--dry-run` says which files it would check. Only `GLOSSARY.md` is held to the check: terms left in `CONTEXT.md` are read and never refused. Satisfies: the interview's third answer.

### D-4 A repo's glossary, and the terms still in CONTEXT.md

`read(view, dir)` returns nothing when the folder has neither file. Otherwise it returns the title and lead of `GLOSSARY.md` when there is one, then its terms, then the terms under `## Language` in `CONTEXT.md` whose names `GLOSSARY.md` does not already define, each carrying the file it came from, with `legacy` the count of those. The session brief prints `domain: glossary in GLOSSARY.md`, adds how many terms are still in `CONTEXT.md` to move, and says `glossary in CONTEXT.md` for a repo that has not split yet. Satisfies: the interview's first answer, with nothing lost in a repo that has not caught up with it.

### D-5 The file in a target

`scripts/harness-files.tsv` lists `GLOSSARY.md` as `skip`, like `CONTEXT.md`: the upstream's names the harness's own terms, and a project's names its domain, so an install never overwrites one. `update-harness.js` writes a skeleton, a title and three lines saying what goes in it, into a target that has none; the skeleton passes D-2 with no terms. This repository's own terms move from `CONTEXT.md` to `GLOSSARY.md` unchanged, in the bold format they were written in. Satisfies: the interview's first answer.

### D-6 The glossary page

`glossaryPage(glossary)` returns the page as markdown: the glossary's own lead, the file it is read from, then an entry per term in alphabetical order whatever the file's. An entry is an H2 carrying `<span id="term-<slug>"></span>` before the term, so the page's table of contents is the list of terms and the prefixed anchor cannot meet the id Starlight gives the heading. Under it sit the definition as written, with the other terms it uses linked on the page, then `Also:` with the aliases and `Avoid:` with the avoided words. A glossary without terms renders one line saying so. The page is at `/glossary/`, in the sidebar after the SRS, and exists only when `read()` returned a glossary; `node tools/docs-site/chain.mjs` prints a `glossary` line with the count and the file. Satisfies: the interview's third answer.

### D-7 Linking a term where a document mentions it

`linkTerms(text, glossary, seen, page)` links each name, a term or an alias, to its entry: matched whole, in any case, the longest name first, and written as the document wrote it. `markdownFor()` keeps one `seen` set per document, so a term is a link where a reader first meets it and plain text after that, by whichever of its names. A line is left alone when it is a heading or the `**Derived from:**` line, and within a line so are inline code, a link inline or by reference, an HTML tag and a URL. A name next to a letter, a digit, `_`, `/`, `\` or `-`, or followed by a dot and a letter, is part of a path, a file name or a longer word and is not the term. Avoided words are never linked. The SRS view renders through `markdownFor()` and so links the same way, and its appendix points at the glossary page when there are terms. Satisfies: the interview's third answer.

## Data model

Nothing is stored beyond the files themselves. The model is rebuilt on each read: `{ file, title, description, terms, legacy }` for a repo, each term `{ term, line, aliases, avoid, definition, empty, slug, names, file }`. `collect()` adds it to the chain model as `glossary`, or `null`, replacing the boolean SPEC-0002 put there.

## Interfaces

- `node scripts/check-glossary.js [path | -]`: the root's `GLOSSARY.md` by default, a path, or stdin. Exit 0 with a summary line, 1 with the problems, 2 when a path it was given does not exist.
- `parse(text, { section })`, `check(text, root, file)`, `read(view, dir)`, `isGlossary(file)` and `namesOf(term)` from `scripts/check-glossary.js`. All pure but `read()`, which reads through the view it is given.
- `GLOSSARY_LINK`, `anchorOf(term)`, `linkTerms()` and `glossaryPage()` from `tools/docs-site/glossary.mjs`; `GLOSSARY_FILES` from `chain.mjs`, the two paths the dev server watches.
- `markdownFor(doc, chain, options)` reads `chain.glossary`; its signature is unchanged.

## Risks

- R-1: a term that is also an everyday word, such as "target" in this repository's own glossary, is linked at its first mention whether or not the sentence means the term. One link per document keeps the cost low, and the fix where it matters is a more specific term.
- R-2: a repo whose install receipt predates the skeleton list is taken to have every skeleton, so it gains no `GLOSSARY.md` from an update. Its terms are still read from `CONTEXT.md` (D-4), and the first `domain-modeling` session creates the file.
- R-3: `teach` writes a `GLOSSARY.md` of the topic being learned into its working directory. Run from the repo root it would write into the domain glossary, so `docs/agents/domain.md` says to run it from a folder of its own; a glossary it left there is checked like any other (D-3) and is not what the portal renders.
- R-4: the file's format is decided by one `**Term**:` line, so a heading-format glossary that quotes such a line outside a code fence is read as bold. The check then reports its terms as missing, which is loud rather than silent.

## Test strategy

Decision tables, each case a repo or a text held in memory:

- `.agents/hooks/tests/tables/glossary.js`: the same entries in both formats give the same model; each problem D-2 names, one case each, and the well-formed and empty files that pass; which paths `isGlossary` takes; `read()` over a repo with a glossary, with terms only in `CONTEXT.md`, with both and with neither; the command's exit codes; and a staged glossary through the real `pre-commit` hook in a temporary git repo, refused when malformed and passed when deleted.
- `.agents/hooks/tests/cases.tsv`: the edit hook refusing a malformed glossary and passing a well-formed one, the two session-brief lines, and the `--dry-run` line.
- `.agents/hooks/tests/tables/installer.js`: an older receipt gains the skeleton, and the skeleton is well formed.
- `.agents/hooks/tests/tables/docs-chain.js`, skipped without the portal: a term linked at its first mention and plain after it; headings, the provenance line and fenced code untouched; aliases, case, code, links, URLs, paths and longer words, one case each; the page's lead, order, anchors, cross-links and aliases; the sidebar, the overview and the SRS appendix with terms, with an empty glossary and with none; terms still in `CONTEXT.md` rendered as the glossary.

The existing pin on `markdownFor()` without a glossary stays as it is, and a real `npm run build` in `tools/docs-site` was checked once by hand for the anchors and the table of contents, which no table can see.
