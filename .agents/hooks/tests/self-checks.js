// .agents/hooks/tests/self-checks.js
// What is left when every module's decision table has moved beside it, under tests/tables/: the
// checks that can only be made from outside a module. They spawn the real hook in a real shell, run
// a real install, or read this checkout itself, so none of them is a table of inputs and verdicts.
// Each function gets a `t` (t.ok(condition, title, detail) for a verdict, t.skip(why) for a check
// this repo cannot run) and the env test.js runs fixtures with (HOOK_TEST set, the harness
// project-dir variables cleared).
// Harness invariants that must hold in a target too live in scripts/check-harness.js, which this file
// runs against the checkout; a decision table for a check(input, root) function goes in tests/tables/.
// Run by test.js after the fixture table. Add a new check as a new function in the exported array,
// not a fourth inline block in test.js. A function defined here and left out of that array never
// runs and says nothing about it, so everyCheckIsRegistered below catches the omission.
// Stand down with t.skip and a reason rather than a bare return: the tally counts skips, so a check
// that could not run is visible instead of leaving "N passed, 0 failed" to say it all went well.
const fs = require("fs");
const path = require("path");
const lib = require("../lib");
const harness = require("../../../scripts/check-harness");
const { withRoot, installer, INSTALLER } = require("./fixtures");

// scripts/harness-files.tsv decides what an install does with each path, and a path no row matches
// becomes `merge` (scripts/update-harness.js). That default is right -- a file the upstream ships
// and nobody classified is harness until someone says otherwise -- but arriving at it silently is
// not: a vendoring run once added 2.2 MB under a top-level agent/ that no harness reads, and it
// would have merged into every repo unread. The fallback stays; the gap is caught here. There is
// deliberately no check the other way, that every row matches a file: MEMORY.md and TODO.md are
// skip rows matching nothing in a clone that has neither, which is what skip means.
function everyTrackedPathIsClassified(t) {
    const manifest = "scripts/harness-files.tsv";
    if (!fs.existsSync(manifest)) { t.skip("manifest check: no harness-files.tsv"); return; }
    const r = lib.run("git", ["ls-files"]);
    if (r.status !== 0) { t.skip("manifest check: not a git checkout"); return; }
    const rows = fs.readFileSync(manifest, "utf8").split(/\r?\n/)
        .filter(l => l.trim() && !l.startsWith("#"))
        .map(l => l.split("\t")[0]);
    t.ok(rows.length > 0, "scripts/harness-files.tsv holds rows");
    const tracked = r.output.split(/\r?\n/).filter(Boolean);
    const loose = tracked.filter(f => !rows.some(p => p.endsWith("/") ? f.startsWith(p) : f === p));
    t.ok(!loose.length,
        "every tracked path matches a row in scripts/harness-files.tsv",
        loose.slice(0, 10).join(", "));
}

// root() must actually follow a harness's project-dir variable, not just fall back to this
// checkout — the one branch no TSV fixture exercises, since they all run with these variables
// cleared. Points CLAUDE_PROJECT_DIR at an unrelated directory with its own MEMORY.md and checks
// that session-start.js reports on THAT directory.
function sessionStartFollowsProjectDir(t, env) {
    const r = withRoot({ "MEMORY.md": "# Project memory\n" }, other =>
        lib.node([".agents/hooks/session-start.js"], { env: { ...env, CLAUDE_PROJECT_DIR: other } }));
    t.ok(r.status === 0 && r.output.includes("facts in MEMORY.md") && !r.output.includes("not initialised"),
        "session-start.js follows CLAUDE_PROJECT_DIR", r.output);
}

