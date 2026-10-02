# ADR-0007: A repo's terms live in GLOSSARY.md

**Derived from:** docs/research/interviews/2026-10-03-glossary-adr.md, docs/research/interviews/2026-10-02-glossary-file.md, https://github.com/about-code/glossarify-md/blob/master/doc/glossary.md, scripts/check-glossary.js

A repo's terms were a section of `CONTEXT.md`, `## Language`, in a format only `domain-modeling` wrote and nothing read. `CONTEXT.md` was at once the statement of what the domain is and the list of its words, and no tool could tell one from the other. The maintainer asked for a glossary other tools can read, in the format glossarify-md uses, without giving up what the vendored skills already write.

## Decision

### D-1 terms live in GLOSSARY.md and nowhere else

A term is defined in `GLOSSARY.md`, one entry each. The file holds terms and nothing else: no implementation detail, no decision, no plan.

### D-2 CONTEXT.md is the boundary and the signpost

`CONTEXT.md` stays. It says what the context is, where it ends, and, in plain words, that its terms are in `GLOSSARY.md`. It defines no term.

### D-3 two formats, one per file, neither preferred

An entry is written as a heading with its definition under it, glossarify-md's format, or as a bold term with its definition on the next line, the format `domain-modeling` and `teach` write. A file is in one format and never both, and whoever writes its first entry chooses.

### D-4 an alias is another form of the name, not a synonym

An alias is an abbreviation, a long form, a plural: the term's own name in another shape, which its entry also answers to. A different word for the same thing is a synonym, and it goes under `_Avoid_`. This is a rule for whoever writes an entry; no check can tell the two apart.

### D-5 terms still in CONTEXT.md are read, never refused

A repo that has not moved its terms keeps them under `## Language` in `CONTEXT.md`, and they are read as its glossary for as long as they stay there. No check reports them. The session brief says how many are waiting to move.

### D-6 the vendored skills are overridden by a rule, not by a fork

`AGENTS.md` and `docs/agents/domain.md` say a term goes in `GLOSSARY.md` whatever a skill's own instructions say, and `CONTEXT.md` points there. No vendored skill is copied to be changed, and `CONTEXT.md` carries no `@GLOSSARY.md` import.

### D-7 a multi-context repo keeps one glossary per context

Each context's folder holds a `CONTEXT.md` and a `GLOSSARY.md` side by side. The root pair is the Shared context, and `CONTEXT-MAP.md` links the `CONTEXT.md` files as before.

### D-8 a learning glossary is kept out of the project's by where teach runs

`teach` writes a `GLOSSARY.md` of the topic being learned into its working directory. It runs from a folder of its own, such as `.scratch/learn/<topic>/`, and never from the repo root.

## Why

- One file with one job is what a tool can read. glossarify-md, the docs portal and the shape check each need to know that everything in the file is a term, which `CONTEXT.md` could never promise.
- Eight vendored skills read or write `CONTEXT.md`, seven by name and `grill-with-docs` through `domain-modeling`, which recreates the file when it is missing. Retiring it would leave them reading nothing and one of them writing it back; kept as a signpost, it is where such a skill is turned towards the glossary.
- Preferring the heading format would mean telling `domain-modeling` to write against its own format file in every repo; preferring the bold one would make the format the maintainer asked for the second-class one. The reader costs the same either way, so the choice stays with the writer.
- `domain-modeling`'s rule is one word per concept, with the others listed as avoided. An alias that could be any accepted synonym would undo that, and the portal would link the words the project decided against.
- Refusing terms left in `CONTEXT.md` would block a commit in every target the day after an update, for a file nobody there had touched. Two homes for a while is the cheaper failure, and the brief keeps it visible.
- A fork of `domain-modeling` would have to be re-merged by hand at every upstream change, and the other seven vendored skills would still need the rule. The `@` import expands only in one harness's memory files: in `CONTEXT.md` it loads nothing, and in `AGENTS.md` it would put the whole glossary into every session there, at a cost that grows with the glossary.
- Contexts exist so that two services may mean different things by one word. A single glossary grouped by context would have to refuse that.
- Exempting `.scratch/` from the check would be a rule about a folder to solve a problem of where a skill is run.

## Consequences

- The licence signal and orphan terms that ADR-0006 put in `CONTEXT.md` are in `GLOSSARY.md` with the rest; this repository's `CONTEXT.md` is a title, three sentences and no terms.
- An agent that follows a vendored skill to the letter may still write a term into `CONTEXT.md`. It is read (D-5) and counted, and moving it is an edit somebody makes.
- The five local skills that read `CONTEXT.md` for vocabulary, `brd`, `pdd`, `rfc`, `spec` and `trd`, read `GLOSSARY.md` instead, and `project-init`'s context map names the pair.
- The docs portal renders and links the root glossary only. A context's own glossary is checked by the hooks and has no page yet.
- A glossary in the heading format that quotes a `**Term**:` line outside fenced code is read as a bold one, which the check then reports loudly. SPEC-0003 has the rest of the design.
