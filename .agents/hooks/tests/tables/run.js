// .agents/hooks/tests/tables/run.js
// scripts/update-harness.js's run(): everything one install does, from the plan to the verdict, as
// a value. Two-thirds of the installer used to be reachable only through a spawned process, and
// that is exactly where its ordering and exit-code fixes landed -- `say` was console.log at two
// dozen call sites, so what a run said could be read only as captured stdout, and only by installing
// for real into a temp repo at eighteen seconds a go. A run takes a repo-edit for the target and one
// adapter for the steps that spawn processes, so each case here is a row instead.
const repoView = require("../../../../scripts/repo-view");
const repoEdit = require("../../../../scripts/repo-edit");
const { installer } = require("../fixtures");

const SKIP = "a run: scripts/update-harness.js is the upstream's own, not installed here";

// One upstream commit, which is all a run needs: what it installs, and that it is the head.
const UPSTREAM = {
    ".githooks/pre-commit": { text: "hook\n", exec: true },
    "AGENTS.md": "# Agents\nthe rule\n",
    "harness-files.tsv": "# table\nAGENTS.md\treconcile\n",
};
const ROWS = [{ path: "AGENTS.md", policy: "reconcile" }];

// Whatever the run asks of the upstream, answered from the map above at every commit.
const upstream = () => ({
    view: { at: () => repoView.fromMap(UPSTREAM), has: () => true, history: () => ["c1"] },
    rows: ROWS, head: "c1", ref: "master", dir: "(no checkout)",
});

const OPTIONS = { dryRun: false, adopt: false, quiet: true, check: true, wants: () => false };

// The steps that spawn processes, as a stand-in that records when it was asked and what the target
// held at that moment. `hooks` and `check` are what it reports back, so a row says what a run makes
// of an unwired hook or a failing invariant without arranging either on a disk.
function afterwards({ hooks = true, check = null, edit = null } = {}) {
    const calls = [];
    const note = name => calls.push({ name, agentsMd: edit ? edit.view().exists("AGENTS.md") : null });
    return {
        calls,
        wire() { note("wire"); return { hooks, lines: ["(wired)"] }; },
        invariants() { note("invariants"); return { check, lines: ["(checked)"] }; },
    };
}

// A whole run against a map: nothing is cloned, nothing is written to a disk, and what the run
// would have said comes back as a list rather than as somebody's stdout.
function runIn(harness, files, previous, options = {}, after = afterwards()) {
    const edit = repoEdit.mapEdit(files);
    const said = [];
    const result = harness.run({
        upstream: upstream(),
        target: { view: edit.view(), edit, root: "(no root)", previous },
        options: { ...OPTIONS, ...options },
        stamp: { installer: "test" },
        after,
        say: line => said.push(line),
    });
    return { result, edit, said, after };
}

// What a run is: a value, and nothing printed on the way to it. A caller that wants the lines on a
// terminal passes `say` and gets them as they happen; one that wants only the answer passes nothing
// and console.log is never reached.
exports.aRunIsAValueRatherThanSomethingPrinted = function aRunIsAValueRatherThanSomethingPrinted(t) {
    const harness = installer();
    if (!harness || !harness.run) { t.skip(SKIP); return; }

    const printed = [];
    const log = console.log;
    let result;
    const edit = repoEdit.mapEdit({});
    try {
        console.log = m => printed.push(m);
        result = harness.run({
            upstream: upstream(),
            target: { view: edit.view(), edit, root: "(no root)", previous: null },
            options: { ...OPTIONS },
            stamp: { installer: "test" },
            after: afterwards(),
        });
    } finally { console.log = log; }
    t.ok(!printed.length, "a run: a run given nowhere to say it prints nothing", printed.join("\n"));
    t.ok(result.lines.length > 3, "a run: what the run said comes back as lines", String(result.lines.length));
    t.ok(result.lines.some(l => l.includes("harness updated to master")), "a run: the summary is among them", result.lines.join("\n"));

    const { result: streamed, said } = runIn(harness, {}, null);
    t.ok(said.join("\n") === streamed.lines.join("\n"),
        "a run: every line comes back is also handed over as it happens, in the same order", `${said.length} said, ${streamed.lines.length} returned`);
};

// The order the steps go in, which is the thing every installer fix has been about: the files are
// written before the hooks are wired, because relink needs the skills in place, and the invariants
// run last because they check what relink wrote. Asserted from inside the steps rather than read off
// a transcript afterwards.
exports.aRunWritesBeforeItWiresAndChecksLast = function aRunWritesBeforeItWiresAndChecksLast(t) {
    const harness = installer();
    if (!harness || !harness.run) { t.skip(SKIP); return; }

    const edit = repoEdit.mapEdit({});
    const after = afterwards({ edit });
    const said = [];
    harness.run({
        upstream: upstream(),
        target: { view: edit.view(), edit, root: "(no root)", previous: null },
        options: { ...OPTIONS }, stamp: {}, after, say: l => said.push(l),
    });
    t.ok(after.calls.map(c => c.name).join(" ") === "wire invariants",
        "a run: the hooks are wired, then the invariants are run", after.calls.map(c => c.name).join(" "));
    t.ok(after.calls.every(c => c.agentsMd === true),
        "a run: both steps run against a target the plan has already been applied to", JSON.stringify(after.calls));
    t.ok(edit.view().read("AGENTS.md") === "# Agents\nthe rule\n",
        "a run: the plan reached the target through its repo-edit", JSON.stringify(edit.view().read("AGENTS.md")));

    const { after: unchecked } = runIn(harness, {}, null, { check: false });
    t.ok(unchecked.calls.map(c => c.name).join(" ") === "wire",
        "a run: --no-check wires the hooks and asks nothing else", unchecked.calls.map(c => c.name).join(" "));
};

