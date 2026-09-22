// scripts/install-policy.js
// What an install does with one path the upstream ships: the policies scripts/harness-files.tsv
// names, each decided here and nowhere else. scripts/update-harness.js walks the paths, reads what a
// decision needs and applies what it answers; this module reads nothing and writes nothing.
//   const policy = require("./install-policy");
//   const { policy: name, asked } = policy.policyFor(rows, file, wants);
//   const { outcome, bucket, write, silent } = policy.decide(name, facts, reads);
// `facts` is what the caller already knows about the path; `reads` holds the things a decision may
// need and costs something to find out, called only when the decision gets that far:
//   facts  exists     the target has something at the path
//          theirs     the upstream's content at the head: LF text, or a Buffer
//          hasBase    the receipt names a commit the upstream still has
//          adopt      --adopt was given
//          asked      the path is an optional part, and the run asked for it
//   reads  held()           the target's copy, read the way `theirs` is (text or bytes)
//          base()           the upstream's content at the receipt's commit, or null
//          shippedBefore()  an earlier run laid this path down, so its absence is a deletion
//          recoverBase(ours) the upstream version nearest the target's copy, or null
//          merge(base, ours, theirs)  a three-way merge: { text, conflicts, failed }
// The answer: `outcome` is the word the run prints, `bucket` the summary list the path joins (null
// for a path nothing happened to), `write` the content to write when there is any, and `silent`
// when the path is counted in the summary but never printed as a line.
const lib = require("./lib");

// ---------------------------------------------------------------- the manifest

// First match wins, so the table's order is its precedence. A row ending in / covers everything under it.
// `optional:<flag>` is seeded only when the run asked for it, and is otherwise not installed at all:
// the docs site is the case, useful to some projects and dead weight in the rest.
// `wants` answers whether the run asked for an optional part, so the table's meaning does not depend
// on the process's own argv and a test can ask what a repo would get either way.
const rowFor = (rows, file) => rows.find(r => r.path.endsWith("/") ? file.startsWith(r.path) : file === r.path);
function policyFor(rows, file, wants) {
    const row = rowFor(rows, file);
    if (!row) return { policy: "merge", asked: false };     // anything the upstream ships and nobody classified is harness
    if (!row.policy.startsWith("optional:")) return { policy: row.policy, asked: false };
    const asked = wants(row.policy.slice("optional:".length));
    return { policy: asked ? "seed" : "template", asked };
}

// ---------------------------------------------------------------- merging a file the target has

// This script's own conflict label, on a line of its own, so prose about conflict markers is not
// mistaken for one.
const MARKED = /^<{7} yours\r?$/m;

// A file with no lines to merge: it is the upstream's copy or it is the project's, and the base
// decides which. A logo the project replaced stays replaced.
function decideBinary({ held, theirs, hasBase, adopt }, { base }) {
    if (lib.sameContent(held, theirs)) return { outcome: "unchanged", bucket: null };
    const was = hasBase ? base() : null;
    if (adopt || lib.sameContent(held, was)) return { outcome: adopt ? "adopted" : "written", bucket: "written", write: theirs };
    return { outcome: hasBase ? "yours, binary" : "yours, no base", bucket: "kept" };
}

// A text file. `raw` is what is on disk, in whatever line endings it has; `theirs` is the upstream's,
// always LF. The comparison and the merge happen in LF and the result is written back in the endings
// the file already had, so a Windows checkout does not read as edited from top to bottom.
function decideText({ policy, raw, theirs, hasBase, adopt }, { base, recoverBase, merge }) {
    const crlf = lib.isCrlf(raw);
    const ours = lib.toLf(raw);
    const keep = { outcome: hasBase ? "yours, new here" : "yours, no base", bucket: "kept" };

    if (ours === theirs) return { outcome: "unchanged", bucket: null };
    // Before the base logic, not inside it: a repo that needs adopting usually has a receipt
    // already, written by the install that kept the stale files in the first place.
    if (adopt) return { outcome: "adopted", bucket: "written", write: lib.asFound(theirs, crlf) };
    // Markers an earlier run wrote and nobody resolved. Left to the merge, the marked-up file is now
    // its own nearest base, so the merge takes it whole, the run says "unchanged" and a half-merged
    // harness passes as settled. Named instead, and the run exits 1 until someone resolves it or
    // --adopt above throws it away.
    if (MARKED.test(ours)) return { outcome: "STILL OPEN", bucket: "conflicted" };

    // A reconcile file is one the harness cannot work around: AGENTS.md is the map every agent reads
    // and holds the table docs-check parses, and docs/README.md says what the chain puts where.
    // Keeping a stale one leaves a repo that looks installed and behaves like the version it came
    // from, so these are merged even when the receipt is missing. Nothing in the upstream's history
    // matching means this copy was written by hand, and an empty base makes the whole file one
    // conflict -- the honest answer: both versions are there to read, and the run exits 1.
    let from = hasBase ? base() : null;
    if (from === null && policy === "reconcile") from = recoverBase(ours);
    if (from === null && policy === "reconcile") from = "";
    // A union table merges by row whether or not there is a base, and even an untouched copy goes
    // through that merge: it may hold a row the upstream dropped and the project still needs.
    if (from === null && policy === "union") from = "";
    if (from === null) return keep;

    if (ours === from && policy !== "union") return { outcome: "written", bucket: "written", write: lib.asFound(theirs, crlf) };
    const merged = merge(from, ours, theirs);
    if (merged.failed) return { outcome: "yours, merge failed", bucket: "kept" };
    const result = lib.asFound(merged.text, crlf);
    if (merged.conflicts) return { outcome: "CONFLICT", bucket: "conflicted", write: result };
    // A file that keeps a local edit merges cleanly on every later run and comes out the same every
    // time. Reported as merged each run it reads as churn, and the reader goes looking for a change
    // nobody made, so what the run did is decided by the result, not the route.
    if (result === raw) return { outcome: "unchanged", bucket: null };
    return { outcome: "merged", bucket: "merged", write: result };
}

