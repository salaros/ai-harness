// .agents/hooks/tests/self-checks.js
// Invariants that don't fit cases.tsv's "run a script against a fixture, check exit code and
// output" shape: each function below gets a `t` (t.ok(condition, title, detail) for a verdict,
// t.skip(why) for a check this repo cannot run) and the env test.js runs fixtures with (HOOK_TEST
// set, the harness project-dir variables cleared).
// Harness invariants that must hold in a target too live in scripts/check-harness.js, which this file
// runs against the checkout; a decision table for a check(input, root) function goes in tables.js.
// Run by test.js after the fixture table. Add a new invariant as a new function in the exported
// array, not a fourth inline block in test.js. A function defined here and left out of that array
// never runs and says nothing about it, so everyCheckIsRegistered below catches the omission.
// Stand down with t.skip and a reason rather than a bare return: the tally counts skips, so a check
// that could not run is visible instead of leaving "N passed, 0 failed" to say it all went well.
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("../lib");
const docsCheck = require("../../../scripts/docs-check");
const repoView = require("../../../scripts/repo-view");
const harness = require("../../../scripts/check-harness");
const projectFacts = require("../../../scripts/project-facts");

// scripts/update-harness.js is the upstream's own and is never installed, so a project that borrowed
// this suite has no installer to test. Required lazily for that reason: at the top it would throw
// before the first check ran, and take the whole suite with it.
const INSTALLER = path.join(__dirname, "..", "..", "..", "scripts", "update-harness.js");
const installer = () => fs.existsSync(INSTALLER) ? require(INSTALLER) : null;

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