// A dry run is the whole run with nothing written: the plan is decided and its lines are said, and
// the target is left exactly as it was found -- including the steps that would have spawned a
// process in it.
exports.aDryRunDecidesEverythingAndTouchesNothing = function aDryRunDecidesEverythingAndTouchesNothing(t) {
    const harness = installer();
    if (!harness || !harness.run) { t.skip(SKIP); return; }

    const { result, edit, after } = runIn(harness, { "AGENTS.md": "# Agents\nmine\n" }, null, { dryRun: true, quiet: false });
    t.ok(!edit.view().exists(".githooks/pre-commit") && edit.view().read("AGENTS.md") === "# Agents\nmine\n",
        "a run: a dry run writes nothing to the target", JSON.stringify(edit.view().list("")));
    t.ok(!after.calls.length, "a run: a dry run wires no hooks and runs no checks", after.calls.map(c => c.name).join(" "));
    t.ok(result.entries.some(e => e.file === ".githooks/pre-commit"),
        "a run: a dry run still reports every entry it decided", String(result.entries.length));
    t.ok(result.lines.some(l => /reconcile\s+\d{6}/.test(l)), "a run: a dry run says each path's line", result.lines.join("\n"));
    t.ok(result.lines.some(l => l.startsWith("dry run against master")), "a run: a dry run says that is what it was", result.lines.join("\n"));
    t.ok(!result.verdict.failed, "a run: a dry run that decided everything has not failed", result.verdict.why.join("; "));
};

// The receipt already names the upstream's head and nothing asks for more, so there is nothing to
// do. One line and a verdict; the target is not read for a plan and the steps after are not run.
exports.aRunWithNothingToDoSaysSoAndStops = function aRunWithNothingToDoSaysSoAndStops(t) {
    const harness = installer();
    if (!harness || !harness.run) { t.skip(SKIP); return; }

    const { result, edit, after } = runIn(harness, {}, { commit: "c1", ref: "master" });
    t.ok(result.lines.length === 1 && result.lines[0].includes("nothing to update"),
        "a run: a run with nothing to do says so, once", result.lines.join("\n"));
    t.ok(!result.entries.length && !after.calls.length && !edit.view().list("").length,
        "a run: a run with nothing to do plans nothing and writes nothing", JSON.stringify(after.calls));
    t.ok(!result.verdict.failed, "a run: a run with nothing to do has not failed", result.verdict.why.join("; "));
};

// The verdict is the exit code, and the exit code is what CI reads. Every reason a run is not
// finished is reachable here, where before each one took a real install to provoke.
exports.aRunsVerdictNamesEveryReasonItIsNotDone = function aRunsVerdictNamesEveryReasonItIsNotDone(t) {
    const harness = installer();
    if (!harness || !harness.run) { t.skip(SKIP); return; }

    const clean = runIn(harness, {}, null).result;
    t.ok(!clean.verdict.failed, "a run: an install with wired hooks and passing checks has not failed", clean.verdict.why.join("; "));

    const unwired = runIn(harness, {}, null, {}, afterwards({ hooks: false })).result;
    t.ok(unwired.verdict.failed && unwired.verdict.why.some(w => w.includes("Git hooks")),
        "a run: an install whose hooks are not wired has failed, and says which", unwired.verdict.why.join("; "));
    t.ok(unwired.lines.some(l => l.includes("GIT HOOKS NOT WIRED")),
        "a run: and the reader is told what to run", unwired.lines.join("\n"));

    const broken = afterwards({ check: { failed: true, summary: "1 failed", output: "nope" } });
    const bad = runIn(harness, {}, null, {}, broken).result;
    t.ok(bad.verdict.failed && bad.verdict.why.some(w => w.includes("checks do not pass")),
        "a run: an install whose invariants fail has failed", bad.verdict.why.join("; "));
    t.ok(bad.lines.some(l => l.includes("SELF CHECK FAILED")), "a run: and says so in words too", bad.lines.join("\n"));

    const skipped = afterwards({ check: { skipped: "this upstream ref has no scripts/check-harness.js" } });
    const old = runIn(harness, {}, null, {}, skipped).result;
    t.ok(!old.verdict.failed && old.lines.some(l => l.includes("self check skipped")),
        "a run: an upstream too old to check is said and not counted against the run", old.verdict.why.join("; "));
};
