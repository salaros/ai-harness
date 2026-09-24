# Documents

Everything written about this project before and beside its code lives here, one folder per stage of the chain in `AGENTS.md` ("Documentation"). That table is the only list of stages, folders and skills; this file says what each document is for and what it must contain. `node scripts/docs-check.js` verifies that the folders, IDs and citations agree with the table.

Every document is `docs/<stage>/NNNN-<slug>.md`, its ID is `<STAGE>-NNNN`, its first heading is `# <STAGE>-NNNN: <title>`, and it carries a `**Derived from:**` line naming at least one reference. Items a later stage will refine start their line with a short ID (`BR-2`, `FR-3`, `AC-1`, `### D-1`), and later documents cite them as `DOC-ID/ITEM`.

A reference is an upstream document ID, or a **source**: a URL, a repo-relative path that exists (optionally `path:line`, a folder written `src/`), or `jira:KEY-123` in upper case. A file at the root counts by its bare name, so a project that keeps its product intent in an optional `INTENT.md` cites `INTENT.md`. A source stands in for an upstream document only while the chain holds nothing earlier, so the first document written may name one and every later document cites the chain. The `Cites` column of the table in `AGENTS.md` names the exceptions. A PDD, a BRD and a TRD may always derive from a source alone, since discovery, a settled business need and engineering-driven work each start there. An ADR and an RFC are exceptions at both ends: each may cite a source or any document at any time, and any document may cite it.

## PDD, Product Discovery Document

**Whether** the opportunity is worth pursuing at all: an opportunity assessment written while the idea is still a hunch, before anyone writes a business case. It is optional; a need already settled by a contract, a regulation or a decision taken elsewhere goes straight to a BRD.

Contains: the problem in the customer's words, who has it, evidence (`EV-n`) each with its reference, the size of the opportunity, today's alternatives, why us, why now, how it would reach them, the outcomes that would prove it worked (`OUT-n`), risks and assumptions (`RISK-n`), and the verdict. It derives from its evidence: interview records under `docs/research/interviews/` and their syntheses under `docs/research/syntheses/`, tickets, analytics, a roadmap entry. The `pdd` skill writes it.

Its status is `Draft`, `Go`, `No-go` or `Parked`. The user gives the verdict, and a BRD may build only on a PDD that is `Go`; a `No-go` is kept as the record of why, and a `Parked` one has a `#deferred` line in `TODO.md` saying what would reopen it.

## BRD, Business Requirements Document

**Why** the business wants it, and how it will know it worked. No solution: no features, screens or technology.

It derives from the PDD that said `Go`, or, as an entry stage, from a source: the brief, the ticket, the deck it came from. Requirements gathered in conversation are a source too, once written down: `brd` records the interview with `interview-notes` under `docs/research/interviews/` and the BRD derives from that path. `MEMORY.md`'s `Requirements` then points at the BRD.

Contains: overview of the situation, objectives in the business's words, measurable success factors (`SF-n`, each with a number and a date), scope in and out, stakeholders, business requirements (`BR-n`, each tied to a success factor), assumptions and constraints. The `brd` skill writes it.

## PRD, Product Requirements Document

**What** the product does, for whom. Turns the business requirements into a product: users, journeys, features, functional and non-functional requirements, scope and constraints.

Contains: purpose and objectives citing `BRD-NNNN/BR-n`, user stories, functional requirements (`FR-n`), non-functional requirements (`NFR-n`), out of scope, open questions. The `prd` skill writes it.

A prototype skips the BRD, so its PRD derives from a source instead. Writing a BRD later makes that PRD wrong: it must then cite the BRD, and the validator says so.

## TRD, Technical Requirements Document

**What the system must satisfy technically.** Each requirement is a measurable target, a constraint the design must live within, or an obligation it must meet. It contains no design: "p95 under 200 ms" belongs here, and the cache that achieves it belongs in an RFC or the SPEC.

Contains: context, requirements (`TR-n`) by ISO/IEC 25010 category, each with a target, how it is measured and a priority; constraints; the categories that do not apply and why; open questions. A PRD's `NFR-n` lines state quality goals in the user's words, and the TRD turns each into a `TR-n` that cites `PRD-NNNN/NFR-n`. Engineering-driven work has no PRD behind it, so its TRD derives from whatever forced the work: an incident, an end-of-life notice, an audit finding. The `trd` skill writes it.