// The chain rule in check-edit.js must check the repo the harness is editing, the same one root()
// answers for, and not whichever checkout the hook file sits in. The two were allowed to disagree
// while docs-check chdir'd to its own location: a repo whose CLAUDE_PROJECT_DIR pointed elsewhere
// had the template's documents validated in place of its own, so a broken document passed. No TSV
// fixture reaches this, since test.js clears the project-dir variables before each one. Points
// CLAUDE_PROJECT_DIR at a directory holding this chain table and one document with the wrong
// heading, and requires the hook to object to THAT document.
function checkEditFollowsProjectDir(t, env) {
    const r = withRoot({
        "AGENTS.md": fs.readFileSync(path.join(lib.checkout, "AGENTS.md"), "utf8"),
        "docs/brd/0001-elsewhere.md": "# Wrong: not the ID its file name gives it\n\n**Derived from:** https://example.com/x\n",
    }, other => lib.node([".agents/hooks/check-edit.js"], {
        input: JSON.stringify({ tool_input: { file_path: path.join(other, "docs", "brd", "0001-elsewhere.md") } }),
        env: { ...env, CLAUDE_PROJECT_DIR: other },
    }));
    t.ok(r.status === 2 && r.output.includes(`# BRD-0001:`),
        "check-edit.js checks the chain in CLAUDE_PROJECT_DIR, not in its own checkout", r.output);
}

// MEMORY.md is in the chain, so an edit that breaks its Requirements line is reported at once rather
// than at the commit, which is the only place it used to surface.
function checkEditChecksMemoryRequirements(t, env) {
    const r = withRoot({
        "AGENTS.md": fs.readFileSync(path.join(lib.checkout, "AGENTS.md"), "utf8"),
        "MEMORY.md": "# Project memory\n\n- **Requirements:** the notes we took\n",
    }, other => lib.node([".agents/hooks/check-edit.js"], {
        input: JSON.stringify({ tool_input: { file_path: path.join(other, "MEMORY.md") } }),
        env: { ...env, CLAUDE_PROJECT_DIR: other },
    }));
    t.ok(r.status === 2 && r.output.includes("Requirements names no reference"),
        "check-edit.js runs docs-check when MEMORY.md is edited", r.output);
}

// check-edit.js runs the invariants after an edit to a path they read, in any repo, and that path
// list is check-harness's own. Points CLAUDE_PROJECT_DIR at a directory whose routing file names an
// agent nobody has, edits it, and requires the hook to object.
function checkEditRunsTheInvariantsOnTheirPaths(t, env) {
    const r = withRoot({
        ".agents/routing.md": "# Routing\n\n## Shared\n\nRead by `ghost`.\n",
        ".agents/agents/engineer.md": "---\nname: engineer\n---\nSee routing.md, Shared.\n",
    }, other => lib.node([".agents/hooks/check-edit.js"], {
        input: JSON.stringify({ tool_input: { file_path: path.join(other, ".agents", "routing.md") } }),
        env: { ...env, CLAUDE_PROJECT_DIR: other },
    }));
    t.ok(harness.reads(".agents/routing.md"), "check-harness reads .agents/routing.md");
    t.ok(r.status === 2 && r.output.includes("is read by exactly the agents it names"),
        "check-edit.js runs the harness invariants after an edit to a path they read", r.output);
}

