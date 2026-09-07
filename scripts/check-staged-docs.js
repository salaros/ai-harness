#!/usr/bin/env node
// scripts/check-staged-docs.js
// Runs the documentation chain check over what is about to be committed. Reads the staged paths on
// stdin, one per line, and does nothing unless one of them belongs to the chain (Markdown under
// docs/, AGENTS.md whose table defines the stages, or MEMORY.md whose Requirements line enters it).
// It checks the *index*, not the working tree: the commit records the staged content, so a document
// half-fixed on disk must not pass and a break staged without saving must not slip through. The
// staged chain is materialised into a temp directory with git checkout-index and thrown away after.
// Exit 1 with the problems listed blocks the commit; `git commit --no-verify` skips the hook.
// Called by .githooks/pre-commit. To try the decision by hand:
//   printf 'docs/brd/0001-x.md\n' | node scripts/check-staged-docs.js --dry-run
// Usage: node scripts/check-staged-docs.js [--dry-run]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const lib = require("./lib");
const docsCheck = require("./docs-check");

const CHAIN = /^(?:docs\/.*\.md|AGENTS\.md|MEMORY\.md)$/;
const git = (args, opts) => spawnSync("git", args, { encoding: "utf8", ...opts });

const root = lib.chdirRoot();
const dryRun = process.argv.includes("--dry-run");
const staged = lib.stdin().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const touched = staged.filter(p => CHAIN.test(p));

if (!touched.length) {
    console.log("nothing staged from the documentation chain");
    process.exit(0);
}
if (dryRun) {
    console.log(`would check the staged chain (${touched.length} file(s)): ${touched.join(" ")}`);
    process.exit(0);
}

// The chain as the commit will record it. ls-files gives the index's paths, checkout-index writes
// their staged blobs; both are -z, so a path with a space or a quote survives.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "staged-docs-"));
const prefix = tmp.split(path.sep).join("/") + "/";
try {
    const list = git(["ls-files", "-z", "--cached", "--", "docs", "AGENTS.md", "MEMORY.md"]);
    if (list.status !== 0) { console.error(`git ls-files failed: ${list.stderr || ""}`); process.exit(0); }
    if (list.stdout) {
        const out = git(["checkout-index", "-z", "--stdin", `--prefix=${prefix}`], { input: list.stdout });
        if (out.status !== 0) { console.error(`git checkout-index failed: ${out.stderr || ""}`); process.exit(0); }
    }
    // Anything the commit does not carry is read from the checkout, so a repo that keeps AGENTS.md
    // or MEMORY.md untracked still gets a meaningful check rather than a confusing one.
    const staged_ = rel => fs.existsSync(path.join(tmp, rel)) ? path.join(tmp, rel) : path.join(root, rel);
    // The root stays the checkout even though the three paths point into the temp tree: a
    // "Derived from:" naming a repo-relative path means a path in the working tree, which the
    // staged blobs of docs/, AGENTS.md and MEMORY.md say nothing about.
    const { problems } = docsCheck.check(root, staged_("docs"), staged_("AGENTS.md"), staged_("MEMORY.md"));
    if (problems.length) {
        console.error(`The staged documentation chain has ${problems.length} problem(s):\n`);
        console.error(problems.map(p => `  ${p.split(tmp.split(path.sep).join("/") + "/").join("")}`).join("\n"));
        console.error("\nFix them (the docs-check skill repairs what this reports) and stage the fix.");
        console.error("To commit anyway: git commit --no-verify");
        process.exit(1);
    }
    console.log(`documentation chain: ${touched.length} staged file(s), no problems`);
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}
