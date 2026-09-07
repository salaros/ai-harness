#!/usr/bin/env node
// scripts/format-changed.js
// Checks the formatting of the files a push would publish, using the stack's own formatter rather
// than one this template picks: scripts/stacks.tsv gives each stack the patterns it formats and a
// check-only command. A row runs only when its "needs" file exists at the repo root, so a .NET repo
// never invokes prettier and a Node repo never invokes dotnet format.
// It never writes. A misformatted file fails the push, naming the files and the command that fixes
// them; `git push --no-verify` skips the hook. Writing during a hook is how lint-staged has to stash
// and restore, and how partially-staged work gets swept into a commit; reporting cannot lose work.
// The files are read from the working tree, not from the pushed commits, so a formatter still sees
// its project context (node_modules, tsconfig, the .csproj). They agree unless you push with
// uncommitted edits, and then the report is about the files in front of you.
// Called by .githooks/pre-push. To try it by hand:
//   printf 'src/a.ts\n' | node scripts/format-changed.js --dry-run
// Usage:
//   node scripts/format-changed.js --push        ref updates on stdin, as Git gives a pre-push hook
//   node scripts/format-changed.js [--dry-run]   file paths on stdin, one per line
// A format cell may list fallbacks separated by " ?? ", tried in order until one's tool is
// installed; that is this script's syntax, not the shell's. The dotnet row uses it to prefer a
// project's Husky.NET task runner and fall back to dotnet format.
const fs = require("fs");
const lib = require("./lib");
const stacks = require("./stacks");

const ZERO = /^0{40,}$/;
// A formatter can fail for reasons that are not "this file is badly formatted", and blocking a push
// over one of those is worse than not checking: the message accuses files that are in fact fine.
// Each runner words these differently, so they are matched on output and turned into a skip. Both
// were seen in testing: npx without the package, and dotnet format in a tree with no project file.
const CANNOT_RUN = [
    [/not recognized|command not found|could not determine executable|canceled due to missing packages|npm error 404|could not execute because|was not found|no such file|ENOENT/i,
        "the tool is not installed"],
    [/could not find a msbuild project|no project or solution file|specify which to use with the <workspace>/i,
        "the stack has no project file here"],
];
const cannotRun = output => (CANNOT_RUN.find(([re]) => re.test(output)) || [])[1] || null;

const root = lib.chdirRoot();
const dry = process.argv.includes("--dry-run");
const fromPush = process.argv.includes("--push");
const input = lib.stdin().split(/\r?\n/).map(l => l.trim()).filter(Boolean);

// Git hands a pre-push hook "<local ref> <local sha> <remote ref> <remote sha>" per ref.
function pathsFromRefUpdates(lines) {
    const out = new Set();
    for (const line of lines) {
        const [, localSha, , remoteSha] = line.split(/\s+/);
        if (!localSha || ZERO.test(localSha)) continue;                  // deleting a branch
        const add = r => { for (const p of r.output.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) out.add(p); };
        if (remoteSha && !ZERO.test(remoteSha)) {
            add(lib.run("git", ["diff", "--name-only", `${remoteSha}..${localSha}`]));
            continue;
        }
        // A branch the remote has never seen: every commit on it that no remote already holds.
        const commits = lib.run("git", ["rev-list", localSha, "--not", "--remotes"]);
        for (const sha of commits.output.split(/\r?\n/).map(s => s.trim()).filter(Boolean))
            add(lib.run("git", ["show", "--name-only", "--pretty=format:", sha]));
    }
    return [...out];
}

const changed = (fromPush ? pathsFromRefUpdates(input) : input).filter(p => fs.existsSync(p));
if (!changed.length) { console.log("nothing to format-check"); process.exit(0); }

let status = 0, ran = false;
// active() drops the rows whose "needs" file is absent -- not this repo's stack -- and select()
// is the table's own matcher, the same one that decides what a merge restores.
for (const { stack, formats, format } of stacks.active(root)) {
    if (!format || !formats) continue;
    const files = stacks.select(formats, changed);
    if (!files.length) continue;
    const quoted = files.map(f => `"${f}"`).join(" ");
    // " ?? " separates fallbacks, tried in order: the first whose tool is actually installed runs,
    // and its verdict stands. The dotnet row uses it to prefer a project's Husky.NET task runner and
    // fall back to dotnet format. This is the script's own syntax, not the shell's.
    const alternatives = format.split(" ?? ").map(s => s.trim()).filter(Boolean);
    ran = true;
    if (dry) {
        for (const alt of alternatives) console.log(`would check: ${alt.replace("{files}", quoted)} (${stack})`);
        continue;
    }
    let outcome = null, skipped = null;
    for (const alt of alternatives) {
        const command = alt.replace("{files}", quoted);
        const r = lib.shell(command);
        const why = r.status === 0 ? null : cannotRun(r.output);
        if (why) { skipped = why; continue; }                           // try the next fallback
        outcome = { command, r };
        break;
    }
    if (!outcome) { console.log(`${stack}: skipped, ${skipped}`); continue; }
    if (outcome.r.status === 0) { console.log(`${stack}: ${files.length} file(s) formatted correctly`); continue; }
    console.error(`\n${stack}: ${files.length} changed file(s) are not formatted.\n`);
    console.error(outcome.r.output);
    console.error(`\nFormat them, then commit the result. To push anyway: git push --no-verify`);
    status = 1;
}
if (!ran) console.log(`nothing to format-check (${changed.length} changed file(s), no stack claims them)`);
process.exit(status);
