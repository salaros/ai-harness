// .agents/hooks/tests/tables/stacks.js
// scripts/stacks.tsv as scripts/stacks.js reads it. Two readers taking a row apart by position is
// how the second came to be written `[stack, , needs, , , formats, format]`: correct, unreadable,
// and wrong the moment a column moved. That only one file reads the table is asserted in
// scripts/check-harness.js, where it travels to a target; what is pinned here is what the reader
// gives its callers.
const fs = require("fs");
const path = require("path");
const lib = require("../../lib");

exports.stacksTableDecisions = function stacksTableDecisions(t) {
    const table = path.join(lib.checkout, "scripts", "stacks.tsv");
    if (!fs.existsSync(table) || !fs.existsSync(path.join(lib.checkout, "scripts", "stacks.js"))) {
        t.skip("stacks table: no table or no reader here"); return;
    }
    const stacks = require("../../../../scripts/stacks.js");
    const rows = stacks.rows(lib.checkout);
    t.ok(rows.length > 0, "scripts/stacks.tsv holds rows");
    // A row with no triggers is scaffold-only (dotnet-aspire): nothing restores or formats through it,
    // so it must at least scaffold, or it is a row that does nothing at all.
    const idle = r => !r.stack || (!r.triggers && !r.scaffold);
    t.ok(!rows.some(idle), "every row names a stack and what triggers it, or only scaffolds",
        rows.filter(idle).map(r => JSON.stringify(r)).join("\n"));
    t.ok(rows.filter(r => !r.triggers).every(r => !r.restore && !r.formats && !r.format),
        "a scaffold-only row restores and formats nothing, since no file can trigger it",
        rows.filter(r => !r.triggers && (r.restore || r.formats || r.format)).map(r => r.stack).join(", "));

    // A row short of a cell is the same failure from the table's side, so the width is asserted too.
    const wide = fs.readFileSync(table, "utf8").split(/\r?\n/)
        .filter(l => l.trim() && !l.startsWith("#"))
        .filter(l => l.split("\t").length !== stacks.COLUMNS.length);
    t.ok(!wide.length, `every row has ${stacks.COLUMNS.length} cells`, wide.map(l => l.split("\t")[0]).join(", "));

    // A pattern matches by path or basename and never across a directory separator, which is what
    // both callers rely on: *.cs must not claim a folder called "a.cs/b".
    t.ok(stacks.matches("*.cs", ["src/App/Program.cs"]), "a pattern matches by basename");
    t.ok(stacks.matches("package-lock.json", ["package-lock.json"]), "a pattern matches by path");
    t.ok(!stacks.matches("*.cs", ["a.cs/b.txt"]), "a pattern does not match across a directory separator");
};
