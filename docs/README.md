# Documents

Everything written about this project before and beside its code lives here, one folder per stage of the chain in `AGENTS.md` ("Documentation"). That table is the only list of stages, folders and skills; this file says what each document is for and what it must contain. `node scripts/docs-check.js` verifies that the folders, IDs and citations agree with the table.

Every document is `docs/<stage>/NNNN-<slug>.md`, its ID is `<STAGE>-NNNN`, its first heading is `# <STAGE>-NNNN: <title>`, and it carries a `**Derived from:**` line naming at least one reference. Items a later stage will refine start their line with a short ID (`BR-2`, `FR-3`, `AC-1`, `### D-1`), and later documents cite them as `DOC-ID/ITEM`.

A reference is an upstream document ID, or a **source**: a URL, a repo-relative path that exists, or `jira:KEY-123`. A file at the root counts by its bare name, so a project that keeps its product intent in an optional `INTENT.md` cites `INTENT.md`. A source stands in for an upstream document only while the chain holds nothing earlier, so the first document written may name one and every later document cites the chain. An ADR is the exception at both ends: it may cite a source or any document at any time, and any document may cite it.

## BRD, Business Requirements Document

**Why** the business wants it, and how it will know it worked. No solution: no features, screens or technology.

As the chain's first document it derives from a source: the brief, the ticket, the deck it came from. Requirements gathered in conversation are a source too, once written down: `brd` saves the interview as `.scratch/<slug>/interview.md` and the BRD derives from that path. `MEMORY.md`'s `Requirements` then points at the BRD.

Contains: overview of the situation, objectives in the business's words, measurable success factors (`SF-n`, each with a number and a date), scope in and out, stakeholders, business requirements (`BR-n`, each tied to a success factor), assumptions and constraints. The `brd` skill writes it.

## PRD, Product Requirements Document

**What** the product does, for whom. Turns the business requirements into a product: users, journeys, features, functional and non-functional requirements, scope and constraints.

Contains: purpose and objectives citing `BRD-NNNN/BR-n`, user stories, functional requirements (`FR-n`), non-functional requirements (`NFR-n`), out of scope, open questions. The `prd` skill writes it.

A prototype skips the BRD, so its PRD derives from a source instead. Writing a BRD later makes that PRD wrong: it must then cite the BRD, and the validator says so.

## EARS, requirements as "shall" statements

**Each requirement as one testable sentence** in the EARS form: ubiquitous, event-driven ("When … the system shall …"), state-driven ("While …"), unwanted behaviour ("If … then the system shall …"), optional feature. One statement per line with an ID (`REQ-n`), each citing the `PRD-NNNN/FR-n` it refines, with acceptance criteria (`AC-n`). The `feature-forge` skill writes it.

## BDD, behaviour scenarios

**Behaviour as Given / When / Then.** One feature file per document, scenarios grouped by rule, each scenario citing the `EARS-NNNN/REQ-n` it exercises; edge cases and failure paths are scenarios too. These become the acceptance tests. The `bdd-scenarios` skill writes it.

## ADR, Architecture Decision Record

**A decision that is hard to reverse**, recorded once, immutable after acceptance. One decision per file.

Contains: title, status (proposed, accepted, deprecated, superseded by ADR-NNNN), context including the requirements that force the choice, the decision, alternatives considered, consequences. The `domain-modeling` skill writes it; `CONTEXT.md` holds the vocabulary the decisions use.

An ADR is cross-cutting, because a decision can be forced before the chain starts or halfway through implementation. It derives from whatever forced it, a source or any document, and a later ADR that replaces one cites it as superseded.

## SPEC, technical design

**How** the system satisfies the requirements: the design that engineering builds from.

Contains: goals and non-goals citing the EARS and BDD documents, the architecture and its components, data model, interfaces between modules and with the outside, decisions taken (citing the ADRs), risks, test strategy, and the sections a later implementation plan will refine (`### D-n`). The `design-doc` skill writes it.

## After the documents

Tests (`tests/`), the implementation plan (`.scratch/`, published to Jira by `to-tickets`) and code (`src/`) are the remaining stages; they are not documents and the validator does not read them.

## Browsing them

These files are readable as they are, and for many projects that plus `to-tickets` into Jira is the whole story. When a rendered site helps, `tools/docs-site` is an optional portal over the same files: the stages in pipeline order, and every citation a link that opens the document it names at the item it names.

```bash
npm --prefix tools/docs-site install && npm --prefix tools/docs-site run dev
```

It reads these files live, copying nothing and writing nothing back. It is also entirely removable: delete `tools/docs-site/` and nothing else in the repo changes behaviour. `tools/docs-site/README.md` has the details.
