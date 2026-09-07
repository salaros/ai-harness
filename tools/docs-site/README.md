# Docs site

A browsable portal over the documentation chain, built with [Astro Starlight](https://starlight.astro.build/). It reads `docs/` at the repo root **live**: nothing is copied, synced or generated into this folder, and the documents stay the single source of truth.

**This tool is optional.** The chain works without it: the documents are Markdown, `node scripts/docs-check.js` validates them, and `to-tickets` publishes the plan to Jira. Nothing outside this folder depends on it, so a project that does not want a local site can delete `tools/docs-site/` and lose nothing else. The harness suite notices and skips its check; `readChain()` in `scripts/docs-check.js`, which this tool builds on, belongs to the validator and stays.

## Running it

From this folder:

```bash
npm install
npm run dev
```

From the repo root, without changing directory:

```bash
npm --prefix tools/docs-site run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server at `http://localhost:4321`, reloading when a document changes |
| `npm run build` | Static site into `dist/` |
| `npm run preview` | Serves the last build |
| `npm run chain` | Prints what the portal will render, one line per stage; no Astro needed |

## How it works

`src/content.config.mjs` gives Starlight a custom loader instead of its default `docsLoader()`, which only reads `src/content/docs/`. The loader reads `docs/<stage>/*.md` directly, turns each document into a page in memory, and hands it to Starlight. `dist/` and `.astro/` are the only gitignored paths, because they are the only things written.

The pipeline is not restated here. `chain.mjs` calls `readChain()` in `scripts/docs-check.js`, the one parser of the stage table in `AGENTS.md`, so stage order, folders and each stage's question all come from that table. Add a stage row there and the sidebar and overview follow.

Starlight needs a frontmatter `title` on every page and the chain's documents have none, which is the reason for the custom loader: the title comes from the `# ID: Title` heading the chain already requires. The loader also applies the chain's other conventions:

- an item ID starting a line (`BR-2`, `FR-3`, `AC-1`, `D-1`) becomes a link target on that page, including inside tables;
- a citation, `DOC-ID` or `DOC-ID/ITEM`, becomes a link to that document, or to that item in it;
- fenced code is left exactly as written, so an ID inside an example stays plain text;
- the overview page is built from the chain table, so it shows the whole pipeline including `TDD`, `IPLAN` and `Code`, which are not documents.

A citation that does not resolve is left as plain text rather than linked to a page that does not exist. `node scripts/docs-check.js` is what reports those; this tool only renders.

## Notes

- `docs/` sits outside the Astro project, so the loader adds it to the dev watcher explicitly. Editing a document and adding a new one were both picked up without a restart.
- Every build logs `The collection "i18n" does not exist or is empty`. The portal is single-language, and declaring an empty `i18n` collection produces two warnings instead of one, so the warning stays.
- The sitemap integration warns that `site` is unset, and it stays unset here: this portal is read locally, so there is no URL to give it and no sitemap worth building. A repo that deploys its documentation sets `site` in `astro.config.mjs` to the URL it deploys to, and the warning goes with it.
- Links are root-absolute (`/prd/0001-x/`). Deploying under a path prefix needs `base` in `astro.config.mjs` and a matching prefix in `chain.mjs`.
