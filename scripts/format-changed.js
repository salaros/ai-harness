#!/usr/bin/env node
// scripts/format-changed.js
// Checks the formatting of the files a commit stages or a push would publish, using the stack's own
// formatter rather than one this template picks: scripts/stacks.tsv gives each stack the patterns
// it formats and a check-only command. A row runs only when its "needs" file exists at the repo
// root, so a .NET repo never invokes prettier and a Node repo never invokes dotnet format.
// It never writes. A misformatted file fails the commit or the push, naming the files and the
// command that fixes them; `--no-verify` skips either hook. Writing during a hook is how lint-staged
// has to stash and restore, and how partially-staged work gets swept into a commit; reporting
// cannot lose work.
// The files are read from the working tree, not from the index or the pushed commits, so a
// formatter still sees its project context (node_modules, tsconfig, the .csproj). They agree unless
// you commit a partial stage or push with uncommitted edits, and then the report is about the files
// in front of you.
// Called by .githooks/pre-commit with the staged paths and by .githooks/pre-push with the ref
// updates. To try it by hand:
//   printf 'src/a.ts\n' | node scripts/format-changed.js --dry-run
// Usage:
//   node scripts/format-changed.js --push        ref updates on stdin, as Git gives a pre-push hook
//   node scripts/format-changed.js --staged      the staged paths on stdin, worded for a commit
//   node scripts/format-changed.js [--dry-run]   file paths on stdin, one per line
// A format cell may list fallbacks separated by " ?? ", tried in order until one's tool is
// installed; that is this script's syntax, not the shell's. The dotnet row uses it to prefer a
// project's Husky.NET task runner and fall back to dotnet format. With --staged an alternative that
// names no {files} is not tried: it checks the whole project, which is the push's job, not the
// commit's, so the staged files go to the next alternative, which does take them.
const lib = require("./lib");
const repoView = require("./repo-view");
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
    // Unreachable while the batches below fit, and listed so it can never be read as a verdict on the
    // files: a path long enough to fill a command line on its own is the shell's problem, not theirs.
    [/command line is too long|argument list too long|E2BIG/i,
        "one file fills a whole command line"],
];
const cannotRun = output => (CANNOT_RUN.find(([re]) => re.test(output)) || [])[1] || null;

// A run that exits 0 having checked nothing is not a pass either. `dotnet husky run --group <x>` with
// no task in that group prints "Skipped, no task found" and exits 0, and a .NET repo that never
// seeded the task had every push reported as "N file(s) formatted correctly" on the strength of it.
// Matched on output whatever the exit code, and turned into a skip so the next alternative runs.
const CHECKED_NOTHING = [
    [/skipped,?\s*no task found/i, "the Husky group has no task"],
];
const checkedNothing = output => (CHECKED_NOTHING.find(([re]) => re.test(output)) || [])[1] || null;
// Why a batch is no verdict on its files, or null when it is one.
const notARun = r => (r.status !== 0 ? cannotRun(r.output) : null) || checkedNothing(r.output);

// The alternatives of a format cell that this run may try. A pre-commit check is about the staged
// files, so one that takes no {files} is dropped there: it checks the whole project, which costs
// the whole project (35 s on a .NET solution) and is what the push already does.
function alternativesFor(format, { staged = false } = {}) {
    const all = format.split(" ?? ").map(s => s.trim()).filter(Boolean);
    const tried = staged ? all.filter(a => a.includes("{files}")) : all;
    return { tried, dropped: all.filter(a => !tried.includes(a)) };
}

// cmd.exe refuses a command line over 8191 characters, and says "The command line is too long"
// before the formatter starts. A push touching a few hundred files passes that length easily: 338
// files came to 18,780 characters. The shell's failure names no file and matches nothing above, so
// it used to be reported as "N changed file(s) are not formatted" -- accusing files that were fine
// and blocking a push that had nothing wrong with it. So the files go to the formatter in batches
// that fit a command line, and the batches' verdicts are combined. A POSIX shell allows far more;
// batching there costs nothing and keeps one code path.
const LIMIT = process.platform === "win32" ? 7500 : 120000;
function batches(template, files, limit = LIMIT) {
    const room = limit - template.replace("{files}", "").length;
    const out = [];
    let group = [], length = 0;
    for (const file of files) {
        const cost = file.length + 3;                                   // two quotes and a separator
        if (group.length && length + cost > room) { out.push(group); group = []; length = 0; }
        group.push(file);
        length += cost;
    }
    if (group.length) out.push(group);
    return out;
}
const fill = (template, group) => template.replace("{files}", group.map(f => `"${f}"`).join(" "));

