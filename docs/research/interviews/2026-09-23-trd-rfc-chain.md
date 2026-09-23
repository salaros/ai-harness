# Interview: TRD and RFC in the documentation chain

**Kind:** stakeholder
**Date:** 2026-09-23
**Participant:** Yaroslav Zhmayev, maintainer of the harness
**Interviewer:** Claude, running the `grilling` skill
**Context:** the maintainer asked to add TRD and RFC document types to the chain in `AGENTS.md`, and asked first to be told why that is a bad idea and what an ideal chain looks like.

## The case put against it

- A TRD in the sense of technical requirements duplicates what EARS can already say, and in the sense of technical design it is the SPEC under another name.
- An RFC is mostly a review process. An ADR marked proposed with its options, open in a pull request, already does that job, and a second file for the same decision can end up disagreeing with it.
- A second cross-cutting stage beside the ADR weakens the backwards-only rule, and every extra stage makes "never skip an upstream document" cost more.
- A vendored TRD or RFC skill will not know the chain's IDs, `**Derived from:**` line or item IDs.

## Questions and answers

1. **What is hurting?** Designs skip debate, non-functional requirements have no home, and engineering-driven work has no entry to a chain that starts at a BRD. No outside party expects documents with these names.
2. **Which TRD?** Technical requirements, not design.
3. **Where does an RFC's debate happen?** Inside the file.
4. **Who takes part?** Mostly the maintainer plus agents; there is rarely a team to comment.
5. **Where do technical requirements live?** In a TRD stage beside the PRD. Engineering-driven work enters the chain there, and a PRD's non-functional goals refine into it.
6. **Who argues inside an RFC?** One advocate agent per option and one critic.
7. **What records an accepted RFC's decision?** The RFC is closed and frozen. Each hard-to-reverse choice becomes an ADR citing it, and the design becomes a SPEC.
8. **When must an RFC be written?** When judgment says so. The routing rule is two or more viable designs and no obvious winner.
9. **Where do stage rules such as "cross-cutting" live?** In a new column of the `AGENTS.md` table, not in `docs-check.js`.
10. **How are non-functional requirements split?** The PRD keeps quality goals in user terms; the TRD makes them measurable.
11. **How long does the debate run?** Positions, one critique, and one rebuttal from each advocate.
12. **Where do the skills come from?** No TRD skill on skills.sh was fit to vendor, so `trd` is written here. For RFC, `pproenca/dot-skills@dev-rfc` was the best base. Vendored skills are never edited in place, and its description competes with `design-doc`, so `rfc` is written here too and credits it.
13. **How much does docs-check enforce on RFC status?** Every RFC must carry a listed status, and a SPEC may cite only an Accepted RFC.
14. **Is this change itself recorded?** Yes, as ADR-0004 derived from this record.
15. **How does it ship?** In two pull requests. This one covers the engineering stages; the next adds PDD before the BRD and interview notes as sources.

## Also raised, and decided for the next pull request

- **SRS:** a generated view in `tools/docs-site`, not a stage.
- **PDD (product discovery):** an optional first stage before the BRD, whose outcome is Go, No-go or Parked. The BRD becomes an entry stage, and a BRD may cite only a PDD that is Go.
- **Interview notes:** sources under `docs/research/interviews/`, not a stage. Real names are allowed, and `brd`'s interviews move here too.
