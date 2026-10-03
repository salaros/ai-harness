#!/usr/bin/env node
// scripts/check-glossary.js
// Reads a glossary and keeps it readable. GLOSSARY.md holds a repo's terms, one entry each, and an
// entry is written in either of two formats, one per file:
//   headings   glossarify-md's (https://github.com/about-code/glossarify-md): `## Term`, an optional
//              `<!-- aliases: a, b -->` comment under it, then the definition. Every heading below
//              the title with text under it is a term; one with nothing under it but deeper headings
//              groups them.
//   bold       the one `domain-modeling` and `teach` write: `**Term**:`, the definition on the lines
//              after it, an optional `_Avoid_: a, b` line. Headings group the entries.
// Both give the same model, so an aliases comment works in a bold entry and an `_Avoid_` line in a
// heading one. An alias is another name the same entry answers to, which the docs portal links like
// the term itself; an avoided word is one the project decided not to use, and is never linked.
// A file holds bold entries when one `**Term**:` line is in it, and heading entries otherwise.
// A glossary only pays for itself if every reader finds one definition per name, so the check asks
// for a title, a definition under every term, and no name defined twice. It never asks for terms to
// exist: an empty glossary, or none at all, is the honest state of a repo that has settled no term.
// A repo that has not split its terms out yet keeps them under `## Language` in CONTEXT.md, the
// file `domain-modeling` wrote them to before GLOSSARY.md existed. read() takes both, GLOSSARY.md
// first, so a repo's glossary is whole while its terms move; only GLOSSARY.md is held to the check.
// The pre-commit hook calls check() on each staged GLOSSARY.md through githook.js, and the edit hook
// on the file just written. As a command it reads GLOSSARY.md at the repo root, a path when given
// one, and stdin only when given `-`.
// parse(text), check(text, root, file) and read(view) are the decisions: text or a repo view in, a
// model or problems out, nothing printed and nothing exited. The command line below is the only
// part that talks to a terminal.
// Usage:
//   node scripts/check-glossary.js
//   node scripts/check-glossary.js src/Ordering/GLOSSARY.md
//   git show :GLOSSARY.md | node scripts/check-glossary.js -
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const FILE = "GLOSSARY.md";
// Where a repo's terms were before the split, and the section of it that holds them.
const CONTEXT = "CONTEXT.md";
const CONTEXT_SECTION = "Language";

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const BOLD = /^\*\*(.+?)\*\*\s*:\s*(.*)$/;
const AVOID = /^[_*]Avoid[_*]\s*:\s*(.*)$/i;
const ALIASES = /(?:^|\n)\s*aliases\s*:\s*(.*)/i;

// A GLOSSARY.md anywhere in the repo is a glossary: the root's, a service's beside its CONTEXT.md, a
// teaching workspace's. One a skill or a dependency ships is somebody else's example of the format.
const isGlossary = file => /(?:^|\/)GLOSSARY\.md$/.test(file) && !/(?:^|\/)(?:\.agents|\.claude|node_modules)\//.test(file);

