#!/usr/bin/env node
// scripts/bdd-features.js
// Writes the BDD stage out as Gherkin feature files a runner can execute. Each document of the stage
// the chain table in AGENTS.md names BDD (docs/bdd/NNNN-<slug>.md) is the record: this takes every
// ```gherkin block in it, in order, and writes them as one <out>/NNNN-<slug>.feature with a header
// saying where it came from, so Reqnroll, cucumber-js or pytest-bdd run the scenarios the document
// holds and nobody edits a copy. The output folder is this script's own: a stale file it wrote for a
// document since renamed is removed, and a .feature file it did not write is left alone.
// What a document must look like to be written, and the refusals, are scripts/feature-file.js's,
// the same rule docs-check holds for the chain, so a document the pre-commit hook let through is one
// this writes. A refused document is named and nothing is written for it; the others still are.
// It is a step before the runner, run by the developer and by CI (ADR-0008); no Git hook runs it.
// features(root, out) is the decision for the folder, returning what to write and what is wrong,
// printing nothing and writing nothing; apply() writes.
// Usage: node scripts/bdd-features.js [--out=<dir>] [--check]
//   --out=<dir>   where the feature files go, relative to the repo root; default tests/features
//   --check       write nothing; exit 1 when a document is refused or a feature file is missing,
//                 stale, or left over from a document that no longer exists
// Exit 1 when a document was refused, with the problems on stderr; the rest is still written.
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const docsCheck = require("./docs-check");
const { extract, MARK, WRITER } = require("./feature-file");

const DEFAULT_OUT = "tests/features";
// The stage, by the name the chain table gives it; its folder is the table's to decide.
const STAGE = "BDD";

// Every BDD document of the chain as the file to write for it, under `out`, with the problems of the
// documents refused. The chain is read the way docs-check reads it, so a file name the chain rejects
// is reported here too rather than written under a name nothing cites.
function features(root, out = DEFAULT_OUT) {
    const { stages, docs, problems: chain } = docsCheck.readDocs(root);
    const stage = stages.find(s => s.stage === STAGE);
    if (!stage) return { out, files: [], problems: [...chain.filter(p => p.includes("chain table")), `AGENTS.md: the chain table has no ${STAGE} stage, so there is nothing to extract`] };
    const dir = `docs/${stage.folder}/`;
    const problems = chain.filter(p => p.startsWith(dir) || p.includes("chain table"));
    const files = [];
    for (const doc of docs.values()) {
        if (doc.stage !== STAGE) continue;
        const r = extract(doc.text, doc.file);
        problems.push(...r.problems);
        if (r.feature !== null) files.push({ file: path.posix.join(out, `${doc.entryId.slice(stage.folder.length + 1)}.feature`), from: doc.file, content: r.feature });
    }
    return { out, files, problems };
}

// What the folder holds against what features() decided: the files missing or differing, and the
// ones this script wrote for documents that no longer exist. Read-only, for --check and for apply().
function compare(root, { out, files }) {
    const dir = path.resolve(root, out);
    const wanted = new Map(files.map(f => [path.resolve(root, f.file), f]));
    const read = full => { try { return lib.toLf(fs.readFileSync(full, "utf8")); } catch { return null; } };
    const stale = [], missing = [], current = [];
    for (const f of files) {
        const existing = read(path.resolve(root, f.file));
        if (existing === null) missing.push(f.file);
        else if (existing !== f.content) stale.push(f.file);
        else current.push(f.file);
    }
    let names = [];
    try { names = fs.readdirSync(dir).filter(n => n.endsWith(".feature")); } catch { /* no folder yet */ }
    const leftover = names.map(n => path.join(dir, n))
        .filter(full => !wanted.has(full) && (read(full) || "").includes(MARK))
        .map(full => path.posix.join(out, path.basename(full)));
    return { missing, stale, current, leftover };
}

// Writes what features() decided: the missing and stale files, and removes the leftovers. A file
// already current is not rewritten, so a build watching the folder sees only real changes.
function apply(root, result) {
    const { missing, stale, current, leftover } = compare(root, result);
    fs.mkdirSync(path.resolve(root, result.out), { recursive: true });
    for (const f of result.files) {
        if (current.includes(f.file)) continue;
        fs.writeFileSync(path.resolve(root, f.file), f.content);
    }
    for (const file of leftover) fs.unlinkSync(path.resolve(root, file));
    return { written: [...missing, ...stale], unchanged: current, removed: leftover };
}

module.exports = { extract, features, compare, apply, DEFAULT_OUT, MARK };

if (require.main === module) {
    const argv = lib.args();
    if (argv.includes("-h") || argv.includes("--help")) {
        console.log(`Usage: node ${WRITER} [--out=<dir>] [--check]\n` +
            `Writes every document of the ${STAGE} stage out as <out>/NNNN-<slug>.feature (default ${DEFAULT_OUT}).\n` +
            "  --out=<dir>   the folder the feature files go to, relative to the repo root\n" +
            "  --check       write nothing; exit 1 if a document is refused or the folder is not what the documents say");
        process.exit(0);
    }
    const root = lib.root();
    const given = argv.find(a => a.startsWith("--out="));
    const out = given ? given.slice("--out=".length).replace(/\\/g, "/").replace(/\/+$/, "") || DEFAULT_OUT : DEFAULT_OUT;
    const result = features(root, out);
    for (const p of result.problems) console.error(p);

    if (argv.includes("--check")) {
        const { missing, stale, leftover } = compare(root, result);
        for (const f of missing) console.error(`${f}: missing; run node ${WRITER}`);
        for (const f of stale) console.error(`${f}: stale; run node ${WRITER}`);
        for (const f of leftover) console.error(`${f}: left over from a document that no longer exists; run node ${WRITER}`);
        const bad = result.problems.length + missing.length + stale.length + leftover.length;
        if (!bad) console.log(`${out}: ${result.files.length} feature file(s) current`);
        process.exit(bad ? 1 : 0);
    }

    const { written, unchanged, removed } = apply(root, result);
    console.log(`${out}: ${written.length} written, ${unchanged.length} unchanged, ${removed.length} removed` +
        (result.problems.length ? `; ${result.problems.length} document(s) refused` : ""));
    process.exit(result.problems.length ? 1 : 0);
}
