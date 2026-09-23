// .agents/hooks/tests/tables/report.js
// What an install run amounts to once it is over: the verdict -- whether anything is left for the
// reader to act on, and what -- and the summary that says it in words. The installer's whole
// contract with CI and with npx used to be one boolean expression at the foot of an unexported
// printer, so asking "would this run fail?" meant running it and reading its stdout.
const { installer, installPolicy } = require("../fixtures");

const SKIP = "scripts/update-harness.js is the upstream's own, not installed here";

const options = (over = {}) => ({ dryRun: false, quiet: false, adopt: false, check: true, ...over });
const held = (...buckets) => buckets.map((bucket, i) => ({ file: `f${i}.md`, bucket, policy: "merge", mode: "100644", outcome: "x" }));

// Four things leave a run unfinished, and they used to be four terms of one expression no caller
// could ask separately: a conflict, a path the upstream checkout would not give up, a self check
// that failed, and hooks that were never wired. Named here, so what a non-zero exit means is a
// value a caller reads rather than a sentence in the output it has to match.
exports.theVerdictNamesWhatIsLeftToDo = function theVerdictNamesWhatIsLeftToDo(t) {
    const harness = installer();
    if (!harness) { t.skip(`verdict: ${SKIP}`); return; }
    if (!harness.verdict) { t.skip("verdict: this installer decides its exit code inside its printer"); return; }
    const cases = [
        [{ entries: held("written", "merged", "kept") }, false, null, "a run with nothing outstanding has passed"],
        [{ entries: held("conflicted") }, true, "conflict", "a conflict is the reader's to resolve"],
        [{ entries: held("unreadable") }, true, "read", "a path the upstream would not give up is missing from the install"],
        [{ entries: [], check: { failed: true, output: "boom" } }, true, "check", "a harness that does not prove itself is not installed"],
        [{ entries: [], hooks: false }, true, "hook", "hooks that were never wired gate nothing"],
        [{ entries: [], check: { skipped: "no check-harness.js at this ref" } }, false, null, "a check that stood down is not a failure"],
    ];
    for (const [over, failed, word, why] of cases) {
        const got = harness.verdict({ entries: [], check: null, hooks: true, options: options(), ...over });
        const said = (got.why || []).join(" | ");
        t.ok(got.failed === failed, `verdict: ${why}`, JSON.stringify(got));
        if (word) t.ok(said.toLowerCase().includes(word), `verdict: it says which -- ${why}`, said);
    }
    const both = harness.verdict({ entries: held("conflicted", "unreadable"), check: { failed: true }, hooks: false, options: options() });
    t.ok(both.why.length === 4, "verdict: every reason is named, not the first one found", both.why.join(" | "));
};

// The summary reads the verdict and never works it out again: two answers to "did this run fail?"
// drift, and the one CI reads is the one nobody is looking at.
exports.theSummaryIsLinesAndReadsTheVerdict = function theSummaryIsLinesAndReadsTheVerdict(t) {
    const harness = installer();
    if (!harness) { t.skip(`summarise: ${SKIP}`); return; }
    if (!harness.summarise) { t.skip("summarise: this installer prints its summary as it builds it"); return; }
    const result = {
        entries: held("conflicted", "written"), base: "abc1234", head: "def5678abc", ref: "master",
        target: "/repo", check: null, hooks: true, options: options({ dryRun: true }),
    };
    const lines = harness.summarise(result);
    t.ok(Array.isArray(lines) && lines.every(l => typeof l === "string"), "summarise: the summary is lines, returned, not printed", typeof lines);
    const text = lines.join("\n");
    t.ok(text.includes("dry run against master at def5678"), "summarise: a dry run says so, and against what", text);
    t.ok(text.includes("CONFLICTED"), "summarise: a conflict is named whatever the verbosity", text);
    // A quiet run never saw a line per path, so it gets the lists in full; a loud one saw them all.
    const loud = harness.summarise(result).join("\n");
    const quiet = harness.summarise({ ...result, options: options({ dryRun: true, quiet: true }) }).join("\n");
    t.ok(quiet.includes("f1.md") && !loud.includes("f1.md"),
        "summarise: a quiet run gets the lists it never saw, and a loud one does not get them twice", `quiet: ${quiet}\n\nloud: ${loud}`);
};

// The bucket names are the install policy's: it is where they are decided, and the summary had its
// own copy of the list, so a policy answering with a bucket nobody had added to that copy would have
// thrown at the push rather than been reported.
exports.theSummaryListsAreThePolicysToName = function theSummaryListsAreThePolicysToName(t) {
    const policy = installPolicy();
    if (!policy) { t.skip("buckets: scripts/install-policy.js is the upstream's own, not installed here"); return; }
    if (!policy.BUCKETS) { t.skip("buckets: this install-policy does not name its summary lists"); return; }
    t.ok(Array.isArray(policy.BUCKETS) && policy.BUCKETS.includes("conflicted") && policy.BUCKETS.includes("kept"),
        "buckets: every summary list a path can join is named in one place", policy.BUCKETS.join(", "));
    t.ok((policy.UNFINISHED || []).every(b => policy.BUCKETS.includes(b)) && (policy.UNFINISHED || []).length > 0,
        "buckets: the ones that leave work for the reader are a subset of them", (policy.UNFINISHED || []).join(", "));
};
