#!/usr/bin/env node
// scripts/update-harness.js
// Installs this repository's harness into another one, and updates it there afterwards. The
// upstream keeps moving; a repo made from it fills the same tree with work of its own. This script
// is the line between the two, and scripts/harness-files.tsv is where that line is written down.
//
// Updating is a three-way merge, not a copy. harness-lock.json at the target root records the
// upstream commit the harness was last taken from, so an update has a base: the recorded commit's
// version of a file, the target's version, and the new one. A file nobody edited takes the new
// version outright. An edited one keeps its edits and gains the changes around them. Only a real
// collision is written with conflict markers, and every one of those is reported and exits 1, so a
// half-merged harness is never mistaken for a clean update.
//
// First run into a repo with no harness-lock.json is an install: there is no base, so every managed
// file is written, and nothing that already exists is touched.
//
// Usage:
//   node scripts/update-harness.js                     update this repo from the upstream it records
//   node scripts/update-harness.js --dry-run           say what would change, write nothing
//   node scripts/update-harness.js --ref v2            update from a tag or branch instead
//   node scripts/update-harness.js --target ../other   install into or update another checkout
//   node scripts/update-harness.js --from ../ai-harness use a checkout you already have, no clone
//   node scripts/update-harness.js --astro-docs        add tools/docs-site, the Astro renderer for the chain
//   node scripts/update-harness.js --no-check          install without proving it afterwards
//   node scripts/update-harness.js --quiet             the summary alone, no line per path
//   node scripts/update-harness.js --adopt             take every harness file from the upstream, losing local edits
//   node scripts/update-harness.js --help              print this usage and exit
// Installing into a repo that has no harness yet, from anywhere:
//   git clone https://github.com/salaros/ai-harness .harness && \
//     node .harness/scripts/update-harness.js --from .harness --target . && rm -rf .harness
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./lib");
const projectFacts = require("./project-facts");
const repoView = require("./repo-view");
const { spawnSync } = require("child_process");

const TEMPLATE = "https://github.com/salaros/ai-harness.git";
const LOCK = "harness-lock.json";
const MANIFEST = "scripts/harness-files.tsv";
const DEFAULT_REF = "master";

// Every argument the installer knows. An optional part of the harness adds its own flag through the
// manifest (optional:<flag>), so those are checked once the upstream checkout is read. Anything else
// stops the run before a file is written: this script installs when it is run, so a mistyped
// --dry-rn, or a --help it did not understand, used to install for real.
const FLAGS = ["--dry-run", "--adopt", "--quiet", "--no-check", "--help", "-h"];
const VALUES = ["--ref", "--target", "--from"];
function unknownArgs(args, optional) {
    const known = [...FLAGS, ...optional.map(name => `--${name}`)];
    const unknown = [];
    for (let i = 0; i < args.length; i++) {
        if (VALUES.includes(args[i])) i++;
        else if (!known.includes(args[i])) unknown.push(args[i]);
    }
    return unknown;
}
// The part of that check that needs no manifest, so a typo fails before the clone rather than after
// it: anything not shaped like a flag, and anything a letter or two from a flag this script already
// knows, which no optional part would be named.
function mistypedArgs(args) {
    const named = [...FLAGS, ...VALUES];
    const near = (a, b) => {
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++)
            for (let j = 1; j <= b.length; j++)
                d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        return d[a.length][b.length] <= 2;
    };
    const mistyped = [];
    for (let i = 0; i < args.length; i++) {
        if (VALUES.includes(args[i])) { i++; continue; }
        if (named.includes(args[i])) continue;
        if (!/^--[a-z0-9]+(-[a-z0-9]+)*$/.test(args[i]) || named.some(n => near(args[i], n))) mistyped.push(args[i]);
    }
    return mistyped;
}
// Read from the comment block at the top of this file, so the usage has one copy.
function usage() {
    const lines = fs.readFileSync(__filename, "utf8").split(/\r?\n/);
    const start = lines.findIndex(l => l.startsWith("// Usage:"));
    const out = [];
    for (let i = start + 1; i < lines.length && lines[i].startsWith("//   "); i++) out.push(lines[i].slice(3).replace("node scripts/update-harness.js", "npx @salaros/ai-harness"));
    return ["Installs or updates the agent harness in the current git repository.", "", "Usage:", ...out].join("\n");
}

// The arguments, read once. Everything below takes this object rather than the process's argv, so a
// test can ask what an --adopt run would plan without being one. `wants` answers whether the run
// asked for an optional part of the harness by its flag.
function parseOptions(args) {
    const flag = name => args.includes(name);
    const value = name => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : null; };
    return {
        help: flag("--help") || flag("-h"),
        dryRun: flag("--dry-run"),
        adopt: flag("--adopt"),
        quiet: flag("--quiet"),
        check: !flag("--no-check"),
        wants: name => flag(`--${name}`),
        ref: value("--ref"),
        target: value("--target"),
        from: value("--from"),
    };
}

// A reason to stop. Thrown rather than exiting, so main() is the one place the process ends, and a
// temporary clone is still removed on the way out.
class Stop extends Error {}
const fail = m => { throw new Stop(m); };
const say = m => console.log(m);

// ---------------------------------------------------------------- the target

// Where the harness is going. Run from inside a project, that is the project: this script sits in
// its scripts/ folder. Run through npx, the package is an extracted tarball with no .git of its own,
// so the answer is the directory the user is standing in. One rule covers both, and --target covers
// installing into a checkout from somewhere else entirely.
function targetRoot(options) {
    if (options.target) return path.resolve(options.target);
    const beside = path.resolve(__dirname, "..");
    return fs.existsSync(path.join(beside, ".git")) ? beside : process.cwd();
}

