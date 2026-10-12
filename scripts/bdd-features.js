#!/usr/bin/env node
// scripts/bdd-features.js
// Writes the BDD stage out as Gherkin feature files a runner can execute. Each docs/bdd/NNNN-<slug>.md
// is the document of record: this takes every ```gherkin block in it, in order, and writes them as
// one <out>/NNNN-<slug>.feature with a header saying where it came from, so Reqnroll, cucumber-js or
// pytest-bdd run the scenarios the document holds and nobody edits a copy. The output folder is this
// script's own: a stale file it wrote for a document since renamed is removed, and a .feature file it
// did not write is left alone.
// A document is refused, and nothing written for it, when it has no gherkin block, more or fewer than
// one `Feature:` line, a scenario without a `# SC-n` line directly above it (above its tags, at the
// start of the line, which is what makes SC-n an item a SPEC can cite as BDD-NNNN/SC-n), or two
// scenarios sharing an id. The other documents are still written. A `# language:` line stays first,
// because Gherkin reads it only there; it also hands the keywords to the runner, since `Feature:`
// and `Scenario:` are English and a document in another language spells them its own way, so only
// the block count is checked for one.
// extract(text, file) is the decision for one document and features(root, out) for the folder, each
// returning what to write and what is wrong, printing nothing and writing nothing; apply() writes.
// Usage: node scripts/bdd-features.js [--out=<dir>] [--check]
//   --out=<dir>   where the feature files go, relative to the repo root; default tests/features
//   --check       write nothing; exit 1 when a document is refused or a feature file is missing,
//                 stale, or left over from a document that no longer exists
// Exit 1 when a document was refused, with the problems on stderr; the rest is still written.
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const docsCheck = require("./docs-check");

const DEFAULT_OUT = "tests/features";
const FOLDER = "bdd";
const SCRIPT = "scripts/bdd-features.js";
// What marks a .feature file as this script's, so a stale one can be removed and a hand-written
// one in the same folder cannot.
const MARK = `by ${SCRIPT}`;

// A fenced block opens on three or more backticks or tildes, optionally indented up to three spaces,
// with the language right after; it closes on the same character, at least as many of them, and
// nothing else. That is CommonMark's rule, and it is why a ```gherkin line inside a ```md example is
// not a block of its own.
const OPEN_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)/;
const closeRe = mark => new RegExp(`^ {0,3}${mark[0] === "\`" ? "\`" : "~"}{${mark.length},}[ \\t]*$`);
const FEATURE_RE = /^\s*Feature:/;
const SCENARIO_RE = /^\s*(?:Scenario Outline|Scenario Template|Scenario|Example):/;
const TAG_RE = /^\s*@/;
// docs-check's item rule, for a line that is a Markdown heading or a Gherkin comment alike: `# SC-1`
// at the start of the line, so the id is one a later document can cite.
const SC_RE = /^# (SC-\d+)\b/;
const LANGUAGE_RE = /^\s*#\s*language:/i;

// The gherkin blocks of a Markdown document, each as its lines, in document order. A block never
// closed runs to the end of the document, as CommonMark reads it.
function blocks(lines) {
    const out = [];
    let close = null, gherkin = false, current = [];
    for (const line of lines) {
        if (!close) {
            const m = line.match(OPEN_RE);
            if (!m) continue;
            close = closeRe(m[1]); gherkin = m[2].toLowerCase() === "gherkin"; current = [];
            continue;
        }
        if (close.test(line)) { if (gherkin) out.push(current); close = null; continue; }
        current.push(line);
    }
    if (close && gherkin) out.push(current);
    return out;
}

const trimBlank = lines => {
    const out = lines.slice();
    while (out.length && !out[0].trim()) out.shift();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return out;
};

// One document's feature file, or the reasons there is none. `file` is the document's repo-relative
// path, named in every problem and in the header of the file written.
function extract(text, file) {
    const problems = [];
    const say = msg => problems.push(`${file}: ${msg}`);
    const found = blocks(text.split(/\r?\n/)).map(trimBlank).filter(b => b.length);
    if (!found.length) { say("has no ```gherkin block to extract"); return { feature: null, ids: [], problems }; }
    const body = found.flatMap((b, i) => i ? ["", ...b] : b);
    const language = body.findIndex(l => LANGUAGE_RE.test(l));
    const english = language < 0 || /language:\s*en\b/i.test(body[language]);

    const features = body.filter(l => FEATURE_RE.test(l)).length;
    if (english && features !== 1) say(`holds ${features} \`Feature:\` lines across its gherkin blocks; a feature file is one Feature`);

    const seen = new Map();
    body.forEach((line, i) => {
        if (!english || !SCENARIO_RE.test(line)) return;
        let j = i - 1;
        while (j >= 0 && TAG_RE.test(body[j])) j--;
        const m = j >= 0 ? body[j].match(SC_RE) : null;
        const name = line.trim();
        if (!m) { say(`"${name}" has no \`# SC-n\` line directly above it (above its tags, at the start of the line)`); return; }
        if (seen.has(m[1])) say(`${m[1]} names both "${seen.get(m[1])}" and "${name}"`);
        else seen.set(m[1], name);
    });
    if (problems.length) return { feature: null, ids: [...seen.keys()], problems };

    const header = [`# Generated from ${file} ${MARK}. Do not edit: change the document and run it again.`, ""];
    const lines = language < 0 ? [...header, ...body]
        : [body[language], ...header, ...trimBlank([...body.slice(0, language), ...body.slice(language + 1)])];
    return { feature: lines.join("\n") + "\n", ids: [...seen.keys()], problems };
}

// Every BDD document of the chain as the file to write for it, under `out`, with the problems of the
// documents refused. The chain is read the way docs-check reads it, so a file name the chain rejects
// is reported here too rather than written under a name nothing cites.
function features(root, out = DEFAULT_OUT) {
    const { stages, docs, problems: chain } = docsCheck.readDocs(root);
    const dir = `docs/${FOLDER}/`;
    const problems = chain.filter(p => p.startsWith(dir) || p.includes("chain table"));
    if (!stages.some(s => s.folder === FOLDER)) problems.push(`AGENTS.md: the chain table has no stage living in ${dir}, so there is nothing to extract`);
    const files = [];
    for (const doc of docs.values()) {
        if (doc.folder !== FOLDER) continue;
        const r = extract(doc.text, doc.file);
        problems.push(...r.problems);
        if (r.feature !== null) files.push({ file: path.posix.join(out, `${doc.entryId.slice(FOLDER.length + 1)}.feature`), from: doc.file, content: r.feature });
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
        console.log(`Usage: node ${SCRIPT} [--out=<dir>] [--check]\n` +
            `Writes every docs/${FOLDER}/NNNN-<slug>.md out as <out>/NNNN-<slug>.feature (default ${DEFAULT_OUT}).\n` +
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
        for (const f of missing) console.error(`${f}: missing; run node ${SCRIPT}`);
        for (const f of stale) console.error(`${f}: stale; run node ${SCRIPT}`);
        for (const f of leftover) console.error(`${f}: left over from a document that no longer exists; run node ${SCRIPT}`);
        const bad = result.problems.length + missing.length + stale.length + leftover.length;
        if (!bad) console.log(`${out}: ${result.files.length} feature file(s) current`);
        process.exit(bad ? 1 : 0);
    }

    const { written, unchanged, removed } = apply(root, result);
    console.log(`${out}: ${written.length} written, ${unchanged.length} unchanged, ${removed.length} removed` +
        (result.problems.length ? `; ${result.problems.length} document(s) refused` : ""));
    process.exit(result.problems.length ? 1 : 0);
}
