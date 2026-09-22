// .agents/hooks/tests/tables/installer.js
// scripts/update-harness.js's decisions, every one of them in process: which arguments it refuses,
// how a conflicted merge is settled, and the whole plan against an upstream and a target held in
// memory. What each policy decides for one path is in install-policy.js beside this file.
const fs = require("fs");
const os = require("os");
const path = require("path");
const projectFacts = require("../../../../scripts/project-facts");
const repoView = require("../../../../scripts/repo-view");
const { installer, INSTALLER } = require("../fixtures");

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

// The install plan, from an upstream and a target held in memory: the upstream as a list of commits,
// oldest first, each mapping a path to its text or to { text, exec } or { link }; the target as a
// map of the same shape. Everything plan() reads crosses a repo-view, and repoView.fromMap reads
// exactly this shape, so a whole install is a row here rather than a clone and a temp tree -- and
// the view a row hands the installer is the same implementation a real run hands it, rather than a
// stand-in free to answer differently.
// Which leaves this fixture with only what a map cannot know on its own: which commit is which.
function memoryUpstream(commits) {
    const held = new Map(commits);
    return {
        at: sha => repoView.fromMap(held.get(sha) || {}),
        has: sha => held.has(sha),
        // Newest first, as `git log` gives them, from a list written oldest first.
        history: file => commits.filter(([, files]) => file in files).map(([sha]) => sha).reverse(),
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
            "licences.tsv": "# table\nup\tMIT\tv1\ngone\tMIT\tv1\n",
            "src/old.md": "old\n",
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
            "licences.tsv": "# table\nup\tMIT\tv2\n",
            "src/old.md": "old\n",
        }],
    ]);
    const rows = [
        { path: "tests/fixtures/", policy: "template" },
        { path: "tools/docs-site/", policy: "optional:astro-docs" },
        { path: "README.md", policy: "skip" },
        { path: "src/", policy: "seed" },
        { path: "AGENTS.md", policy: "reconcile" },
        { path: "licences.tsv", policy: "union" },
        { path: "skills-lock.json", policy: "skills" },
        { path: ".agents/skills/", policy: "skills" },
        { path: ".claude/skills/", policy: "skills" },
    ];
    const run = (files, previous, options = {}) => harness.plan({
        upstream: up, target: repoView.fromMap(files), rows, head: "c2", ref: "master", previous,
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
        "licences.tsv": "# table\nup\tMIT\tv1\ngone\tMIT\tv1\n",
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

    is(pick(update, "licences.tsv"), { outcome: "merged", write: "# table\nup\tMIT\tv2\ngone\tMIT\tv1\n" },
        "a union table takes the upstream's rows and keeps the one it dropped, whose skill stays here");
    const kept = run({ ...target, "licences.tsv": "# table\nup\tMIT\tv2\ngone\tMIT\tv1\n" }, { commit: "c1", ref: "master" });
    is(pick(kept, "licences.tsv"), { outcome: "unchanged", bucket: null, write: undefined }, "a union table already holding the kept row is unchanged");

    // What the project deleted stays deleted: a seed file the recorded commit shipped, and a skeleton
    // the receipt knew. A first install, and a skeleton newer than the receipt, still lay them down.
    is(pick(fresh, "src/old.md"), { outcome: "created", write: "old\n" }, "a first install seeds every seed file");
    is(pick(update, "src/old.md"), { outcome: "deleted here", bucket: null, write: undefined }, "a seed file the recorded commit shipped and the project deleted stays deleted");
    is(pick(update, "src/README.md"), { outcome: "created", write: "src\n" }, "a seed file new since the recorded commit is seeded");
    is(pick(update, "TODO.md"), { outcome: "deleted here", write: undefined }, "a skeleton the project deleted stays deleted");
    const older = run(target, { commit: "c1", ref: "master", skeletons: ["MEMORY.md", "CONTEXT.md"] });
    is(pick(older, "TODO.md"), { outcome: "created", bucket: "seeded" }, "a skeleton newer than the receipt is laid down");
    t.ok(JSON.parse(pick(update, "harness-lock.json").write).skeletons.includes("TODO.md"), "install plan: the receipt lists the skeletons it knew", pick(update, "harness-lock.json").write);
    t.ok(pick(update, "harness-lock.json").write.includes('  "skeletons": ["MEMORY.md", "CONTEXT.md", "TODO.md"]\n'),
        "install plan: the receipt writes the list on one line, as Prettier does", pick(update, "harness-lock.json").write);

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
    const late = run({}, { commit: "c2" }, { wants: name => name === "astro-docs" });
    is(pick(late, "tools/docs-site/astro.mjs"), { outcome: "created", write: "astro\n" }, "an optional part asked for at the recorded commit is still seeded");
    t.ok(late.notices.some(n => n.includes("only the optional part")), "install plan: a run at the recorded commit for an optional part says so", late.notices.join("\n"));

    // Whether main() stops at "nothing to update": an optional part asked for is something to do.
    const asks = flags => ({ adopt: false, wants: name => flags.includes(name) });
    for (const [previous, options, want, why] of [
        [{ commit: "c2" }, asks([]), true, "the recorded commit with nothing asked for has nothing to do"],
        [{ commit: "c2" }, asks(["astro-docs"]), false, "--astro-docs at the recorded commit still runs"],
        [{ commit: "c2" }, { ...asks([]), adopt: true }, false, "--adopt at the recorded commit still runs"],
        [{ commit: "c1" }, asks([]), false, "an older recorded commit runs"],
        [null, asks([]), false, "a first install runs"],
    ]) t.ok(harness.upToDate(previous, "c2", options, ["astro-docs"]) === want, `install plan: ${why}`, JSON.stringify(previous));

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

// SPEC-0001, and the whole reason bytes() is a question of its own rather than a flag on read(). A
// skill ships a logo, and until repo-view there was no way to put a file with a zero byte in it in
// front of plan(): the stand-in this table used answered a bytes read by re-encoding its own string,
// so decideBinary and planSkills' binary branch never once ran here. What they are guarding against
// is a blob decoded as UTF-8 and written back, where every byte outside ASCII becomes U+FFFD -- the
// logo installs broken, and no later run ever agrees with the upstream about it either.
function installPlanHandlesBinaryContent(t) {
    const harness = installer();
    if (!harness) { t.skip("binary content: the installer is the upstream's own, not installed here"); return; }
    // 0x00 is what makes it binary to Git and to the installer; 0xff is what a decode would destroy.
    const v1 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0xff]);
    const v2 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x02, 0xff]);
    const lock = JSON.stringify({ skills: { a: { source: "up" } } });
    const up = memoryUpstream([
        ["c1", { "logo.png": v1, ".agents/skills/a/icon.png": v1 }],
        ["c2", { "logo.png": v2, ".agents/skills/a/icon.png": v2, "skills-lock.json": lock }],
    ]);
    const rows = [{ path: "skills-lock.json", policy: "skills" }, { path: ".agents/skills/", policy: "skills" }];
    const run = (files, previous) => harness.plan({
        upstream: up, target: repoView.fromMap(files), rows, head: "c2", ref: "master", previous,
        options: { dryRun: false, adopt: false, quiet: true, check: true, wants: () => false },
    });
    const pick = (p, file) => p.entries.find(e => e.file === file) || {};
    const bytes = (e, want, why) => t.ok(Buffer.isBuffer(e.write) && e.write.equals(want),
        `binary content: ${why}`, Buffer.isBuffer(e.write) ? e.write.toString("hex") : JSON.stringify(e.write));

    const fresh = pick(run({}, null), "logo.png");
    bytes(fresh, v2, "a first install writes the upstream's bytes, byte for byte");
    const skill = pick(run({}, null), ".agents/skills/a/icon.png");
    bytes(skill, v2, "and a skill's binary file the same way, whole");

    const at = { commit: "c1", ref: "master" };
    const same = run({ "logo.png": v2, ".agents/skills/a/icon.png": v2 }, at);
    t.ok(pick(same, "logo.png").outcome === "unchanged" && pick(same, "logo.png").write === undefined,
        "binary content: a copy already holding the upstream's bytes is unchanged", JSON.stringify(pick(same, "logo.png").outcome));
    t.ok(pick(same, ".agents/skills/a/icon.png").file === undefined,
        "binary content: an unchanged skill file is not rewritten either", JSON.stringify(pick(same, ".agents/skills/a/icon.png")));

    // The project replaced the logo with its own. Nothing merges a Buffer, so it is kept whole.
    const mine = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x09, 0xfe]);
    const theirs = run({ "logo.png": mine }, at);
    t.ok(pick(theirs, "logo.png").outcome === "yours, binary" && pick(theirs, "logo.png").write === undefined,
        "binary content: a binary file the project replaced is kept, never merged", JSON.stringify(pick(theirs, "logo.png")));
    // The same file untouched since the recorded commit takes the upstream's, which is the branch
    // that needs the base read as bytes rather than as text.
    const moved = run({ "logo.png": v1 }, at);
    bytes(pick(moved, "logo.png"), v2, "a binary file nobody touched since the base takes the upstream's");
}