// ---------------------------------------------------------------- the upstream

// A clone deep enough to read the recorded commit: an update needs that commit's version of a file
// as the merge base, and --depth 1 would not have it. Removed again unless the caller supplied one.
function templateCheckout(ref, options) {
    // The manifest is what makes a checkout usable here, so both routes are held to it: a --from
    // that points somewhere else, and a --ref naming a branch or tag from before the table existed,
    // fail the same way. Without this the run reaches readTsv and dies in a stack trace naming a
    // temporary directory the reader has never heard of.
    const usable = dir => fs.existsSync(path.join(dir, MANIFEST));
    if (options.from) {
        const dir = path.resolve(options.from);
        if (!usable(dir)) fail(`${dir} does not look like the upstream harness: no ${MANIFEST}`);
        return { dir, temporary: false };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-"));
    say(`cloning ${TEMPLATE} at ${ref}`);
    const r = lib.run("git", [...GIT, "clone", "--quiet", "--branch", ref, TEMPLATE, dir]);
    if (r.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); fail(`could not clone the upstream at ${ref}\n${r.output}`); }
    if (!usable(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        fail(`${TEMPLATE} at ${ref} carries no ${MANIFEST}, so there is nothing to install from; try another --ref`);
    }
    return { dir, temporary: true };
}

// The installer's own name and version, read from the package it ships inside rather than written
// down here, so a release cannot forget to update it. It answers what the upstream commit cannot:
// which released tool wrote this tree. Both routes land on the right file, because the script always
// sits in the scripts/ folder of either the npm package or a checkout of the upstream. Omitted
// rather than recorded as null when it cannot be read, so the receipt never claims a version it
// does not know.
function installer() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"));
        return pkg.name && pkg.version ? { installer: `${pkg.name}@${pkg.version}` } : {};
    } catch { return {}; }
}

// Windows stops at 260 characters for a path, and the harness ships skill files nested deep enough
// that a project a few folders down the drive crosses it. Git then fails to stat the working copy
// while resolving <commit>:<path>, so `git show` says the file is not there and the installer skips
// it -- a skill missing seven of its reference files, and not a word said about it. Setting
// core.longpaths on every call is what makes those paths reachable, and it costs nothing anywhere
// else.
const GIT = ["-c", "core.longpaths=true"];
const at = (dir, args) => lib.run("git", [...GIT, "-C", dir, ...args]);

// The upstream's version of a path at a commit, or null when the file did not exist there.
// Read raw rather than through lib.run, which trims trailing whitespace: that is right for the
// plumbing whose output is a hash or a status line, and wrong for a file. Trimmed, every installed
// file lost its final newline, no copy was ever byte-identical to the upstream, and so every later
// run re-merged files nobody had touched.
// Text comes back as a string and anything holding a NUL byte as the Buffer it arrived in, which is
// how Git itself tells the two apart. Decoded as UTF-8 and written back, every byte a PNG holds
// outside ASCII becomes U+FFFD: the skill's logo installs as a broken image, and no later run ever
// agrees with the upstream about it. Nothing merges a Buffer; it is written whole or kept whole.
function blob(dir, commit, file) {
    const r = spawnSync("git", [...GIT, "-C", dir, "show", `${commit}:${file}`], { maxBuffer: 256 * 1024 * 1024 });
    if (r.status !== 0) return null;
    return r.stdout.includes(0) ? r.stdout : r.stdout.toString("utf8");
}

// One test for both, so a caller comparing what blob returned against what is on disk does not have
// to know which it got.
const same = (a, b) => Buffer.isBuffer(a) || Buffer.isBuffer(b)
    ? Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.equals(b)
    : a === b;

// ---------------------------------------------------------------- the adapters
//
// What plan() reads, and nothing more: the upstream at any commit, and the target as it stands. A
// real run backs them with the upstream's git checkout and the target's directory; the suite backs
// them with maps, so a whole install is a table row rather than a clone and a temp tree.

// Every blob in one commit, read in two calls rather than one `git show` per path: an install reads
// every file at the head, and a process per file made a first install take most of a minute on
// Windows. Keyed by path, holding what blob() would return; a submodule entry is not a blob and is
// left out, as `git show` would fail on it too.
function treeBlobs(dir, commit) {
    const listing = spawnSync("git", [...GIT, "-C", dir, "ls-tree", "-r", "-z", commit], { maxBuffer: 64 * 1024 * 1024 });
    if (listing.status !== 0) return null;
    const entries = listing.stdout.toString("utf8").split("\0").filter(Boolean)
        .map(line => { const tab = line.indexOf("\t"); const [, type, oid] = line.slice(0, tab).split(" "); return { type, oid, file: line.slice(tab + 1) }; })
        .filter(e => e.type === "blob");
    const r = spawnSync("git", [...GIT, "-C", dir, "cat-file", "--batch"],
        { input: entries.map(e => e.oid).join("\n") + "\n", maxBuffer: 1024 * 1024 * 1024 });
    if (r.status !== 0) return null;
    const blobs = new Map();
    let at = 0;
    for (const { file } of entries) {
        const eol = r.stdout.indexOf(10, at);
        const size = Number(r.stdout.toString("utf8", at, eol).split(" ")[2]);
        const bytes = r.stdout.subarray(eol + 1, eol + 1 + size);
        blobs.set(file, bytes.includes(0) ? Buffer.from(bytes) : bytes.toString("utf8"));
        at = eol + 1 + size + 1;
    }
    return blobs;
}

