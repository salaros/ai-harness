// .agents/hooks/tests/tables/install-policy.js
// scripts/install-policy.js's decisions, one table per policy: how the manifest is read, and what an
// install does with one path, from the facts about it and fakes for everything it would read.
const { installPolicy } = require("../fixtures");

const SKIP = "scripts/install-policy.js is the upstream's own, not installed here";
const never = () => { throw new Error("should not have been consulted"); };

// scripts/harness-files.tsv decides what an install does to each path, and policyFor reads it.
// First match wins, a row ending in / covers everything under it, and an `optional:<flag>` row is
// seeded only when the run asked for that flag. The real table is checked elsewhere; what is pinned
// here is how a table is read, against one written for the purpose.
function manifestPoliciesAreReadInOrder(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`policyFor: ${SKIP}`); return; }
    const rows = [
        { path: "scripts/harness-files.tsv", policy: "skip" },
        { path: "scripts/", policy: "merge" },
        { path: "tools/docs-site/", policy: "optional:astro-docs" },
        { path: "src/", policy: "seed" },
    ];
    const all = () => true;
    const none = () => false;
    const cases = [
        ["scripts/harness-files.tsv", all, "skip", false, "the earlier row wins over the prefix below it"],
        ["scripts/lib.js", all, "merge", false, "a row ending in / covers everything under it"],
        ["src/app.ts", all, "seed", false, "an exact prefix match takes its own policy"],
        ["README.md", all, "merge", false, "a path nobody classified is harness"],
        ["tools/docs-site/astro.config.mjs", all, "seed", true, "an optional part the run asked for is seeded, and says it was asked for"],
        ["tools/docs-site/astro.config.mjs", none, "template", false, "an optional part nobody asked for is not installed"],
    ];
    for (const [file, wants, want, asked, why] of cases) {
        const got = policy.policyFor(rows, file, wants);
        t.ok(got.policy === want && got.asked === asked, `policyFor: ${why}`,
            `${file} -> ${JSON.stringify(got)}, expected ${want}, asked ${asked}`);
    }
    let threw = false;
    try { policy.decide("nonsense", {}); } catch { threw = true; }
    t.ok(threw, "decide: a policy nobody defined is an error, not a silent skip", "");
}

