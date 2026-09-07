#!/usr/bin/env node
// scripts/githook.js
// What each Git hook decides. `.githooks/<name>` is a wrapper of two lines -- change to the repo
// root, call this with its own name and whatever Git passed it -- so the shell chooses nothing and
// every hook is one Node entry point the suite can drive.
// It was not always so. The shell read the index (`git show :TODO.md`), computed the merge diff
// (`git diff-tree ORIG_HEAD HEAD`), decided a hook was being run by hand (`[ -n "$GIT_DIR" ]`) and
// chained checks with `||`, each in a file no test could reach, each written twice in slightly
// different words. One of those differences was a bug: a TODO.md that was never committed piped
// nothing into the checker, which reported "nothing to check" and passed.
// Every hook is a local courtesy, not a wall: `--no-verify` skips them, and they run at all only
// after `node scripts/githooks-init.js`.
// Usage:
//   node scripts/githook.js pre-commit
//   node scripts/githook.js commit-msg <message-file>
//   node scripts/githook.js pre-push               (ref updates on stdin, as Git gives the hook)
//   node scripts/githook.js post-merge
//   node scripts/githook.js <name> --dry-run       say what it would check, run nothing, exit 0
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const initialised = require("./check-initialised");
const commitMsg = require("./check-commit-msg");
const todo = require("./check-todo");
const stagedDocs = require("./check-staged-docs");

const TODO = "TODO.md";

// Reporting, in the shape every check here already returns: problems block, warnings do not.
function report(root, { problems = [], warnings = [], summary = "" }, help) {
    for (const w of warnings) console.error(w);
    if (!problems.length) { if (summary) console.log(summary); return 0; }
    console.error(`\n${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  ${p}`);
    if (help) console.error(`\n${help}`);
    return 1;
}

// The blob Git holds for a path, or null when the index has none. `git show :<path>` writes the
// staged content to stdout and fails when the path is not in the index, which is the distinction
// the shell threw away by sending both down the same pipe.
function staged(root, file) {
    const r = lib.run("git", ["show", `:${file}`], { cwd: root });
    return r.status === 0 ? r.output : null;
}

const lines = text => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

// Before a commit lands: refuse an unconfigured clone, check the loose-ends ledger, check the
// documentation chain as the commit will record it.
function preCommit(root, { dry }) {
    const gate = initialised.check(root);
    const stagedTodo = staged(root, TODO);
    const onDisk = fs.existsSync(path.join(root, TODO));
    const changed = lib.run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRD"], { cwd: root });
    const touched = stagedDocs.inChain(lines(changed.output));

    if (dry) {
        console.log(`project: ${gate.reason}`);
        console.log(stagedTodo !== null ? `would check the staged ${TODO}`
            : onDisk ? `would check the unstaged ${TODO} and warn about what it finds`
            : `no ${TODO} to check`);
        console.log(touched.length ? `would check the staged chain (${touched.length} file(s)): ${touched.join(" ")}`
            : "nothing staged from the documentation chain");
        return 0;
    }

    if (!gate.ok) { initialised.explain("commit", gate); return 1; }
    console.log(`project: ${gate.reason}`);

    // The ledger the commit records blocks it. A TODO.md nobody has staged records nothing, so a
    // problem in it is a warning: it is still this repo's ledger and still worth saying, but it is
    // not what the commit is about. Sending both through the same pipe is how an untracked one came
    // to be checked as an empty file and passed.
    if (stagedTodo !== null) {
        if (report(root, todo.check(stagedTodo, root), "The loose-ends skill has the format. To commit anyway: git commit --no-verify")) return 1;
    } else if (onDisk) {
        const r = todo.check(fs.readFileSync(path.join(root, TODO), "utf8"), root);
        for (const p of r.problems) console.error(`${TODO} (not staged): ${p}`);
        if (!r.problems.length) console.log(`${TODO}: ${r.summary.replace(/^TODO\.md: /, "")}, not staged`);
    } else {
        console.log(`${TODO}: nothing to check`);
    }

    if (changed.status !== 0) console.error(`git diff --cached failed: ${changed.output}`);
    return report(root, stagedDocs.check(root, lines(changed.output)),
        "Fix them (the docs-check skill repairs what this reports) and stage the fix.\nTo commit anyway: git commit --no-verify");
}