// A --diff3 conflict whose project side shares no line with the base is a section the project
// dropped or replaced, and stays so.
function mergeSettlesDroppedSections(t) {
    const harness = installer();
    if (!harness) { t.skip("settleDropped: the installer is the upstream's own, not installed here"); return; }
    const H = (ours, base, theirs) => `top\n<<<<<<< yours\n${ours}||||||| upstream (base)\n${base}=======\n${theirs}>>>>>>> upstream (new)\nend\n`;
    for (const [merged, text, conflicts, why] of [
        [H("dist/\n", "harness a\nharness b\n", "harness a\n"), "top\ndist/\nend\n", false, "a section the project replaced keeps the project's lines"],
        [H("", "harness a\nharness b\n", "harness a\n"), "top\nend\n", false, "a section the project deleted stays deleted"],
        [H("harness a\nmine\n", "harness a\n", "harness a\ntheirs\n"), "top\n<<<<<<< yours\nharness a\nmine\n=======\nharness a\ntheirs\n>>>>>>> upstream (new)\nend\n", true, "a section both edited stays a conflict, without the base"],
        [H("mine\n", "", "theirs\n"), "top\n<<<<<<< yours\nmine\n=======\ntheirs\n>>>>>>> upstream (new)\nend\n", true, "both adding at one place stays a conflict"],
    ]) {
        const got = harness.settleDropped(merged);
        t.ok(got.text === text && got.conflicts === conflicts, `settleDropped: ${why}`, JSON.stringify(got));
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
    installerRejectsUnknownArguments,
    installPlanCoversEveryCase,
    installPlanHandlesBinaryContent,
    mergeSettlesDroppedSections,
    memorySkeletonDefersToIntent,
    installerStampNamesOnlyAReleasedVersion,
];