// .claude/settings.json is read by more than Claude Code: Copilot (CLI and VS Code) reads it too, and
// sets no CLAUDE_PROJECT_DIR. A command built on that variable pointed node at /.agents/hooks/...,
// which exits 1, and Copilot denies a tool whose preToolUse hook errors, so every shell command was
// refused. The command also has to survive whichever shell the host picks: bash under Claude Code and
// on WSL2, PowerShell for Copilot on Windows, cmd.exe for a Node host spawning with shell: true.
// "$(git rev-parse ...)" is bash and PowerShell only, and PowerShell -Command reports a native exit 2
// as 1, which VS Code reads as a warning and lets the tool run. So node finds the root itself and the
// command ends "; exit $LASTEXITCODE": PowerShell exits with node's status, bash exits with the last
// status when the variable is empty, and cmd.exe hands both words to node -e, which ignores them.
// The exact text is check-harness.js's, and its launcher invariant holds the settings file to it;
// what this adds is that the text actually runs. Each command goes through the system shell and
// every PowerShell installed, from a subfolder with the project-dir variables cleared: session-start
// must print, and the guard must pass a safe command and block a force push with exit 2.
function claudeHooksRunInEveryShell(t, env) {
    const settings = path.join(lib.checkout, ".claude", "settings.json");
    if (!fs.existsSync(settings)) { t.skip("hook commands: no .claude/settings.json"); return; }
    const commands = Object.values(JSON.parse(fs.readFileSync(settings, "utf8")).hooks)
        .flat().flatMap(group => group.hooks.map(h => h.command));
    const cwd = path.join(lib.checkout, "scripts");
    const shells = { [process.platform === "win32" ? "cmd.exe" : "sh"]: (command, input) => lib.run(command, [], { shell: true, cwd, env, input }) };
    for (const ps of process.platform === "win32" ? ["pwsh", "powershell"] : ["pwsh"]) {
        if (lib.run(ps, ["-NoProfile", "-Command", "exit 0"]).status !== 0) { t.skip(`hook commands: no ${ps} to run them with`); continue; }
        shells[ps] = (command, input) => lib.run(ps, ["-NoProfile", "-Command", command], { cwd, env, input });
    }
    const start = commands.find(c => c.includes("session-start.js")), guard = commands.find(c => c.includes("guard-command.js"));
    const payload = command => JSON.stringify({ toolName: "bash", toolArgs: JSON.stringify({ command }) });
    for (const [name, run] of Object.entries(shells)) {
        if (start) {
            const s = run(start, "{}");
            t.ok(s.status === 0 && s.output.includes("project:"), `session-start.js runs from its settings.json command in ${name}`, `${s.status} ${s.output}`);
        }
        if (guard) {
            const safe = run(guard, payload("git status")), force = run(guard, payload("git push --force"));
            t.ok(safe.status === 0 && force.status === 2, `guard-command.js allows and blocks from its settings.json command in ${name}`,
                `safe ${safe.status} ${safe.output}\nforce ${force.status} ${force.output}`);
        }
    }
}

