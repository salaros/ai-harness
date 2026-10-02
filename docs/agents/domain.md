# Domain Docs

How the engineering skills consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root: the terms, one entry each.
- **`CONTEXT.md`** beside it: what the domain is and where it ends, how its terms relate, and the ambiguities already settled.
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context, each with a `GLOSSARY.md` beside it. Read the pair for each context relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you are about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files do not exist, **proceed silently**. Do not flag their absence or suggest creating them upfront. The `domain-modeling` skill (reached via `grill-with-docs` and `improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Layout

A repo is **single-context** by default: one `GLOSSARY.md` and one `CONTEXT.md` at the root, and one `docs/adr/` folder. A `microservices` repo (the `Unit type` in `MEMORY.md`) is multi-context from the start; see [Microservices](#microservices).

```
/
├── CONTEXT.md
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-<slug>.md
│   └── 0002-<slug>.md
└── src/
```

Switch to multi-context (a root `CONTEXT-MAP.md` pointing at `src/<context>/CONTEXT.md` files, each with its `GLOSSARY.md`) only if the repo grows into several packages with their own vocabularies.

## The glossary

`GLOSSARY.md` holds the terms and nothing else: no implementation detail, no decision, no plan. `CONTEXT.md` keeps the rest of what `domain-modeling` records, which is the context's description, its `Relationships`, its example dialogue and its flagged ambiguities. `domain-modeling`'s own format file puts the terms under `## Language` in `CONTEXT.md`; here they go in `GLOSSARY.md`, created with the first term, and terms a repo still has under `## Language` are read as its glossary until they are moved.

The file opens with a `# <title>` heading and is written in one of two formats, never both:

```markdown
# Billing glossary

## Invoice
<!-- aliases: bill -->

A request for payment sent to a Customer after delivery.
```

A term is a heading, and its definition is what follows until the next heading. The `aliases` comment is optional and lists the other words that mean this term. A heading with no text of its own, followed by deeper headings, is a group and not a term. This is the format of [glossarify-md](https://github.com/about-code/glossarify-md/blob/master/doc/glossary.md), so that tool can read the file too.

```markdown
# Billing glossary

**Invoice**:
A request for payment sent to a Customer after delivery.
_Avoid_: Bill, payment request
```

A term is a bold name with a colon after it, and its definition is the lines that follow. The `_Avoid_` line is optional and lists the words the project does not use for it. Headings in such a file group the terms. This is the format `domain-modeling` writes.

`node scripts/check-glossary.js` reads either format into one model and reports a file with no title, a term with no definition, a term defined twice, an `aliases` comment or an `_Avoid_` line that names nothing, and a word that is both a name of a term and one it avoids. The edit hook runs it after every change to a `GLOSSARY.md`, and the `pre-commit` hook runs it over the staged one. `tools/docs-site`, where a repo keeps it, renders the root glossary at `/glossary/` and links a term's first mention in each chain document to its entry.

The `teach` skill keeps a `GLOSSARY.md` of its own, the vocabulary of whatever is being learned, in the folder it is run from. Run it from a folder of its own, such as `.scratch/learn/<topic>/`, and never from the repo root, where its glossary would be this one.

## Microservices

Several services in one repo, deployed separately and orchestrated together. Each service is one bounded context with its own vocabulary and its own decisions; the requirements are still one product's.

```
/
├── CONTEXT-MAP.md                  ← lists every context, and how the services talk
├── CONTEXT.md                      ← the "Shared" context: what every service has in common
├── GLOSSARY.md                     ← terms every service uses
├── docs/
│   ├── <stage>/                    ← one documentation chain for the whole product: pdd/ to spec/
│   ├── adr/                        ← decisions that cross services
│   └── research/                   ← what the chain cites: interviews/ and their syntheses/
├── src/
│   ├── <Name>.AppHost/             ← orchestration (Aspire on .NET)
│   ├── <Name>.ServiceDefaults/     ← shared telemetry, health checks, resilience
│   └── <Service>/
│       ├── CONTEXT.md              ← what this service's context is
│       ├── GLOSSARY.md             ← this service's terms
│       └── docs/adr/               ← decisions inside this service
└── tests/
    ├── <Name>.Tests/               ← integration tests through the AppHost
    └── <Service>.Tests/
```

- **Where a term goes.** A term one service owns goes in `src/<Service>/GLOSSARY.md`. A term two or more services share, such as an identifier or an event, goes in the root `GLOSSARY.md`, and the event itself goes under `Relationships` in `CONTEXT-MAP.md`.
- **Where a decision goes.** A decision that changes one service goes in `src/<Service>/docs/adr/`. One that changes a contract between services, the orchestration or anything every service inherits goes in `docs/adr/`. When unsure, it crosses services.
- **Citing a service ADR.** `docs-check` covers the root `docs/` only, so `ADR-0003` always means `docs/adr/0003-*.md`. A chain document that depends on a service decision names its path, `src/Ordering/docs/adr/0001-<slug>.md`, on the `**Derived from:**` line beside its upstream document; `docs-check` accepts an existing path as a source.
- **One chain.** PDD, BRD, PRD, EARS and BDD describe the product, not a service. A TRD, an RFC or a SPEC may cover one service; name the service in its title.

### Adding a service

On .NET with Aspire, from the repo root, with `<Name>` the project name and `<Service>` the new service:

```bash
dotnet new webapi -n <Service> -o src/<Service>
dotnet add src/<Service> reference src/<Name>.ServiceDefaults
dotnet add src/<Name>.AppHost reference src/<Service>
dotnet new xunit -n <Service>.Tests -o tests/<Service>.Tests
dotnet add tests/<Service>.Tests reference src/<Service>
dotnet sln add src/<Service> tests/<Service>.Tests
```

Then call `builder.AddServiceDefaults()` in the service's `Program.cs` and `app.MapDefaultEndpoints()` after `builder.Build()`, and register it in the AppHost's entry file (`AppHost.cs`, or `Program.cs` from older templates) with `builder.AddProject<Projects.<Service>>("<service>")`. Add the service to `CONTEXT-MAP.md` when its first term is resolved, not before.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept you need is not in the glossary yet, that is a signal: either you are inventing language the project does not use (reconsider), or there is a real gap (note it for `domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