function gitUpstream(dir, head) {
    let atHead;
    return {
        // Every path the upstream tracks, with the mode Git recorded. Mode 120000 is a symlink, and
        // the harness has two kinds: .claude/agents pointing at .agents/agents, and one per skill
        // under .claude/skills. Written as ordinary files they become text files holding a path,
        // which is how a harness ends up looking installed while the agent sees no skills at all.
        files() {
            const rows = repoView.indexModes(dir);
            if (!rows) fail(`could not list the upstream's files in ${dir}`);
            return rows.map(({ file, link, exec }) => ({ file, link, exec }));
        },
        // The head is read whole on first use; any other commit, which only a base or a base search
        // asks for, one path at a time.
        blob(commit, file) {
            if (commit !== head) return blob(dir, commit, file);
            if (atHead === undefined) atHead = treeBlobs(dir, head);
            if (atHead === null) return blob(dir, commit, file);
            return atHead.has(file) ? atHead.get(file) : null;
        },
        // A rewritten history no longer holds the recorded commit, which leaves the run without a base.
        hasCommit: commit => at(dir, ["cat-file", "-e", `${commit}^{commit}`]).status === 0,
        // The commits that touched a path, newest first.
        history(file) {
            const r = at(dir, ["log", "--format=%H", "--", file]);
            return r.status === 0 ? r.output.split(/\r?\n/).filter(Boolean) : [];
        },
    };
}

function fsTarget(root) {
    const full = file => path.join(root, file);
    return {
        exists: file => fs.existsSync(full(file)),
        // A Buffer when asked for bytes, text otherwise.
        read: (file, binary) => binary ? fs.readFileSync(full(file)) : fs.readFileSync(full(file), "utf8"),
        // null when nothing is there; otherwise whether it is a symlink, and where it points.
        lstat(file) {
            let s;
            try { s = fs.lstatSync(full(file)); } catch { return null; }
            return s.isSymbolicLink() ? { link: fs.readlinkSync(full(file)).split(path.sep).join("/") } : { link: null };
        },
    };
}

// The receipt is missing, so the base is found instead: the upstream version this copy is closest to
// is where the project forked from, whatever a receipt would have said. An exact match is the clean
// case, an older copy nobody touched; a project that has since edited its own file matches nothing
// exactly, so the nearest version by shared lines stands in as the base. That turns a first install
// into a real three-way merge for the files that need one, rather than one whole-file conflict.
// Only reconcile-policy files pay for the search: one git log, then a blob read per commit that
// touched the path.
// Under half the lines in common is a different file, not an older one, and merging against it would
// invent a diff the project never made.
const NEAREST = 0.5;
function recoverBase(upstream, file, ours) {
    const want = lineCounts(ours);
    let best = null;
    let nearest = NEAREST;
    // Oldest first, and a tie goes to the first seen: two upstream versions one line apart score the
    // same against a copy that has neither, and the older of them is the one whose merge puts that
    // line back. The newer would drop it silently, which is the failure this policy exists to stop.
    for (const commit of upstream.history(file).reverse()) {
        const text = upstream.blob(commit, file);
        if (typeof text !== "string") continue;
        if (text === ours) return text;
        const shared = overlap(want, lineCounts(text));
        if (shared > nearest) { best = text; nearest = shared; }
    }
    return best;
}

// Lines to counts, blank ones left out: they carry no content and every version of a markdown file
// has plenty, so counting them would score two unrelated documents as half the same.
function lineCounts(text) {
    const counts = new Map();
    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        counts.set(line, (counts.get(line) || 0) + 1);
    }
    return counts;
}

// The share of the longer file the two have in common, so neither a version that added a section nor
// one that cut it scores as a perfect match.
function overlap(ours, theirs) {
    let shared = 0;
    let mine = 0;
    for (const [line, n] of ours) { mine += n; shared += Math.min(n, theirs.get(line) || 0); }
    let other = 0;
    for (const n of theirs.values()) other += n;
    return shared / Math.max(mine, other, 1);
}

// ---------------------------------------------------------------- the manifest

function policies(templateDir) {
    return lib.readTsv(path.join(templateDir, MANIFEST)).map(([p, policy]) => ({ path: p, policy }));
}

// First match wins, so the table's order is its precedence. A row ending in / covers everything under it.
// `optional:<flag>` is seeded only when the run asked for it, and is otherwise not installed at all:
// the docs site is the case, useful to some projects and dead weight in the rest.
// `wants` answers whether the run asked for an optional part, so the table's meaning does not depend
// on the process's own argv and a test can ask what a repo would get either way.
function policyFor(rows, file, wants) {
    const row = rows.find(r => r.path.endsWith("/") ? file.startsWith(r.path) : file === r.path);
    if (!row) return "merge";               // anything the upstream ships and nobody classified is harness
    if (!row.policy.startsWith("optional:")) return row.policy;
    return wants(row.policy.slice("optional:".length)) ? "seed" : "template";
}

// ---------------------------------------------------------------- skeletons