// A union table, merged row by row rather than line by line: a row is keyed by its first
// tab-separated column, and the table is a set of them, so there is nothing to conflict over.
// The upstream's comments and order come first. Each of its rows is the project's where only the
// project changed it, or where both did, and the upstream's otherwise; a row the project deleted
// stays deleted. Every row of the project's the upstream lacks follows, whether the project added it
// or the upstream dropped it: the licence of a skill the upstream stopped shipping is still needed
// here, because the skills merge keeps the skill. All three texts are LF; `base` is null without a
// receipt, and then the project's copy of a row wins.
function mergeRows(base, ours, theirs) {
    const rows = text => new Map((text || "").split("\n").filter(l => l.trim() && !l.startsWith("#")).map(l => [l.split("\t")[0], l]));
    const was = rows(base), mine = rows(ours), up = rows(theirs);
    const out = [];
    for (const line of theirs.split("\n")) {
        const key = line.split("\t")[0];
        if (!line.trim() || line.startsWith("#") || !up.has(key)) { out.push(line); continue; }
        const o = mine.get(key), b = was.get(key);
        if (o === undefined) { if (b === undefined) out.push(line); continue; }
        out.push(o === b ? line : o);
    }
    const extra = [...mine].filter(([key]) => !up.has(key)).map(([, line]) => line);
    if (!extra.length) return out.join("\n");
    while (out.length && out[out.length - 1] === "") out.pop();
    return [...out, ...extra, ""].join("\n");
}
const unionMerge = (from, ours, up) => ({ text: mergeRows(from, ours, up), conflicts: false, failed: false });

// merge, reconcile and union: a file the target lacks is written, and one it has is merged.
function merging(policy) {
    return (facts, reads) => {
        if (!facts.exists) return { outcome: "written", bucket: "written", write: facts.theirs };
        const held = reads.held();
        if (Buffer.isBuffer(facts.theirs)) return decideBinary({ ...facts, held }, reads);
        // A union table has no lines to conflict over, and no base means the project's rows win.
        return decideText({ ...facts, policy, raw: held }, policy === "union" ? { ...reads, merge: unionMerge } : reads);
    };
}

// ---------------------------------------------------------------- laying a file down once

// What the project deleted stays deleted. Seed files and skeletons both go down once and are never
// touched again, so a missing one is either new to this run or one the project removed, and
// shippedBefore() tells the two apart: for a seed file, the receipt's commit shipped it; for a
// skeleton, the receipt lists it.
// TODO: an existing seed file joins the "kept" summary list and an existing skeleton joins none;
// the two differ only because they grew apart, and unifying them changes what a run reports.
function layDown(existing) {
    return ({ exists, theirs, asked }, { shippedBefore }) => {
        if (exists) return existing;
        // An optional part is the exception: its flag is the project asking for it now, whatever an
        // earlier run left out.
        if (!asked && shippedBefore()) return { outcome: "deleted here", bucket: null };
        return { outcome: "created", bucket: "seeded", write: theirs };
    };
}

// ---------------------------------------------------------------- the policies

const POLICIES = {
    merge: merging("merge"),
    reconcile: merging("reconcile"),
    union: merging("union"),
    seed: layDown({ outcome: "yours", bucket: "kept" }),
    skeleton: layDown({ outcome: "yours", bucket: null }),
    // Reported only when the target actually has it: "left alone, yours" about a file the repo does
    // not have names something that was never there.
    skip: ({ exists }) => exists ? { outcome: "yours", bucket: "skipped" } : { outcome: "absent", bucket: null },
    // Not installed anywhere, and named in one line of the summary instead: sixty-five lines saying
    // nothing happened bury the thirty-eight saying something did.
    template: () => ({ outcome: "template", bucket: "template", silent: true }),
};

function decide(policy, facts, reads = {}) {
    const rule = POLICIES[policy];
    if (!rule) throw new Error(`install-policy: no policy named "${policy}"`);
    return rule(facts, reads);
}

module.exports = { policyFor, decide };
