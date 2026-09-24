// The docs collection Starlight renders, loaded straight out of docs/ at the repo root. Nothing is
// copied into this folder: the loader reads each document, takes its title from the "# ID: Title"
// heading the chain requires, links its citations, and hands the result to Starlight in memory.
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";
import { collect, DOCS, markdownFor, overview, siteTitle } from "../chain.mjs";
import { srs } from "../srs.mjs";

// A custom loader rather than Starlight's docsLoader(), which only reads src/content/docs/.
const chainLoader = {
    name: "documentation-chain",
    async load(context) {
        const { store, parseData, renderMarkdown, generateDigest, watcher, logger } = context;

        const read = async () => {
            const chain = collect();
            for (const note of chain.notes) logger.warn(note);
            store.clear();

            const pages = [
                { id: "index", title: siteTitle(), body: overview(chain), order: 0 },
                { id: "srs", title: "SRS", body: srs(chain), order: 1 },
                ...chain.docs.map(d => ({
                    id: d.entryId, title: d.title, body: markdownFor(d, chain), order: d.number,
                })),
            ];
            for (const page of pages) {
                const data = await parseData({
                    id: page.id,
                    data: { title: page.title, sidebar: { order: page.order } },
                });
                store.set({
                    id: page.id,
                    data,
                    body: page.body,
                    digest: generateDigest(page.body),
                    rendered: await renderMarkdown(page.body),
                });
            }
            logger.info(`${chain.docs.length} document(s) from docs/`);
        };

        await read();

        // In dev, docs/ sits outside the Astro project, so it is watched explicitly.
        if (watcher && !watcher.__chainWatched) {
            watcher.__chainWatched = true;
            watcher.add(DOCS);
            const reload = path => { if (path.endsWith(".md")) read().catch(e => logger.error(String(e))); };
            watcher.on("add", reload);
            watcher.on("change", reload);
            watcher.on("unlink", reload);
        }
    },
};

export const collections = {
    docs: defineCollection({ loader: chainLoader, schema: docsSchema() }),
};