// merge and reconcile, on a text file the target already has. Every branch used to need a git
// checkout, an upstream history and a temp tree to reach even once; the reads are fakes here.
// `held` is what is on disk, `theirs` the upstream's, always LF.
function mergeDecisionCoversEveryOutcome(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`merge decision: ${SKIP}`); return; }
    const OURS = "one\ntwo edited\n";
    const THEIRS = "one\ntwo upstream\n";
    const clean = text => () => ({ text, conflicts: false, failed: false });
    const conflicted = text => () => ({ text, conflicts: true, failed: false });
    const broke = () => ({ text: "", conflicts: false, failed: true });

    const decide = (name, facts, reads) => policy.decide(name,
        { exists: true, theirs: THEIRS, hasBase: true, adopt: false, asked: false, ...facts },
        { held: () => OURS, base: () => null, recoverBase: () => null, merge: never, ...reads });

    const cases = [
        // policy, facts, reads, expected outcome, bucket and write, why
        ["merge", { exists: false }, { held: never }, "written", "written", THEIRS, "a file the target lacks is written"],
        ["merge", {}, { held: () => THEIRS }, "unchanged", null, undefined, "a copy already matching the upstream is left alone"],
        ["merge", { adopt: true }, {}, "adopted", "written", THEIRS, "--adopt takes the upstream's version whatever the base says"],
        ["merge", {}, { held: () => "<<<<<<< yours\nmine\n" }, "STILL OPEN", "conflicted", undefined, "markers an earlier run left are named, not merged over"],
        ["merge", { hasBase: false }, { base: never }, "yours, no base", "kept", undefined, "an install with no base keeps what is there"],
        ["merge", {}, {}, "yours, new here", "kept", undefined, "a file the base did not have is the project's own"],
        ["merge", {}, { base: () => OURS }, "written", "written", THEIRS, "a file nobody edited takes the upstream's version"],
        ["merge", {}, { base: () => "one\n", merge: clean("one\ntwo edited\nthree\n") },
            "merged", "merged", "one\ntwo edited\nthree\n", "an edited file keeps its edits and gains the changes around them"],
        ["merge", {}, { base: () => "one\n", merge: clean(OURS) }, "unchanged", null, undefined,
            "a merge that comes out as what is already there is not churn to report"],
        ["merge", {}, { base: () => "one\n", merge: conflicted("<<<<<<< yours\n") }, "CONFLICT", "conflicted", "<<<<<<< yours\n",
            "a real collision is written with markers and named"],
        ["merge", {}, { base: () => "one\n", merge: broke }, "yours, merge failed", "kept", undefined,
            "a merge git could not run leaves the file alone"],
        // reconcile is the policy for a file the harness cannot work around, so it merges even with
        // no receipt: the nearest upstream version stands in, and failing that an empty base makes
        // the whole file one honest conflict.
        ["reconcile", { hasBase: false }, { recoverBase: () => "one\n", merge: clean("merged\n") },
            "merged", "merged", "merged\n", "reconcile recovers a base when the receipt has none"],
        ["reconcile", { hasBase: false }, { merge: from => ({ text: `base=${JSON.stringify(from)}`, conflicts: true, failed: false }) },
            "CONFLICT", "conflicted", 'base=""', "reconcile with nothing to recover merges against an empty base"],
        ["merge", { hasBase: false }, { recoverBase: never }, "yours, no base", "kept", undefined, "only reconcile goes looking for a base"],
    ];
    for (const [name, facts, reads, outcome, bucket, write, why] of cases) {
        const got = decide(name, facts, reads);
        t.ok(got.outcome === outcome && got.bucket === bucket && got.write === write, `${name} decision: ${why}`,
            `got ${JSON.stringify(got)}, expected ${outcome}, ${bucket}, ${JSON.stringify(write)}`);
    }

    // Git checks a repo out with the platform's line endings, so a Windows copy holds CRLF where the
    // upstream stores LF. The comparison happens in LF and the result goes back in what the file had.
    const crlf = [
        [{ held: () => "one\r\ntwo edited\r\n", base: () => OURS }, "written", "one\r\ntwo upstream\r\n", "a CRLF copy nobody edited is written back in CRLF"],
        [{ held: () => "one\r\ntwo upstream\r\n", base: never }, "unchanged", undefined, "a CRLF copy matching the upstream does not read as edited"],
        [{ held: () => "one\r\ntwo edited\r\n", base: () => "one\n", merge: clean("one\ntwo edited\nthree\n") },
            "merged", "one\r\ntwo edited\r\nthree\r\n", "a CRLF copy is merged in LF and written back in CRLF"],
        [{ held: () => "one\r\ntwo edited\r\n", base: () => "one\n", merge: clean(OURS) },
            "unchanged", undefined, "a CRLF merge that comes out as what is there is unchanged"],
    ];
    for (const [reads, outcome, write, why] of crlf) {
        const got = decide("merge", {}, reads);
        t.ok(got.outcome === outcome && got.write === write, `merge decision: ${why}`, JSON.stringify(got));
    }
}

// A file with no lines to merge is the upstream's copy or the project's, and the base decides.
function binaryDecisionFollowsTheBase(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`binary decision: ${SKIP}`); return; }
    const bin = (held, theirs, was, adopt = false) => policy.decide("merge",
        { exists: true, theirs: Buffer.from(theirs), hasBase: was !== null, adopt, asked: false },
        { held: () => Buffer.from(held), base: () => (was === null ? null : Buffer.from(was)), recoverBase: never, merge: never });
    const cases = [
        [bin("a", "a", "a"), "unchanged", null, false, "a copy already matching the upstream is left alone"],
        [bin("a", "b", "a"), "written", "written", true, "a copy nobody replaced takes the upstream's"],
        [bin("mine", "b", "a"), "yours, binary", "kept", false, "a copy the project replaced stays replaced"],
        [bin("mine", "b", null), "yours, no base", "kept", false, "with no base a differing copy is the project's"],
        [bin("mine", "b", "a", true), "adopted", "written", true, "--adopt takes the upstream's binary too"],
    ];
    for (const [got, outcome, bucket, writes, why] of cases)
        t.ok(got.outcome === outcome && got.bucket === bucket && Buffer.isBuffer(got.write) === writes,
            `binary decision: ${why}`, `got ${got.outcome} ${got.bucket}, expected ${outcome} ${bucket}`);
}

