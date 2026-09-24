# Domain Docs

How the engineering skills consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you are about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files do not exist, **proceed silently**. Do not flag their absence or suggest creating them upfront. The `domain-modeling` skill (reached via `grill-with-docs` and `improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Layout

A repo is **single-context** by default: one `CONTEXT.md` at the root and one `docs/adr/` folder. A `microservices` repo (the `Unit type` in `MEMORY.md`) is multi-context from the start; see [Microservices](#microservices).

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-<slug>.md
│   └── 0002-<slug>.md
└── src/
```

Switch to multi-context (a root `CONTEXT-MAP.md` pointing at `src/<context>/CONTEXT.md` files) only if the repo grows into several packages with their own vocabularies.

## Microservices

Several services in one repo, deployed separately and orchestrated together. Each service is one bounded context with its own vocabulary and its own decisions; the requirements are still one product's.

```
/
├── CONTEXT-MAP.md                  ← lists every context, and how the services talk
├── CONTEXT.md                      ← terms every service uses (the "Shared" context)
├── docs/
│   ├── <stage>/                    ← one documentation chain for the whole product: pdd/ to spec/
│   ├── adr/                        ← decisions that cross services
│   └── research/                   ← what the chain cites: interviews/ and their syntheses/
├── src/
│   ├── <Name>.AppHost/             ← orchestration (Aspire on .NET)
│   ├── <Name>.ServiceDefaults/     ← shared telemetry, health checks, resilience
│   └── <Service>/
│       ├── CONTEXT.md              ← this service's terms
│       └── docs/adr/               ← decisions inside this service
└── tests/
    ├── <Name>.Tests/               ← integration tests through the AppHost
    └── <Service>.Tests/
```

- **Where a term goes.** A term one service owns goes in `src/<Service>/CONTEXT.md`. A term two or more services share, such as an identifier or an event, goes in the root `CONTEXT.md`, and the event itself goes under `Relationships` in `CONTEXT-MAP.md`.
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

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept you need is not in the glossary yet, that is a signal: either you are inventing language the project does not use (reconsider), or there is a real gap (note it for `domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