// Three files the upstream does not ship, because there they would be lies: MEMORY.md
// describes a project this repo is not, and CONTEXT.md and TODO.md are written by the skills that
// own them, when there is something real to put in them. A repo that just took the harness has
// neither the files nor any sign the harness expects them, so an empty one is laid down: it names
// the file, says which skill fills it, and is valid to every check that reads it. Written only when
// absent, and never touched again.
const SKELETONS = {
    "MEMORY.md": [
        "# Project memory",
        "",
        "The facts no other file derives. Read this first. The `project-init` skill writes it, and the",
        "`pre-commit` and `pre-push` hooks refuse to let work leave a clone while any value is still a",
        "`<placeholder>`.",
        "",
    ],
    "CONTEXT.md": [
        "# Context",
        "",
        "The project's glossary: one entry per term the code and the documents both use, in the words",
        "the business uses. The `domain-modeling` skill writes an entry the moment a term is settled,",
        "and the decisions those terms come out of live in `docs/adr/`.",
        "",
    ],
    "TODO.md": [
        "# TODO",
        "",
        "Loose ends, in the [todo-md](https://github.com/todo-md/todo-md) format the `loose-ends` skill",
        "writes: `- [ ] <text> #question|#assumption|#deferred (<source>)`. An entry is deleted in the",
        "commit that settles it rather than ticked, so the length of this file means something.",
        "",
    ],
};

// MEMORY.md's fact lines come from scripts/project-facts.js, the table the gate checks them against,
// so a skeleton never asks for a fact the gate does not know or leaves out one it requires. A repo
// that already has an INTENT.md names the product and its purpose there, so the MEMORY.md laid down
// beside it leaves those two out rather than asking for them a second time.
function skeletonLines(file, lines, hasIntent) {
    if (file !== projectFacts.MEMORY) return lines;
    return [...lines, ...projectFacts.skeleton(hasIntent), ""];
}

// ---------------------------------------------------------------- merging

