// tools/docs-site/chain.mjs
// Reads the documentation chain straight out of docs/. Nothing is copied or generated on disk: the
// loader in src/content.config.mjs hands what this returns to Starlight in memory, and
// astro.config.mjs builds the sidebar from the same call.
// The chain itself comes from readDocs() in scripts/docs-check.js: the stage table, the documents,
// and the expressions that recognise a citation and an item. The portal renders what the validator
// checks, down to the file-name rule, so a document either takes part in both or in neither. What
// is left here is presentation: markdown for Starlight, the overview page, the sidebar. readDocs()
// is given REPO and leaves the working directory alone, so Astro's own root stays where Astro put it.
// Run it directly for a summary of what the portal will render:
//   node tools/docs-site/chain.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { readDocs } = require("../../scripts/docs-check.js");

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DOCS = path.join(REPO, "docs");

// One fact out of MEMORY.md ("- **Name:** Acme Billing"), or "" while the template is unconfigured.
function memoryFact(name) {
    const file = path.join(REPO, "MEMORY.md");
    if (!fs.existsSync(file)) return "";
    const re = new RegExp(`^\\s*[-*]?\\s*\\**${name}:?\\**:?`, "i");
    const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find(l => re.test(l));
    return line ? line.replace(re, "").trim() : "";
}

// The chain as the portal renders it: the model, with the documents as an array in stage order and
// then file order, and the problems as notes for the loader to log. A document the validator refuses
// is one of those notes rather than a page, so the portal never renders what nothing checked.
export function collect() {
    const { stages, docStages, docs, problems, refRe, itemRe } = readDocs(REPO);
    return { stages, docStages, docs: [...docs.values()], byId: docs, notes: problems, refRe, itemRe };
}

// One document as markdown for Starlight: the H1 goes (Starlight renders the title itself), every
// citation that resolves becomes a link, and every item ID becomes a link target so a citation can
// land on it. Fenced code is left exactly as written.
export function markdownFor(doc, { byId, refRe, itemRe }) {
    const out = [];
    let fenced = false, seenH1 = false;
    for (const line of doc.lines) {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; out.push(line); continue; }
        if (fenced) { out.push(line); continue; }
        if (!seenH1 && line.startsWith("# ")) { seenH1 = true; continue; }

        let text = line.replace(refRe, (whole, stage, num, item, offset, full) => {
            const target = byId.get(`${stage}-${num}`);
            if (!target) return whole;                          // docs-check is what reports this
            if (target.id === doc.id && !item) return whole;     // a document citing itself
            if (full[offset - 1] === "[") return whole;          // already inside a link
            return `[${whole}](${target.link}${item ? `#${item}` : ""})`;
        });
        const item = text.match(itemRe);
        if (item) text = text.replace(item[1], `<span id="${item[1]}"></span>${item[1]}`);
        out.push(text);
    }
    return out.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
}

export const siteTitle = () => memoryFact("Name") || path.basename(REPO);

// The overview page, built from the chain table rather than from a file, so it shows the whole
// pipeline including the stages that are not documents.
export function overview(chain) {
    const { stages, docs } = chain;
    const cell = s => docs.filter(d => d.folder === s.folder).map(d => `[${d.title}](${d.link})`).join("<br>");
    const stageCount = new Set(docs.map(d => d.folder)).size;
    return [
        memoryFact("Purpose") || "Every document written about this project, in the order the chain writes them.",
        "",
        "## The pipeline",
        "",
        "Each stage answers one question and refines the stage before it. These stages come from the chain table in `AGENTS.md`; the last three are not documents, so they are listed for order but not rendered here.",
        "",
        "| # | Stage | Answers | Lives in | Documents |",
        "| --- | --- | --- | --- | --- |",
        ...stages.map((s, i) => `| ${i + 1} | \`${s.stage}\` | ${s.answers || ""} | \`${s.lives || ""}\` | ${s.folder ? (cell(s) || "none yet") : "not documents"} |`),
        "",
        "## Reading a document",
        "",
        "- The **ID** comes from the file name: `docs/ears/0003-alerts.md` is `EARS-0003`.",
        "- **Derived from** names where the document came from: the upstream document, or a source outside the chain (a URL, a repo-relative path, or a Jira key) where the chain holds nothing earlier.",
        "- A citation like `PRD-0002/FR-3` is a link here: it opens that document at that requirement.",
        "- Items a later stage refines carry a short ID at the start of their line (`BR-2`, `FR-3`, `AC-1`, `D-1`), and each is a link target.",
        "",
        docs.length
            ? `${docs.length} document${docs.length === 1 ? "" : "s"} across ${stageCount} stage${stageCount === 1 ? "" : "s"}, read live from \`docs/\`. \`node scripts/docs-check.js\` checks that the citations above all resolve.`
            : "No documents yet. Run the `brd` skill to write the first one; this page picks it up on reload.",
    ].join("\n");
}

export function sidebar(chain) {
    const out = [{ label: "Overview", link: "/" }];
    for (const s of chain.docStages) {
        const items = chain.docs.filter(d => d.folder === s.folder)
            .map(d => ({ label: d.title, slug: d.entryId }));
        if (items.length) out.push({ label: s.stage, items });
    }
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const chain = collect();
    for (const n of chain.notes) console.log(n);
    for (const s of chain.stages) {
        const mine = chain.docs.filter(d => d.folder === s.folder);
        console.log(`${s.stage}\t${s.lives || "-"}\t${s.folder ? mine.map(d => d.id).join(",") || "none yet" : "not documents"}`);
    }
    console.log(`docs-site: ${chain.docs.length} document(s) from ${chain.docStages.length} stage(s), read live from docs/`);
}