const list = text => text.split(",").map(s => s.trim().replace(/^["'`]|["'`]$/g, "")).filter(Boolean);
const key = name => name.trim().replace(/\s+/g, " ").toLowerCase();
const slugOf = name => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "term";

// Every name a reader may meet an entry under: the term, its aliases, and both halves of a term
// written `RPE (Rate of Perceived Exertion)`, which prose uses one at a time.
function namesOf({ term, aliases }) {
    const halves = term.match(/^(.+?)\s*\((.+)\)$/);
    return [...new Set([term, ...(halves ? [halves[1], halves[2]] : []), ...aliases])];
}

// The lines a section holds: everything under `## <section>` up to the next heading at its level or
// above. With no section, the whole file below its title.
function sliceOf(lines, section) {
    if (!section) return { from: 0, to: lines.length, depth: 1 };
    let fenced = false, from = -1, depth = 0;
    for (let i = 0; i < lines.length; i++) {
        if (FENCE.test(lines[i])) { fenced = !fenced; continue; }
        const h = !fenced && lines[i].match(HEADING);
        if (!h) continue;
        if (from < 0) { if (key(h[2]) === key(section)) { from = i + 1; depth = h[1].length; } continue; }
        if (h[1].length <= depth) return { from, to: i, depth };
    }
    return from < 0 ? { from: 0, to: 0, depth: 1 } : { from, to: lines.length, depth };
}

// An entry's body, taken apart: the aliases comment, the avoided words, and the definition, which is
// every other line. A comment that names no aliases is somebody's note and is dropped.
function bodyOf(lines) {
    const body = { aliases: [], avoid: [], definition: "", empty: [] };
    const kept = [];
    let fenced = false, comment = null;
    for (const line of lines) {
        if (comment !== null) {
            comment += "\n" + line;
            if (!line.includes("-->")) continue;
        } else if (FENCE.test(line)) { fenced = !fenced; kept.push(line); continue; }
        else if (fenced) { kept.push(line); continue; }
        else if (/^\s*<!--/.test(line)) { comment = line; if (!line.includes("-->")) continue; }
        if (comment !== null) {
            const named = comment.replace(/<!--|-->/g, "").match(ALIASES);
            if (named) { const names = list(named[1]); if (names.length) body.aliases.push(...names); else body.empty.push("an aliases comment"); }
            comment = null;
            continue;
        }
        const avoid = line.trim().match(AVOID);
        if (avoid) { const names = list(avoid[1]); if (names.length) body.avoid.push(...names); else body.empty.push("an _Avoid_ line"); continue; }
        kept.push(line);
    }
    body.definition = kept.join("\n").trim();
    return body;
}

// A glossary's text as a model: its title, the prose under it, and its terms in file order, each
// with the line it starts on, its aliases, the words it avoids, its definition and a slug no other
// term in the file has. `section` reads one section of a file that holds more than a glossary.
// Nothing here judges: a term with no definition is still a term, and check() is what objects.
function parse(text, { section } = {}) {
    const lines = text.split(/\r?\n/);
    const first = lines.findIndex(l => l.trim() !== "");
    const h1 = first >= 0 && lines[first].match(/^#\s+(.+?)\s*#*\s*$/);
    const { from, to, depth } = sliceOf(lines, section);
    const start = section ? from : (h1 ? first + 1 : 0);

    // Which lines start something: a heading, or a bold entry. Fenced code starts nothing.
    const marks = [];
    let fenced = false;
    for (let i = start; i < to; i++) {
        if (FENCE.test(lines[i])) { fenced = !fenced; continue; }
        if (fenced) continue;
        const h = lines[i].match(HEADING), b = lines[i].match(BOLD);
        if (h && h[1].length > depth) marks.push({ at: i, level: h[1].length, name: h[2] });
        else if (b) marks.push({ at: i, bold: true, name: b[1].trim(), rest: b[2] });
    }
    const bold = marks.some(m => m.bold);
    const description = lines.slice(start, marks.length ? marks[0].at : to).join("\n").trim();

    const terms = [], slugs = new Map();
    marks.forEach((mark, n) => {
        const next = marks[n + 1];
        const body = bodyOf([...(mark.bold && mark.rest ? [mark.rest] : []), ...lines.slice(mark.at + 1, next ? next.at : to)]);
        if (bold ? !mark.bold : !body.definition && next && next.level > mark.level) return;   // a group, not a term
        const slug = slugOf(mark.name), seen = slugs.get(slug) || 0;
        slugs.set(slug, seen + 1);
        const term = { term: mark.name, line: mark.at + 1, aliases: body.aliases, avoid: body.avoid, definition: body.definition, empty: body.empty, slug: seen ? `${slug}-${seen + 1}` : slug };
        terms.push({ ...term, names: namesOf(term) });
    });
    return { title: h1 ? h1[1] : "", description, format: !terms.length ? null : bold ? "bold" : "headings", terms };
}

// The whole decision: a glossary's text, and the name to report it under. Returns the rules it broke
// and the line to print when it broke none. `root` is taken for the shape every check here shares;
// nothing in a glossary resolves against the repo.
function check(text, root, file = FILE) {
    if (!text.trim()) return { problems: [], terms: 0, summary: `${file}: nothing to check` };
    const model = parse(text);
    const problems = [];
    if (!model.title) {
        const first = text.split(/\r?\n/).find(l => l.trim() !== "") || "";
        problems.push(`line 1: the file must open with a "# <title>" heading, not: ${first.trim()}`);
    }
    const defined = new Map();
    for (const term of model.terms) {
        const at = `line ${term.line}`;
        if (!term.definition) problems.push(`${at}: "${term.term}" has no definition. Say what it is on the lines under it.`);
        for (const what of term.empty) problems.push(`${at}: "${term.term}" has ${what} that names nothing`);
        // Only the names somebody wrote: the halves of `Short (Long form)` are derived, and two terms
        // may share one.
        for (const name of [term.term, ...term.aliases]) {
            const was = defined.get(key(name));
            if (was) problems.push(`${at}: "${name}" is already defined on line ${was}. One entry per name: merge them, or make one an alias of the other.`);
            else defined.set(key(name), term.line);
        }
        const both = term.avoid.filter(a => [term.term, ...term.aliases].some(n => key(n) === key(a)));
        if (both.length) problems.push(`${at}: "${both[0]}" is both a name of "${term.term}" and a word it avoids`);
    }
    return { problems, terms: model.terms.length, summary: `${file}: ${model.terms.length} term(s), all well formed` };
}

// The glossary a repo has, read through a repo view (scripts/repo-view.js): GLOSSARY.md's terms, then
// the ones CONTEXT.md still holds under `## Language` that GLOSSARY.md does not define. `dir` is the
// folder of one context in a repo that keeps several. null when the repo has neither file.
function read(view, dir = "") {
    const at = name => dir ? `${dir.replace(/\/+$/, "")}/${name}` : name;
    const own = view.isFile(at(FILE)) ? parse(view.read(at(FILE)) || "") : null;
    const context = view.isFile(at(CONTEXT)) ? parse(view.read(at(CONTEXT)) || "", { section: CONTEXT_SECTION }) : null;
    if (!own && !context) return null;
    const terms = own ? [...own.terms] : [];
    const taken = new Set(terms.flatMap(t => t.names.map(key)));
    const slugs = new Set(terms.map(t => t.slug));
    const legacy = [];
    for (const term of context ? context.terms : []) {
        if (term.names.some(n => taken.has(key(n)))) continue;
        let slug = term.slug;
        for (let n = 2; slugs.has(slug); n++) slug = `${term.slug}-${n}`;
        slugs.add(slug);
        legacy.push({ ...term, slug, file: at(CONTEXT) });
    }
    return {
        file: own ? at(FILE) : at(CONTEXT),
        title: (own || context).title,
        description: own ? own.description : "",
        terms: [...terms.map(t => ({ ...t, file: at(FILE) })), ...legacy],
        // How many terms are still where they were before the split, which the session brief says.
        legacy: legacy.length,
    };
}

module.exports = { check, parse, read, isGlossary, namesOf, FILE, CONTEXT };

// The glossary's text: stdin for "-", the path given, or else the root's GLOSSARY.md. A missing root
// GLOSSARY.md is an empty glossary, not an error. A path someone typed that is not there is a
// mistake, so it fails rather than passing as "nothing to check".
function readGlossary(given, root) {
    if (given === "-") return { text: lib.stdin(), file: FILE };
    if (given) {
        if (!fs.existsSync(given)) { console.error(`check-glossary: no such file: ${given}`); process.exit(2); }
        return { text: fs.readFileSync(given, "utf8"), file: path.relative(root, path.resolve(given)).split(path.sep).join("/") };
    }
    const file = path.join(root, FILE);
    return { text: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "", file: FILE };
}

if (require.main === module) {
    const root = lib.root();
    const { text, file } = readGlossary(lib.args().find(a => !a.startsWith("--")), root);

    const { problems, summary } = check(text, root, file);
    if (!problems.length) { console.log(summary); process.exit(0); }
    console.error(`\n${file} has ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\ndocs/agents/domain.md has the two formats. To commit anyway: git commit --no-verify\n`);
    process.exit(1);
}