// git merge-file writes the merged result and reports the number of conflicts, or a negative status
// for trouble. Used rather than a hand-rolled diff3 because the target already needs Git.
function threeWay(base, ours, theirs) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-"));
    const f = n => path.join(dir, n);
    try {
        fs.writeFileSync(f("base"), base);
        fs.writeFileSync(f("ours"), ours);
        fs.writeFileSync(f("theirs"), theirs);
        const r = lib.run("git", ["merge-file", "-L", "yours", "-L", "upstream (base)", "-L", "upstream (new)",
            f("ours"), f("base"), f("theirs")]);
        return { text: fs.readFileSync(f("ours"), "utf8"), conflicts: r.status > 0, failed: r.status < 0 };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// Git checks a repo out with the platform's line endings, so a Windows working copy holds CRLF where
// the upstream stores LF. Compared raw, every line of every file reads as changed: a copy nobody
// touched reports as edited, and a real edit is buried in a whole-file conflict nobody can read. So
// the comparison and the merge happen in LF, and the result is written back in the endings the file
// already had.
const CRLF = /\r\n/g;
const LF = /\n/g;
// This script's own conflict label, on a line of its own, so prose about conflict markers is not
// mistaken for one.
const MARKED = /^<{7} yours\r?$/m;
const isCrlf = text => (text.match(CRLF) || []).length * 2 > (text.match(LF) || []).length;
const toLf = text => text.replace(CRLF, "\n");
const asFound = (text, crlf) => crlf ? text.replace(LF, "\r\n") : text;

// ---------------------------------------------------------------- the decision
//
// What happens to one file the target already has, decided apart from doing it. Everything these two
// read is an argument, including the three things they cannot compute -- the base's text, the search
// for a base when the receipt has none, and the three-way merge itself -- so plan() passes them in.
//
// Both answer the same shape: `outcome` is the word the run prints, `bucket` the summary list it
// belongs in (null for a file nothing happened to), and `text` what to write, or null to write
// nothing.

// A file with no lines to merge: it is the upstream's copy or it is the project's, and the base
// decides which. A logo the project replaced stays replaced.
function decideBinary({ held, theirs, hasBase, adopt }, { baseBytes }) {
    if (same(held, theirs)) return { outcome: "unchanged", bucket: null, text: null };
    const was = hasBase ? baseBytes() : null;
    if (adopt || same(held, was)) return { outcome: adopt ? "adopted" : "written", bucket: "written", text: theirs };
    return { outcome: hasBase ? "yours, binary" : "yours, no base", bucket: "kept", text: null };
}

// A text file. `raw` is what is on disk, in whatever line endings it has; `theirs` is the upstream's,
// always LF. The comparison and the merge happen in LF and the result is written back in the endings
// the file already had, so a Windows checkout does not read as edited from top to bottom.
function decideText({ policy, raw, theirs, hasBase, adopt }, { baseText, recoverBase, merge }) {
    const crlf = isCrlf(raw);
    const ours = toLf(raw);
    const keep = { outcome: hasBase ? "yours, new here" : "yours, no base", bucket: "kept", text: null };

    if (ours === theirs) return { outcome: "unchanged", bucket: null, text: null };
    // Before the base logic, not inside it: a repo that needs adopting usually has a receipt
    // already, written by the install that kept the stale files in the first place.
    if (adopt) return { outcome: "adopted", bucket: "written", text: asFound(theirs, crlf) };
    // Markers an earlier run wrote and nobody resolved. Left to the merge, the marked-up file is now
    // its own nearest base, so the merge takes it whole, the run says "unchanged" and a half-merged
    // harness passes as settled. Named instead, and the run exits 1 until someone resolves it or
    // --adopt above throws it away.
    if (MARKED.test(ours)) return { outcome: "STILL OPEN", bucket: "conflicted", text: null };

    // A reconcile file is one the harness cannot work around: AGENTS.md is the map every agent reads
    // and holds the table docs-check parses, and docs/README.md says what the chain puts where.
    // Keeping a stale one leaves a repo that looks installed and behaves like the version it came
    // from, so these are merged even when the receipt is missing. Nothing in the upstream's history
    // matching means this copy was written by hand, and an empty base makes the whole file one
    // conflict -- the honest answer: both versions are there to read, and the run exits 1.
    let from = hasBase ? baseText() : null;
    if (from === null && policy === "reconcile") from = recoverBase(ours);
    if (from === null && policy === "reconcile") from = "";
    if (from === null) return keep;

    if (ours === from) return { outcome: "written", bucket: "written", text: asFound(theirs, crlf) };
    const merged = merge(from, ours, theirs);
    if (merged.failed) return { outcome: "yours, merge failed", bucket: "kept", text: null };
    const result = asFound(merged.text, crlf);
    if (merged.conflicts) return { outcome: "CONFLICT", bucket: "conflicted", text: result };
    // A file that keeps a local edit merges cleanly on every later run and comes out the same every
    // time. Reported as merged each run it reads as churn, and the reader goes looking for a change
    // nobody made, so what the run did is decided by the result, not the route.
    if (result === raw) return { outcome: "unchanged", bucket: null, text: null };
    return { outcome: "merged", bucket: "merged", text: result };
}

// ---------------------------------------------------------------- the plan
//
// Everything a run will do to the target, decided before anything is written: an install rewrites
// someone else's repository, and deciding and writing in the same loop left every branch but the
// per-file decision reachable only through a git checkout and a temp tree. A dry run prints the plan;
// a real run applies it. Each entry is one line of the run's output and at most one thing done to
// one path:
//   file, policy, mode, outcome, bucket   what the run prints, and the summary list the path joins
//   write                                 the path's new content, text or a Buffer
//   link, replace                         a symlink to `link`, replacing what is there when `replace`
//   exec                                  mark the path executable, whether or not it is written
//   mkdir                                 create the path's folder and nothing else
//   silent                                counted in the summary, never printed as a line
// and a { phase } entry heads each section of the output.
const mode = f => f.link ? "120000" : f.exec ? "100755" : "100644";
const SKILLS = ".agents/skills/";

// `previous` is the target's harness-lock.json, or null; `stamp` is what the receipt records about
// this run besides the upstream commit, passed in so a plan is the same whenever it is made.
function plan({ upstream, target, rows, head, ref, previous, options, stamp = {} }) {
    const entries = [];
    const notices = [];
    const add = e => entries.push(e);

    // A base is what makes this an update rather than an overwrite. Without one -- a first install,
    // or an upstream whose history was rewritten -- an existing file is left alone instead of being
    // guessed at, and the run says so.
    let base = previous ? previous.commit : null;
    if (base && !upstream.hasCommit(base)) {
        notices.push(`the recorded upstream commit ${base.slice(0, 8)} is not in ${TEMPLATE} any more, so this run has no merge base: existing files are left alone`);
        base = null;
    }
    // --adopt is how a repo whose harness files are wrong gets them replaced, and the commonest way to
    // reach that state is an install that wrote the receipt and kept a stale harness. So the run stays
    // open at the recorded commit, and main() answers "nothing to update" only without --adopt.
    if (previous && base === head) notices.push(`harness is already at ${head.slice(0, 8)} (${ref}); --adopt takes every harness file again anyway`);

    // A repo carrying a harness from before harness-lock.json existed. Without a base the rule below
    // keeps every file that is already there, which protects the project's work and also preserves
    // the old harness: its checks then run against the new skills and agents and fail, naming rules
    // this version dropped. Worth saying out loud, because the run otherwise looks like a success.
    const MARKERS = [".agents/hooks/lib.js", "scripts/lib.js", ".githooks/pre-commit"];
    const stale = previous ? [] : MARKERS.filter(f => target.exists(f));
    if (stale.length) {
        notices.push(options.adopt
            ? `this repo has a harness but no ${LOCK}, and --adopt was given: harness files are replaced with ${ref}'s, and edits to them are lost`
            : `this repo has a harness (${stale.join(", ")}) but no ${LOCK}, so it predates the receipt and there is no merge base.\nEvery harness file already here is kept, which leaves old checks running against new skills. Re-run with --adopt to replace them, or --dry-run --quiet to list them first.`);
    }

    const files = upstream.files();
    const skills = [];
    add({ phase: `${files.length} path(s) in ${ref} at ${head.slice(0, 8)}` });
    for (const entry of files) {
        const { file, link: isLink, exec } = entry;
        const policy = policyFor(rows, file, options.wants);
        const m = mode(entry);
        const theirs = upstream.blob(head, file);
        // Git listed the path a moment ago, so failing to read it is the checkout being unhappy
        // rather than the file being absent. Said out loud: skipped quietly, the run reports a clean
        // install of a harness missing whichever files the reader was never told about.
        if (theirs === null) { add({ file, policy, mode: m, outcome: "UNREADABLE", bucket: "unreadable" }); continue; }
        const exists = target.exists(file);
        // The executable bit is not the project's content, so a file kept for its content still has
        // its mode corrected. Git runs a hook only if it is executable and says nothing when it is
        // not, so a hook kept at 100644 by an install that had no merge base looks installed and
        // gates nothing at all -- the failure the mode column exists to catch.
        const line = (outcome, bucket, act = {}) =>
            add({ file, policy, mode: m, outcome, bucket, ...act, exec: exec && (exists || act.write !== undefined) });

        // Not installed anywhere, and named in one line of the summary instead: sixty-five lines
        // saying nothing happened bury the thirty-eight saying something did.
        if (policy === "template") { line("template", "template", { silent: true }); continue; }
        if (isLink) {
            // A skill link is relink's to make, once the directory it lives in exists: it knows which
            // skills this project actually has, where the upstream only knows its own.
            if (policy === "skills") { add({ file, mkdir: true, silent: true }); continue; }
            const to = theirs.trim();
            const found = target.lstat(file);
            // Something of the project's in the way -- or, in a repo whose harness predates the lock
            // file, the link itself checked out as a text file holding a path, which is the failure
            // that leaves an agent seeing no skills at all. --adopt is the only thing that replaces it.
            if (!found) line("written", "written", { link: to });
            else if (!found.link) line(options.adopt ? "merged" : "yours", options.adopt ? "merged" : "kept", options.adopt ? { link: to, replace: true } : {});
            else if (found.link === to) line("unchanged", null);
            else line("merged", "merged", { link: to, replace: true });
            continue;
        }
        // Reported one line per skill by planSkills below, not one per reference file: a skill is the
        // unit a project installs, and its files run to several hundred.
        if (policy === "skills") { skills.push(entry); continue; }
        // Reported only when the target actually has it: "left alone, yours" about a file the repo
        // does not have names something that was never there.
        if (policy === "skip") { line(exists ? "yours" : "absent", exists ? "skipped" : null); continue; }
        if (policy === "seed") {
            if (exists) line("yours", "kept");
            else line("created", "seeded", { write: theirs });
            continue;
        }
        // merge and reconcile
        if (!exists) { line("written", "written", { write: theirs }); continue; }
        const hasBase = base !== null;
        const held = target.read(file, Buffer.isBuffer(theirs));
        const { outcome, bucket, text } = Buffer.isBuffer(theirs)
            ? decideBinary({ held, theirs, hasBase, adopt: options.adopt }, { baseBytes: () => upstream.blob(base, file) })
            : decideText({ policy, raw: held, theirs, hasBase, adopt: options.adopt }, {
                baseText: () => upstream.blob(base, file),
                recoverBase: ours => recoverBase(upstream, file, ours),
                merge: threeWay,
            });
        line(outcome, bucket, text === null ? {} : { write: text });
    }

    add({ phase: "skeletons a project starts with" });
    const hasIntent = target.exists(projectFacts.INTENT);
    for (const [file, lines] of Object.entries(SKELETONS)) {
        if (target.exists(file)) add({ file, policy: "seed", mode: "100644", outcome: "yours", bucket: null });
        else add({ file, policy: "seed", mode: "100644", outcome: "created", bucket: "seeded", write: skeletonLines(file, lines, hasIntent).join("\n") });
    }

    add({ phase: "skills, merged by name" });
    entries.push(...planSkills(upstream, target, head, skills));

    add({ file: LOCK, silent: true, write: JSON.stringify({ template: TEMPLATE, ref, commit: head, ...stamp }, null, 2) + "\n" });
    return { entries, notices, base };
}

// Skills merge by name, not by content: the upstream's are added and updated, and a skill the
// project vendored itself is never removed. skills-lock.json is the union, the project's entry
// winning where both name the same skill, so a project that pinned a different source keeps it.
function planSkills(upstream, target, head, files) {
    const LOCKFILE = "skills-lock.json";
    const theirLock = JSON.parse(upstream.blob(head, LOCKFILE) || '{"skills":{}}');
    const ourLock = target.exists(LOCKFILE) ? JSON.parse(target.read(LOCKFILE)) : { skills: {} };
    ourLock.skills = ourLock.skills || {};
    const mine = new Set(Object.keys(ourLock.skills));

    const out = [];
    // One line per skill, not per file. Outcome is decided across the whole folder: a skill counts as
    // changed the moment any file in it did, and only an untouched folder reads "unchanged".
    const outcomes = new Map();
    const seen = name => outcomes.get(name) || outcomes.set(name, { added: 0, updated: 0, files: 0 }).get(name);
    for (const { file, exec } of files) {
        if (!file.startsWith(SKILLS)) continue;                 // .claude/skills links are rebuilt, not copied
        const name = file.slice(SKILLS.length).split("/")[0];
        const tally = seen(name);
        tally.files++;
        const exists = target.exists(file);
        // A script the skill runs keeps its executable bit whoever owns the content, as a hook does.
        if (exec && exists) out.push({ file, silent: true, exec: true });
        // A skill the project installed under a name the upstream also uses stays the project's.
        if (mine.has(name) && !theirLock.skills[name]) { tally.yours = true; continue; }
        const text = upstream.blob(head, file);
        if (text === null) continue;
        // A vendored file the project has not touched still differs byte-for-byte on Windows, where
        // Git checked it out with CRLF. Compared raw, every skill would report as updated every run.
        const held = exists ? target.read(file, true) : null;
        let write;
        if (Buffer.isBuffer(text)) {
            if (same(held, text)) continue;
            write = text;
        } else {
            const ourText = held === null ? null : held.toString("utf8");
            if (ourText !== null && toLf(ourText) === text) continue;
            write = asFound(text, ourText !== null && isCrlf(ourText));
        }
        if (exists) tally.updated++; else tally.added++;
        out.push({ file, silent: true, write, bucket: exists ? "merged" : "written", exec: exec && !exists });
    }
    for (const [name, t] of [...outcomes].sort()) {
        const what = t.yours ? "yours" : t.added ? "added" : t.updated ? "updated" : "unchanged";
        out.push({ file: `${SKILLS}${name}  (${t.files} file(s))`, policy: "skills", mode: "100644", outcome: what, bucket: null });
    }
    for (const [name, entry] of Object.entries(theirLock.skills)) {
        if (!ourLock.skills[name]) ourLock.skills[name] = entry;
    }
    out.push({ file: LOCKFILE, silent: true, write: JSON.stringify(ourLock, null, 2) + "\n" });
    return out;
}

// ---------------------------------------------------------------- applying it

// Git runs a hook only if it is executable, and says nothing when it is not: an installed harness
// whose hooks are mode 644 looks installed and gates nothing. The upstream records them 100755, so
// that mode has to travel, and only Git can carry it. `chmod` alone is not enough -- on Windows
// core.fileMode is false and the call does nothing, so the file would be staged 100644 later and the
// hooks would run for whoever installed them and silently never run for anyone else. `git add
// --chmod=+x` writes the mode into the index whether or not the file was tracked, which is why the
// install stages these few files rather than leaving them for the project's own `git add`.
// Returns why it failed, or null.
function carryMode(root, file) {
    try { fs.chmodSync(path.join(root, file), 0o755); } catch { /* the filesystem does not do modes */ }
    const r = lib.run("git", [...GIT, "-C", root, "add", "--chmod=+x", "--", file]);
    return r.status === 0 ? null : `could not mark ${file} executable: ${r.output}`;
}

// Carries out one entry. Returns null when it went as planned, or what happened instead: `why` to
// print, and the `outcome` and `bucket` the run reports in place of the plan's.
function perform(root, e) {
    const full = path.join(root, e.file);
    if (e.mkdir || e.link !== undefined || e.write !== undefined) fs.mkdirSync(path.dirname(full), { recursive: true });
    if (e.link !== undefined) {
        if (e.replace) fs.unlinkSync(full);
        // Windows needs Developer Mode and core.symlinks=true for this to work at all, so a refusal
        // is reported rather than thrown: the harness still functions with the link missing, it is
        // just invisible to the harnesses that read it, and README says how to turn them on.
        try { fs.symlinkSync(e.link.split("/").join(path.sep), full, "dir"); }
        catch (err) { return { outcome: "yours", bucket: "kept", why: `could not create the symlink ${e.file} -> ${e.link}: ${err.code || err.message}` }; }
        return null;
    }
    if (e.write !== undefined) fs.writeFileSync(full, e.write);
    if (e.exec) { const why = carryMode(root, e.file); if (why) return { why }; }
    return null;
}

// An install rewrites someone else's repository, so it says what it did to every path while it does
// it, and --quiet asks for the summary alone. The mode is worth a column of its own: a hook that
// lands 100644 gates nothing and a skill link written as a regular file leaves the agent with no
// skills, and both look installed. A dry run prints the same lines straight from the plan.
// Returns the entries as they turned out, which the summary is built from.
function apply(entries, root, options) {
    const done = [];
    for (const e of entries) {
        if (e.phase) { if (!options.quiet) say(`\n${e.phase}`); continue; }
        let shown = e;
        if (!options.dryRun) {
            const fix = perform(root, e);
            if (fix && fix.why) say(fix.why);
            if (fix && fix.outcome) shown = { ...e, outcome: fix.outcome, bucket: fix.bucket };
        }
        if (!shown.silent && !options.quiet) say(`  ${shown.policy.padEnd(9)}${shown.mode}  ${shown.outcome.padEnd(12)}${shown.file}`);
        done.push(shown);
    }
    return done;
}

// ---------------------------------------------------------------- after it

// Two files nothing copied: the per-harness skill links, which depend on which skills this project
// has rather than which the upstream ships, and the third-party notice, which must describe this
// project's lock file. Both are generated, so the install leaves a harness that works rather than a
// list of commands to remember.
function finish(target, options) {
    if (!options.quiet) say("\nlinks and notices");
    for (const [label, args] of [["links", ["relink"]], ["notices", ["notices"]]]) {
        const r = lib.node([path.join(target, "scripts/skills.js"), ...args], { cwd: target });
        say(r.status === 0 ? r.output : `${label}: ${r.output}`);
    }
}

// Merging is not checking. The installer knows it wrote a file; it cannot know whether the result
// still works -- an AGENTS.md whose chain table no longer parses, routing sections naming an agent
// this repo does not have, a skill nothing links to, an upstream with no licence row. Those are the
// harness invariants, and scripts/check-harness.js holds them as functions of a root.
//
// So they run from the upstream checkout against the target, and nothing is written into the target
// to run them. The upstream's copy rather than the one just installed, so the check is the one that
// matches the files this run wrote. The suite's fixtures stay upstream: they prove the harness
// scripts, which the upstream's own CI has already done.
function selfCheck(target, templateDir, options) {
    const script = path.join(templateDir, "scripts", "check-harness.js");
    if (!fs.existsSync(script)) return { skipped: "this upstream ref has no scripts/check-harness.js" };
    if (!options.quiet) say("\nself check: the harness invariants, run from the upstream against this repo");
    const harness = require(script);
    const r = harness.check(target);
    return { failed: r.failed.length > 0, summary: r.summary, output: harness.format(r) };
}

// The summary, from the entries as they turned out. Returns the exit code: 1 while anything is left
// for the reader to act on.
function report({ entries, base, head, ref, target, check, options }) {
    const notes = { written: [], merged: [], conflicted: [], seeded: [], kept: [], skipped: [], template: [], unreadable: [] };
    for (const e of entries) if (e.bucket) notes[e.bucket].push(e.file);
    // Every path was named as it happened, so repeating the lists here doubles the output; a quiet
    // run never saw them and gets them in full. Conflicts are listed either way: they are what the
    // reader has to act on, and they belong beside the instructions for acting on them.
    const list = (label, arr, always) => {
        if (!arr.length) return;
        if (options.quiet || always) say(`\n${label} (${arr.length}):\n  ${arr.sort().join("\n  ")}`);
        else say(`\n${label}: ${arr.length}`);
    };
    say("");
    say(options.dryRun ? `dry run against ${ref} at ${head.slice(0, 8)}` : `harness updated to ${ref} at ${head.slice(0, 8)}`);
    if (!base) say("no merge base: this was an install, so nothing that already existed was changed");
    list("added", notes.written);
    list("merged", notes.merged);
    list("created for the first time", notes.seeded);
    list("left alone, yours", notes.kept.concat(notes.skipped));
    // Named rather than listed: the fixtures alone are sixty files, and the point is the rule, not
    // the inventory. Nothing a project runs reaches any of it.
    if (notes.template.length) {
        const named = notes.template.filter(f => !f.startsWith(".agents/hooks/tests/"));
        say(`\nnot installed, the upstream's own (${notes.template.length}): ${named.join(", ")}, and the suite's fixtures`);
    }
    // Listed whatever the verbosity, like a conflict: a file the upstream ships and this run could
    // not read is missing from the install, and the reader is the only one who can say why.
    if (notes.unreadable.length) {
        list("UNREADABLE in the upstream checkout, so not installed", notes.unreadable, true);
        say(`\nGit could not read these out of the upstream checkout. On Windows a path over 260 characters is\nthe usual cause: install into a shorter path, or set core.longpaths=true globally.`);
    }
    if (notes.conflicted.length) {
        list("CONFLICTED, resolve the markers by hand", notes.conflicted, true);
        say(`\nEach one holds <<<<<<< yours / ======= / >>>>>>> upstream (new). Resolve them, then check the harness:\n  node scripts/check-harness.js`);
    }
    if (check && check.skipped) say(`\nself check skipped: ${check.skipped}`);
    else if (check && check.failed) say(`\nSELF CHECK FAILED, so this install does not work yet:\n${check.output}`);
    else if (check) say(`\nself check: ${check.summary}`);

    if (!options.dryRun) {
        say(`\nIn ${target}, point Git at the hooks once per clone, then check the harness:`);
        say(`  node scripts/githooks-init.js && node scripts/check-harness.js`);
    }
    return notes.conflicted.length || notes.unreadable.length || (check && check.failed) ? 1 : 0;
}

// ---------------------------------------------------------------- the run

// Returns the exit code, and throws Stop for a run that could not start.
function main(args) {
    const options = parseOptions(args);
    if (options.help) { console.log(usage()); return 0; }
    const mistyped = mistypedArgs(args);
    if (mistyped.length) fail(`unknown argument(s): ${mistyped.join(" ")}. Nothing was written; run with --help for the options.`);
    const target = targetRoot(options);
    if (!fs.existsSync(path.join(target, ".git"))) fail(`${target} is not a git checkout`);

    const lockPath = path.join(target, LOCK);
    const previous = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, "utf8")) : null;
    const ref = options.ref || (previous ? previous.ref : DEFAULT_REF);
    const { dir: templateDir, temporary } = templateCheckout(ref, options);

    try {
        // Checked before anything is said about the target, so a bad argument is the only message.
        const rows = policies(templateDir);
        const optional = rows.filter(r => r.policy.startsWith("optional:")).map(r => r.policy.slice("optional:".length));
        const unknown = unknownArgs(args, optional);
        if (unknown.length) fail(`unknown argument(s): ${unknown.join(" ")}. Nothing was written; run with --help for the options.`);
        const head = at(templateDir, ["rev-parse", "HEAD"]).output.trim();
        if (previous && previous.commit === head && !options.adopt) {
            say(`harness is already at ${head.slice(0, 8)} (${ref}); nothing to update`);
            return 0;
        }

        const planned = plan({
            upstream: gitUpstream(templateDir, head), target: fsTarget(target), rows, head, ref, previous, options,
            stamp: { ...installer(), updated: new Date().toISOString().slice(0, 10) },
        });
        for (const notice of planned.notices) say(notice);
        const entries = apply(planned.entries, target, options);
        let check = null;
        if (!options.dryRun) {
            // After the plan is applied, because relink needs the skills in place and the invariants
            // check the links relink has just written.
            finish(target, options);
            if (options.check) check = selfCheck(target, templateDir, options);
        }
        return report({ entries, base: planned.base, head, ref, target, check, options });
    } finally {
        if (temporary) fs.rmSync(templateDir, { recursive: true, force: true });
    }
}

// The plan and the decisions under it, so the suite can put a case in and read the answer out rather
// than building a git checkout to reach one branch. apply() is here for its dry run, which prints and
// writes nothing; main() writes to somebody's repository and is reached through the command line.
module.exports = { unknownArgs, mistypedArgs, usage, parseOptions, policyFor, plan, apply, decideText, decideBinary, lineCounts, overlap, NEAREST, skeletonLines };

if (require.main === module) {
    try { process.exitCode = main(process.argv.slice(2)); }
    catch (e) {
        if (!(e instanceof Stop)) throw e;
        console.error(`update-harness: ${e.message}`);
        process.exitCode = 1;
    }
}