// The project-init gate. Exercised against temp directories rather than this checkout, whose own
// answer depends on whether the developer running the suite has created the marker file. How a line
// is read is projectFactDecisions' in tables.js; this is what the gate makes of the answer: which
// file it blames, what it names as missing, and the marker.
function initialisationGateAnswersEveryState(t) {
    const init = require("../../../scripts/check-initialised");
    const full = ["# Project memory", "", "- **Name:** Acme Billing", "- **Purpose:** Invoices customers monthly.",
        "- **Requirements:** jira:AB-1", "- **Unit type:** service", "- **Language:** C#",
        "- **Runtime / package manager:** .NET 9 / NuGet", "- **Issue tracker:** Jira at https://acme.atlassian.net, project `AB`", ""].join("\n");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-gate-"));
    const write = (name, text) => { fs.writeFileSync(path.join(dir, name), text); };
    const clear = () => { for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f)); };
    try {
        t.ok(!init.check(dir).ok, "an unconfigured clone is blocked", init.check(dir).reason);

        write("MEMORY.md", full.replace("C#", "<language>"));
        const placeheld = init.check(dir);
        t.ok(!placeheld.ok && placeheld.missing.join() === "Language" && placeheld.reason.includes("MEMORY.md records no Language"),
            "a fact left as a <placeholder> is blocked and named", placeheld.reason);

        write("MEMORY.md", full);
        t.ok(init.check(dir).ok, "a MEMORY.md with every required fact passes", init.check(dir).reason);

        // INTENT.md, when there is one, owns the name and purpose; the configuration stays in MEMORY.md.
        const intent = ["# INTENT.md", "", "## Product", "", "**Acme Billing** invoices small firms monthly, so nobody cuts invoices by hand.",
            "", "## MVP stories — build these first", "", "### Send an invoice", ""].join("\n");
        const configOnly = full.split("\n").filter(l => !/\*\*(?:Name|Purpose):/.test(l)).join("\n");
        clear();
        write("INTENT.md", intent);
        write("MEMORY.md", configOnly);
        const fromIntent = init.check(dir);
        t.ok(fromIntent.ok && fromIntent.reason.includes("INTENT.md"),
            "INTENT.md's Product gives the name and purpose MEMORY.md leaves out", fromIntent.reason);

        write("INTENT.md", intent.replace("**Acme Billing** ", ""));
        write("MEMORY.md", full);
        const nameless = init.check(dir);
        t.ok(!nameless.ok && nameless.missing.join() === "Name" && nameless.reason.includes("INTENT.md"),
            "an INTENT.md whose Product names no product is blocked, even when MEMORY.md has a Name", nameless.reason);

        write("INTENT.md", intent.replace(/## Product[\s\S]*?(?=## MVP)/, ""));
        fs.unlinkSync(path.join(dir, "MEMORY.md"));
        const bare = init.check(dir);
        t.ok(!bare.ok && ["Name", "Purpose", "Language"].every(f => bare.missing.includes(f)),
            "an INTENT.md with no Product and no MEMORY.md is blocked on both", bare.reason);

        clear();
        write(".skip-project-init", "");
        t.ok(init.check(dir).ok, "the marker file passes a clone with no MEMORY.md at all", init.check(dir).reason);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// INTENT.md is optional, and when present docs-check holds it to the sections its specification
// requires. Each broken shape gets its own message; a well-formed file and an absent one get none.
function docsCheckIntentShape(t) {
    const good = ["# INTENT.md", "", "_Written by hand._", "", "## Product", "", "**Acme Billing** invoices small firms monthly.",
        "", "## Personas", "", "### Dana, bookkeeper", "", "## MVP stories — build these first", "", "### Send an invoice", "",
        "*Done when:*", "- the customer receives a PDF", "", "## Release 2 — reminders", ""];
    const cases = [
        ["a well-formed file", good, ""],
        ["a wrong title", ["# Intent", ...good.slice(1)], "first heading must be"],
        ["no Product section", good.filter(l => l !== "## Product" && !l.startsWith("**Acme")), 'no "## Product" section'],
        ["a Product with no bold name", good.map(l => l.replace("**Acme Billing** ", "Acme Billing ")), "names no product in bold"],
        ["a Product with a name and nothing else", good.map(l => l.replace(" invoices small firms monthly.", "")), "does not say what the product does"],
        ["no MVP stories section", good.map(l => l.replace("## MVP stories — build these first", "## Stories")), 'no "## MVP stories" section'],
    ];
    const problemsFor = lines => docsCheck.check(lib.checkout, chainView(lines ? { "INTENT.md": lines } : {})).problems;
    t.ok(problemsFor(null).length === 0, "docs-check: a project with no INTENT.md is not asked for one", problemsFor(null).join("\n"));
    for (const [title, lines, needle] of cases) {
        const problems = problemsFor(lines);
        const detail = problems.join("\n") || "(none)";
        t.ok(needle ? problems.some(p => p.includes(needle)) : problems.length === 0, `docs-check: INTENT.md, ${title}`, detail);
    }
}

// The installer lays down MEMORY.md's facts from the table the gate reads, every one a placeholder:
// all of them in a plain repo, all but the name and purpose beside an INTENT.md. Either skeleton is
// unanswered as a whole, so a fresh install is blocked until project-init runs.
function memorySkeletonDefersToIntent(t) {
    const inst = installer();
    if (!inst) { t.skip("memory skeleton: no scripts/update-harness.js"); return; }
    const header = ["# Project memory", ""];
    const labels = projectFacts.FACTS.map(f => f.label);
    const plain = inst.skeletonLines("MEMORY.md", header, false).join("\n");
    const plainFacts = projectFacts.readFacts({ memory: plain });
    t.ok(labels.every(l => plainFacts[l] === ""), "memory skeleton: every fact, as a placeholder, without an INTENT.md", plain);
    const beside = inst.skeletonLines("MEMORY.md", header, true).join("\n");
    const besideFacts = projectFacts.readFacts({ memory: beside });
    t.ok(besideFacts.Name === null && besideFacts.Purpose === null && besideFacts.Language === "" && beside.includes("INTENT.md"),
        "memory skeleton: no name or purpose beside an INTENT.md", beside);
    t.ok(inst.skeletonLines("TODO.md", header, false) === header, "memory skeleton: other skeletons are left as written", "");
}

// The project-init skill writes MEMORY.md from a template of its own, which the installer's skeleton
// and the gate never read. The labels are what every reader agrees on, so the template must list
// exactly the facts scripts/project-facts.js holds, in the same order; its placeholders are the
// skill's to word.
function projectInitTemplateMatchesFacts(t) {
    const skill = path.join(lib.checkout, ".agents", "skills", "project-init", "SKILL.md");
    if (!fs.existsSync(skill)) { t.skip("project-init template: no project-init skill here"); return; }
    const text = fs.readFileSync(skill, "utf8");
    const block = text.match(/```md\r?\n\s*# Project memory[\s\S]*?```/);
    t.ok(!!block, "project-init: SKILL.md carries a MEMORY.md template", skill);
    if (!block) return;
    const labels = [...block[0].matchAll(/^\s*- \*\*([^*]+?):\*\*/gm)].map(m => m[1]);
    const facts = projectFacts.FACTS.map(f => f.label);
    t.ok(labels.join("|") === facts.join("|"),
        "project-init: the template lists the facts scripts/project-facts.js holds, in order",
        `template: ${labels.join(", ")}\nfacts:    ${facts.join(", ")}`);
}

// docs-check's citation logic, exercised directly rather than through a fixture: a duplicate
// document number, a citation to an item that does not exist in its target, and a citation that
// jumps forward in the chain.
function docsCheckCitationEdgeCases(t) {
    const r = checkDocs({
        "brd/9001-alpha.md": ["# BRD-9001: Alpha"],
        "brd/9001-beta.md": ["# BRD-9001: Beta"],
        "brd/9002-source.md": ["# BRD-9002: Source", "", "- BR-1: Something real"],
        "prd/9002-citer.md": ["# PRD-9002: Citer", "", "**Derived from:** BRD-9002", "", "Refines BRD-9002/BR-2, which does not exist."],
        "brd/9003-support.md": ["# BRD-9003: Support"],
        "ears/9003-late.md": ["# EARS-9003: Late"],
        "prd/9003-early.md": ["# PRD-9003: Early", "", "**Derived from:** BRD-9003", "", "See EARS-9003 for details."],
    });
    const has = needle => r.all.includes(needle);
    const detail = r.all;
    t.ok(has("already used by"), "docs-check: duplicate document number", detail);
    t.ok(has("has no item BR-2"), "docs-check: citation to a missing item", detail);
    t.ok(has("later in the chain"), "docs-check: citation later in the chain", detail);
}

// A repo as docs-check reads it, held in memory (scripts/repo-view.js): this checkout's AGENTS.md,
// so the real stage table decides, an empty SKILL.md for each skill it names, and `files`
// (repo-relative path -> lines) and nothing else. A case names every file it depends on, a source
// it cites included, and nothing touches the disk.
function chainView(files = {}) {
    const map = { "AGENTS.md": fs.readFileSync(path.join(lib.checkout, "AGENTS.md"), "utf8") };
    for (const s of docsCheck.readChain(lib.checkout).stages)
        for (const skill of s.skills) map[`.agents/skills/${skill}/SKILL.md`] = "";
    for (const [rel, lines] of Object.entries(files)) map[rel] = [].concat(lines).join("\n") + "\n";
    return repoView.fromMap(map);
}

// check() over the documents in `docs` (keyed under docs/) and the other `files`, with a helper that
// filters the problems by document.
function checkDocs(docs, files = {}) {
    const entries = Object.entries(docs).map(([rel, lines]) => [`docs/${rel}`, lines]);
    const { problems } = docsCheck.check(lib.checkout, chainView({ ...Object.fromEntries(entries), ...files }));
    return {
        all: problems.join("\n") || "(none)",
        for: rel => problems.filter(p => p.startsWith(`docs/${rel}:`)),
    };
}

// Every document says where it came from. Where the chain holds nothing earlier that is a source:
// a URL, an existing repo-relative path, or a Jira key. A missing line, a line naming nothing, and
// a path that does not exist are each their own message.
function docsCheckDerivedFromShapes(t) {
    const r = checkDocs({
        "brd/9100-url.md": ["# BRD-9100: Url", "", "**Derived from:** https://example.com/brief"],
        "brd/9101-jira.md": ["# BRD-9101: Jira", "", "**Derived from:** jira:ABC-123"],
        "brd/9102-path.md": ["# BRD-9102: Path", "", "**Derived from:** .scratch/interview.md"],
        "brd/9103-absent.md": ["# BRD-9103: Absent"],
        "brd/9104-words.md": ["# BRD-9104: Words", "", "**Derived from:** the whiteboard"],
        "brd/9105-gone.md": ["# BRD-9105: Gone", "", "**Derived from:** docs/nowhere/missing.md"],
        // A bare file name is a path at the root, which is how INTENT.md is cited.
        "brd/9106-root.md": ["# BRD-9106: Root", "", "**Derived from:** the product intent in INTENT.md"],
        "brd/9107-root-gone.md": ["# BRD-9107: Root gone", "", "**Derived from:** NO-SUCH-INTENT.md"],
        "brd/9108-dotted.md": ["# BRD-9108: Dotted", "", "**Derived from:** a talk about Node.js"],
    }, {
        ".scratch/interview.md": ["# Interview"],
        "INTENT.md": ["# INTENT.md", "", "## Product", "", "**Acme** bills people.", "", "## MVP stories", "", "### Bill", ""],
    });
    for (const ok of ["brd/9100-url.md", "brd/9101-jira.md", "brd/9102-path.md", "brd/9106-root.md"])
        t.ok(r.for(ok).length === 0, `docs-check: ${ok} derives from a valid source`, r.all);
    t.ok(r.for("brd/9107-root-gone.md").some(p => p.includes("NO-SUCH-INTENT.md does not exist")),
        "docs-check: Derived from names a root file that is not there", r.all);
    t.ok(r.for("brd/9108-dotted.md").some(p => p.includes("names no reference") && !p.includes("does not exist")),
        "docs-check: a dotted word in prose is neither a source nor a missing path", r.all);
    t.ok(r.for("brd/9103-absent.md").some(p => p.includes("missing a")), "docs-check: no Derived from line at all", r.all);
    t.ok(r.for("brd/9104-words.md").some(p => p.includes("names no reference")), "docs-check: Derived from names nothing", r.all);
    t.ok(r.for("brd/9105-gone.md").some(p => p.includes("does not exist")), "docs-check: Derived from names a path that is not there", r.all);
}

// A source stands in for an upstream document only while nothing earlier exists. Once it does, the
// line must cite it — except on an ADR, which is cross-cutting and cites in either direction.
function docsCheckSourceAndAdrExemption(t) {
    const r = checkDocs({
        "brd/9200-real.md": ["# BRD-9200: Real", "", "**Derived from:** https://example.com/brief"],
        "prd/9200-stale.md": ["# PRD-9200: Stale", "", "**Derived from:** https://example.com/brief"],
        "adr/9200-forced.md": ["# ADR-9200: Forced", "", "**Derived from:** https://example.com/rfc"],
        "spec/9200-design.md": ["# SPEC-9200: Design", "", "**Derived from:** BRD-9200"],
        "adr/9201-late.md": ["# ADR-9201: Late", "", "**Derived from:** SPEC-9200"],
        "prd/9201-decided.md": ["# PRD-9201: Decided", "", "**Derived from:** BRD-9200", "", "Constrained by ADR-9200."],
    });
    t.ok(r.for("prd/9200-stale.md").some(p => p.includes("cite the upstream document instead")),
        "docs-check: source-only line once an upstream document exists", r.all);
    t.ok(r.for("adr/9200-forced.md").length === 0, "docs-check: an ADR may derive from a source at any time", r.all);
    t.ok(r.for("adr/9201-late.md").length === 0, "docs-check: an ADR may cite a later stage", r.all);
    t.ok(r.for("prd/9201-decided.md").length === 0, "docs-check: any document may cite an ADR", r.all);
}

// MEMORY.md's Requirements takes part in traceability, so it follows the same reference rule.
function docsCheckMemoryRequirements(t) {
    const memory = lines => {
        const { problems } = docsCheck.check(lib.checkout, chainView({
            "docs/brd/9300-real.md": ["# BRD-9300: Real", "", "**Derived from:** https://example.com/brief"],
            "MEMORY.md": lines,
        }));
        return problems.filter(p => p.startsWith("MEMORY.md:"));
    };
    const cases = [
        ["none yet", ["# Project", "", "- **Requirements:** none yet"], 0, ""],
        ["a document that exists", ["- **Requirements:** BRD-9300"], 0, ""],
        ["several sources", ["- **Requirements:** https://example.com/a, jira:ABC-1"], 0, ""],
        ["a file at the root, as INTENT.md is cited", ["- **Requirements:** MVP stories in AGENTS.md"], 0, ""],
        ["a document that does not exist", ["- **Requirements:** BRD-9999"], 1, "does not exist"],
        ["prose instead of a reference", ["- **Requirements:** the whiteboard"], 1, "names no reference"],
        // The rule is "Derived from:"'s: one reference on the line, and the rest of the words are the
        // writer's, in whatever language MEMORY.md says this project writes prose in.
        ["prose around a reference", ["- **Requirements:** gathered on a call, written up in BRD-9300"], 0, ""],
        ["prose around a reference, not in English", ["- **Requirements:** требования собраны в BRD-9300"], 0, ""],
        ["no Requirements line", ["# Project", "", "- **Stack:** none yet"], 1, "no Requirements line"],
        // update-harness.js lays down a MEMORY.md of placeholders when it installs the harness into a
        // repo that has none, so a fresh install must pass its own checks. check-initialised.js
        // already blocks every commit until project-init fills them in, and says exactly that.
        ["a placeholder project-init has not filled in", ["- **Requirements:** <requirements>"], 0, ""],
    ];
    for (const [title, lines, want, needle] of cases) {
        const problems = memory(lines);
        const detail = problems.join("\n") || "(none)";
        t.ok(want === 0 ? problems.length === 0 : problems.some(p => p.includes(needle)),
            `docs-check: MEMORY.md Requirements, ${title}`, detail);
    }
}

// root() must actually follow a harness's project-dir variable, not just fall back to this
// checkout — the one branch no TSV fixture exercises, since they all run with these variables
// cleared. Points CLAUDE_PROJECT_DIR at an unrelated directory with its own MEMORY.md and checks
// that session-start.js reports on THAT directory.
function sessionStartFollowsProjectDir(t, env) {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "harness-root-test-"));
    fs.writeFileSync(path.join(other, "MEMORY.md"), "# Project memory\n");
    const r = lib.node([".agents/hooks/session-start.js"], { env: { ...env, CLAUDE_PROJECT_DIR: other } });
    fs.rmSync(other, { recursive: true, force: true });
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
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "harness-edit-root-"));
    const doc = path.join(other, "docs", "brd", "0001-elsewhere.md");
    fs.mkdirSync(path.dirname(doc), { recursive: true });
    fs.copyFileSync(path.join(lib.checkout, "AGENTS.md"), path.join(other, "AGENTS.md"));
    fs.writeFileSync(doc, "# Wrong: not the ID its file name gives it\n\n**Derived from:** https://example.com/x\n");
    const r = lib.node([".agents/hooks/check-edit.js"], {
        input: JSON.stringify({ tool_input: { file_path: doc } }),
        env: { ...env, CLAUDE_PROJECT_DIR: other },
    });
    fs.rmSync(other, { recursive: true, force: true });
    t.ok(r.status === 2 && r.output.includes(`# BRD-0001:`),
        "check-edit.js checks the chain in CLAUDE_PROJECT_DIR, not in its own checkout", r.output);
}

