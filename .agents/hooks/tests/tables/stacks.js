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

    // --ignore-unknown skips a file prettier has no parser for and still exits 0, so a row listing an
    // extension it cannot read reported a clean gate over files nothing had checked: codecave.pro
    // carried .astro that way. The formats cell is the contract, the command trusts it, and an
    // extension with no parser has to fail loudly rather than be listed and skipped.
    const skipping = rows.filter(r => (r.format || "").includes("--ignore-unknown"));
    t.ok(!skipping.length, "no format command hides an unparseable file behind --ignore-unknown",
        skipping.map(r => `${r.stack}: ${r.format}`).join("\n"));

    // Which leaves the other half of ADR-0003: an extension prettier cannot parse on its own is
    // listed only where the scaffold leaves the project able to parse it. That takes two commands,
    // not one. Prettier 3 dropped plugin auto-discovery, so an installed plugin it has not been
    // told about is a plugin it never loads: `prettier --check Page.astro` answers "No parser
    // could be inferred" and the push is blocked over a file nothing could have formatted. The
    // scaffold installs the plugin and names it in the config, and both are asserted, because
    // either one alone leaves the extension listed and unparseable. The pairing runs the other
    // way too: a plugin no row formats anything for is weight in every scaffolded project, paid
    // for nothing.
    const PLUGINS = { "*.astro": "prettier-plugin-astro" };
    const unpaired = [];
    for (const r of rows.filter(r => (r.format || "").includes("prettier"))) {
        const listed = (r.formats || "").split(/\s+/).filter(Boolean), scaffold = r.scaffold || "";
        for (const [pattern, plugin] of Object.entries(PLUGINS)) {
            const wants = listed.includes(pattern);
            const steps = scaffold.split("&&").map(s => s.trim());
            const installs = steps.some(s => /\b(?:install|add)\b/.test(s) && s.split(/\s+/).includes(plugin));
            const declares = steps.some(s => s.includes("prettier.plugins") && s.includes(plugin));
            if (wants && !installs) unpaired.push(`${r.stack}: formats ${pattern} and its scaffold does not install ${plugin}`);
            if (wants && !declares) unpaired.push(`${r.stack}: formats ${pattern} and its scaffold never names ${plugin} in the prettier config, so prettier will not load it`);
            if (installs && !wants) unpaired.push(`${r.stack}: scaffolds ${plugin} and formats nothing that needs it`);
        }
    }
    t.ok(!unpaired.length, "an extension needing a prettier plugin is listed only where the scaffold installs and configures it",
        unpaired.join("\n"));
};
