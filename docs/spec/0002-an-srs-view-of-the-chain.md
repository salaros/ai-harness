# SPEC-0002: An SRS view of the chain

**Status:** Agreed
**Derived from:** ADR-0005, docs/research/interviews/2026-09-23-trd-rfc-chain.md

A client who asks for a Software Requirements Specification is asking for one document in the shape IEEE 29148 gives it. The chain already holds everything such a document says, spread over the PRD, the TRD and the EARS document, and the interview settled that the SRS is a generated view of those three in `tools/docs-site`, not a stage: nothing is written to `docs/`, nothing is cited, and `docs-check` has nothing new to validate.

## Goals and non-goals

**Goals:** one page in the portal, `/srs/`, that renders every PRD, TRD and EARS document under the section outline of IEEE 29148-2018 (clause 9.6, the SRS information item), in that outline's order rather than the chain's; the same page reachable from the sidebar and summarised by `node tools/docs-site/chain.mjs`; the portal still optional, so a repo without it loses nothing.

**Non-goals:** taking a document apart. A TRD's requirement rows are not sorted into the outline's performance, interface and constraint subsections by their category cell; the document is placed whole, and a reader who wants that split reads the TRD. Exporting the page as a file: the portal's build already writes `dist/`, and a PDF is whatever prints the page. Rendering BDD, SPEC or ADR documents inside the SRS: the outline's verification section lists the BDD documents by link only.

## Constraints

- `readDocs()` in `scripts/docs-check.js` stays the one model of the chain (ADR-0001 settled one read seam; `theDocsPortalReadsTheChainModel` in the harness invariants holds the portal to it). The view takes the model `collect()` returns and reads nothing from disk itself.
- The stage table in `AGENTS.md` names the stages. The view names the three it renders, `PRD`, `TRD` and `EARS`, by stage, and finds their folders through the model, so a renamed folder follows the table.
- A citation on the page links where it links on the document's own page, so `markdownFor()` renders the documents; the view does not reimplement linking.
- Item anchors (`FR-1`, `TR-1`, `REQ-1`) are unique on a document's page and not on a page holding several documents, so the SRS carries none: an item ID on it is plain text, and the citation beside it still links to the item on its own page.
- `tools/docs-site` is deleted whole by a repo that does not want it, so the view is a file inside that folder and the suite skips its check when the folder is gone, as the existing smoke does.

## Architecture

`tools/docs-site/srs.mjs` is one module with one pure function, `srs(chain)`, which returns the page as markdown. `chain.mjs` gains an `anchors` and a `demote` option on `markdownFor()`, so the view can render a document without anchors and with its headings pushed down under the outline's. `src/content.config.mjs` adds the page to the collection beside the overview, `astro.config.mjs` adds it to the sidebar through `sidebar()`, and the command line in `chain.mjs` prints one more line for it.

## Design

### D-1 The outline

The page is the IEEE 29148-2018 SRS outline, each section an H2 in this order: 1 Introduction, 2 References, 3 Requirements, 4 Verification, 5 Appendices. The documents sit where the outline puts what they say: the PRD under Introduction (purpose, scope, product overview and its users), the EARS document under 3.1 Functions, the TRD under 3.2 Quality requirements and constraints, which stands for the outline's 3.2 to 3.7 (performance, usability, interface, logical database, design constraints, software system attributes) without splitting the document across them. References lists every document rendered with a link to its page and what it derives from. Verification lists the BDD documents by link. Appendices holds the outline's assumptions and acronyms as one sentence pointing at `CONTEXT.md` when the repo has one, and is otherwise empty. Satisfies: the goal of one page in the outline's order.

### D-2 Rendering a document into a section

Each document is rendered by `markdownFor(doc, chain, { anchors: false, demote: 2 })`: its H1 dropped as on its own page, every heading pushed down two levels so a document's `##` becomes `####` under the section's H3, capped at H6, and no `<span id>` anchor written. An H3 above each document carries its title as a link to its page, so the reader can leave the view for the document. Documents of one stage come in file order, the order the model holds them. Fenced code stays exactly as written, as it does everywhere else in the portal. Satisfies: citations link as on the document's page; no duplicate anchors.

### D-3 A section with nothing in it

A section whose stage has no documents says so in the overview's voice, `none yet`, and names the skill that writes the stage (`prd`, `trd`, `feature-forge`), read from the stage table rather than repeated here. The page exists in an empty repo, with every section saying `none yet`, so the sidebar entry never leads to a missing page. Satisfies: the portal renders from the model alone.

### D-4 Where the page appears

The page's collection id is `srs`, its route `/srs/`, its title `SRS`, and its sidebar entry comes straight after Overview, outside the stage groups, because it is not a stage. The command line prints `srs\t<n> document(s) across PRD, TRD, EARS` after the stage lines, so the smoke that reads the stages in pipeline order still finds them where it looks. Satisfies: reachable from the sidebar and the command line.

## Data model

Nothing new is stored. The view reads the model `collect()` returns: `stages` (for each stage's name, folder and skills), `docs` (in stage then file order, each with `stage`, `title`, `link`, `lines`) and the `byId`, `refRe` and `itemRe` that `markdownFor()` needs. Its output is one markdown string.

## Interfaces

- `srs(chain)` in `tools/docs-site/srs.mjs`: takes what `collect()` returns, gives the page body. Pure, throws on nothing: a stage missing from the table renders as an empty section.
- `markdownFor(doc, chain, options)` in `tools/docs-site/chain.mjs`: `options.anchors` (default `true`) and `options.demote` (default `0`, a number of heading levels). The two existing callers pass no options and get what they got.
- `sidebar(chain)` gains one entry; `collect()` is unchanged.

## Risks

- R-1: the outline's clause numbers and titles are IEEE's, and a reader comparing the page with the standard will notice 3.2 covering six subsections. The section says so in its first line, so the choice reads as a choice. Likely to be raised, cheap to revisit: a category-to-subsection map over the TRD's requirement table is the follow-up if a client insists.
- R-2: `require(esm)` in a CommonJS decision table needs Node 22.12 or later. `package.json` already requires Node 22, and the runner skips the table when the module cannot be loaded rather than failing the suite.

## Test strategy

One decision table in `.agents/hooks/tests/tables/docs-chain.js` beside the portal smoke, loading `srs.mjs` with `require()` and building the chain with `chainView()`, so no case touches the disk:

- a repo holding a PRD, a TRD, an EARS and a BDD document renders the five sections in outline order, the PRD before the EARS before the TRD by position, every document's title linked to its page, the citation in the EARS still a link, the document's `##` heading demoted, and no `span id` on the page;
- an empty repo renders the same five sections, each saying `none yet` and naming its skill;
- `markdownFor()` with no options renders exactly what it rendered before, pinned on one document with an item and a citation.

The existing smoke gains one assertion: the command line prints the `srs` line after the stage lines.