// MEMORY.md is in the chain, so an edit that breaks its Requirements line is reported at once rather
// than at the commit, which is the only place it used to surface.
function checkEditChecksMemoryRequirements(t, env) {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "harness-edit-memory-"));
    fs.copyFileSync(path.join(lib.checkout, "AGENTS.md"), path.join(other, "AGENTS.md"));
    const memory = path.join(other, "MEMORY.md");
    fs.writeFileSync(memory, "# Project memory\n\n- **Requirements:** the notes we took\n");
    const r = lib.node([".agents/hooks/check-edit.js"], {
        input: JSON.stringify({ tool_input: { file_path: memory } }),
        env: { ...env, CLAUDE_PROJECT_DIR: other },
    });
    fs.rmSync(other, { recursive: true, force: true });
    t.ok(r.status === 2 && r.output.includes("Requirements names no reference"),
        "check-edit.js runs docs-check when MEMORY.md is edited", r.output);
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
// Runs each command through the system shell and every PowerShell installed, from a subfolder with
// the project-dir variables cleared: session-start must print, and the guard must pass a safe
// command and block a force push with exit 2.
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
    for (const command of commands) t.ok(!/PROJECT_DIR/.test(command), `hook command names no harness-specific variable: ${command}`, command);
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

// scripts/harness-files.tsv decides what an install does to each path, and policyFor reads it.
// First match wins, a row ending in / covers everything under it, and an `optional:<flag>` row is
// seeded only when the run asked for that flag. The real table is checked elsewhere; what is pinned
// here is how a table is read, against one written for the purpose.
function manifestPoliciesAreReadInOrder(t) {
    const harness = installer();
    if (!harness) { t.skip("policyFor: the installer is the upstream's own, not installed here"); return; }
    const rows = [
        { path: "scripts/harness-files.tsv", policy: "skip" },
        { path: "scripts/", policy: "merge" },
        { path: "tools/docs-site/", policy: "optional:astro-docs" },
        { path: "src/", policy: "seed" },
    ];
    const all = () => true;
    const none = () => false;
    const cases = [
        ["scripts/harness-files.tsv", all, "skip", "the earlier row wins over the prefix below it"],
        ["scripts/lib.js", all, "merge", "a row ending in / covers everything under it"],
        ["src/app.ts", all, "seed", "an exact prefix match takes its own policy"],
        ["README.md", all, "merge", "a path nobody classified is harness"],
        ["tools/docs-site/astro.config.mjs", all, "seed", "an optional part the run asked for is seeded"],
        ["tools/docs-site/astro.config.mjs", none, "template", "an optional part nobody asked for is not installed"],
    ];
    for (const [file, wants, want, why] of cases) {
        const got = harness.policyFor(rows, file, wants);
        t.ok(got === want, `policyFor: ${why}`, `${file} -> ${got}, expected ${want}`);
    }
}

