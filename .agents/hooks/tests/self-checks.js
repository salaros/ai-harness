// .agents/hooks/tests/self-checks.js
// Invariants that don't fit cases.tsv's "run a script against a fixture, check exit code and
// output" shape: each function below gets a `t` (t.ok(condition, title, detail) for a verdict,
// t.skip(why) for a check this repo cannot run) and the env test.js runs fixtures with (HOOK_TEST
// set, the harness project-dir variables cleared).
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
const commitMsg = require("../../../scripts/check-commit-msg");
const todo = require("../../../scripts/check-todo");

// scripts/update-harness.js is the upstream's own and is never installed, so a project that borrowed
// this suite has no installer to test. Required lazily for that reason: at the top it would throw
// before the first check ran, and take the whole suite with it.
const INSTALLER = path.join(__dirname, "..", "..", "..", "scripts", "update-harness.js");
const installer = () => fs.existsSync(INSTALLER) ? require(INSTALLER) : null;

// A harness installed by scripts/update-harness.js has its files on disk and nothing in the index
// until the project makes its first commit. Both mode checks below assert what the index records, so
// that state is nothing to assert rather than a failure: saying the hooks are not executable when
// they have simply never been committed sends the reader looking for a bug that is not there.
function untracked(dir) { return fs.existsSync(dir); }

// Git skips a hook that is not executable, and says nothing about it. On Windows core.fileMode is
// normally false, so chmod is a no-op and a hook added there is recorded 100644: it runs for its
// author and silently never runs on Linux or macOS. Only `git update-index --chmod=+x <file>` fixes
// the mode Git records, so the mode in the index is what this asserts.
// .claude/skills is one symlink to .agents/skills, so a skill has one copy on disk. A harness that
// wants a link per skill gets .claude/skills/<name> instead, and both shapes are mode 120000.
// `npx skills add` recreates per-skill links absolute, and `node scripts/skills.js relink` rewrites
// them relative -- but a skill staged before the relink goes into the index as the directory it was
// at the time, one 100644 blob per file. That commits a second copy of the skill that no longer
// tracks the first, and leaves the worktree permanently dirty against it. Mode 120000 is the
// symlink, so the mode in the index is what this asserts.
function claudeSkillLinksAreSymlinks(t) {
    const r = lib.run("git", ["ls-files", "-s", "--", ".claude/skills"]);
    if (r.status !== 0) { t.skip(".claude/skills mode check: not a git checkout"); return; }
    const rows = r.output.split(/\r?\n/).filter(Boolean).map(l => l.split(/\s+/));
    if (!rows.length && untracked(".claude/skills")) { t.skip(".claude/skills mode check: present on disk, not committed yet"); return; }
    t.ok(rows.length > 0, "git tracks entries under .claude/skills/", r.output);
    const notLinks = rows.filter(([mode]) => mode !== "120000").map(row => row[row.length - 1]);
    t.ok(!notLinks.length,
        "every .claude/skills/ entry is committed as a symlink (node scripts/skills.js relink, then stage)",
        notLinks.slice(0, 10).join(", "));
}

// A harness surfaces the skills it can see, so a skill with no link is a skill that does not exist
// as far as the agent is concerned. One link to the whole folder shows every skill, a local one
// written by hand included, and the only thing left to check is where it points. A folder of
// per-skill links shows what someone linked and nothing else -- `npx skills` links what it
// vendored -- so there the count is the check. Reading a name through the whole-folder link would
// compare .agents/skills with itself and pass whatever the state.
function everyInstalledSkillIsLinked(t) {
    const skills = ".agents/skills", links = ".claude/skills";
    if (!fs.existsSync(skills) || !fs.existsSync(links)) { t.skip("skill link check: no skills directories"); return; }
    const installed = fs.readdirSync(skills).filter(n => fs.existsSync(path.join(skills, n, "SKILL.md")));
    t.ok(installed.length > 0, "skills are installed under .agents/skills/");
    if (fs.lstatSync(links).isSymbolicLink()) {
        const target = fs.readlinkSync(links);
        t.ok(path.resolve(path.dirname(links), target) === path.resolve(skills),
            "the .claude/skills link points at .agents/skills", target);
        return;
    }
    const unlinked = installed.filter(n => { try { fs.lstatSync(path.join(links, n)); return false; } catch { return true; } });
    t.ok(!unlinked.length,
        "every installed skill has a .claude/skills/ link (node scripts/skills.js relink)",
        unlinked.slice(0, 10).join(", "));
}