// A union table merged as a set of rows, never in conflict, with or without a base.
function unionDecisionMergesByRow(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`union decision: ${SKIP}`); return; }
    const T = (...rows) => ["# t", ...rows, ""].join("\n");
    const cases = [
        [T("a\t1", "b\t1"), T("a\t1", "b\t1"), T("a\t2"), T("a\t2", "b\t1"), "a row the upstream dropped stays"],
        [T("a\t1"), T("a\tmine"), T("a\t2"), T("a\tmine"), "a row both changed is the project's"],
        [T("a\t1"), T("a\tmine"), T("a\t1"), T("a\tmine"), "a row only the project changed is the project's"],
        [T("a\t1", "b\t1"), T("a\t1"), T("a\t1", "b\t2"), T("a\t1"), "a row the project deleted stays deleted"],
        [T("a\t1"), T("a\t1", "m\t1"), T("n\t1", "a\t1"), T("n\t1", "a\t1", "m\t1"), "the upstream's order and new rows, then the project's own"],
        [null, T("a\tmine"), T("a\t2", "c\t1"), T("a\tmine", "c\t1"), "with no base the project's copy of a row wins"],
    ];
    for (const [base, ours, theirs, want, why] of cases) {
        const got = policy.decide("union", { exists: true, theirs, hasBase: base !== null, adopt: false, asked: false },
            { held: () => ours, base: () => base, recoverBase: never, merge: never });
        const result = got.write === undefined ? ours : got.write;
        t.ok(result === want && (got.write === undefined) === (got.outcome === "unchanged"), `union decision: ${why}`, JSON.stringify(got));
    }
    // Even an untouched copy goes through the row merge: it may hold a row the upstream dropped.
    const kept = policy.decide("union", { exists: true, theirs: T("a\t2"), hasBase: true, adopt: false, asked: false },
        { held: () => T("a\t2", "b\t1"), base: () => T("a\t1", "b\t1"), recoverBase: never, merge: never });
    t.ok(kept.outcome === "unchanged" && kept.bucket === null && kept.write === undefined,
        "union decision: a table already holding the kept row is unchanged", JSON.stringify(kept));
    const crlf = policy.decide("union", { exists: true, theirs: T("a\t2"), hasBase: true, adopt: false, asked: false },
        { held: () => T("a\t1", "b\t1").replace(/\n/g, "\r\n"), base: () => T("a\t1", "b\t1"), recoverBase: never, merge: never });
    t.ok(crlf.outcome === "merged" && crlf.write === T("a\t2", "b\t1").replace(/\n/g, "\r\n"),
        "union decision: a CRLF table is merged in LF and written back in CRLF", JSON.stringify(crlf));
}

// seed, skeleton, skip and template: the policies that never merge. What the project deleted stays
// deleted, unless the run asked for an optional part by name.
function layDownDecisionsKeepWhatIsThere(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`lay-down decisions: ${SKIP}`); return; }
    const shipped = yes => ({ shippedBefore: () => yes });
    const cases = [
        // policy, facts, reads, expected outcome, bucket, write, why
        ["seed", { exists: true }, { shippedBefore: never }, "yours", "kept", undefined, "an existing seed file is the project's"],
        ["seed", { exists: false }, shipped(false), "created", "seeded", "new\n", "a seed file new to this run is created"],
        ["seed", { exists: false }, shipped(true), "deleted here", null, undefined, "a seed file shipped before and now missing stays deleted"],
        ["seed", { exists: false, asked: true }, { shippedBefore: never }, "created", "seeded", "new\n", "an optional part asked for is seeded whatever an earlier run left out"],
        ["skeleton", { exists: true }, { shippedBefore: never }, "yours", null, undefined, "an existing skeleton is left alone"],
        ["skeleton", { exists: false }, shipped(false), "created", "seeded", "new\n", "a skeleton the receipt does not know is laid down"],
        ["skeleton", { exists: false }, shipped(true), "deleted here", null, undefined, "a skeleton the receipt knew and the project deleted stays deleted"],
        ["skip", { exists: true }, {}, "yours", "skipped", undefined, "a skipped file the target has is left alone"],
        ["skip", { exists: false }, {}, "absent", null, undefined, "a skipped file the target lacks is named, not written"],
        ["template", { exists: true }, {}, "template", "template", undefined, "the upstream's own files are never installed"],
    ];
    for (const [name, facts, reads, outcome, bucket, write, why] of cases) {
        const got = policy.decide(name, { theirs: "new\n", hasBase: true, adopt: false, asked: false, ...facts }, reads);
        t.ok(got.outcome === outcome && got.bucket === bucket && got.write === write, `${name} decision: ${why}`, JSON.stringify(got));
    }
    t.ok(policy.decide("template", {}).silent === true, "template decision: counted in the summary, never printed as a line", "");
}

module.exports = [
    manifestPoliciesAreReadInOrder,
    mergeDecisionCoversEveryOutcome,
    binaryDecisionFollowsTheBase,
    unionDecisionMergesByRow,
    layDownDecisionsKeepWhatIsThere,
];
