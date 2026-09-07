// tools/docs-site/chain.mjs
// Reads the documentation chain straight out of docs/. Nothing is copied or generated on disk: the
// loader in src/content.config.mjs hands what this returns to Starlight in memory, and
// astro.config.mjs builds the sidebar from the same call.
// The stage table in AGENTS.md is parsed by readChain() in scripts/docs-check.js, the one parser of
// that table, so stage order and folders are never restated here. It is given REPO and leaves the
// working directory alone, so Astro's own root stays where Astro put it.
// Run it directly for a summary of what the portal will render:
//   node tools/docs-site/chain.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { readChain } = require("../../scripts/docs-check.js");

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

// Every document in the chain: docs/<stage>/NNNN-<slug>.md, in stage order and then file order.
export function collect() {
    const { stages, problems } = readChain(REPO);
    const notes = [...problems];
    const docStages = stages.filter(s => s.folder);
    const docs = [];
    for (const s of docStages) {
        const dir = path.join(DOCS, s.folder);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir).filter(n => n.endsWith(".md") && n !== "README.md").sort()) {
            const m = file.match(/^(\d{4})-.+\.md$/);
            if (!m) { notes.push(`skipped docs/${s.folder}/${file}: not NNNN-<slug>.md`); continue; }
            const name = file.replace(/\.md$/, "");
            const text = fs.readFileSync(path.join(dir, file), "utf8");
            const lines = text.split(/\r?\n/);
            const h1 = lines.find(l => l.startsWith("# "));
            docs.push({
                id: `${s.folder.toUpperCase()}-${m[1]}`,
                entryId: `${s.folder}/${name}`,
                stage: s.stage, folder: s.folder, number: Number(m[1]), lines,
                title: h1 ? h1.replace(/^#\s+/, "").trim() : `${s.folder.toUpperCase()}-${m[1]}`,
                link: `/${s.folder}/${name}/`,
                file: path.join(dir, file),
            });
        }
    }
    const byId = new Map(docs.map(d => [d.id, d]));
    const prefixes = docStages.map(s => s.folder.toUpperCase());
    return {
        stages, docStages, docs, byId, notes,
        refRe: new RegExp(`\\b(${prefixes.join("|") || "NONE"})-(\\d{4})(?:\\/([A-Z]{1,5}-\\d+))?\\b`, "g"),
        itemRe: /^(?:[-*]\s+|#{1,6}\s+|\*\*|\|\s*)?([A-Z]{1,5}-\d+)\b/,
    };
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