// .claude/skills resolves to .agents/skills, so anything a tool writes into the first lands in the
// second. `npx skills` links what it vendors into every harness folder it finds, and a link it puts
// there would appear beside the skills as a sibling pointing at one of them. Nothing else in the
// harness ever creates one, so an entry here that is not a directory is that, and it is worth
// catching: the roster reads this folder, and a skill that is really a link to another skill counts
// twice and vendors as neither.
function skillsFolderHoldsSkillsNotLinks(t) {
    const skills = ".agents/skills";
    if (!fs.existsSync(skills)) { t.skip("skills folder check: no skills directory"); return; }
    const links = fs.readdirSync(skills).filter(n => fs.lstatSync(path.join(skills, n)).isSymbolicLink());
    t.ok(!links.length,
        "every entry under .agents/skills/ is a skill, not a link to one",
        links.slice(0, 10).join(", "));
}

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

// Vendoring a skill copies someone else's work into this repo, and MIT and Apache-2.0 both ask that
// the copyright and permission notice travel with the copy. `npx skills` carries only what sits
// inside the skill folder, so an upstream keeping its licence at the repo root sends nothing, and
// the notice has to be written here. Nothing about adding a skill prompts anyone to do that, which
// is what this check is for: THIRD-PARTY-NOTICES.md is generated, so a new upstream with no row in
// scripts/skill-licences.tsv fails the suite rather than shipping unattributed.
function vendoredSkillsAreAttributed(t) {
    const r = lib.node(["scripts/skills.js", "notices", "--check"]);
    t.ok(r.status === 0,
        "THIRD-PARTY-NOTICES.md covers every vendored skill (node scripts/skills.js notices)",
        r.output);
}

// .agents/routing.md holds the rows more than one agent routes through, in a section per audience:
// each section names its agents, each agent names its sections, and the two must agree. Either half
// is a silent failure otherwise. A section nobody names is dead rows; an agent naming a section that
// does not exist routes nothing, and neither shows up as a broken link or a bad exit code anywhere
// else. `scripts/skills.js list` reads the same pairing to credit a moved row to the agents that
// still route it, so this also pins that attribution.
// The file lives above .agents/agents/ on purpose: .claude/agents is a symlink to that folder, and a
// harness reads everything in there as an agent definition.
function agentRoutingSectionsAgreeOnTheirAudience(t) {
    const dir = ".agents/agents", shared = "routing.md";
    const file = path.join(".agents", shared);
    if (!fs.existsSync(file)) { t.skip("routing section check: no routing.md"); return; }
    const bodies = {};
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith(".md"))) {
        const text = fs.readFileSync(path.join(dir, f), "utf8");
        const name = (text.match(/^name:\s*(.+)$/m) || [])[1];
        if (name && text.includes(shared)) bodies[name.trim()] = text;
    }
    const sections = fs.readFileSync(file, "utf8").split(/^## /m).slice(1);
    t.ok(sections.length > 0 && Object.keys(bodies).length > 0,
        `${shared} has sections and agents point at it`, `${sections.length} section(s), ${Object.keys(bodies).length} agent(s)`);
    for (const s of sections) {
        const title = s.split(/\r?\n/)[0].trim();
        const line = s.match(/^Read by .*$/m);
        const stated = line ? [...line[0].matchAll(/`([a-z-]+)`/g)].map(m => m[1]).sort() : [];
        const actual = Object.keys(bodies).filter(n => bodies[n].includes(title)).sort();
        t.ok(stated.length > 0, `"${title}" says which agents read it, on a "Read by" line`);
        t.ok(stated.join(",") === actual.join(","),
            `"${title}" is read by exactly the agents it names`,
            `names ${stated.join(", ") || "(none)"}; named by ${actual.join(", ") || "(none)"}`);
    }
}

