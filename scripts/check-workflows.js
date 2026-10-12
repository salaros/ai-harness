#!/usr/bin/env node
// scripts/check-workflows.js
// Lints the GitHub Actions workflows a commit stages, with actionlint. GitHub parses a workflow
// before it runs anything, and one it cannot parse -- a `runner` context in a job's env, a step
// with two `uses` -- produces a run with no jobs, no check run and no annotation, so `gh` reports
// nothing and only the run page says "Invalid workflow file". That cost a push and a dead run once;
// actionlint says the same thing in milliseconds, before the commit.
// actionlint is not required. A clone without it gets one notice line and the rest of pre-commit
// decides, because a hook that blocked every commit on a tool nobody installed would be skipped with
// --no-verify and teach nothing; the harness workflow runs the same lint on every push, so the gap
// is a push, not a release. https://github.com/rhysd/actionlint has the installers.
// A workflow is judged as the commit records it, like the ledger and the glossary: the staged blobs
// are written under a temp directory at their own paths and actionlint runs there, so a change
// staged in part is linted as staged and the report names the file as the repo does.
// check(root, files, { run }) is the decision, in the shape every pre-commit check returns: `files`
// are the staged paths, `run` is lib.run unless a test hands in its own actionlint.
// Usage: node scripts/check-workflows.js <file>...     (paths relative to the root; non-workflows are ignored)
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./lib");
const repoView = require("./repo-view");

const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const isWorkflow = file => WORKFLOW.test(file);
// One -oneline report: path, line, column, message.
const REPORT = /^\S.*?:\d+:\d+: /;

function check(root, files, { run = lib.run } = {}) {
    const workflows = files.filter(isWorkflow);
    let blobs = [];
    try {
        const index = repoView.index(root, workflows);
        blobs = workflows.map(file => [file, index.read(file)]).filter(([, text]) => text !== null);
    } catch { /* no index to read: nothing staged */ }
    if (!blobs.length) return { problems: [], warnings: [], summary: "no workflow staged" };

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-workflows-"));
    try {
        for (const [file, text] of blobs) {
            fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
            fs.writeFileSync(path.join(dir, file), text);
        }
        const r = run("actionlint", ["-no-color", "-oneline", ...blobs.map(([file]) => file)], { cwd: dir });
        if (r.status === -1) {
            return { problems: [], summary: "", warnings: [
                `actionlint is not installed, so ${blobs.length} staged workflow(s) are not linted here; the harness workflow lints them on push (${r.output.split(/\r?\n/)[0]})`,
            ] };
        }
        if (r.status === 0) return { problems: [], warnings: [], summary: `workflows: ${blobs.length} staged file(s) pass actionlint` };
        const problems = r.output.split(/\r?\n/).filter(l => REPORT.test(l));
        if (!problems.length) problems.push(`actionlint exited ${r.status}: ${r.output.split(/\r?\n/)[0] || "(no output)"}`);
        return { problems, warnings: [], summary: "" };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

module.exports = { check, isWorkflow };

if (require.main === module) {
    const { problems, warnings, summary } = check(lib.root(), lib.args());
    for (const w of warnings) console.error(w);
    if (!problems.length) { console.log(summary); process.exit(0); }
    console.error(`\n${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\nTo commit anyway: git commit --no-verify\n`);
    process.exit(1);
}