// One real install, end to end, from this checkout into an empty repository: the plan and the table
// above can agree with each other and still disagree with the disk. A dry run first, which must
// leave the repository as it found it, then the install, then a second run with nothing to do.
// Run the way a maintainer runs it from a Claude Code session open on this checkout: with
// CLAUDE_PROJECT_DIR naming the upstream, which must not pull any step of the install away from the
// target. Without the variable set here the check passed from a shell and failed only from a hook.
function installerInstallsIntoAnEmptyRepo(t, env) {
    if (!installer()) { t.skip("a real install: the installer is the upstream's own, not installed here"); return; }
    withRoot({}, dir => {
        const node = args => require("child_process").spawnSync(process.execPath, [INSTALLER, "--from", lib.checkout, "--target", dir, "--quiet", ...args], { encoding: "utf8", env: { ...env, CLAUDE_PROJECT_DIR: lib.checkout } });
        lib.run("git", ["-C", dir, "init", "--quiet"]);
        const dry = node(["--dry-run"]);
        t.ok(dry.status === 0 && !fs.existsSync(path.join(dir, "harness-lock.json")) && !fs.existsSync(path.join(dir, "AGENTS.md")),
            "a real install: --dry-run exits 0 and writes nothing", `exit ${dry.status}\n${dry.stdout}${dry.stderr}`);
        const real = node([]);
        const head = lib.run("git", ["-C", lib.checkout, "rev-parse", "HEAD"]).output.trim();
        const lock = fs.existsSync(path.join(dir, "harness-lock.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "harness-lock.json"), "utf8")) : {};
        t.ok(real.status === 0 && lock.commit === head, "a real install: exits 0 and records the upstream commit", `exit ${real.status}\n${real.stdout}${real.stderr}`);
        t.ok(fs.existsSync(path.join(dir, "MEMORY.md")) && fs.existsSync(path.join(dir, "AGENTS.md")), "a real install: the harness and its skeletons are on disk", dir);
        const staged = lib.run("git", ["-C", dir, "ls-files", "-s", "--", ".githooks/pre-commit"]).output;
        t.ok(staged.startsWith("100755"), "a real install: a hook is staged executable", staged || "(not staged)");
        let link = null;
        try { link = fs.lstatSync(path.join(dir, ".claude", "agents")); } catch { /* absent */ }
        if (link && link.isSymbolicLink()) t.ok(true, "a real install: .claude/agents is a symlink", "");
        else t.skip("a real install: this OS refused the symlink, so .claude/agents is not checked");
        const second = node([]);
        t.ok(second.status === 0 && second.stdout.includes("nothing to update"), "a real install: a second run has nothing to do", `exit ${second.status}\n${second.stdout}${second.stderr}`);
    });
}

// npx runs the installer from the published package, which holds only what package.json's `files`
// lists. A script the installer requires and the list leaves out works from a checkout and breaks
// for every project on the next release, so the requires are followed here, one file to the next.
function installerShipsEverythingItRequires(t) {
    if (!installer()) { t.skip("package files: the installer is the upstream's own, not installed here"); return; }
    const listed = new Set(JSON.parse(fs.readFileSync(path.join(lib.checkout, "package.json"), "utf8")).files || []);
    const seen = new Set();
    const walk = rel => {
        if (seen.has(rel)) return;
        seen.add(rel);
        const text = fs.readFileSync(path.join(lib.checkout, rel), "utf8");
        for (const [, dep] of text.matchAll(/require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
            const file = path.posix.normalize(path.posix.join(path.posix.dirname(rel), dep));
            walk(file.endsWith(".js") ? file : `${file}.js`);
        }
    };
    walk("scripts/update-harness.js");
    const missing = [...seen].filter(rel => !listed.has(rel));
    t.ok(seen.size > 1 && !missing.length, "package.json ships every script the installer requires",
        missing.length ? `missing from "files": ${missing.join(", ")}` : [...seen].join(", "));
}

// The harness invariants are scripts/check-harness.js's, because they travel: a target runs them after
// an edit and the installer runs them against what it wrote. The upstream holds itself to the same
// ones, with the suite's own t, so a regression here fails the suite the way it fails an install.
function harnessInvariantsHoldHere(t) {
    for (const invariant of harness.INVARIANTS) invariant(t, lib.checkout);
}

// check-harness asserts the shape of the hooks githook.js handles and leaves a target's own hooks
// alone. The upstream ships no hook of its own, so every file in its .githooks/ is one githook.js must
// handle: a hook added there without a handler would reach every target and do nothing.
function everyUpstreamHookIsHandled(t) {
    const known = Object.keys(require("../../../scripts/githook.js").HOOKS);
    const unhandled = fs.readdirSync(path.join(lib.checkout, ".githooks")).filter(n => !known.includes(n));
    t.ok(!unhandled.length, "githook.js handles every hook in .githooks/", unhandled.join(", "));
}

// A check runs because it is in an exported array, and nothing but this notices when one is not: an
// unregistered function raises the pass count of the suite by zero and the failure count by zero, so
// the tally reads exactly as it did before it was written. Caught by reading the files rather than by
// any cleverness at run time, because a function nobody calls leaves no trace to inspect. Every table
// under tests/tables/ is read the same way, so a module's own file cannot quietly stop running either.
function everyCheckIsRegistered(t) {
    const tables = path.join(__dirname, "tables");
    const files = [__filename, ...fs.readdirSync(tables).filter(n => n !== "index.js").map(n => path.join(tables, n))];
    const defined = files.flatMap(file => [...fs.readFileSync(file, "utf8").matchAll(/^function (\w+)\(t\b/gm)].map(m => m[1]));
    const registered = new Set([...module.exports, ...require("./tables")].map(fn => fn.name));
    const missing = defined.filter(name => !registered.has(name));
    t.ok(defined.length > 0, "the suite defines checks", String(defined.length));
    t.ok(files.length > 2, "every table file under tests/tables/ is read", files.length + " file(s)");
    t.ok(!missing.length, "every check defined in self-checks.js and tests/tables/ is in its exported array", missing.join(", "));
}

module.exports = [
    everyCheckIsRegistered,
    harnessInvariantsHoldHere,
    everyUpstreamHookIsHandled,
    everyTrackedPathIsClassified,
    sessionStartFollowsProjectDir,
    checkEditFollowsProjectDir,
    checkEditChecksMemoryRequirements,
    claudeHooksRunInEveryShell,
    checkEditRunsTheInvariantsOnTheirPaths,
    installerInstallsIntoAnEmptyRepo,
    installerShipsEverythingItRequires,
];
