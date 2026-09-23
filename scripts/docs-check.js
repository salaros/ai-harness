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
// document, or a source (isSource below: a URL, a path that exists, or jira:KEY-123). A path may be a
// bare file name at the root, which is how INTENT.md or .gitignore is cited. A source
// stands in for an upstream document only while the chain holds nothing earlier. The table's Cites
// column names the exceptions: an entry stage (a TRD) may always derive from a source alone, and a
// cross-cutting one (an ADR, an RFC) is exempt from the backwards-only rule in both directions. Its
// Status column lists the values a stage's documents carry, the bold ones those a later stage may
// build on, so no SPEC cites an RFC that is not Accepted. MEMORY.md's
// Requirements line follows the same reference rule, or says "none yet". INTENT.md is optional;
// when there is one it must carry the sections its specification requires, as readIntent() in scripts/project-facts.js reads them.
// Prints one line per problem and exits 1 when there are any. The edit hook requires check().
// readDocs() is the model both this file and anything else that renders the chain read: the stages,
// the documents, and the two expressions that recognise a citation and an item. It is exported
// because the optional tools/docs-site portal renders what this validates, and a second walk of
// docs/ there means two file-name rules, two citation expressions, and a document the validator
// rejects while the portal happily renders it. readChain() is the table alone, for a caller that
// wants the pipeline without reading a single document.
// Each reads nothing but a view of the repo (scripts/repo-view.js): the working tree, what the
// commit will record when check-staged-docs.js passes a staged view, or a map of files in a test.
// check() and readDocs() take the root as well, because they report the path a reader outside the
// view would open; readChain() takes the view alone, having nothing to resolve.
// None changes the working directory: chdir is process-wide, so a library that moves it moves it
// for its caller. The caller decides where the root is -- a hook honours the harness's project-dir
// variable, a command uses its own location -- and says so here.
// Usage: node scripts/docs-check.js
const path = require("path");
const lib = require("./lib");
const repoView = require("./repo-view");
const { readFacts, readIntent } = require("./project-facts");

const DOCS = "docs", AGENTS = "AGENTS.md", MEMORY = "MEMORY.md", INTENT = "INTENT.md";
// isSource is also called with a bare root, by check-todo.js.
const viewOf = at => typeof at === "string" ? repoView.worktree(at) : at;