## EARS, requirements as "shall" statements

**Each requirement as one testable sentence** in the EARS form: ubiquitous, event-driven ("When … the system shall …"), state-driven ("While …"), unwanted behaviour ("If … then the system shall …"), optional feature. One statement per line with an ID (`REQ-n`), each citing the `PRD-NNNN/FR-n` or `TRD-NNNN/TR-n` it refines, with acceptance criteria (`AC-n`). The `feature-forge` skill writes it.

## BDD, behaviour scenarios

**Behaviour as Given / When / Then.** One feature file per document, scenarios grouped by rule, each scenario citing the `EARS-NNNN/REQ-n` it exercises; edge cases and failure paths are scenarios too. These become the acceptance tests. The `bdd-scenarios` skill writes it.

## RFC, Request for Comments

**How to solve a technical problem, argued out before anyone commits.** An RFC is optional and is written when there are two or more viable solutions and no obvious winner.

Contains: status, abstract, problem, goals and non-goals, criteria (`C-n`) set before the options, options (`OPT-n`) each scored against every criterion, the Discussion, open questions (`Q-n`), and the Resolution. The debate runs inside the file: an agent argues for each option, a critic attacks all of them, and each advocate answers once. The user writes the Resolution; no agent closes an RFC. The `rfc` skill writes it.

Its status is `Draft`, `Open`, `Accepted`, `Rejected`, `Withdrawn` or `Superseded by RFC-NNNN`, and a closed RFC is frozen. Like an ADR it is cross-cutting. It argues and the ADR records: each hard-to-reverse choice an accepted RFC settled becomes an ADR citing it, and its design becomes a SPEC, which may cite only an accepted RFC.

## ADR, Architecture Decision Record

**A decision that is hard to reverse**, recorded once, immutable after acceptance. One decision per file.

Contains: title, status (proposed, accepted, deprecated, superseded by ADR-NNNN), context including the requirements that force the choice, the decision, alternatives considered, consequences. The `grill-with-docs` skill writes it, interviewing the decision before recording it; `CONTEXT.md` holds the vocabulary the decisions use.

An ADR is cross-cutting, because a decision can be forced before the chain starts or halfway through implementation. It derives from whatever forced it, a source or any document, and a later ADR that replaces one cites it as superseded.

## SPEC, technical design

**How** the system satisfies the requirements: the design that engineering builds from.

Contains: goals and non-goals citing the EARS and BDD documents, the architecture and its components, data model, interfaces between modules and with the outside, decisions taken (citing the ADRs, and the accepted RFC it implements, if any), risks, test strategy, and the sections a later implementation plan will refine (`### D-n`). The `design-doc` skill writes it.

## Research, the sources beside the chain

`docs/research/` holds what the chain's documents cite as evidence but that is not itself a stage, so `docs-check` checks nothing inside it beyond its being there to cite. Its first kind is interviews: `docs/research/interviews/YYYY-MM-DD-<slug>.md`, one conversation per file, written with `interview-notes`. A `user` interview is with someone who has the problem, and feeds a PDD's evidence. A `stakeholder` interview is with someone who decides or pays, including a grilling session that settled requirements or a decision, and feeds a PDD, a BRD, a TRD or an ADR. Real names are allowed; what the participant asked to keep off the record stays off it.

Its second kind is syntheses: `docs/research/syntheses/YYYY-MM-DD-<slug>.md`, written with `interview-synthesis`, weighing several interviews on one question: themes, insights and recommendations, which a PDD's evidence cites and its verdict may overrule.

## After the documents

Tests (`tests/`), the implementation plan (`.scratch/`, published to Jira by `to-tickets`) and code (`src/`) are the remaining stages; they are not documents and the validator does not read them.

## Browsing them

These files are readable as they are, and for many projects that plus `to-tickets` into Jira is the whole story. When a rendered site helps, `tools/docs-site` is an optional portal over the same files: the stages in pipeline order, and every citation a link that opens the document it names at the item it names.

```bash
npm --prefix tools/docs-site install && npm --prefix tools/docs-site run dev
```

It reads these files live, copying nothing and writing nothing back. It is also entirely removable: delete `tools/docs-site/` and nothing else in the repo changes behaviour. `tools/docs-site/README.md` has the details.
