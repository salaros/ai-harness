#!/usr/bin/env node
// scripts/check-staged-docs.js
// Runs the documentation chain check over what is about to be committed. Reads the staged paths on
// stdin, one per line, and does nothing unless one of them belongs to the chain (Markdown under
// docs/, AGENTS.md whose table defines the stages, or MEMORY.md whose Requirements line enters it).
// It checks the *index*, not the working tree: the commit records the staged content, so a document
// half-fixed on disk must not pass and a break staged without saving must not slip through. The
// staged chain is materialised into a temp directory with git checkout-index and thrown away after.
// Exit 1 with the problems listed blocks the commit; `git commit --no-verify` skips the hook.
// check(root, staged) is the decision, exported the way check-initialised.js and docs-check.js
// export theirs: the staged paths in, the problems out, nothing printed and nothing exited. Git
// runs in `root`, and the temp tree is created and removed inside the call.
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

// Which of the staged paths the chain covers. Exported because the pre-commit hook's whole reason
// for piping a list in is this filter, and it answers without touching git or the disk.
const inChain = staged => staged.filter(p => CHAIN.test(p));

// The chain as the commit will record it. A git command that fails is a warning rather than a
// problem: a hook that blocks a commit because it could not read the index is worse than one that
// lets the working-tree check downstream have the last word.
function check(root, staged) {
    const git = (args, opts) => spawnSync("git", args, { encoding: "utf8", cwd: root, ...opts });
    const touched = inChain(staged);
    const warnings = [];
    if (!touched.length) return { touched, problems: [], warnings, summary: "nothing staged from the documentation chain" };

    // ls-files gives the index's paths, checkout-index writes their staged blobs; both are -z, so a
    // path with a space or a quote survives.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "staged-docs-"));
    const prefix = tmp.split(path.sep).join("/") + "/";
    try {
        const list = git(["ls-files", "-z", "--cached", "--", "docs", "AGENTS.md", "MEMORY.md"]);
        if (list.status !== 0) { warnings.push(`git ls-files failed: ${list.stderr || ""}`); return { touched, problems: [], warnings, summary: "" }; }
        if (list.stdout) {
            const out = git(["checkout-index", "-z", "--stdin", `--prefix=${prefix}`], { input: list.stdout });
            if (out.status !== 0) { warnings.push(`git checkout-index failed: ${out.stderr || ""}`); return { touched, problems: [], warnings, summary: "" }; }
        }
        // Anything the commit does not carry is read from the checkout, so a repo that keeps AGENTS.md
        // or MEMORY.md untracked still gets a meaningful check rather than a confusing one.
        const staged_ = rel => fs.existsSync(path.join(tmp, rel)) ? path.join(tmp, rel) : path.join(root, rel);
        // The root stays the checkout even though the three paths point into the temp tree: a
        // "Derived from:" naming a repo-relative path means a path in the working tree, which the
        // staged blobs of docs/, AGENTS.md and MEMORY.md say nothing about.
        const { problems } = docsCheck.check(root, staged_("docs"), staged_("AGENTS.md"), staged_("MEMORY.md"));
        return {
            touched,
            // The temp tree is an implementation detail, so a problem names the repo-relative path.
            problems: problems.map(p => p.split(prefix).join("")),
            warnings,
            summary: `documentation chain: ${touched.length} staged file(s), no problems`,
        };
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

module.exports = { check, inChain, CHAIN };

if (require.main === module) {
    const root = lib.chdirRoot();
    const staged = lib.stdin().split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (process.argv.includes("--dry-run")) {
        const touched = inChain(staged);
        console.log(touched.length
            ? `would check the staged chain (${touched.length} file(s)): ${touched.join(" ")}`
            : "nothing staged from the documentation chain");
        process.exit(0);
    }

    const { problems, warnings, summary } = check(root, staged);
    for (const w of warnings) console.error(w);
    if (!problems.length) { if (summary) console.log(summary); process.exit(0); }
    console.error(`The staged documentation chain has ${problems.length} problem(s):\n`);
    console.error(problems.map(p => `  ${p}`).join("\n"));
    console.error("\nFix them (the docs-check skill repairs what this reports) and stage the fix.");
    console.error("To commit anyway: git commit --no-verify");
    process.exit(1);
}
