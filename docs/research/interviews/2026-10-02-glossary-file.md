# Interview: a glossary file of its own

**Kind:** stakeholder
**Date:** 2026-10-02
**Participant:** Yaroslav Zhmayev, maintainer of the harness
**Interviewer:** Claude, through the question tool, one round of three questions
**Context:** The maintainer asked for "support for GLOSSARY.md", linking the glossary format of [glossarify-md](https://github.com/about-code/glossarify-md/blob/master/doc/glossary.md), "used by some skill in this repo". Two vendored skills write a glossary: `teach` keeps a `GLOSSARY.md` of the topic being learned, and `domain-modeling` keeps the project's terms under `## Language` in `CONTEXT.md`. The questions settled what the file is here before any code was written.
**Record:** transcript of the session

## Questions and answers

1. **What is `GLOSSARY.md` in this repo, beside the `CONTEXT.md` that holds the terms today?** A file of its own: "a separate GLOSSARY.md, that branches out of CONTEXT.md is a very good idea (separation of concerns)".
2. **Which format is an entry written in: glossarify-md's, a term per heading with an optional aliases comment, or the bold term with an `_Avoid_` line that `teach` and `domain-modeling` write?** "Accept both".
3. **How far does support go: recognising the file, checking its shape, or linking terms where they are used?** "Also linkify in the docs site", on top of the other two.

## Also heard

- Not asked: what becomes of the terms a repo already keeps in `CONTEXT.md`, whether a `microservices` repo gets a glossary per service, and whether `teach` writing its own `GLOSSARY.md` in the working directory may meet the project's.