// The project-init gate. Exercised against temp directories rather than this checkout, whose own
// answer depends on whether the developer running the suite has created the marker file.
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

        write("MEMORY.md", "");
        t.ok(!init.check(dir).ok, "an empty MEMORY.md is blocked", init.check(dir).reason);

        write("MEMORY.md", full.replace("C#", "<language>"));
        const placeheld = init.check(dir);
        t.ok(!placeheld.ok && placeheld.missing.includes("Language"),
            "a fact left as a <placeholder> is blocked and named", placeheld.reason);

        write("MEMORY.md", full.split("\n").filter(l => !l.includes("Runtime")).join("\n"));
        t.ok(!init.check(dir).ok, "a missing stack line is blocked", init.check(dir).reason);

        write("MEMORY.md", full.split("\n").filter(l => !l.includes("Issue tracker:")).join("\n"));
        t.ok(init.check(dir).ok, "a project with no issue tracker at all passes", init.check(dir).reason);

        write("MEMORY.md", full);
        t.ok(init.check(dir).ok, "a MEMORY.md with every required fact passes", init.check(dir).reason);

        clear();
        write(".skip-project-init", "");
        t.ok(init.check(dir).ok, "the marker file passes a clone with no MEMORY.md at all", init.check(dir).reason);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function gitHooksAreExecutable(t) {
    const r = lib.run("git", ["ls-files", "-s", "--", ".githooks"]);
    if (r.status !== 0) { t.skip(".githooks mode check: not a git checkout"); return; }
    const rows = r.output.split(/\r?\n/).filter(Boolean).map(l => l.split(/\s+/));
    if (!rows.length && untracked(".githooks")) { t.skip(".githooks mode check: present on disk, not committed yet"); return; }
    t.ok(rows.length > 0, "git tracks files under .githooks/", r.output);
    const notExecutable = rows.filter(([mode]) => mode !== "100755").map(row => row[row.length - 1]);
    t.ok(!notExecutable.length,
        "every .githooks/ hook is committed executable (git update-index --chmod=+x <file>)",
        notExecutable.join(", "));
}

// The lock file and .agents/skills must agree. This is breakage, not bookkeeping: a skill recorded
// in the lock but absent from disk means a damaged or partial checkout, and `skills.js install`
// fixes it. Nothing here requires a project to route, document or tabulate the skills it installs.
function noSkillIsMissingFromDisk(t) {
    const r = lib.node(["scripts/skills.js", "missing"]);
    t.ok(r.status === 0, "node scripts/skills.js missing", r.output);
}

// docs-check's citation logic, exercised directly against a throwaway doc tree (real stage folder
// names, so it uses the real AGENTS.md chain) rather than through a fixture: a duplicate document
// number, a citation to an item that does not exist in its target, and a citation that jumps
// forward in the chain. A unique OS-temp directory, not a fixed path under the repo, so two runs
// (a manual one and one the edit hook triggers) can never collide on the same files.
function docsCheckCitationEdgeCases(t) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "harness-docs-check-"));
    const write = (rel, ...lines) => {
        const file = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, lines.join("\n") + "\n");
    };
    write("brd/9001-alpha.md", "# BRD-9001: Alpha");
    write("brd/9001-beta.md", "# BRD-9001: Beta");
    write("brd/9002-source.md", "# BRD-9002: Source", "", "- BR-1: Something real");
    write("prd/9002-citer.md", "# PRD-9002: Citer", "", "**Derived from:** BRD-9002", "", "Refines BRD-9002/BR-2, which does not exist.");
    write("brd/9003-support.md", "# BRD-9003: Support");
    write("ears/9003-late.md", "# EARS-9003: Late");
    write("prd/9003-early.md", "# PRD-9003: Early", "", "**Derived from:** BRD-9003", "", "See EARS-9003 for details.");
    const { problems } = docsCheck.check(lib.checkout, tmp, "AGENTS.md");
    fs.rmSync(tmp, { recursive: true, force: true });
    const has = needle => problems.some(p => p.includes(needle));
    const detail = problems.join("\n") || "(none)";
    t.ok(has("already used by"), "docs-check: duplicate document number", detail);
    t.ok(has("has no item BR-2"), "docs-check: citation to a missing item", detail);
    t.ok(has("later in the chain"), "docs-check: citation later in the chain", detail);
}

