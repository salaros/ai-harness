#!/usr/bin/env node
// scripts/docs-check.js
// Checks the documentation chain. The chain itself is the table in AGENTS.md ("Documentation"):
// every row whose "Lives in" is docs/<stage>/ is a document stage, in table order, and the folder
// name gives the ID prefix (docs/ears/ -> EARS). This script reads that table, so the stage list
// is written nowhere else, and reports: a table it cannot read, a stage folder or name that does
// not fit, a skill named in the table that is not under .agents/skills/, and then, per document:
// the ID its file name gives it, the upstream documents it was derived from, and every citation
// (DOC-ID or DOC-ID/ITEM) pointing backwards along the chain to something that exists.
// Every document carries a "Derived from:" line naming at least one reference: an upstream
// document, or a source (a URL, a repo-relative path that exists, or jira:KEY-123). A source
// stands in for an upstream document only while the chain holds nothing earlier; an ADR may
// always cite one, and is exempt from the backwards-only rule in both directions. MEMORY.md's
// Requirements line follows the same reference rule, or says "none yet".
// Prints one line per problem and exits 1 when there are any. The edit hook requires check();
// readChain() is exported for anything else that needs the pipeline (the optional tools/docs-site
// does), so the stage table is parsed in one place, not two.
// Both take the repo root as their first argument and resolve everything relative against it; an
// absolute argument is used as it stands, which is how check-staged-docs.js points the docs, table
// and memory file at a temp tree of staged blobs while sources still resolve in the checkout.
// Neither changes the working directory: chdir is process-wide, so a library that moves it moves it
// for its caller. The caller decides where the root is -- a hook honours the harness's project-dir
// variable, a command uses its own location -- and says so here.
// Usage: node scripts/docs-check.js [docs-dir] [agents-file] [memory-file]
//        (defaults: docs, AGENTS.md, MEMORY.md, each relative to the repo root)
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const SOURCE_HELP = "a URL, a repo-relative path that exists, or jira:KEY-123";
const looksLikePath = token => /^[\w.][\w./-]*$/.test(token) && token.includes("/");
// A source is the non-chain thing a document derives from. Only a path can be verified here;
// a URL and a Jira key are checked for shape, since neither can be followed. `at` resolves a
// repo-relative path against the root the caller gave.
const isSource = (token, at) =>
    /^https?:\/\/\S+$/i.test(token)
    || /^jira:[A-Za-z][A-Za-z0-9]*-\d+$/.test(token)
    || (looksLikePath(token) && fs.existsSync(at(token)));
