// .agents/hooks/tests/tables/format.js
// scripts/format-changed.js's own decisions: how the changed files are cut into command lines the
// shell will accept, and what a run that could not start is reported as. The formatters themselves
// are somebody else's program and are not run here; cases.tsv covers the script end to end.
const path = require("path");

const SKIP = "scripts/format-changed.js is the upstream's own, not installed here";
const TEMPLATE = "npx --no-install prettier --check {files}";

function formatChanged() {
    try { return require(path.join(__dirname, "..", "..", "..", "..", "scripts", "format-changed.js")); }
    catch { return null; }
}

// cmd.exe refuses a command line over 8191 characters and fails before the formatter starts, naming
// no file. A push of a few hundred files passed that length and the failure was reported as "not
// formatted", blocking a push whose files were fine. Every batch has to fit, and no file may be lost
// between them.
function batchesFitTheCommandLine(t) {
    const fmt = formatChanged();
    if (!fmt) { t.skip(`batches: ${SKIP}`); return; }
    const files = Array.from({ length: 338 }, (_, i) => `src/components/some/deep/path/component-${i}.astro`);
    const groups = fmt.batches(TEMPLATE, files);
    const longest = Math.max(...groups.map(g => fmt.fill(TEMPLATE, g).length));
    t.ok(groups.length > 1 && longest <= fmt.LIMIT, "batches: a push of 338 files is cut into command lines that fit", `${groups.length} batch(es), longest ${longest} of ${fmt.LIMIT}`);
    t.ok(groups.flat().join("\n") === files.join("\n"), "batches: every file is checked, once, in order", `${groups.flat().length} of ${files.length}`);
    t.ok(fmt.batches(TEMPLATE, ["a.ts"]).length === 1 && fmt.batches(TEMPLATE, []).length === 0,
        "batches: one file is one batch and no files is no batch", "");
    // The template is part of the command, so a long one leaves less room for paths.
    const long = `${"x".repeat(200)} {files}`;
    t.ok(Math.max(...fmt.batches(long, files).map(g => fmt.fill(long, g).length)) <= fmt.LIMIT,
        "batches: the command's own length is counted against the limit", "");
    // A limit smaller than one path still yields that path: one file alone is the shell's problem,
    // and CANNOT_RUN reports it as such rather than as a verdict on the file.
    t.ok(fmt.batches(TEMPLATE, ["a.ts", "b.ts"], TEMPLATE.length).length === 2,
        "batches: a file too long for any command line is still its own batch", "");
}

// A formatter that could not run must never be reported as a formatter that found something.
function aRunThatCouldNotStartIsNotAVerdict(t) {
    const fmt = formatChanged();
    if (!fmt) { t.skip(`cannot run: ${SKIP}`); return; }
    const cases = [
        ["The command line is too long.", "one file fills a whole command line"],
        ["/bin/sh: 1: Argument list too long", "one file fills a whole command line"],
        ["'prettier' is not recognized as an internal or external command", "the tool is not installed"],
        ["MSBUILD : error MSB1003: no project or solution file was found", "the stack has no project file here"],
        ["src/a.ts\nsrc/b.ts", null],
    ];
    for (const [output, why] of cases)
        t.ok(fmt.cannotRun(output) === why, `cannot run: ${why || "a list of files is a verdict, not a failure"}`, `${output.split("\n")[0]} -> ${fmt.cannotRun(output)}`);
}

// One verdict from the batches of one alternative: misformatted if any batch said so, and the output
// is what those batches said. A batch that passed has nothing to add.
function batchVerdictsCombineIntoOne(t) {
    const fmt = formatChanged();
    if (!fmt) { t.skip(`combine: ${SKIP}`); return; }
    t.ok(fmt.combine([{ status: 0, output: "" }, { status: 0, output: "" }]).status === 0,
        "combine: every batch clean is a clean run", "");
    const bad = fmt.combine([{ status: 0, output: "" }, { status: 1, output: "a.ts" }, { status: 1, output: "b.ts" }]);
    t.ok(bad.status === 1 && bad.output === "a.ts\nb.ts", "combine: the failing batches' output is what the run reports", JSON.stringify(bad));
    t.ok(fmt.combine([]).status === 0, "combine: no batches is nothing to report", "");
}

module.exports = [
    batchesFitTheCommandLine,
    aRunThatCouldNotStartIsNotAVerdict,
    batchVerdictsCombineIntoOne,
];
