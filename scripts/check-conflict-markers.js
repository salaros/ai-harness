#!/usr/bin/env node
// scripts/check-conflict-markers.js
// Refuses a commit that records a merge conflict nobody resolved: an added line that opens with
// `<<<<<<< `. Every conflict Git writes has one, so it alone is enough; `=======` is left out
// because a Markdown heading underlined with exactly seven equals signs is the same line, and
// `>>>>>>> ` never appears without the opening marker above it.
// Git already finds markers -- `git diff --cached --check` names each a "leftover conflict marker"
// by file and line -- so this keeps the reports whose staged line is an opening marker and drops
// the rest, whitespace errors included, which are the formatter's business, not a merge's.
// Only lines the commit adds count. A marker already committed blocks nothing until its line is
// edited, and a file that has to carry markers, such as a fixture about merges, sets a longer marker
// for its path in .gitattributes (`conflict-marker-size=32`), after which Git stops matching seven.
// It runs at pre-commit rather than pre-push: a marker caught before the commit is fixed by editing
// the file, and one caught at push is already in history.
// check(root) is the decision, exported the way check-staged-docs.js exports its own: git runs in
// `root`, the problems come out, nothing is printed and nothing exited. A git that cannot answer is a
// warning, not a problem, for the reason check-staged-docs.js gives.
// Usage: node scripts/check-conflict-markers.js
const lib = require("./lib");
const repoView = require("./repo-view");

const MARKER = /^(.+):(\d+): leftover conflict marker$/;
// --check says where a marker is but not which one, so the staged line is read to tell.
const OPENING = /^</;

function check(root) {
    const diff = lib.run("git", ["-c", "core.quotePath=false", "diff", "--cached", "--check", "--no-color"], { cwd: root });
    const found = diff.output.split(/\r?\n/).map(l => l.match(MARKER)).filter(Boolean);
    const blobs = {};
    const blob = file => blobs[file] ??= (repoView.index(root, [file]).read(file) || "").split(/\r?\n/);
    const problems = found.filter(([, file, line]) => OPENING.test(blob(file)[line - 1] || ""))
        .map(([, file, line]) => `${file}:${line}: a conflict marker is staged; resolve the merge and stage the file again`);
    // --check exits 2 for a whitespace error alone, and 128 or so when git itself fails.
    const warnings = diff.status > 2 ? [`could not check for conflict markers: ${diff.output.split(/\r?\n/)[0]}`] : [];
    return { problems, warnings, summary: problems.length ? "" : "conflict markers: none staged" };
}

module.exports = { check };

if (require.main === module) {
    const { problems, warnings, summary } = check(lib.root());
    for (const w of warnings) console.error(w);
    if (!problems.length) { console.log(summary); process.exit(0); }
    console.error(`\n${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\nTo commit anyway: git commit --no-verify\n`);
    process.exit(1);
}
