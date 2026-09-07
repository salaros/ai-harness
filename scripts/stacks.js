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
// Run it directly to see what the table says about this repo:
//   node scripts/stacks.js
// Usage: const stacks = require("./stacks");  stacks.rows(root), stacks.active(root), stacks.select(...)
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const FILE = "scripts/stacks.tsv";
// The columns, in the order the file writes them. A row is read into these names, so a script asks
// for `row.format` rather than counting commas, and adding a column at the end costs nothing.
const COLUMNS = ["stack", "triggers", "needs", "restore", "scaffold", "formats", "format"];
// A cell nobody filled in. The table writes "-" so the column stays visible; a reader wants null.
const cell = value => (value === undefined || value === "" || value === "-") ? null : value;

// Every row of the table, as objects. `root` is the repo the table belongs to.
function rows(root) {
    const file = path.resolve(root, FILE);
    if (!fs.existsSync(file)) return [];
    return lib.readTsv(file).map(cells => {
        const row = {};
        COLUMNS.forEach((name, i) => { row[name] = cell(cells[i]); });
        return row;
    });
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

module.exports = { rows, active, select, matches, toRe, COLUMNS, FILE };

if (require.main === module) {
    const root = lib.chdirRoot();
    const here = new Set(active(root).map(r => r.stack));
    for (const row of rows(root)) {
        const has = here.has(row.stack) ? "here" : `needs ${row.needs}`;
        console.log(`${row.stack}\t${has}\trestore: ${row.restore || "-"}\tformat: ${row.format || "-"}`);
    }
    console.log(`${FILE}: ${rows(root).length} stack(s), ${here.size} present in this repo`);
}