// One verdict from every batch of one alternative: the files are misformatted if any batch says so,
// and the output is what those batches said. A batch that passes has nothing to report.
function combine(runs) {
    const bad = runs.filter(r => r.status !== 0);
    return { status: bad.length ? 1 : 0, output: bad.map(r => r.output).filter(Boolean).join("\n") };
}

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

// Which of the changed paths a formatter can actually be handed: the ones that are a real file
// here and now. A path a commit deleted is gone, a folder is not a file, and a symlink is neither --
// prettier refuses one named on its command line, and the refusal arrives looking exactly like
// "this file is badly formatted", so a push of perfectly good files was blocked by .claude/skills
// pointing at .agents/skills. Both questions are asked because either alone lets a link through:
// that folder link is not a file, and a link to a file is one.
const formattable = (view, paths) => paths.filter(p => view.isFile(p) && !(view.lstat(p) || {}).link);

// Reads the paths from stdin, runs each active stack's formatter over them and prints what it found.
// Returns the exit code: 1 while a file the commit stages or a push would publish is misformatted.
function main(argv) {
    const root = lib.chdirRoot();
    const dry = argv.includes("--dry-run");
    const fromPush = argv.includes("--push");
    const staged = argv.includes("--staged");
    const input = lib.stdin().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const what = staged ? "staged" : "changed";
    const anyway = staged ? "stage the result and commit again. To commit anyway: git commit --no-verify"
        : "then commit the result. To push anyway: git push --no-verify";

    const changed = formattable(repoView.worktree(root), fromPush ? pathsFromRefUpdates(input) : input);
    if (!changed.length) { console.log(`nothing ${staged ? "staged " : ""}to format-check`); return 0; }

    let status = 0, ran = false;
    // active() drops the rows whose "needs" file is absent -- not this repo's stack -- and select()
    // is the table's own matcher, the same one that decides what a merge restores.
    for (const { stack, formats, format } of stacks.active(root)) {
        if (!format || !formats) continue;
        const files = stacks.select(formats, changed);
        if (!files.length) continue;
        // " ?? " separates fallbacks, tried in order: the first whose tool is actually installed and
        // actually checked something runs, and its verdict stands. The dotnet row uses it to prefer a
        // project's Husky.NET task runner and fall back to dotnet format. This is the script's own
        // syntax, not the shell's.
        const { tried, dropped } = alternativesFor(format, { staged });
        ran = true;
        if (dry) {
            for (const alt of dropped) console.log(`would not run: ${alt} (${stack}: checks the whole project, not the staged files)`);
            for (const alt of tried) {
                const groups = batches(alt, files);
                const rest = groups.length > 1 ? ` (and ${groups.length - 1} more batch(es))` : "";
                console.log(`would check: ${fill(alt, groups[0])}${rest} (${stack})`);
            }
            continue;
        }
        let outcome = null, skipped = tried.length ? null : "every alternative checks the whole project";
        for (const alt of tried) {
            // A batch that cannot run at all ends the alternative rather than the run: a missing tool
            // is the same answer for every batch, and the next fallback gets the whole list.
            const runs = [];
            let why = null;
            for (const group of batches(alt, files)) {
                const r = lib.shell(fill(alt, group));
                why = notARun(r);
                if (why) break;
                runs.push(r);
            }
            if (why) { skipped = why; continue; }                       // try the next fallback
            outcome = combine(runs);
            break;
        }
        if (!outcome) { console.log(`${stack}: skipped, ${skipped}`); continue; }
        if (outcome.status === 0) { console.log(`${stack}: ${files.length} ${what} file(s) formatted correctly`); continue; }
        console.error(`\n${stack}: ${files.length} ${what} file(s) are not formatted.\n`);
        console.error(outcome.output);
        console.error(`\nFormat them, ${anyway}`);
        status = 1;
    }
    if (!ran) console.log(`nothing to format-check (${changed.length} ${what} file(s), no stack claims them)`);
    return status;
}

// The batching is this script's own decision, so the suite reads it here rather than through a shell:
// a command line that was too long is a failure the formatter's output cannot show. So are which
// alternatives a staged check may try, and which run is no verdict on its files.
module.exports = { batches, fill, combine, cannotRun, checkedNothing, notARun, alternativesFor, formattable, LIMIT, CANNOT_RUN, CHECKED_NOTHING };

if (require.main === module) process.exit(main(process.argv.slice(2)));