// The installer writes whenever it runs, so an argument it does not know has to stop it: a --help it
// ignored once installed the harness into the repo it was asked about.
function installerRejectsUnknownArguments(t) {
    const harness = installer();
    if (!harness) { t.skip("installer arguments: the installer is the upstream's own, not installed here"); return; }
    const cases = [
        [["--dry-run", "--quiet"], [], "", "known flags pass"],
        [["--ref", "v2", "--target", "../x"], [], "", "a value after --ref or --target is not a flag"],
        [["--astro-docs"], ["astro-docs"], "", "an optional part the manifest names is known"],
        [["--astro-docs"], [], "--astro-docs", "an optional part the manifest does not name is not"],
        [["--dry-rn", "extra"], [], "--dry-rn extra", "a typo and a stray word are both reported"],
    ];
    for (const [args, optional, want, why] of cases) {
        const got = harness.unknownArgs(args, optional).join(" ");
        t.ok(got === want, `unknownArgs: ${why}`, `${args.join(" ")} -> "${got}", expected "${want}"`);
    }
    const early = [
        [["--dry-rn"], "--dry-rn", "a letter off a known flag fails before the clone"],
        [["--Adopt", "extra"], "--Adopt extra", "anything not shaped like a flag fails before the clone"],
        [["--astro-docs", "--ref", "v2"], "", "an optional part is left for the manifest to judge"],
    ];
    for (const [args, want, why] of early) {
        const got = harness.mistypedArgs(args).join(" ");
        t.ok(got === want, `mistypedArgs: ${why}`, `${args.join(" ")} -> "${got}", expected "${want}"`);
    }
    const text = harness.usage();
    t.ok(/Usage:/.test(text) && text.includes("npx @salaros/ai-harness --help") && !text.includes("node scripts/"),
        "usage: read from the header comment, in the npx form", text);
    const run = require("child_process").spawnSync(process.execPath, [INSTALLER, "--help"], { cwd: os.tmpdir(), encoding: "utf8" });
    t.ok(run.status === 0 && run.stdout.includes("Usage:"), "--help prints the usage and exits 0 without a repository",
        `exit ${run.status}: ${run.stderr}`);
}

// What an install does to a file the target already has. Every branch used to need a git checkout,
// an upstream history and a temp tree to reach even once, so none of them had a test; the decision
// takes the base, the base recovery and the merge as arguments now, and the fakes below stand in for
// all three. `raw` is what is on disk, `theirs` the upstream's, always LF.
function installDecisionCoversEveryOutcome(t) {
    const harness = installer();
    if (!harness) { t.skip("the install decision: the installer is the upstream's own, not installed here"); return; }
    const OURS = "one\ntwo edited\n";
    const THEIRS = "one\ntwo upstream\n";
    const clean = text => () => ({ text, conflicts: false, failed: false });
    const conflicted = text => () => ({ text, conflicts: true, failed: false });
    const broke = () => ({ text: "", conflicts: false, failed: true });
    const never = () => { throw new Error("should not have been consulted"); };

    const decide = (input, deps) => harness.decideText(
        { policy: "merge", raw: OURS, theirs: THEIRS, hasBase: true, adopt: false, ...input },
        { baseText: () => null, recoverBase: () => null, merge: never, ...deps });

    const cases = [
        // input, deps, expected outcome, expected text, why
        [{ raw: THEIRS }, {}, "unchanged", null, "a copy already matching the upstream is left alone"],
        [{ adopt: true }, {}, "adopted", THEIRS, "--adopt takes the upstream's version whatever the base says"],
        [{ raw: "<<<<<<< yours\nmine\n" }, {}, "STILL OPEN", null, "markers an earlier run left are named, not merged over"],
        [{ hasBase: false }, {}, "yours, no base", null, "an install with no base keeps what is there"],
        [{}, {}, "yours, new here", null, "a file the base did not have is the project's own"],
        [{}, { baseText: () => OURS }, "written", THEIRS, "a file nobody edited takes the upstream's version"],
        [{}, { baseText: () => "one\n", merge: clean("one\ntwo edited\nthree\n") },
            "merged", "one\ntwo edited\nthree\n", "an edited file keeps its edits and gains the changes around them"],
        [{}, { baseText: () => "one\n", merge: clean(OURS) }, "unchanged", null,
            "a merge that comes out as what is already there is not churn to report"],
        [{}, { baseText: () => "one\n", merge: conflicted("<<<<<<< yours\n") }, "CONFLICT", "<<<<<<< yours\n",
            "a real collision is written with markers and named"],
        [{}, { baseText: () => "one\n", merge: broke }, "yours, merge failed", null,
            "a merge git could not run leaves the file alone"],
        // reconcile is the policy for a file the harness cannot work around, so it merges even with
        // no receipt: the nearest upstream version stands in, and failing that an empty base makes
        // the whole file one honest conflict.
        [{ policy: "reconcile", hasBase: false }, { recoverBase: () => "one\n", merge: clean("merged\n") },
            "merged", "merged\n", "reconcile recovers a base when the receipt has none"],
        [{ policy: "reconcile", hasBase: false }, { merge: (from) => ({ text: `base=${JSON.stringify(from)}`, conflicts: true, failed: false }) },
            "CONFLICT", 'base=""', "reconcile with nothing to recover merges against an empty base"],
    ];
    for (const [input, deps, outcome, text, why] of cases) {
        const got = decide(input, deps);
        t.ok(got.outcome === outcome && got.text === text, `decideText: ${why}`,
            `got ${JSON.stringify(got)}, expected outcome ${outcome} and text ${JSON.stringify(text)}`);
    }

    // Git checks a repo out with the platform's line endings, so a Windows copy holds CRLF where the
    // upstream stores LF. The comparison happens in LF and the result goes back in what the file had.
    const windows = harness.decideText(
        { policy: "merge", raw: "one\r\ntwo edited\r\n", theirs: THEIRS, hasBase: true, adopt: false },
        { baseText: () => OURS, recoverBase: () => null, merge: never });
    t.ok(windows.outcome === "written" && windows.text === "one\r\ntwo upstream\r\n",
        "decideText: a CRLF working copy is written back in CRLF", JSON.stringify(windows));
    const unchanged = harness.decideText(
        { policy: "merge", raw: "one\r\ntwo upstream\r\n", theirs: THEIRS, hasBase: true, adopt: false },
        { baseText: never, recoverBase: never, merge: never });
    t.ok(unchanged.outcome === "unchanged",
        "decideText: a CRLF copy matching the upstream does not read as edited", JSON.stringify(unchanged));

    // A file with no lines to merge is the upstream's copy or the project's, and the base decides.
    const bin = (held, theirs, was, adopt = false) => harness.decideBinary(
        { held: Buffer.from(held), theirs: Buffer.from(theirs), hasBase: was !== null, adopt },
        { baseBytes: () => (was === null ? null : Buffer.from(was)) });
    const binCases = [
        [bin("a", "a", "a"), "unchanged", "a copy already matching the upstream is left alone"],
        [bin("a", "b", "a"), "written", "a copy nobody replaced takes the upstream's"],
        [bin("mine", "b", "a"), "yours, binary", "a copy the project replaced stays replaced"],
        [bin("mine", "b", null), "yours, no base", "with no base a differing copy is the project's"],
        [bin("mine", "b", "a", true), "adopted", "--adopt takes the upstream's binary too"],
    ];
    for (const [got, outcome, why] of binCases)
        t.ok(got.outcome === outcome, `decideBinary: ${why}`, `got ${got.outcome}, expected ${outcome}`);
}

