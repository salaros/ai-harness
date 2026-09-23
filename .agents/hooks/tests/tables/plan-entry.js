// .agents/hooks/tests/tables/plan-entry.js
// scripts/plan-entry.js: what one line of an install plan is allowed to be. The entry used to be a
// record with eleven optional keys, written in three places and read in three others, and what a
// producer had to set and what a consumer could assume lived only in a comment above the loop --
// which is why apply() called `policy.padEnd(9)` on anything not marked silent and would have thrown
// on an entry that left the column out. These pin the kinds instead: each says what it does to the
// path and how it is reported, and there is no way to build one that cannot be printed.
const { planEntry } = require("../fixtures");

const SKIP = "scripts/plan-entry.js is the upstream's own, not installed here";

// The four columns a run prints are not optional decoration: they are the line. Demanded where the
// entry is made, so a producer that forgets one is told which, rather than a whole install getting
// most of the way through somebody's repository and then throwing inside a padEnd.
exports.aPrintedEntryDemandsEveryColumnItPrints = function aPrintedEntryDemandsEveryColumnItPrints(t) {
    const p = planEntry();
    if (!p) { t.skip(`shown: ${SKIP}`); return; }
    const columns = ["policy", "mode", "outcome"];
    for (const missing of columns) {
        const args = ["merge", "100644", "written"];
        args[columns.indexOf(missing)] = undefined;
        let threw = null;
        try { p.shown(...args); } catch (e) { threw = e.message; }
        t.ok(threw && threw.includes(missing), `shown: an entry with no ${missing} is refused where it is made, by name`, String(threw));
    }
    // The bucket is the one that may be left out: a line can be printed and join no summary list,
    // which is what "unchanged" is.
    let ok = null;
    try { ok = p.shown("merge", "100644", "unchanged"); } catch (e) { ok = e; }
    t.ok(ok && ok.bucket === null, "shown: a line that joins no summary list is not an error", JSON.stringify(ok));
};

// The kinds are repo-edit's -- write, link, mkdir, mark, and nothing at all -- because the entry a
// producer builds is the entry the edit reads. One name per kind across the three, so a reader
// following a path through the run is not translating at every step.
exports.everyKindIsTheOneTheEditReads = function everyKindIsTheOneTheEditReads(t) {
    const p = planEntry();
    if (!p) { t.skip(`kinds: ${SKIP}`); return; }
    const repoEdit = require("../../../../scripts/repo-edit");
    if (!repoEdit.kindOf) { t.skip("kinds: this repo-edit does not say what kind an entry is"); return; }
    const as = p.shown("merge", "100644", "written");
    const cases = [
        ["write", p.written("a.txt", "hello", as)],
        ["link", p.linked(".claude/skills", "../.agents/skills", as)],
        ["mkdir", p.folder(".claude/skills", p.quiet())],
        ["mark", p.marked(".githooks/pre-commit", p.quiet())],
        [null, p.noted("b.txt", p.shown("merge", "100644", "unchanged"))],
    ];
    for (const [kind, entry] of cases) {
        t.ok(repoEdit.kindOf(entry) === kind, `kinds: the entry the plan builds is a ${kind || "no-op"} to the edit`, JSON.stringify(entry));
    }
    // What each kind carries, which is the whole of what a consumer may read off it.
    t.ok(p.written("a.txt", "hello", as).write === "hello", "kinds: a written entry carries its content", "");
    t.ok(p.linked("l", "to", as).link === "to" && p.linked("l", "to", as).replace === false,
        "kinds: a linked entry carries its target and replaces nothing unless asked", "");
    t.ok(p.linked("l", "to", as, { replace: true }).replace === true, "kinds: a link may be asked to replace what is there", "");
    t.ok(p.written("h", "x", as, { exec: true }).exec === true, "kinds: a written entry may also be marked executable", "");
};

// A silent entry is counted and never printed: a skill's own files, the two receipts, the folder made
// for a link. Printing is one function over the entry rather than a format string at each consumer,
// so the entry that prints nothing says so once.
exports.whatIsPrintedIsDecidedByTheEntry = function whatIsPrintedIsDecidedByTheEntry(t) {
    const p = planEntry();
    if (!p) { t.skip(`describe: ${SKIP}`); return; }
    t.ok(p.describe(p.heading("skeletons a project starts with")) === null, "describe: a heading is not a path's line", "");
    t.ok(p.describe(p.written("skills-lock.json", "{}", p.quiet())) === null, "describe: a silent entry prints nothing", "");
    t.ok(p.quiet("written").bucket === "written", "describe: a silent entry still joins its summary list", "");
    const line = p.describe(p.noted("AGENTS.md", p.shown("merge", "100644", "unchanged")));
    t.ok(/^ {2}merge {4}100644 {2}unchanged {3}AGENTS\.md$/.test(line), "describe: the four columns, padded to their widths", JSON.stringify(line));
    // A word as wide as its column, or wider, still ends before the next one starts: padding on its
    // own separated these only by accident, and "reconcile" and "yours appended" are both real.
    const tight = p.describe(p.noted("AGENTS.md", p.shown("reconcile", "100644", "yours appended")));
    t.ok(/^ {2}reconcile 100644 {2}yours appended AGENTS\.md$/.test(tight),
        "describe: a word that fills its column is still separated from the next", JSON.stringify(tight));
};

// The link the platform would not make is the one case where what a run did is not what it planned:
// the edit reports that the link is not there, and the outcome word is the run's to choose. Said as
// one call rather than a spread over the entry, so the action cannot be edited by accident along
// with the word for it.
exports.anEntryCanBeReportedAsItTurnedOut = function anEntryCanBeReportedAsItTurnedOut(t) {
    const p = planEntry();
    if (!p) { t.skip(`turnedOut: ${SKIP}`); return; }
    const planned = p.linked(".claude/skills", "../.agents/skills", p.shown("skills", "120000", "written", "written"));
    const actual = p.turnedOut(planned, "yours", "kept");
    t.ok(actual.outcome === "yours" && actual.bucket === "kept", "turnedOut: the outcome and the list it joins are the run's to change", JSON.stringify(actual));
    t.ok(actual.link === planned.link && actual.file === planned.file, "turnedOut: what was asked of the path is untouched", JSON.stringify(actual));
    t.ok(planned.outcome === "written", "turnedOut: the planned entry is not edited in place", JSON.stringify(planned));
};
