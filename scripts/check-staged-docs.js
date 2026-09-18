#!/usr/bin/env node
// scripts/check-staged-docs.js
// Runs the documentation chain check over what is about to be committed. Reads the staged paths on
// stdin, one per line, and does nothing unless one of them belongs to the chain (Markdown under
// docs/, AGENTS.md whose table defines the stages, MEMORY.md whose Requirements line enters it, or
// INTENT.md, whose required sections docs-check verifies when a project has one).
// It checks the *index*, not the working tree: the commit records the staged content, so a document
// half-fixed on disk must not pass and a break staged without saving must not slip through. The
// chain is read through a staged view (scripts/repo-view.js), which answers the chain's paths from
// the index and everything else, the sources a document cites, from the working tree.
// Exit 1 with the problems listed blocks the commit; `git commit --no-verify` skips the hook.
// check(root, staged) is the decision, exported the way check-initialised.js and docs-check.js
// export theirs: the staged paths in, the problems out, nothing printed and nothing exited. Git
// runs in `root`, and nothing is written.
// Called by .githooks/pre-commit. To try the decision by hand:
//   printf 'docs/brd/0001-x.md\n' | node scripts/check-staged-docs.js --dry-run
// Usage: node scripts/check-staged-docs.js [--dry-run]
const lib = require("./lib");
const docsCheck = require("./docs-check");
const repoView = require("./repo-view");

// Which of the staged paths the chain covers, by docs-check's membership rule, the one the edit hook
// asks too. Exported because the pre-commit hook's whole reason for piping a list in is this filter,
// and it answers without touching git or the disk.
const chainFiles = staged => staged.filter(docsCheck.inChain);

// The chain as the commit will record it. A git command that fails is a warning rather than a
// problem: a hook that blocks a commit because it could not read the index is worse than one that
// lets the working-tree check downstream have the last word.
function check(root, staged) {
    const touched = chainFiles(staged);
    const warnings = [];
    if (!touched.length) return { touched, problems: [], warnings, summary: "nothing staged from the documentation chain" };
    let problems;
    try {
        ({ problems } = docsCheck.check(root, repoView.staged(root, docsCheck.CHAIN_PATHS)));
    } catch (e) {
        warnings.push(`could not read the staged documentation chain: ${e.message}`);
        return { touched, problems: [], warnings, summary: "" };
    }
    return { touched, problems, warnings, summary: `documentation chain: ${touched.length} staged file(s), no problems` };
}

module.exports = { check, chainFiles };

if (require.main === module) {
    const root = lib.chdirRoot();
    const staged = lib.stdin().split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (process.argv.includes("--dry-run")) {
        const touched = chainFiles(staged);
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
