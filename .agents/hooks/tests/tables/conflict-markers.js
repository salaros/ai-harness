// .agents/hooks/tests/tables/conflict-markers.js
// scripts/check-conflict-markers.js's decisions: which staged lines count as a merge left unresolved,
// and which do not.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const markers = require("../../../../scripts/check-conflict-markers");
const { withRoot, text } = require("../fixtures");

const git = (dir, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" });
const CONFLICT = text("before", "<<<<<<< HEAD", "ours", "=======", "theirs", ">>>>>>> feature", "after");

// A repo with `committed` in its first commit and `staged` added on top, and the verdict on it:
// blocked with a problem naming each of `blocks`, or passed.
exports.conflictMarkerDecisions = function conflictMarkerDecisions(t) {
    const rows = [
        // committed, staged, blocks, why
        [{}, { "a.txt": CONFLICT }, ["a.txt:2:"], "a conflict is named once, by the line that opens it"],
        [{}, { "a.txt": text("<<<<<<< HEAD", "x", "<<<<<<< HEAD") }, ["a.txt:1:", "a.txt:3:"], "each opening marker is named"],
        [{}, { "README.md": text("Title", "=======") }, [], "a heading underlined with seven equals signs is prose"],
        [{}, { "a.txt": text(">>>>>>> feature") }, [], "a closing marker on its own is not what the check looks for"],
        [{}, { "a.txt": text("<<<<<<<< eight", "======== eight", "a <<<<<<< mid-line") }, [], "eight of a sign, or seven not at the start, is not a marker"],
        [{}, { "a.txt": text("x  ", "y\t") }, [], "whitespace errors --check also reports are left to the formatter"],
        [{ "a.txt": CONFLICT }, { "a.txt": CONFLICT + "more\n" }, [], "a marker already committed blocks nothing until its line changes"],
        [{}, { "merge.fixture": CONFLICT, ".gitattributes": "*.fixture conflict-marker-size=32\n" }, [],
            "a path given a longer marker in .gitattributes may carry seven"],
        [{}, { "a b.txt": CONFLICT }, ["a b.txt:2:"], "a path with a space is named as it is, not quoted"],
    ];
    for (const [committed, staged, blocks, why] of rows) {
        withRoot(committed, dir => {
            if (git(dir, "init", "-q").status !== 0) { t.skip(`conflict markers: git is not available (${why})`); return; }
            git(dir, "commit", "-q", "--allow-empty", "-m", "base");
            if (Object.keys(committed).length) { git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "committed"); }
            for (const [rel, content] of Object.entries(staged)) fs.writeFileSync(path.join(dir, rel), content);
            git(dir, "add", "-A");
            const r = markers.check(dir);
            const verdict = blocks.length ? r.problems.length === blocks.length && blocks.every(b => r.problems.some(p => p.startsWith(b)))
                : !r.problems.length && !r.warnings.length;
            t.ok(verdict, `conflict markers: ${why}`, r.problems.concat(r.warnings).join("\n") || r.summary);
        });
    }
};

// Outside a repository git cannot answer, and a hook that blocked every commit on that would be
// worse than one that says so and lets the rest of pre-commit decide.
exports.conflictMarkersOutsideARepo = function conflictMarkersOutsideARepo(t) {
    withRoot({ "a.txt": CONFLICT }, dir => {
        const r = markers.check(dir);
        t.ok(!r.problems.length && r.warnings.length === 1 && r.warnings[0].startsWith("could not check"),
            "conflict markers: no repository is a warning, not a block", r.problems.concat(r.warnings).join("\n"));
    });
};