// Git passes the path of the message file. It is read here rather than piped by the shell so the
// checker sees the file Git wrote, comments, scissors line and all.
function commitMessage(root, args, { dry }) {
    const file = args.find(a => !a.startsWith("--"));
    if (!file) { console.error("commit-msg: Git passes the message file as an argument; none was given"); return 1; }
    if (dry) { console.log(`would check the commit message in ${file}`); return 0; }
    return report(root, commitMsg.check(fs.readFileSync(file, "utf8"), root),
        "Rewrite it, or commit anyway with: git commit --no-verify");
}

// Before commits leave this machine: refuse an unconfigured clone, then check that what they
// publish is formatted. Git gives a pre-push hook the ref updates on stdin, which format-changed
// turns into paths.
function prePush(root, { dry }) {
    const gate = initialised.check(root);
    if (dry) { console.log(`project: ${gate.reason}`); console.log("would format-check what the push carries"); return 0; }
    if (!gate.ok) { initialised.explain("push", gate); return 1; }
    console.log(`project: ${gate.reason}`);
    const r = lib.node([path.join(root, "scripts", "format-changed.js"), "--push"], { cwd: root, input: lib.stdin(), stdio: ["pipe", "inherit", "inherit"] });
    return r.status === 0 ? 0 : 1;
}

// After a merge or a pull, restore whatever the changed manifests call for. ORIG_HEAD is what Git
// sets to the commit the merge moved away from, so it exists during this hook and generally does
// not otherwise: a missing one means this was run by hand, and there is no merge to react to.
function postMerge(root, { dry }) {
    const has = lib.run("git", ["rev-parse", "--verify", "--quiet", "ORIG_HEAD"], { cwd: root }).status === 0;
    if (!has) {
        console.error("post-merge: no ORIG_HEAD, so there is no merge to react to. Git sets it during a merge or a pull.");
        return dry ? 0 : 1;
    }
    const diff = lib.run("git", ["diff-tree", "-r", "--name-only", "--no-commit-id", "ORIG_HEAD", "HEAD"], { cwd: root });
    if (diff.status !== 0) { console.error(`git diff-tree failed: ${diff.output}`); return 1; }
    const args = [path.join(root, "scripts", "on-manifest-change.js"), ...(dry ? ["--dry-run"] : [])];
    const r = lib.node(args, { cwd: root, input: diff.output + "\n", stdio: ["pipe", "inherit", "inherit"] });
    return r.status === 0 ? 0 : 1;
}

const HOOKS = {
    "pre-commit": (root, args, opts) => preCommit(root, opts),
    "commit-msg": commitMessage,
    "pre-push": (root, args, opts) => prePush(root, opts),
    "post-merge": (root, args, opts) => postMerge(root, opts),
};

module.exports = { HOOKS, preCommit, commitMessage, prePush, postMerge };

if (require.main === module) {
    // Git's arguments are paths relative to wherever it ran the hook, so they are made absolute
    // before the chdir below moves the working directory to the repo root. This is why the wrappers
    // need no path handling of their own: they pass what Git gave them, unread.
    const [name, ...given] = process.argv.slice(2);
    const args = given.map(a => a.startsWith("--") ? a : path.resolve(a));
    const root = lib.chdirRoot();
    const hook = HOOKS[name];
    if (!hook) {
        console.error(`githook.js: no hook named "${name || ""}". One of: ${Object.keys(HOOKS).join(", ")}`);
        process.exit(1);
    }
    process.exit(hook(root, args, { dry: args.includes("--dry-run") }));
}