// A throwaway doc tree: real stage folder names, so check() uses the real AGENTS.md chain, and a
// unique OS-temp directory so two runs (a manual one and one the edit hook triggers) never collide.
// Returns { write, run, clean }; run() gives back a helper that filters problems by file.
function docTree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-docs-check-"));
    return {
        dir,
        write(rel, ...lines) {
            const file = path.join(dir, rel);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, lines.join("\n") + "\n");
        },
        run(memoryFile) {
            const { problems } = docsCheck.check(lib.checkout, dir, "AGENTS.md", memoryFile || path.join(dir, "no-memory-here.md"));
            return {
                all: problems.join("\n") || "(none)",
                for: rel => problems.filter(p => p.startsWith(path.join(dir, rel).split(path.sep).join("/"))),
            };
        },
        clean: () => fs.rmSync(dir, { recursive: true, force: true }),
    };
}

// Every document says where it came from. Where the chain holds nothing earlier that is a source:
// a URL, an existing repo-relative path, or a Jira key. A missing line, a line naming nothing, and
// a path that does not exist are each their own message.
function docsCheckDerivedFromShapes(t) {
    const tree = docTree();
    tree.write("brd/9100-url.md", "# BRD-9100: Url", "", "**Derived from:** https://example.com/brief");
    tree.write("brd/9101-jira.md", "# BRD-9101: Jira", "", "**Derived from:** jira:ABC-123");
    tree.write("brd/9102-path.md", "# BRD-9102: Path", "", "**Derived from:** .scratch/README.md");
    tree.write("brd/9103-absent.md", "# BRD-9103: Absent");
    tree.write("brd/9104-words.md", "# BRD-9104: Words", "", "**Derived from:** the whiteboard");
    tree.write("brd/9105-gone.md", "# BRD-9105: Gone", "", "**Derived from:** docs/nowhere/missing.md");
    const r = tree.run();
    tree.clean();
    for (const ok of ["brd/9100-url.md", "brd/9101-jira.md", "brd/9102-path.md"])
        t.ok(r.for(ok).length === 0, `docs-check: ${ok} derives from a valid source`, r.all);
    t.ok(r.for("brd/9103-absent.md").some(p => p.includes("missing a")), "docs-check: no Derived from line at all", r.all);
    t.ok(r.for("brd/9104-words.md").some(p => p.includes("names no reference")), "docs-check: Derived from names nothing", r.all);
    t.ok(r.for("brd/9105-gone.md").some(p => p.includes("does not exist")), "docs-check: Derived from names a path that is not there", r.all);
}

// A source stands in for an upstream document only while nothing earlier exists. Once it does, the
// line must cite it — except on an ADR, which is cross-cutting and cites in either direction.
function docsCheckSourceAndAdrExemption(t) {
    const tree = docTree();
    tree.write("brd/9200-real.md", "# BRD-9200: Real", "", "**Derived from:** https://example.com/brief");
    tree.write("prd/9200-stale.md", "# PRD-9200: Stale", "", "**Derived from:** https://example.com/brief");
    tree.write("adr/9200-forced.md", "# ADR-9200: Forced", "", "**Derived from:** https://example.com/rfc");
    tree.write("spec/9200-design.md", "# SPEC-9200: Design", "", "**Derived from:** BRD-9200");
    tree.write("adr/9201-late.md", "# ADR-9201: Late", "", "**Derived from:** SPEC-9200");
    tree.write("prd/9201-decided.md", "# PRD-9201: Decided", "", "**Derived from:** BRD-9200", "", "Constrained by ADR-9200.");
    const r = tree.run();
    tree.clean();
    t.ok(r.for("prd/9200-stale.md").some(p => p.includes("cite the upstream document instead")),
        "docs-check: source-only line once an upstream document exists", r.all);
    t.ok(r.for("adr/9200-forced.md").length === 0, "docs-check: an ADR may derive from a source at any time", r.all);
    t.ok(r.for("adr/9201-late.md").length === 0, "docs-check: an ADR may cite a later stage", r.all);
    t.ok(r.for("prd/9201-decided.md").length === 0, "docs-check: any document may cite an ADR", r.all);
}