// The install plan, from an upstream and a target held in memory: the upstream as a list of commits,
// oldest first, each mapping a path to its text or to { text, exec } or { link }; the target as a
// map from path to text or { link }. Everything plan() reads crosses those two adapters, so a whole
// install is a row here rather than a clone and a temp tree.
function memoryUpstream(commits) {
    const at = new Map(commits);
    const head = commits[commits.length - 1][0];
    const entry = (commit, file) => {
        const e = (at.get(commit) || {})[file];
        return e === undefined ? null : typeof e === "string" ? { text: e } : e;
    };
    return {
        files: () => Object.keys(at.get(head)).map(file => ({ file, link: !!entry(head, file).link, exec: !!entry(head, file).exec })),
        blob: (commit, file) => { const e = entry(commit, file); return e ? e.link || e.text : null; },
        hasCommit: commit => at.has(commit),
        history: file => commits.filter(([c]) => entry(c, file)).map(([c]) => c).reverse(),
    };
}
function memoryTarget(files) {
    const has = file => file in files || Object.keys(files).some(k => k.startsWith(`${file}/`));
    return {
        exists: has,
        read: (file, binary) => binary ? Buffer.from(files[file]) : files[file],
        lstat: file => !has(file) ? null : { link: typeof files[file] === "object" ? files[file].link : null },
    };
}

