#!/usr/bin/env node
// scripts/stacks.js
// The one reader of scripts/stacks.tsv. Every row is a stack and every column is what this repo
// does with it: which files say the stack is present, what restores it after a merge, what
// scaffolds it, and what format-checks it.
// It exists because two scripts read the table by position -- `[stack, triggers, needs, restore]`
// in one, `[stack, , needs, , , formats, format]` in the other -- and a column added in the middle
// would have silently shifted the second one's idea of which cell is which. A row is a named
// object here, so a new column is a new name and nothing moves.
// The pattern matcher is here for the same reason: both scripts had their own copy of it, one
// character apart from each other, and both call it the same thing.
// Commands in the table run through the OS shell, and a format cell may list fallbacks separated
// by " ?? " -- that is this repo's syntax, not the shell's, and format-changed.js tries them in
// order until one's tool is installed.
// Run it directly to see what the table says about this repo, or to print a row's scaffold with its
// placeholders filled in, the way project-init hands it to the developer:
//   node scripts/stacks.js
//   node scripts/stacks.js scaffold <stack> --name=<Name> [--template=<template>]
// Usage: const stacks = require("./stacks");  stacks.rows(root), stacks.parse(text), stacks.active(root), stacks.select(...), stacks.scaffold(row, vars)
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const FILE = "scripts/stacks.tsv";
// The columns, in the order the file writes them. A row is read into these names, so a script asks
// for `row.format` rather than counting commas, and adding a column at the end costs nothing.
const COLUMNS = ["stack", "triggers", "needs", "restore", "scaffold", "formats", "format", "runner"];
// A cell nobody filled in. The table writes "-" so the column stays visible; a reader wants null.
const cell = value => (value === undefined || value === "" || value === "-") ? null : value;

// Every row of the table, as objects: parse() from the table's text, for a caller that already
// holds it (an invariant reading through a repo-view), and rows() from the repo the table belongs to.
const parse = text => lib.parseTsv(text).map(cells => {
    const row = {};
    COLUMNS.forEach((name, i) => { row[name] = cell(cells[i]); });
    return row;
});
function rows(root) {
    const file = path.resolve(root, FILE);
    if (!fs.existsSync(file)) return [];
    return parse(fs.readFileSync(file, "utf8"));
}

// The rows that apply to this repo. A row's "needs" file is what says the stack is really here, so
// a .NET repo never invokes prettier and a Node repo never invokes dotnet format; a row with no
// "needs" applies everywhere.
const active = root => rows(root).filter(r => !r.needs || fs.existsSync(path.resolve(root, r.needs)));

// A pattern matches a path by its full repo-relative form or by its basename, and `*` matches
// anything within one name (never across a `/`). One definition, because two scripts compare the
// same patterns against the same paths and a difference between them would be a bug nobody could
// see: `*.cs` must mean the same thing when deciding to restore as when deciding to format.
const toRe = pattern => new RegExp(`^${pattern.split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
const patternsOf = patterns => (patterns || "").split(" ").filter(Boolean).map(toRe);

// The paths that match, and whether any did.
const select = (patterns, paths) => {
    const res = patternsOf(patterns);
    return paths.filter(p => res.some(re => re.test(p) || re.test(path.posix.basename(p))));
};
const matches = (patterns, paths) => select(patterns, paths).length > 0;

// A row's scaffold with its placeholders filled in: {Name} the PascalCase project name, {name} its
// kebab-case form, {template} the unit type's template the project-init skill chooses. One
// substitution, so the skill and the workflow that runs every row hand the shell the same line.
const kebab = name => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[\s_]+/g, "-").toLowerCase();
const scaffold = (row, { Name, template = "" }) => row.scaffold
    ? row.scaffold.replace(/\{Name\}/g, Name).replace(/\{name\}/g, kebab(Name)).replace(/\{template\}/g, template)
    : null;

module.exports = { rows, parse, active, select, matches, toRe, scaffold, kebab, COLUMNS, FILE };

if (require.main === module) {
    const argv = lib.args();
    if (argv[0] === "scaffold") {
        const value = flag => { const a = argv.find(x => x.startsWith(`${flag}=`)); return a ? a.slice(flag.length + 1) : null; };
        const row = rows(lib.root()).find(r => r.stack === argv[1]);
        if (!row) { console.error(`stacks: no row named ${argv[1] || "(none)"} in ${FILE}`); process.exit(2); }
        if (!value("--name")) { console.error("stacks: --name=<Name> is required, the PascalCase project name"); process.exit(2); }
        const line = scaffold(row, { Name: value("--name"), template: value("--template") || "" });
        if (!line) { console.error(`stacks: the ${row.stack} row has no scaffold`); process.exit(1); }
        console.log(line);
        process.exit(0);
    }
    const root = lib.chdirRoot();
    const here = new Set(active(root).map(r => r.stack));
    for (const row of rows(root)) {
        const has = here.has(row.stack) ? "here" : `needs ${row.needs}`;
        console.log(`${row.stack}\t${has}\trestore: ${row.restore || "-"}\tformat: ${row.format || "-"}`);
    }
    console.log(`${FILE}: ${rows(root).length} stack(s), ${here.size} present in this repo`);
}