// What a source is, for every checker that accepts one: the chain's "Derived from:" lines, MEMORY.md's
// Requirements and TODO.md's entries all call isSource, so the rule and its help text live here once.
const SOURCE_HELP = "a URL, a repo-relative path that exists (optionally path:line), or jira:KEY-123";
// path:12 and path:12-40 point at lines of a file; the file is what has to exist.
const withoutLine = token => token.replace(/:\d+(?:-\d+)?$/, "");
// A path with a folder in it (a folder itself is written src/), or a Markdown file at the root such
// as INTENT.md: the shapes worth a "does not exist" hint. Any other bare word with a dot ("Node.js",
// "e.g") or without one ("docs", "scripts") stays prose, however real that name is on disk.
const looksLikePath = token => (/^[\w.][\w./-]*$/.test(withoutLine(token)) && token.includes("/")) || /^[\w-][\w.-]*\.md$/i.test(withoutLine(token));
// A bare file name counts as a source only when that file is at the root, so prose that happens to
// contain a dot never passes for a reference. The name may be a dotfile such as .gitignore.
const isRootFile = (file, view) => /^\.?[\w-][\w.-]*$/.test(file) && view.isFile(file);
// A source is the non-chain thing a document derives from. Only a path can be verified here; a URL
// and a Jira key are checked for shape, since neither can be followed. A Jira key is upper case, as
// Jira issues them. `at` is the repo a path resolves in: a view of it, or its root.
function isSource(token, at) {
    const view = viewOf(at);
    const file = withoutLine(token);
    return /^https?:\/\/\S+$/i.test(token)
        || /^jira:[A-Z][A-Z0-9_]*-\d+$/.test(token)
        || (looksLikePath(token) && view.exists(file))
        || isRootFile(file, view);
}
// Which repo-relative paths belong to the chain: Markdown under docs/, the AGENTS.md table that
// defines the stages, MEMORY.md whose Requirements line enters it, and INTENT.md. The edit hook and
// the pre-commit hook both ask inChain, so an edit and a commit never disagree about what to check;
// CHAIN_PATHS is the same set as git pathspecs.
const CHAIN_FILES = [AGENTS, MEMORY, INTENT];
const CHAIN_PATHS = [DOCS, ...CHAIN_FILES];
const inChain = file => CHAIN_FILES.includes(file) || /^docs\/.+\.md$/.test(file);
// "x, y (z)" -> ["x", "y", "z"], with surrounding punctuation stripped.
const tokensOf = text => text.split(/[\s,;]+/).filter(Boolean)
    .map(t => t.replace(/^[("'<[]+|[)"'>\].]+$/g, ""))
    .filter(Boolean);
// "**Derived from:** x, y" -> ["x", "y"].
const referenceTokens = line => tokensOf(line.replace(/^\**Derived from:?\**:?/i, ""));

// The three expressions that say what the chain's markers look like. They are ASCII whatever
// language the prose is (AGENTS.md, "Working here"), and they live here rather than at each reader
// because a renderer that recognises one more file name than the validator renders a document
// nothing checked.
// A document's file name, which is what gives it its ID: docs/ears/0003-alerts.md is EARS-0003.
const FILE_RE = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
// An item a later stage can refine, at the start of its line: `- BR-2: …`, `### D-1 …`, `| FR-3 |`.
const ITEM_RE = /^(?:[-*]\s+|#{1,6}\s+|\*\*|\|\s*)?([A-Z]{1,5}-\d+)\b/;
// A citation, anywhere: PRD-0002, or PRD-0002/FR-3 pointing at one item of it. Built from the
// folders the table gives, so a stage nobody wrote is not a prefix.
const citationRe = folders =>
    new RegExp(`\\b(${folders.map(f => f.toUpperCase()).join("|") || "NONE"})-(\\d{4})(?:\\/([A-Z]{1,5}-\\d+))?\\b`, "g");

// What a stage's documents may cite, the table's Cites column: `backwards` along the chain only;
// `backwards or source`, an entry stage that may also derive from a source alone however much of the
// chain exists; `any`, a cross-cutting stage that cites and is cited in either direction.
const CITES = ["backwards", "backwards or source", "any"];

// The chain itself, read from the AGENTS.md table: | Stage | Answers | Lives in | Cites | Status | Skill |. Every
// row in table order, so the caller sees the pipeline the way a reader of AGENTS.md does; `folder`
// is set only on the rows that are document stages (tests/, .scratch/ and src/ have none). This is
// the only parser of that table: check() below goes through it, as does the optional
// tools/docs-site portal. A view and no root, because the table is one file and nothing here
// resolves a path against anything: readDocs() below takes both, since it reports the path a reader
// outside the view would open.
function readChain(view) {
    const problems = [];
    const say = msg => problems.push(`${AGENTS}: ${msg}`);
    const stages = [];
    const text = view.read(AGENTS) || "";
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
            if (!view.isFile(`.agents/skills/${skill}/SKILL.md`))
                say(`stage ${stage} names skill \`${skill}\`, which is not under .agents/skills/`);
        const m = lives.match(/^docs\/([a-z0-9-]+)\/$/);   // tests/, .scratch/, src/: not a document stage
        if (m && m[1].toUpperCase() !== stage) say(`stage ${stage} lives in ${lives}; the folder must be docs/${stage.toLowerCase()}/`);
        // Cites says what a stage's documents may reference. A table written before the column
        // existed keeps the one rule it had, ADR citing anything.
        const citesCell = cols.includes("Cites") ? col(row, "Cites").replace(/`/g, "").trim().toLowerCase() : (stage === "ADR" ? "any" : "backwards");
        const cites = m ? (citesCell || "backwards") : null;
        if (m && !CITES.includes(cites)) say(`stage ${stage} cites "${cites}"; the Cites column takes ${CITES.map(c => `\`${c}\``).join(", ")}`);
        // Status lists the values a document of the stage carries on its **Status:** line; the bold
        // ones are those a later stage may build on (an Accepted RFC, a Go PDD).
        const statusCell = m ? col(row, "Status") : "";
        const statuses = [...statusCell.matchAll(/(\*\*)?([A-Za-z][A-Za-z -]*[A-Za-z])\1?/g)]
            .map(s => ({ value: s[2].trim(), buildable: !!s[1] }));
        if (statuses.length && !statuses.some(s => s.buildable)) say(`stage ${stage} lists statuses but marks none in bold as one a later stage may build on`);
        stages.push({ stage, answers: col(row, "Answers"), lives, folder: m ? m[1] : null, cites, statuses, skills });
    }
    if (!stages.some(s => s.folder)) say("chain table has no row living in docs/<stage>/");
    return { stages, problems };
}

// Every document of the chain, keyed by ID, in stage order and then file order, with the stage
// table it was read against and the expressions that recognise a citation and an item in it. What
// check() validates and what the portal renders is this one model, so a document either takes part
// in the chain in both or in neither.
// `file` is the repo-relative path, for a message a reader can act on; `path` is the same file
// resolved against the root, for a reader outside the view. A file name the rule rejects is a problem here
// rather than a document, so no reader has to decide what to do with one.
function readDocs(root, view = repoView.worktree(root)) {
    const { stages, problems } = readChain(view);
    const docStages = stages.filter(s => s.folder);
    const docs = new Map();

    for (const s of docStages) {
        const dir = `${DOCS}/${s.folder}`;
        const seen = new Map();
        for (const name of view.list(dir).filter(n => n.endsWith(".md") && n !== "README.md")) {
            const file = `${dir}/${name}`;
            const m = name.match(FILE_RE);
            if (!m) { problems.push(`${file}: file name must be NNNN-<kebab-slug>.md`); continue; }
            const id = `${s.folder.toUpperCase()}-${m[1]}`;
            if (seen.has(m[1])) problems.push(`${file}: number ${m[1]} already used by ${seen.get(m[1])}`);
            seen.set(m[1], name);
            const text = view.read(file);
            if (text === null) continue;                    // a folder named like a document
            const lines = text.split(/\r?\n/);
            const h1 = lines.find(l => l.startsWith("# ")) || null;
            const slug = name.replace(/\.md$/, "");
            const items = new Set();
            for (const line of lines) {
                const im = line.match(ITEM_RE);
                if (im) items.add(im[1]);
            }
            docs.set(id, {
                id, stage: s.stage, folder: s.folder, number: Number(m[1]),
                file, path: path.resolve(root, file), entryId: `${s.folder}/${slug}`, link: `/${s.folder}/${slug}/`,
                title: h1 ? h1.replace(/^#\s+/, "").trim() : id,
                h1, text, lines, items,
            });
        }
    }

    return { stages, docStages, docs, problems, refRe: citationRe(docStages.map(s => s.folder)), itemRe: ITEM_RE };
}

function check(root, view = repoView.worktree(root)) {
    const say = (file, msg) => problems.push(`${file}: ${msg}`);

    // 1. The chain and its documents
    const { docStages, docs, problems, refRe } = readDocs(root, view);
    const chain = docStages.map(s => s.folder);   // folder names in stage order
    const rank = Object.fromEntries(chain.map((s, i) => [s, i]));
    const stageOf = Object.fromEntries(docStages.map(s => [s.folder, s]));
    // A document's **Status:** value, and the table's entry for it: "Superseded by RFC-0007" is
    // Superseded. Null when the line is missing or names a value the stage does not list.
    const statusOf = d => {
        const line = d.lines.find(l => /^\**Status\**:/i.test(l));
        const value = line ? line.replace(/^\**Status\**:\**\s*/i, "").trim().toLowerCase() : "";
        // The value, then anything but a letter or a hyphen, so "Go-live" is not Go: "Accepted.", "Accepted, 2026-09-20", "Superseded by …".
        return stageOf[d.folder].statuses.find(s => new RegExp(`^${s.value.toLowerCase()}(?![a-z-])`).test(value)) || null;
    };
    const prefixes = chain.map(s => s.toUpperCase());

    // 2. Check each document
    for (const [id, d] of docs) {
        const { lines, h1 } = d;
        const cites = stageOf[d.folder].cites;
        if (!h1) say(d.file, "no level-1 heading");
        else if (!h1.startsWith(`# ${id}:`)) say(d.file, `first heading must start with "# ${id}:" (found "${h1.slice(0, 40)}")`);

        // Every document says where it came from: an upstream document, or a source.
        const derived = lines.find(l => /^\**Derived from:?\**:?/i.test(l));
        if (!derived) say(d.file, `missing a "**Derived from:**" line naming an upstream document or a source (${SOURCE_HELP})`);
        else {
            const tokens = referenceTokens(derived);
            const upstream = [...derived.matchAll(refRe)].map(m => `${m[1]}-${m[2]}`).filter(c => c !== id);
            const sources = tokens.filter(t => isSource(t, view));
            const brokenPath = tokens.find(t => looksLikePath(t) && !view.exists(withoutLine(t)));
            if (!upstream.length && !sources.length) {
                const why = brokenPath ? `; ${brokenPath} does not exist` : "";
                say(d.file, `"Derived from:" names no reference: cite an upstream document, or a source (${SOURCE_HELP})${why}`);
            } else if (!upstream.length && cites === "backwards") {
                // A source stands in for an upstream document only while there is nothing earlier
                // to cite. An entry stage and a cross-cutting one may always start from a source.
                const earlier = [...docs].find(([, o]) => rank[o.folder] < rank[d.folder]);
                if (earlier) say(d.file, `"Derived from:" names only a source, but ${earlier[0]} exists; cite the upstream document instead`);
            }
        }

        // A stage that lists statuses needs every document of it to carry one of them.
        const listed = stageOf[d.folder].statuses;
        if (listed.length && !statusOf(d))
            say(d.file, `needs a "**Status:**" line with one of ${listed.map(s => s.value).join(", ")}`);

        for (const [ref, stage, num, item] of d.text.matchAll(refRe)) {
            const docId = `${stage}-${num}`;
            if (docId === id) continue;
            const target = docs.get(docId);
            if (!target) { say(d.file, `cites ${ref} but ${docId} does not exist`); continue; }
            // A cross-cutting stage (an ADR, an RFC) is written the moment something forces it, so
            // it cites, and is cited, in either direction; every other pair points backwards.
            const crossCutting = cites === "any" || stageOf[target.folder].cites === "any";
            if (!crossCutting && rank[target.folder] > rank[d.folder]) say(d.file, `cites ${ref}, which is later in the chain (${target.folder} after ${d.folder})`);
            // A later stage builds only on a document its stage's Status marks as one to build on:
            // no SPEC on an RFC still open or rejected. A cross-cutting document may cite any, since
            // "we rejected RFC-0002" is itself a decision worth recording.
            const status = rank[target.folder] < rank[d.folder] && cites !== "any" && stageOf[target.folder].statuses.length ? statusOf(target) : null;
            if (status && !status.buildable) {
                const want = stageOf[target.folder].statuses.filter(s => s.buildable).map(s => s.value).join(" or ");
                say(d.file, `cites ${ref}, which is ${status.value}; ${stageOf[d.folder].stage} builds only on ${stageOf[target.folder].stage} documents that are ${want}`);
            }
            if (item && !target.items.has(item)) say(d.file, `cites ${ref} but ${target.file} has no item ${item}`);
        }
    }

    // 4. MEMORY.md's Requirements takes part in traceability once a BRD exists, so it follows the
    // same reference rule: sources, document IDs, or "none yet".
    const memory = view.read(MEMORY), intentText = view.read(INTENT);
    if (memory !== null) {
        // Read as every other reader of project facts reads it, through scripts/project-facts.js.
        const value = readFacts({ memory, intent: intentText }).Requirements;
        if (value === null) say(MEMORY, "no Requirements line (the project-init skill writes one)");
        else {
            // An unanswered `<placeholder>` means project-init has not run. check-initialised.js
            // already blocks every commit and push until it does, and says so in those words; repeating
            // it here as a broken citation sends the reader looking for a document that was never named.
            if (!value) { /* unconfigured, and gated elsewhere */ }
            else if (!/^none yet\b/i.test(value)) {
                // The same rule as "Derived from:": at least one reference on the line, and the rest
                // of the words are the writer's. Holding every comma-separated piece to it turned a
                // sentence naming its source into four broken citations, and made English the only
                // language the line could be written in.
                const tokens = tokensOf(value);
                const named = tokens.filter(t => new RegExp(`^(${prefixes.join("|") || "NONE"})-\\d{4}$`).test(t));
                for (const token of named) {
                    if (!docs.has(token)) say(MEMORY, `Requirements names ${token}, which does not exist`);
                }
                if (!named.length && !tokens.some(t => isSource(t, view))) {
                    const broken = tokens.find(t => looksLikePath(t) && !view.exists(withoutLine(t)));
                    say(MEMORY, `Requirements names no reference: cite a document ID, a source (${SOURCE_HELP}), or "none yet"`
                        + (broken ? `; ${broken} does not exist` : ""));
                }
            }
        }
    }

    // 5. INTENT.md, only when there is one: the sections its specification requires. The stories
    // themselves are the product owner's, so their shape is not checked.
    if (intentText !== null) {
        const intent = readIntent(intentText);
        const spec = "see https://www.intentdocs.com/intent-md";
        if (!intent.title) say(INTENT, `first heading must be "# INTENT.md" (${spec})`);
        if (!intent.product) say(INTENT, `no "## Product" section (${spec})`);
        else {
            if (!intent.product.name) say(INTENT, `"## Product" names no product in bold, as in "**Acme Billing** invoices …" (${spec})`);
            if (!intent.product.purpose) say(INTENT, `"## Product" does not say what the product does, for whom and why (${spec})`);
        }
        if (!intent.stories) say(INTENT, `no "## MVP stories" section (${spec})`);
    }

    return { problems, summary: `docs-check: ${chain.length} stage(s) in ${AGENTS}, ${docs.size} document(s) under ${DOCS}/, no problems` };
}

module.exports = { check, readChain, readDocs, isSource, SOURCE_HELP, inChain, CHAIN_PATHS };

if (require.main === module) {
    const { problems, summary } = check(lib.root());
    console.log(problems.length ? problems.join("\n") : summary);
    process.exit(problems.length ? 1 : 0);
}