function installPlanCoversEveryCase(t) {
    const harness = installer();
    if (!harness) { t.skip("the install plan: the installer is the upstream's own, not installed here"); return; }
    const up = memoryUpstream([
        ["c1", {
            ".githooks/pre-commit": { text: "hook v1\n", exec: true },
            "AGENTS.md": "# Agents\nold rule\n",
            "notes.md": "one\ntwo\nthree\n",
            ".claude/agents": { link: ".agents/agents" },
        }],
        ["c2", {
            ".githooks/pre-commit": { text: "hook v2\n", exec: true },
            "AGENTS.md": "# Agents\nnew rule\n",
            "notes.md": "one\ntwo\nthree upstream\n",
            ".claude/agents": { link: ".agents/agents" },
            ".claude/skills/a": { link: "../../.agents/skills/a" },
            ".agents/skills/a/SKILL.md": "skill a\n",
            ".agents/skills/a/run.sh": { text: "run\n", exec: true },
            ".agents/skills/mine/SKILL.md": "the upstream's mine\n",
            "skills-lock.json": JSON.stringify({ skills: { a: { source: "up" }, shared: { source: "up" } } }),
            "src/README.md": "src\n",
            "README.md": "readme\n",
            "tests/fixtures/x.md": "x\n",
            "tools/docs-site/astro.mjs": "astro\n",
        }],
    ]);
    const rows = [
        { path: "tests/fixtures/", policy: "template" },
        { path: "tools/docs-site/", policy: "optional:astro-docs" },
        { path: "README.md", policy: "skip" },
        { path: "src/", policy: "seed" },
        { path: "AGENTS.md", policy: "reconcile" },
        { path: "skills-lock.json", policy: "skills" },
        { path: ".agents/skills/", policy: "skills" },
        { path: ".claude/skills/", policy: "skills" },
    ];
    const run = (files, previous, options = {}) => harness.plan({
        upstream: up, target: memoryTarget(files), rows, head: "c2", ref: "master", previous,
        options: { dryRun: false, adopt: false, quiet: true, check: true, wants: () => false, ...options },
        stamp: { installer: "test" },
    });
    const pick = (p, file) => p.entries.find(e => e.file === file) || {};
    const show = e => JSON.stringify({ ...e, write: typeof e.write === "string" ? e.write : e.write && "<bytes>" });
    const is = (e, want, why) => {
        const ok = Object.entries(want).every(([k, v]) => e[k] === v);
        t.ok(ok, `install plan: ${why}`, `got ${show(e)}\nexpected ${JSON.stringify(want)}`);
    };

    const fresh = run({}, null);
    is(pick(fresh, ".githooks/pre-commit"), { outcome: "written", bucket: "written", write: "hook v2\n", exec: true }, "a first install writes a hook, executable");
    is(pick(fresh, "src/README.md"), { outcome: "created", bucket: "seeded", write: "src\n" }, "a seed file is created when absent");
    is(pick(fresh, "README.md"), { outcome: "absent", bucket: null, write: undefined }, "a skipped file the target lacks is named, not written");
    is(pick(fresh, "tests/fixtures/x.md"), { outcome: "template", bucket: "template", silent: true, write: undefined }, "the upstream's own files are never installed");
    is(pick(fresh, "tools/docs-site/astro.mjs"), { outcome: "template", write: undefined }, "an optional part nobody asked for is not installed");
    is(pick(fresh, ".claude/agents"), { outcome: "written", link: ".agents/agents", replace: undefined }, "a link is planned as a link");
    is(pick(fresh, ".claude/skills/a"), { mkdir: true, link: undefined }, "a per-skill link is left to relink, its folder made");
    is(pick(fresh, ".agents/skills/a/SKILL.md"), { bucket: "written", write: "skill a\n", silent: true }, "a skill's files are written without a line each");
    is(pick(fresh, ".agents/skills/a/run.sh"), { exec: true }, "a skill's script lands executable");
    is(pick(fresh, ".agents/skills/a  (2 file(s))"), { outcome: "added", policy: "skills" }, "a skill is reported once, by name");
    is(pick(fresh, "MEMORY.md"), { outcome: "created", bucket: "seeded" }, "a first install lays down the skeletons");
    t.ok((pick(fresh, "MEMORY.md").write || "").includes("- **Language:** <language>"), "install plan: the MEMORY.md skeleton carries the facts", pick(fresh, "MEMORY.md").write);
    const receipt = JSON.parse(pick(fresh, "harness-lock.json").write || "{}");
    t.ok(receipt.commit === "c2" && receipt.ref === "master" && receipt.installer === "test", "install plan: the receipt records the upstream commit and the run", JSON.stringify(receipt));
    t.ok(fresh.base === null && fresh.notices.length === 0, "install plan: a first install has no base and nothing to warn about", fresh.notices.join("\n"));

    const target = {
        ".githooks/pre-commit": "hook v1\n",
        "notes.md": "zero\none\ntwo\nthree\n",
        "AGENTS.md": "# Agents\r\nold rule\r\n",
        "MEMORY.md": "# Project memory\n",
        ".claude/agents": { link: ".agents/agents" },
        "skills-lock.json": JSON.stringify({ skills: { mine: { source: "me" }, shared: { source: "me" } } }),
    };
    const update = run(target, { commit: "c1", ref: "master" });
    is(pick(update, ".githooks/pre-commit"), { outcome: "written", write: "hook v2\n", exec: true }, "an untouched file takes the upstream's");
    is(pick(update, "notes.md"), { outcome: "merged", bucket: "merged", write: "zero\none\ntwo\nthree upstream\n" }, "an edited file keeps its edit and gains the upstream's");
    is(pick(update, "AGENTS.md"), { outcome: "written", write: "# Agents\r\nnew rule\r\n" }, "a CRLF copy nobody edited is updated in its own endings");
    is(pick(update, "MEMORY.md"), { outcome: "yours", bucket: null, write: undefined }, "an existing skeleton is left alone");
    is(pick(update, ".claude/agents"), { outcome: "unchanged", link: undefined }, "a link already in place is left alone");
    is(pick(update, ".agents/skills/mine  (1 file(s))"), { outcome: "yours" }, "a skill the project vendored under the same name stays the project's");
    const lock = JSON.parse(pick(update, "skills-lock.json").write || "{}").skills || {};
    t.ok(lock.shared.source === "me" && lock.a.source === "up" && lock.mine.source === "me", "install plan: skills-lock.json is the union, the project's entry winning", JSON.stringify(lock));

    const stale = run({ ".githooks/pre-commit": "hook mine\n", "AGENTS.md": "# Agents\nold rule\n", ".claude/agents": ".agents/agents" }, null);
    t.ok(stale.notices.some(n => n.includes("predates the receipt")), "install plan: a harness with no receipt is named", stale.notices.join("\n"));
    is(pick(stale, ".githooks/pre-commit"), { outcome: "yours, no base", bucket: "kept", write: undefined, exec: true }, "with no base an edited hook is kept, and still made executable");
    is(pick(stale, "AGENTS.md"), { outcome: "written", write: "# Agents\nnew rule\n" }, "a reconcile file finds its base in the upstream's history");
    is(pick(stale, ".claude/agents"), { outcome: "yours", bucket: "kept", link: undefined }, "a link checked out as a file is kept without --adopt");

    const adopted = run({ ".githooks/pre-commit": "hook mine\n", ".claude/agents": ".agents/agents" }, null, { adopt: true });
    t.ok(adopted.notices.some(n => n.includes("--adopt was given")), "install plan: --adopt says what it replaces", adopted.notices.join("\n"));
    is(pick(adopted, ".githooks/pre-commit"), { outcome: "adopted", write: "hook v2\n" }, "--adopt takes the upstream's copy over an edit");
    is(pick(adopted, ".claude/agents"), { outcome: "merged", link: ".agents/agents", replace: true }, "--adopt replaces a link checked out as a file");

    const moved = run({ ".claude/agents": { link: "elsewhere" } }, { commit: "c1" });
    is(pick(moved, ".claude/agents"), { outcome: "merged", link: ".agents/agents", replace: true }, "a link pointing elsewhere is repointed");
    const gone = run({}, { commit: "rewritten" });
    t.ok(gone.base === null && gone.notices.some(n => n.includes("is not in")), "install plan: a recorded commit the upstream lost leaves no base", gone.notices.join("\n"));
    const again = run({}, { commit: "c2" }, { adopt: true });
    t.ok(again.notices.some(n => n.includes("already at")), "install plan: --adopt at the recorded commit runs anyway, and says so", again.notices.join("\n"));
    const docs = run({}, null, { wants: name => name === "astro-docs" });
    is(pick(docs, "tools/docs-site/astro.mjs"), { outcome: "created", bucket: "seeded", write: "astro\n" }, "an optional part the run asked for is seeded");

    // A dry run prints the plan's lines and touches nothing: apply is pointed at a root that does not
    // exist, and still has to come back with every entry.
    const nowhere = path.join(os.tmpdir(), `harness-dry-run-${process.pid}-${Date.now()}`);
    const printed = [];
    const log = console.log;
    console.log = m => printed.push(m);
    let done;
    try { done = harness.apply(fresh.entries, nowhere, { dryRun: true, quiet: false }); }
    finally { console.log = log; }
    const out = printed.join("\n");
    t.ok(/merge\s+100755\s+written\s+\.githooks\/pre-commit/.test(out) && !out.includes("harness-lock.json"),
        "install plan: a dry run prints each path's line, and nothing silent", out);
    t.ok(!fs.existsSync(nowhere) && done.length === fresh.entries.filter(e => !e.phase).length,
        "install plan: a dry run writes nothing", `${done.length} entries; ${nowhere} exists: ${fs.existsSync(nowhere)}`);
}