// MEMORY.md's Requirements takes part in traceability, so it follows the same reference rule.
function docsCheckMemoryRequirements(t) {
    const tree = docTree();
    tree.write("brd/9300-real.md", "# BRD-9300: Real", "", "**Derived from:** https://example.com/brief");
    const memory = (name, ...lines) => {
        const file = path.join(tree.dir, name);
        fs.writeFileSync(file, lines.join("\n") + "\n");
        const { problems } = docsCheck.check(lib.checkout, tree.dir, "AGENTS.md", file);
        return problems.filter(p => p.startsWith(file.split(path.sep).join("/")) || p.startsWith(file));
    };
    const cases = [
        ["none yet", ["# Project", "", "- **Requirements:** none yet"], 0, ""],
        ["a document that exists", ["- **Requirements:** BRD-9300"], 0, ""],
        ["several sources", ["- **Requirements:** https://example.com/a, jira:ABC-1"], 0, ""],
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
        const problems = memory("memory.md", ...lines);
        const detail = problems.join("\n") || "(none)";
        t.ok(want === 0 ? problems.length === 0 : problems.some(p => p.includes(needle)),
            `docs-check: MEMORY.md Requirements, ${title}`, detail);
    }
    tree.clean();
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

// What an issue reference looks like is the host project's decision, read from its own
// docs/agents/issue-tracker.md and MEMORY.md. cases.tsv drives the script as a command, which can
// only ever see this repo's files, so every fixture gets the same default and the three branches
// below have no fixture at all -- the reason check() takes a root rather than reading the cwd.
// Each case is a valid message, so the only thing that varies is the warning.
function commitMsgReadsTheProjectsTracker(t) {
    const MSG = "feat(billing): add a monthly invoice run\n\nInvoices were cut by hand every month.\n";
    const project = (files, raw = MSG) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-tracker-"));
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
            fs.writeFileSync(path.join(dir, rel), text);
        }
        const r = commitMsg.check(raw, dir);
        fs.rmSync(dir, { recursive: true, force: true });
        return r;
    };
    const TRACKER = "docs/agents/issue-tracker.md";

    const dflt = project({});
    t.ok(!dflt.problems.length && dflt.warnings.length === 1 && dflt.warnings[0].includes("PROJ-123"),
        "check-commit-msg: an unconfigured project is warned with the Jira-shaped example", JSON.stringify(dflt));

    const keyed = project({ [TRACKER]: "**Project key:** `AB`\n" });
    t.ok(keyed.warnings.length === 1 && keyed.warnings[0].includes("AB-123"),
        "check-commit-msg: the project's own key becomes the example in the warning", JSON.stringify(keyed));

    const cited = project({ [TRACKER]: "**Project key:** `AB`\n" }, `${MSG}\nRefs: AB-42\n`);
    t.ok(!cited.warnings.length, "check-commit-msg: a key matching the project's own is a reference", JSON.stringify(cited));

    // GitHub Issues cite #42, which is nothing like AB-42, so a project says so with a regular
    // expression and is warned about the right thing.
    const github = project({ [TRACKER]: "**Key format:** `#\\d+`\n" });
    t.ok(github.warnings.length === 1 && github.warnings[0].includes("#\\d+") && !github.warnings[0].includes("PROJ-123"),
        "check-commit-msg: a configured key format replaces the example", JSON.stringify(github));
    const hashed = project({ [TRACKER]: "**Key format:** `#\\d+`\n" }, MSG.replace("run", "run (#42)"));
    t.ok(!hashed.warnings.length, "check-commit-msg: a reference matching the configured format counts", JSON.stringify(hashed));

    // A project that plans in docs/ has already answered the question, so asking again on every
    // commit is asking for something it said it does not have.
    const none = project({ "MEMORY.md": "- **Issue tracker:** none\n" });
    t.ok(!none.warnings.length, "check-commit-msg: a project recording no tracker is never warned", JSON.stringify(none));
}

