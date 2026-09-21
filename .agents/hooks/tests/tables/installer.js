// .agents/hooks/tests/tables/installer.js
// scripts/update-harness.js's decisions, every one of them in process: how the manifest is read,
// which arguments it refuses, what it does to a file the target already has, and the whole plan
// against an upstream and a target held in memory.
const fs = require("fs");
const os = require("os");
const path = require("path");
const projectFacts = require("../../../../scripts/project-facts");
const { installer, INSTALLER } = require("../fixtures");

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

// The receipt names the released tool that wrote the tree. package.json says 0.0.0 everywhere but
// inside the published package, so a checkout goes by its release tag, and a checkout on no tag, or
// on a tag that is not a release, names no package at all.
function installerStampNamesOnlyAReleasedVersion(t) {
    const inst = installer();
    if (!inst) { t.skip("installer stamp: no scripts/update-harness.js"); return; }
    const name = "@salaros/ai-harness";
    const cases = [
        [{ name, version: "0.3.0", tag: null }, `${name}@0.3.0`, "the published package names the version the release wrote into it"],
        [{ name, version: "0.3.0", tag: "0.2.9" }, `${name}@0.3.0`, "the package's own version wins over a tag"],
        [{ name, version: "0.0.0", tag: "0.3.0" }, `${name}@0.3.0`, "a checkout on a release tag names that tag"],
        [{ name, version: "0.0.0", tag: null }, undefined, "a checkout on no tag names no package"],
        [{ name, version: "0.0.0", tag: "v0.2.3" }, undefined, "a v-prefixed tag is not a release and names nothing"],
        [{ name, version: undefined, tag: null }, undefined, "a package without a version names nothing"],
        [{ name: undefined, version: "0.3.0", tag: null }, undefined, "a package without a name names nothing"],
    ];
    for (const [input, want, why] of cases) {
        const got = inst.installerStamp(input);
        t.ok(got.installer === want && (want !== undefined || !("installer" in got)), `installer stamp: ${why}`, JSON.stringify({ input, got }));
    }
}

module.exports = [
    manifestPoliciesAreReadInOrder,
    installerRejectsUnknownArguments,
    installDecisionCoversEveryOutcome,
    installPlanCoversEveryCase,
    memorySkeletonDefersToIntent,
    installerStampNamesOnlyAReleasedVersion,
];
