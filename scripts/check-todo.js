#!/usr/bin/env node
// scripts/check-todo.js
// Keeps TODO.md greppable, and valid against the todo-md standard (https://github.com/todo-md/todo-md):
// a `# TODO` header, one-line tasks starting `- [ ] `, metadata as `#tag` and `@user`, subtasks by
// indentation. The `loose-ends` skill records what has nowhere else to live -- a question nobody
// answered, an assumption taken on trust, work knowingly left -- and a ledger only pays for itself
// if every entry can be found by its tag.
// One rule departs from the standard on purpose. todo-md keeps finished work as `- [x]` done or
// `- [-]` declined; here a resolved entry is deleted in the commit that resolves it. Kept entries
// are noise every agent re-reads on every run, and the file's length stops meaning anything. An
// all-open file is still valid todo-md, so its tooling reads this one; it just never sees the other
// two states.
// Only checkbox lines are entries; every other line is prose the file is free to carry. It never
// asks for entries to exist: an empty ledger, or no TODO.md at all, is the honest state of a repo
// with nothing outstanding.
// Called by .githooks/pre-commit, which pipes the staged blob in, so the check sees what the commit
// will record rather than what is on disk. Reads a path instead when given one.
// check(text, root) is the decision, exported the way check-initialised.js and docs-check.js export
// theirs: text in, problems out, nothing printed and nothing exited. `root` is what a source that
// looks like a path is resolved against. The command line below is the only part that talks to a
// terminal.
// Usage:
//   git show :TODO.md | node scripts/check-todo.js
//   node scripts/check-todo.js TODO.md
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const TAGS = ["question", "assumption", "deferred"];
const HEADER = /^#\s+TODO\s*$/;
// `- [ ] text #tag (source)`, per todo-md. Indentation makes it a subtask of the entry above.
const BOX = /^(\s*)-\s\[([^\]])\]\s+(.*)$/;
const TAG = new RegExp(`(?:^|\\s)#(${TAGS.join("|")})(?=\\s|$)`);
const ANY_TAG = /(?:^|\s)#([A-Za-z][\w-]*)/g;
const SOURCE = /\(([^()]+)\)\s*$/;
// A source says where the entry came from, in the vocabulary AGENTS.md already gives the chain:
// a URL, a repo-relative path that exists, or jira:KEY-123, plus path:line for pointing at code.
const URL = /^https?:\/\/\S+$/;
const ISSUE = /^jira:[A-Z][A-Z0-9]+-\d+$/;

function badSource(src, root) {
    if (URL.test(src) || ISSUE.test(src)) return null;
    const file = src.replace(/:\d+(?:-\d+)?$/, "");
    if (/^[^\s:]/.test(file) && fs.existsSync(path.resolve(root, file))) return null;
    return `"${src}" is not a source: a URL, a repo-relative path that exists (optionally path:line), or jira:KEY-123`;
}

// The whole decision: the ledger's text, and the repo a source that looks like a path lives in.
// Returns the rules it broke and the line to print when it broke none.
function check(text, root) {
    if (!text.trim()) return { problems: [], entries: 0, summary: "TODO.md: nothing to check" };

    const lines = text.split(/\r?\n/);
    const problems = [];

    // todo-md opens every file with `# TODO`, which is what tells its tooling the file is one of these.
    const first = lines.find(l => l.trim() !== "");
    if (!HEADER.test(first || "")) {
        problems.push(`line 1: the file must open with "# TODO" (todo-md), not: ${(first || "").trim() || "(nothing)"}`);
    }

    let entries = 0;
    lines.forEach((line, i) => {
        const box = line.match(BOX);
        if (!box) return;
        const [, indent, state, body] = box;
        const at = `line ${i + 1}`;
        // Resolved means deleted, in the commit that resolves it, so the file holds only live work and
        // costs nothing to re-read. todo-md's `[x]` and `[-]` are the two states this ledger never keeps.
        if (state !== " ") {
            problems.push(`${at}: a "[${state}]" entry. Resolved and declined entries are deleted in the commit that settles them, not kept: ${line.trim()}`);
            return;
        }
        entries++;
        const unknown = [...body.matchAll(ANY_TAG)].map(m => m[1]).filter(t => !TAGS.includes(t));
        if (unknown.length) problems.push(`${at}: unknown tag #${unknown[0]}, expected one of ${TAGS.map(t => "#" + t).join(", ")}`);
        // A subtask inherits its parent's kind and origin, so only a top-level entry states them.
        if (indent) return;
        if (!TAG.test(body)) problems.push(`${at}: no kind. Add one of ${TAGS.map(t => "#" + t).join(", ")}:\n    ${line.trim()}`);
        const src = body.match(SOURCE);
        if (!src) { problems.push(`${at}: no source. End the line with one in brackets, such as (AGENTS.md):\n    ${line.trim()}`); return; }
        const bad = badSource(src[1], root);
        if (bad) problems.push(`${at}: ${bad}`);
    });

    return { problems, entries, summary: `TODO.md: ${entries} open item(s), all well formed` };
}

module.exports = { check, TAGS };

if (require.main === module) {
    const file = process.argv.slice(2).find(a => !a.startsWith("--"));
    // No ledger is the honest state of a repo with nothing outstanding, and the same answer as an
    // empty one. Throwing ENOENT at a path that is simply not there says "broken" about "nothing to
    // report".
    const text = file ? (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "") : lib.stdin();
    const root = lib.chdirRoot();

    const { problems, summary } = check(text, root);
    if (!problems.length) { console.log(summary); process.exit(0); }
    console.error(`\nTODO.md has ${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\nThe loose-ends skill has the format. To commit anyway: git commit --no-verify\n`);
    process.exit(1);
}