// A TODO source that looks like a path means a path in the repo the ledger belongs to. As a command
// that is always this checkout, so a fixture can only cite a file the template happens to ship;
// check(text, root) is what lets the suite prove the resolution rather than assume it.
function todoSourcesResolveAgainstTheGivenRoot(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-todo-"));
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "billing.cs"), "// there\n");
    const ledger = src => todo.check(`# TODO\n\n- [ ] Confirm the rounding rule #question (${src})\n`, dir);

    const here = ledger("src/billing.cs:12");
    t.ok(!here.problems.length && here.entries === 1,
        "check-todo: a path:line source resolves in the root it was given", here.problems.join("\n"));
    const elsewhere = ledger("scripts/lib.js");
    t.ok(elsewhere.problems.some(p => p.includes("is not a source")),
        "check-todo: a path outside that root is not a source, however real it is here", elsewhere.problems.join("\n"));
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "harness-docs-model-"));
    const write = (rel, ...lines) => {
        const file = path.join(tmp, rel);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, lines.join("\n") + "\n");
    };
    write("brd/9401-billing.md", "# BRD-9401: Billing", "", "**Derived from:** jira:AB-42", "", "- BR-1: Bill monthly.");
    write("prd/9401-биллинг.md", "# PRD-9401: Billing", "", "**Derived from:** BRD-9401");
    const model = docsCheck.readDocs(lib.checkout, tmp, "AGENTS.md");
    const { problems } = docsCheck.check(lib.checkout, tmp, "AGENTS.md");
    fs.rmSync(tmp, { recursive: true, force: true });

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

// A Git hook is a wrapper and nothing else: find the repo, hand over to scripts/githook.js. Every
// decision it used to make -- reading the index, computing the merge diff, working out whether Git
// had run it at all, chaining checks with `||` -- sat in a file the suite could not reach, and one
// of those decisions was wrong for as long as nobody could test it. The shape is the invariant, so
// it is asserted rather than trusted: strip the shebang and the comments, and two lines are left.
function noGitHookDecidesAnything(t) {
    if (!fs.existsSync(".githooks")) { t.skip("git hook shape: no .githooks folder"); return; }
    const hooks = fs.readdirSync(".githooks");
    t.ok(hooks.length > 0, "there are hooks in .githooks/");
    for (const name of hooks) {
        const body = fs.readFileSync(path.join(".githooks", name), "utf8")
            .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
        const want = [
            "root=$(git rev-parse --show-toplevel) || exit 1",
            `exec node "$root/scripts/githook.js" ${name} "$@"`,
        ];
        t.ok(body.length === want.length && body.every((l, i) => l === want[i]),
            `.githooks/${name} decides nothing; it calls githook.js ${name}`, body.join("\n"));
    }
    const known = Object.keys(require("../../../scripts/githook.js").HOOKS);
    const unhandled = hooks.filter(n => !known.includes(n));
    t.ok(!unhandled.length, "githook.js handles every hook in .githooks/", unhandled.join(", "));
}

// A check runs because it is in the array below, and nothing but this notices when one is not: an
// unregistered function raises the pass count of the suite by zero and the failure count by zero,
// so the tally reads exactly as it did before it was written. Caught by reading this file rather
// than by any cleverness at run time, because a function nobody calls leaves no trace to inspect.
function everyCheckIsRegistered(t) {
    const defined = [...fs.readFileSync(__filename, "utf8").matchAll(/^function (\w+)\(t\b/gm)].map(m => m[1]);
    const registered = new Set(module.exports.map(f => f.name));
    const missing = defined.filter(name => !registered.has(name));
    t.ok(defined.length > 0, "this file defines checks", String(defined.length));
    t.ok(!missing.length, "every check defined here is in the exported array", missing.join(", "));
}

module.exports = [
    everyCheckIsRegistered,
    gitHooksAreExecutable,
    noGitHookDecidesAnything,
    initialisationGateAnswersEveryState,
    claudeSkillLinksAreSymlinks,
    everyInstalledSkillIsLinked,
    skillsFolderHoldsSkillsNotLinks,
    everyTrackedPathIsClassified,
    agentRoutingSectionsAgreeOnTheirAudience,
    noSkillIsMissingFromDisk,
    vendoredSkillsAreAttributed,
    docsCheckCitationEdgeCases,
    docsCheckDerivedFromShapes,
    docsCheckSourceAndAdrExemption,
    docsCheckMemoryRequirements,
    chainIsParsedInPipelineOrder,
    oneModelForValidatorAndPortal,
    docsSiteRendersTheChain,
    sessionStartFollowsProjectDir,
    checkEditFollowsProjectDir,
    commitMsgReadsTheProjectsTracker,
    todoSourcesResolveAgainstTheGivenRoot,
    manifestPoliciesAreReadInOrder,
    installDecisionCoversEveryOutcome,
];