// One real install, end to end, from this checkout into an empty repository: the plan and the table
// above can agree with each other and still disagree with the disk. A dry run first, which must
// leave the repository as it found it, then the install, then a second run with nothing to do.
function installerInstallsIntoAnEmptyRepo(t) {
    if (!installer()) { t.skip("a real install: the installer is the upstream's own, not installed here"); return; }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-install-"));
    const node = args => require("child_process").spawnSync(process.execPath, [INSTALLER, "--from", lib.checkout, "--target", dir, "--quiet", ...args], { encoding: "utf8" });
    try {
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
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// The stage table in AGENTS.md has one parser, readChain(), and anything that needs the pipeline
// builds on it rather than reading the table again. Pin what it promises those callers: every row
// in table order, document stages carrying the folder their name implies.
// Written out rather than read from AGENTS.md on purpose: a test that asks the parser what the
// table says and then checks the answer against the table proves only that reading twice gives the
// same answer. This is the expectation the parser is held to, so reordering the table without
// meaning to fails here. Reordering it on purpose is an edit to this line as well.
const PIPELINE = ["BRD", "PRD", "EARS", "BDD", "ADR", "SPEC"];
function chainIsParsedInPipelineOrder(t) {
    const { stages, problems } = docsCheck.readChain(lib.checkout);
    const named = stages.map(s => s.stage);
    const detail = named.join(",");
    t.ok(problems.length === 0, "readChain finds no problem in this repo's table", problems.join("\n"));
    const order = PIPELINE.map(s => named.indexOf(s));
    t.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), "readChain returns the stages in pipeline order", detail);
    t.ok(stages.some(s => !s.folder), "readChain returns the stages that are not documents too", detail);
    const wrong = stages.filter(s => s.folder && s.folder !== s.stage.toLowerCase());
    t.ok(!wrong.length, "every document stage's folder matches its name", wrong.map(s => `${s.stage} -> ${s.lives}`).join(","));
}

// readDocs() is the one model of the chain: what check() validates is what the portal renders. Pin
// the part that made two readers a bug rather than a duplication -- the file-name rule. A name the
// rule rejects is a problem and not a document, so a second reader cannot render a file nothing
// checked, which is what happened while the portal carried its own looser rule.
function oneModelForValidatorAndPortal(t) {
    const view = chainView({
        "docs/brd/9401-billing.md": ["# BRD-9401: Billing", "", "**Derived from:** jira:AB-42", "", "- BR-1: Bill monthly."],
        "docs/prd/9401-биллинг.md": ["# PRD-9401: Billing", "", "**Derived from:** BRD-9401"],
    });
    const model = docsCheck.readDocs(lib.checkout, view);
    const { problems } = docsCheck.check(lib.checkout, view);

    const ids = [...model.docs.keys()].join(",");
    const rejected = model.problems.filter(p => p.includes("9401-биллинг"));
    t.ok(model.docs.has("BRD-9401"), "readDocs collects a document the file-name rule accepts", ids);
    t.ok(!model.docs.has("PRD-9401"), "readDocs makes a rejected file name a problem, not a document", ids);
    t.ok(rejected.length === 1, "readDocs reports the rejected file name once", model.problems.join("\n") || "(none)");
    // The same file, refused in the same words by the reader every consumer goes through.
    t.ok(problems.some(p => rejected.includes(p)), "check() reports what the model rejected", problems.join("\n") || "(none)");

    const doc = model.docs.get("BRD-9401");
    t.ok(doc && doc.title === "BRD-9401: Billing" && doc.link === "/brd/9401-billing/" && doc.items.has("BR-1"),
        "readDocs carries what a renderer needs: title, link, items",
        doc && `${doc.title} | ${doc.link} | ${[...doc.items]}`);
    t.ok([...("Refines BRD-9401/BR-1.".matchAll(model.refRe))].length === 1, "the model's refRe matches a citation");
    t.ok(model.itemRe.test("- BR-1: Bill monthly."), "the model's itemRe matches an item");
}

// tools/docs-site is optional: a repo that publishes straight to Jira can delete the folder and owes
// this suite nothing, so the portal's end-to-end smoke runs only when it is installed. It needs no
// Astro install of its own, since chain.mjs only reads.
function docsSiteRendersTheChain(t) {
    const entry = path.join("tools", "docs-site", "chain.mjs");
    if (!fs.existsSync(entry)) { t.skip("tools/docs-site smoke: the optional portal is not installed"); return; }
    const r = lib.node([entry]);
    t.ok(r.status === 0, "tools/docs-site/chain.mjs runs", r.output);
    if (r.status !== 0) return;
    const order = PIPELINE.map(s => r.output.indexOf(`${s}\t`));
    t.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])),
        "docs-site reads the stages in pipeline order", r.output);
    // The portal presents the model; it does not go looking for documents of its own. A directory
    // read here is a second walk of docs/, and a second walk grew a second file-name rule last time.
    const src = fs.readFileSync(entry, "utf8");
    t.ok(!/readdirSync/.test(src), "the portal reads the model rather than walking docs/ itself", entry);
}

// scripts/stacks.tsv has one reader, scripts/stacks.js, and every script that wants a stack asks it
// by name. Two readers taking the row apart by position is how the second came to be written
// `[stack, , needs, , , formats, format]`: correct, unreadable, and wrong the moment a column moved.
// A row short of a cell is the same failure from the table's side, so the width is asserted too.
function oneReaderForTheStacksTable(t) {
    const table = "scripts/stacks.tsv", reader = "scripts/stacks.js";
    if (!fs.existsSync(table) || !fs.existsSync(reader)) { t.skip("stacks table: no table or no reader here"); return; }
    const stacks = require("../../../scripts/stacks.js");
    const rows = stacks.rows(lib.checkout);
    t.ok(rows.length > 0, `${table} holds rows`);
    // A row with no triggers is scaffold-only (dotnet-aspire): nothing restores or formats through it,
    // so it must at least scaffold, or it is a row that does nothing at all.
    const idle = r => !r.stack || (!r.triggers && !r.scaffold);
    t.ok(!rows.some(idle), "every row names a stack and what triggers it, or only scaffolds",
        rows.filter(idle).map(r => JSON.stringify(r)).join("\n"));
    t.ok(rows.filter(r => !r.triggers).every(r => !r.restore && !r.formats && !r.format),
        "a scaffold-only row restores and formats nothing, since no file can trigger it",
        rows.filter(r => !r.triggers && (r.restore || r.formats || r.format)).map(r => r.stack).join(", "));

    const wide = fs.readFileSync(table, "utf8").split(/\r?\n/)
        .filter(l => l.trim() && !l.startsWith("#"))
        .filter(l => l.split("\t").length !== stacks.COLUMNS.length);
    t.ok(!wide.length, `every row has ${stacks.COLUMNS.length} cells`, wide.map(l => l.split("\t")[0]).join(", "));

    // A pattern matches by path or basename and never across a directory separator, which is what
    // both callers rely on: *.cs must not claim a folder called "a.cs/b".
    t.ok(stacks.matches("*.cs", ["src/App/Program.cs"]), "a pattern matches by basename");
    t.ok(stacks.matches("package-lock.json", ["package-lock.json"]), "a pattern matches by path");
    t.ok(!stacks.matches("*.cs", ["a.cs/b.txt"]), "a pattern does not match across a directory separator");

    // Code only: lib.js names the table in the usage comment at its top, which is documentation of
    // the helper rather than a second reader of the table.
    const code = file => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(l => !l.trim().startsWith("//")).join("\n");
    const others = fs.readdirSync("scripts")
        .filter(n => n.endsWith(".js") && n !== "stacks.js")
        .filter(n => code(path.join("scripts", n)).includes("stacks.tsv"));
    t.ok(!others.length, `only ${reader} reads ${table} itself`, others.join(", "));
}