// "x, y (z)" -> ["x", "y", "z"], with surrounding punctuation stripped.
const tokensOf = text => text.split(/[\s,;]+/).filter(Boolean)
    .map(t => t.replace(/^[("'<[]+|[)"'>\].]+$/g, ""))
    .filter(Boolean);
// "**Derived from:** x, y" -> ["x", "y"].
const referenceTokens = line => tokensOf(line.replace(/^\**Derived from:?\**:?/i, ""));

// The chain itself, read from the AGENTS.md table: | Stage | Answers | Lives in | Skill |. Every
// row in table order, so the caller sees the pipeline the way a reader of AGENTS.md does; `folder`
// is set only on the rows that are document stages (tests/, .scratch/ and src/ have none). This is
// the only parser of that table: check() below goes through it, as does the optional
// tools/docs-site portal.
function readChain(root, agentsFile = "AGENTS.md") {
    const at = p => path.resolve(root, p);
    const problems = [];
    const say = msg => problems.push(`${agentsFile}: ${msg}`);
    const stages = [];
    const text = fs.existsSync(at(agentsFile)) ? fs.readFileSync(at(agentsFile), "utf8") : "";
    const lines = text.split(/\r?\n/);
    const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    const header = lines.findIndex(l => /^\|/.test(l) && cells(l).includes("Stage") && cells(l).includes("Lives in"));
    if (header < 0) {
        say("no chain table found (a Markdown table with Stage and Lives in columns)");
        return { stages, problems };
    }
    const cols = cells(lines[header]);
    const col = (row, name) => row[cols.indexOf(name)] || "";
    for (let i = header + 2; i < lines.length && /^\|/.test(lines[i]); i++) {
        const row = cells(lines[i]);
        const stage = col(row, "Stage");
        const lives = (col(row, "Lives in").match(/`([^`]+)`/) || [])[1] || "";
        const skills = [...col(row, "Skill").matchAll(/`([^`]+)`/g)].map(m => m[1]);
        for (const skill of skills)
            if (!fs.existsSync(at(path.join(".agents/skills", skill, "SKILL.md"))))
                say(`stage ${stage} names skill \`${skill}\`, which is not under .agents/skills/`);
        const m = lives.match(/^docs\/([a-z0-9-]+)\/$/);   // tests/, .scratch/, src/: not a document stage
        if (m && m[1].toUpperCase() !== stage) say(`stage ${stage} lives in ${lives}; the folder must be docs/${stage.toLowerCase()}/`);
        stages.push({ stage, answers: col(row, "Answers"), lives, folder: m ? m[1] : null, skills });
    }
    if (!stages.some(s => s.folder)) say("chain table has no row living in docs/<stage>/");
    return { stages, problems };
}

function check(root, docsDir = "docs", agentsFile = "AGENTS.md", memoryFile = "MEMORY.md") {
    const at = p => path.resolve(root, p);
    const problems = [];
    const say = (file, msg) => problems.push(`${file}: ${msg}`);

    // 1. The chain, from the AGENTS.md table
    const fromTable = readChain(root, agentsFile);
    problems.push(...fromTable.problems);
    const chain = fromTable.stages.filter(s => s.folder).map(s => s.folder);   // folder names in stage order
    const rank = Object.fromEntries(chain.map((s, i) => [s, i]));
    const prefixes = chain.map(s => s.toUpperCase());
    const refRe = new RegExp(`\\b(${prefixes.join("|") || "NONE"})-(\\d{4})(?:\\/([A-Z]{1,5}-\\d+))?\\b`, "g");
    const docs = new Map();      // "EARS-0003" -> { file, stage, items:Set, text }

    // 2. Collect documents: docs/<stage>/NNNN-<slug>.md -> <STAGE>-NNNN
    for (const stage of chain) {
        // The path as the caller wrote it, so a problem names the file the way the caller knows it;
        // at() turns it into something to read.
        const dir = path.join(docsDir, stage);
        if (!fs.existsSync(at(dir))) continue;
        const seen = new Map();
        for (const name of fs.readdirSync(at(dir)).filter(n => n.endsWith(".md") && n !== "README.md")) {
            const file = path.join(dir, name).split(path.sep).join("/");
            const m = name.match(/^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/);
            if (!m) { say(file, "file name must be NNNN-<kebab-slug>.md"); continue; }
            const id = `${stage.toUpperCase()}-${m[1]}`;
            if (seen.has(m[1])) say(file, `number ${m[1]} already used by ${seen.get(m[1])}`);
            seen.set(m[1], name);
            const text = fs.readFileSync(at(file), "utf8");
            const items = new Set();
            for (const line of text.split(/\r?\n/)) {
                const im = line.match(/^(?:[-*]\s+|#{1,6}\s+|\*\*|\|\s*)?([A-Z]{1,5}-\d+)\b/);
                if (im) items.add(im[1]);
            }
            docs.set(id, { file, stage, items, text });
        }
    }

    // 3. Check each document
    for (const [id, d] of docs) {
        const lines = d.text.split(/\r?\n/);
        const h1 = lines.find(l => l.startsWith("# "));
        if (!h1) say(d.file, "no level-1 heading");
        else if (!h1.startsWith(`# ${id}:`)) say(d.file, `first heading must start with "# ${id}:" (found "${h1.slice(0, 40)}")`);

        // Every document says where it came from: an upstream document, or a source.
        const derived = lines.find(l => /^\**Derived from:?\**:?/i.test(l));
        if (!derived) say(d.file, `missing a "**Derived from:**" line naming an upstream document or a source (${SOURCE_HELP})`);
        else {
            const tokens = referenceTokens(derived);
            const cites = [...derived.matchAll(refRe)].map(m => `${m[1]}-${m[2]}`).filter(c => c !== id);
            const sources = tokens.filter(t => isSource(t, at));
            const brokenPath = tokens.find(t => looksLikePath(t) && !fs.existsSync(at(t)));
            if (!cites.length && !sources.length) {
                const why = brokenPath ? `; ${brokenPath} does not exist` : "";
                say(d.file, `"Derived from:" names no reference: cite an upstream document, or a source (${SOURCE_HELP})${why}`);
            } else if (!cites.length && d.stage !== "adr") {
                // A source stands in for an upstream document only while there is nothing earlier
                // to cite. An ADR is cross-cutting, so this never applies to it.
                const earlier = [...docs].find(([, o]) => rank[o.stage] < rank[d.stage]);
                if (earlier) say(d.file, `"Derived from:" names only a source, but ${earlier[0]} exists; cite the upstream document instead`);
            }
        }

        for (const [ref, stage, num, item] of d.text.matchAll(refRe)) {
            const docId = `${stage}-${num}`;
            if (docId === id) continue;
            const target = docs.get(docId);
            if (!target) { say(d.file, `cites ${ref} but ${docId} does not exist`); continue; }
            // An ADR records a decision forced at any point, so it cites, and is cited, in
            // either direction; every other pair points backwards along the chain.
            const crossCutting = d.stage === "adr" || target.stage === "adr";
            if (!crossCutting && rank[target.stage] > rank[d.stage]) say(d.file, `cites ${ref}, which is later in the chain (${target.stage} after ${d.stage})`);
            if (item && !target.items.has(item)) say(d.file, `cites ${ref} but ${target.file} has no item ${item}`);
        }
    }

    // 4. MEMORY.md's Requirements takes part in traceability once a BRD exists, so it follows the
    // same reference rule: sources, document IDs, or "none yet".
    if (fs.existsSync(at(memoryFile))) {
        const line = fs.readFileSync(at(memoryFile), "utf8").split(/\r?\n/).find(l => /^\s*[-*]?\s*\**Requirements:?\**:?/i.test(l));
        if (!line) say(memoryFile, "no Requirements line (the project-init skill writes one)");
        else {
            const value = line.replace(/^\s*[-*]?\s*\**Requirements:?\**:?/i, "").trim();
            // A `<placeholder>` means project-init has not run. check-initialised.js already blocks
            // every commit and push until it does, and says so in those words; repeating it here as
            // a broken citation sends the reader looking for a document that was never named.
            if (/^<[^>]*>$/.test(value)) { /* unconfigured, and gated elsewhere */ }
            else if (!/^none yet\b/i.test(value)) {
                // The same rule as "Derived from:": at least one reference on the line, and the rest
                // of the words are the writer's. Holding every comma-separated piece to it turned a
                // sentence naming its source into four broken citations, and made English the only
                // language the line could be written in.
                const tokens = tokensOf(value);
                const named = tokens.filter(t => new RegExp(`^(${prefixes.join("|") || "NONE"})-\\d{4}$`).test(t));
                for (const token of named) {
                    if (!docs.has(token)) say(memoryFile, `Requirements names ${token}, which does not exist`);
                }
                if (!named.length && !tokens.some(t => isSource(t, at))) {
                    const broken = tokens.find(t => looksLikePath(t) && !fs.existsSync(at(t)));
                    say(memoryFile, `Requirements names no reference: cite a document ID, a source (${SOURCE_HELP}), or "none yet"`
                        + (broken ? `; ${broken} does not exist` : ""));
                }
            }
        }
    }

    return { problems, summary: `docs-check: ${chain.length} stage(s) in ${agentsFile}, ${docs.size} document(s) under ${docsDir}/, no problems` };
}

module.exports = { check, readChain };

if (require.main === module) {
    const { problems, summary } = check(lib.root(), ...process.argv.slice(2));
    console.log(problems.length ? problems.join("\n") : summary);
    process.exit(problems.length ? 1 : 0);
}