// The harness invariants are scripts/check-harness.js's, because they travel: a target runs them after
// an edit and the installer runs them against what it wrote. The upstream holds itself to the same
// ones, with the suite's own t, so a regression here fails the suite the way it fails an install.
function harnessInvariantsHoldHere(t) {
    for (const invariant of harness.INVARIANTS) invariant(t, lib.checkout);
}

// The upstream's own skills all pass the frontmatter check, so harnessInvariantsHoldHere proves only
// that it passes. Each broken shape gets a skill of its own in a temporary root, and the check must
// name every one of them and none of the valid ones: quoted values and a folded description included.
function skillFrontmatterCheckNamesEachProblem(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-skill-frontmatter-"));
    const skill = (name, text) => {
        fs.mkdirSync(path.join(root, ".agents/skills", name), { recursive: true });
        if (text !== null) fs.writeFileSync(path.join(root, ".agents/skills", name, "SKILL.md"), text);
    };
    skill("plain-ok", "---\nname: plain-ok\ndescription: Does one thing.\n---\nBody\n");
    skill("quoted-ok", "---\nname: \"quoted-ok\"\ndescription: 'Does one thing.'\n---\n");
    skill("folded-ok", "---\nname: folded-ok\ndescription: >\n  Spans\n  two lines.\nlicense: MIT\n---\n");
    skill("no-file", null);
    skill("no-frontmatter", "# Just a heading\n");
    skill("wrong-name", "---\nname: other\ndescription: x\n---\n");
    skill("Bad_Name", "---\nname: Bad_Name\ndescription: x\n---\n");
    skill("no-description", "---\nname: no-description\n---\n");
    skill("empty-folded", "---\nname: empty-folded\ndescription: >\n---\n");
    skill("too-long", `---\nname: too-long\ndescription: ${"x".repeat(1025)}\n---\n`);

    const found = [];
    const probe = { ok: (condition, title, detail) => { if (!condition) found.push(...detail.split("\n")); }, skip: why => found.push(`skip: ${why}`) };
    const invariant = harness.INVARIANTS.find(fn => fn.name === "everySkillHasValidFrontmatter");
    invariant(probe, root);
    fs.rmSync(root, { recursive: true, force: true });

    const expected = {
        "no-file": "no SKILL.md",
        "no-frontmatter": "does not start with --- frontmatter",
        "wrong-name": "name is 'other'",
        "Bad_Name": "lowercase letters",
        "no-description": "no description",
        "empty-folded": "no description",
        "too-long": "over 1024",
    };
    for (const [name, says] of Object.entries(expected)) {
        t.ok(found.some(line => line.startsWith(`${name}:`) && line.includes(says)),
            `the skill frontmatter check reports ${name} (${says})`, found.join("\n"));
    }
    const noise = found.filter(line => /^(plain-ok|quoted-ok|folded-ok):/.test(line) || line.startsWith("skip:"));
    t.ok(!noise.length, "the skill frontmatter check accepts plain, quoted and folded values", noise.join("\n"));
}

// check-harness asserts the shape of the hooks githook.js handles and leaves a target's own hooks
// alone. The upstream ships no hook of its own, so every file in its .githooks/ is one githook.js must
// handle: a hook added there without a handler would reach every target and do nothing.
function everyUpstreamHookIsHandled(t) {
    const known = Object.keys(require("../../../scripts/githook.js").HOOKS);
    const unhandled = fs.readdirSync(path.join(lib.checkout, ".githooks")).filter(n => !known.includes(n));
    t.ok(!unhandled.length, "githook.js handles every hook in .githooks/", unhandled.join(", "));
}

// check-edit.js runs the invariants after an edit to a path they read, in any repo, and that path
// list is check-harness's own. Points CLAUDE_PROJECT_DIR at a directory whose routing file names an
// agent nobody has, edits it, and requires the hook to object.
function checkEditRunsTheInvariantsOnTheirPaths(t, env) {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "harness-edit-invariants-"));
    const routing = path.join(other, ".agents", "routing.md");
    fs.mkdirSync(path.join(other, ".agents", "agents"), { recursive: true });
    fs.writeFileSync(routing, "# Routing\n\n## Shared\n\nRead by `ghost`.\n");
    fs.writeFileSync(path.join(other, ".agents", "agents", "engineer.md"), "---\nname: engineer\n---\nSee routing.md, Shared.\n");
    const r = lib.node([".agents/hooks/check-edit.js"], {
        input: JSON.stringify({ tool_input: { file_path: routing } }),
        env: { ...env, CLAUDE_PROJECT_DIR: other },
    });
    fs.rmSync(other, { recursive: true, force: true });
    t.ok(harness.reads(".agents/routing.md"), "check-harness reads .agents/routing.md");
    t.ok(r.status === 2 && r.output.includes("is read by exactly the agents it names"),
        "check-edit.js runs the harness invariants after an edit to a path they read", r.output);
}

// A check runs because it is in the array below, and nothing but this notices when one is not: an
// unregistered function raises the pass count of the suite by zero and the failure count by zero,
// so the tally reads exactly as it did before it was written. Caught by reading this file rather
// than by any cleverness at run time, because a function nobody calls leaves no trace to inspect.
// tables.js holds the in-process decision tables and registers them the same way, so both files are read.
function everyCheckIsRegistered(t) {
    const files = [__filename, path.join(__dirname, "tables.js")];
    const defined = files.flatMap(file => [...fs.readFileSync(file, "utf8").matchAll(/^function (\w+)\(t\b/gm)].map(m => m[1]));
    const registered = new Set([...module.exports, ...require("./tables")].map(fn => fn.name));
    const missing = defined.filter(name => !registered.has(name));
    t.ok(defined.length > 0, "this file defines checks", String(defined.length));
    t.ok(!missing.length, "every check defined in self-checks.js and tables.js is in its exported array", missing.join(", "));
}

module.exports = [
    everyCheckIsRegistered,
    harnessInvariantsHoldHere,
    skillFrontmatterCheckNamesEachProblem,
    everyUpstreamHookIsHandled,
    everyTrackedPathIsClassified,
    oneReaderForTheStacksTable,
    initialisationGateAnswersEveryState,
    docsCheckCitationEdgeCases,
    docsCheckDerivedFromShapes,
    docsCheckSourceAndAdrExemption,
    docsCheckMemoryRequirements,
    docsCheckIntentShape,
    memorySkeletonDefersToIntent,
    projectInitTemplateMatchesFacts,
    chainIsParsedInPipelineOrder,
    oneModelForValidatorAndPortal,
    docsSiteRendersTheChain,
    sessionStartFollowsProjectDir,
    checkEditFollowsProjectDir,
    checkEditChecksMemoryRequirements,
    claudeHooksRunInEveryShell,
    checkEditRunsTheInvariantsOnTheirPaths,
    manifestPoliciesAreReadInOrder,
    installerRejectsUnknownArguments,
    installDecisionCoversEveryOutcome,
    installPlanCoversEveryCase,
    installerInstallsIntoAnEmptyRepo,
];
