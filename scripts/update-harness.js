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
const repoEdit = require("./repo-edit");
const installPolicy = require("./install-policy");
const entry = require("./plan-entry");

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
    return repoView.worktree(beside).exists(".git") ? beside : process.cwd();
}

// ---------------------------------------------------------------- the upstream

// The command line that clone runs on, which is how every install begins that did not bring its own
// checkout. Separate from the running of it because nothing in the suite clones: a check can read
// arguments, and cannot watch a network call it must not make.
const cloneArgs = (ref, dir) => ["-c", "core.longpaths=true", "clone", "--quiet", "--branch", ref, TEMPLATE, dir];

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
    const r = lib.run("git", cloneArgs(ref, dir));
    if (r.status !== 0) { fs.rmSync(dir, { recursive: true, force: true }); fail(`could not clone the upstream at ${ref}\n${r.output}`); }
    if (!usable(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        fail(`${TEMPLATE} at ${ref} carries no ${MANIFEST}, so there is nothing to install from; try another --ref`);
    }
    return { dir, temporary: true };
}

// The installer's own name and version: which released tool wrote this tree, the one thing the
// upstream commit cannot answer. package.json holds 0.0.0 on every branch and only the release job
// writes the real version into it, just before the publish, so its number means something only
// inside the npm package. A checkout of the upstream reads the release tag on its own HEAD instead.
// A checkout on no tag is not a release, and the receipt names no package rather than a version
// that was never published. Omitted, never null, whenever it cannot be read, so the receipt never
// claims a version it does not know.
const PLACEHOLDER_VERSION = "0.0.0";
const RELEASE_TAG = /^\d+\.\d+\.\d+$/;
function installerStamp({ name, version, tag }) {
    if (!name) return {};
    if (version && version !== PLACEHOLDER_VERSION) return { installer: `${name}@${version}` };
    return tag && RELEASE_TAG.test(tag) ? { installer: `${name}@${tag}` } : {};
}
// The reads behind installerStamp. The script sits in the scripts/ folder of either the npm package
// or a checkout of the upstream, so both files are one folder up; the package has no .git, and there
// git answers nothing.
function installer() {
    const home = path.resolve(__dirname, "..");
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(home, "package.json"), "utf8")); } catch { return {}; }
    const described = git(home, ["describe", "--tags", "--exact-match", "HEAD"]);
    return installerStamp({ name: pkg.name, version: pkg.version, tag: described.status === 0 ? described.output.trim() : null });
}

// The commit graph, which is all the installer runs git for itself now that repo-view reads the
// files. core.longpaths for the same reason repo-view sets it: Windows stops at 260 characters, and
// the harness ships skill files nested deep enough that a project a few folders down the drive
// crosses it.
const git = (dir, args) => lib.run("git", ["-c", "core.longpaths=true", "-C", dir, ...args]);

// ---------------------------------------------------------------- the adapters
//
// What plan() reads: the upstream at any commit, and the target as it stands. Both are repo-view
// adapters -- scripts/repo-view.js -- so a real run reads a checkout and a commit while the suite
// reads a map, through one implementation rather than two. That is the whole point of the seam: the
// stand-ins this file used to carry drifted, and the branch taken for a file with a NUL byte in it
// was unreachable from the suite for as long as a stand-in answered a bytes question with a string.
//
// What repo-view will not do is guess which of the two a caller wants, so the guess is made here.

// The upstream's version of a path, as the installer needs it: text as a string, and anything
// holding a NUL byte as the Buffer it arrived in, which is how Git itself tells the two apart.
// Decoded as UTF-8 and written back, every byte a PNG holds outside ASCII becomes U+FFFD: the
// skill's logo installs as a broken image, and no later run ever agrees with the upstream about it.
// Nothing merges a Buffer; it is written whole or kept whole.
// null when the commit has no such path, and equally when the checkout will not give it up: Git
// listed it a moment ago, so a read that fails is the checkout being unhappy rather than the file
// being absent, and plan() reports that as UNREADABLE rather than letting it end the run.
function contentOf(view, file) {
    let bytes;
    try { bytes = view.bytes(file); } catch { return null; }
    if (bytes === null) return null;
    return bytes.includes(0) ? bytes : bytes.toString("utf8");
}

// The upstream checkout: a view per commit, and the two questions only the commit graph can answer.
// Views are kept, because plan() asks the head for every path and a base for every file it merges;
// each one reads its tree once and its blobs in a single batch on first use.
function gitUpstream(dir) {
    const views = new Map();
    return {
        at(sha) {
            if (!views.has(sha)) views.set(sha, repoView.commit(dir, sha));
            return views.get(sha);
        },
        // A rewritten history no longer holds the recorded commit, which leaves the run without a base.
        has: sha => git(dir, ["cat-file", "-e", `${sha}^{commit}`]).status === 0,
        // The commits that touched a path, newest first.
        history(file) {
            const r = git(dir, ["log", "--format=%H", "--", file]);
            return r.status === 0 ? r.output.split(/\r?\n/).filter(Boolean) : [];
        },
    };
}

// The receipt is missing, so the base is found instead: the upstream version this copy is closest to
// is where the project forked from, whatever a receipt would have said. An exact match is the clean
// case, an older copy nobody touched; a project that has since edited its own file matches nothing
// exactly, so the nearest version by shared lines stands in as the base. That turns a first install
// into a real three-way merge for the files that need one, rather than one whole-file conflict.
// Only reconcile-policy files pay for the search: one git log, then a view per commit that touched
// the path.
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
        const text = contentOf(upstream.at(commit), file);
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
// This is the one thing a policy decision does that reaches outside the process: it makes a temp
// directory and spawns Git, which is why the otherwise in-memory decision table touches real disk.
// It was left that way deliberately. Putting a merge behind a seam would let the table run on a
// stand-in, and the stand-in is exactly what nobody wants tested: every interesting case here is a
// question about what diff3 really does to a conflict, which only diff3 can answer. The cost was
// measured rather than assumed -- the installer's plan table is 211ms of a 46s suite -- so the
// trade would buy purity with the only coverage that is worth anything.
function threeWay(base, ours, theirs) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-"));
    const f = n => path.join(dir, n);
    try {
        fs.writeFileSync(f("base"), base);
        fs.writeFileSync(f("ours"), ours);
        fs.writeFileSync(f("theirs"), theirs);
        const r = lib.run("git", ["merge-file", "--diff3", "-L", "yours", "-L", "upstream (base)", "-L", "upstream (new)",
            f("ours"), f("base"), f("theirs")]);
        if (r.status < 0) return { text: "", conflicts: false, failed: true };
        return settleDropped(fs.readFileSync(f("ours"), "utf8"));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// The conflicts of a --diff3 merge, each settled or written the way this script always has: the
// project's side and the upstream's, no base. A conflict whose project side shares no line with the
// base is a section the project dropped or replaced with its own, as a project does with the harness's
// part of .gitignore, and it stays dropped: the upstream's edit is to text the project no longer has.
// A conflict with an empty base is both sides adding at one place, and stays a conflict.
function settleDropped(text) {
    const HUNK = /^<{7} yours\n([\s\S]*?)^\|{7} upstream \(base\)\n([\s\S]*?)^={7}\n([\s\S]*?)^>{7} upstream \(new\)\n/gm;
    const lines = s => s.split("\n").map(l => l.trim()).filter(Boolean);
    let conflicts = 0;
    const out = text.replace(HUNK, (all, ours, base, theirs) => {
        const was = new Set(lines(base));
        if (was.size && !lines(ours).some(l => was.has(l))) return ours;
        conflicts++;
        return `<<<<<<< yours\n${ours}=======\n${theirs}>>>>>>> upstream (new)\n`;
    });
    return { text: out, conflicts: conflicts > 0, failed: false };
}

// ---------------------------------------------------------------- the plan
//
// Everything a run will do to the target, decided before anything is written: an install rewrites
// someone else's repository, and deciding and writing in the same loop left every branch but the
// per-file decision reachable only through a git checkout and a temp tree. A dry run prints the plan;
// a real run applies it. Each entry is one line of the run's output and at most one thing done to
// one path, and what an entry may be is scripts/plan-entry.js: written, linked, marked, folder,
// noted or heading, each reported by shown(...) or quiet(...). Nothing here builds an entry by hand,
// so the rules are the ones that module enforces rather than the ones this comment used to list.
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
    const atHead = upstream.at(head);
    if (base && !upstream.has(base)) {
        notices.push(`the recorded upstream commit ${base.slice(0, 8)} is not in ${TEMPLATE} any more, so this run has no merge base: existing files are left alone`);
        base = null;
    }
    // --adopt is how a repo whose harness files are wrong gets them replaced, and the commonest way to
    // reach that state is an install that wrote the receipt and kept a stale harness. So the run stays
    // open at the recorded commit, and main() answers "nothing to update" only without --adopt. An
    // optional part asked for by its flag keeps it open too, and then only that part has anything to do.
    if (previous && base === head) {
        notices.push(options.adopt
            ? `harness is already at ${head.slice(0, 8)} (${ref}); --adopt takes every harness file again anyway`
            : `harness is already at ${head.slice(0, 8)} (${ref}); installing only the optional part(s) asked for`);
    }

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

    // The mode Git recorded, rather than one worked out from the entry: a view answers for every path
    // it holds without reading a blob, and 120000 against 100755 against 100644 is the whole of what
    // the mode column says.
    const files = atHead.modes();
    const skills = [];
    add(entry.heading(`${files.length} path(s) in ${ref} at ${head.slice(0, 8)}`));
    for (const row of files) {
        const { file, link: isLink, exec, mode: m } = row;
        const { policy, asked } = installPolicy.policyFor(rows, file, options.wants);
        const theirs = contentOf(atHead, file);
        // Git listed the path a moment ago, so failing to read it is the checkout being unhappy
        // rather than the file being absent. Said out loud: skipped quietly, the run reports a clean
        // install of a harness missing whichever files the reader was never told about.
        if (theirs === null) { add(entry.noted(file, entry.shown(policy, m, "UNREADABLE", "unreadable"))); continue; }
        const exists = target.exists(file);
        // The executable bit is not the project's content, so a file kept for its content still has
        // its mode corrected. Git runs a hook only if it is executable and says nothing when it is
        // not, so a hook kept at 100644 by an install that had no merge base looks installed and
        // gates nothing at all -- the failure the mode column exists to catch.
        const line = (outcome, bucket, act = {}, silent = false) => {
            // The upstream's own files are counted and never printed: sixty of them are the suite's
            // fixtures, and the rule is worth a sentence in the summary rather than sixty lines.
            const as = silent ? entry.quiet(bucket) : entry.shown(policy, m, outcome, bucket);
            if (act.link !== undefined) return add(entry.linked(file, act.link, as, { replace: !!act.replace }));
            const bit = exec && (exists || act.write !== undefined);
            if (act.write !== undefined) return add(entry.written(file, act.write, as, { exec: bit }));
            return add(bit ? entry.marked(file, as) : entry.noted(file, as));
        };

        // Skills are decided for the folder rather than for the path: a skill merges by name, and
        // one line of output stands for its several hundred files. Collected here and handed to the
        // seam below, links and all, so this loop leaks around its own policy seam nowhere.
        if (policy === "skills") { skills.push(row); continue; }
        if (isLink && policy !== "template") {
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
        const { outcome, bucket, notice, silent, ...act } = installPolicy.decide(policy,
            { exists, theirs, hasBase: base !== null, adopt: options.adopt, asked }, {
                held: () => Buffer.isBuffer(theirs) ? target.bytes(file) : target.read(file),
                base: () => contentOf(upstream.at(base), file),
                // A seed file the recorded commit already shipped was laid down then. isFile, not a
                // read: whether a commit holds a path is a question its listing already answers.
                shippedBefore: () => base !== null && upstream.at(base).isFile(file),
                recoverBase: ours => recoverBase(upstream, file, ours),
                merge: threeWay,
            });
        if (notice) notices.push(`${file}: ${notice}`);
        line(outcome, bucket, act, silent);
    }

    add(entry.heading("skeletons a project starts with"));
    const hasIntent = target.exists(projectFacts.INTENT);
    // The receipt lists the skeletons its run knew, so one missing on an update is one the project
    // deleted, and it stays deleted; a skeleton added since still arrives. A receipt from before the
    // list is taken to know them all, which every install since the skeletons began has laid down.
    const known = new Set(previous && base !== null ? previous.skeletons || Object.keys(SKELETONS) : []);
    for (const [file, lines] of Object.entries(SKELETONS)) {
        const theirs = skeletonLines(file, lines, hasIntent).join("\n");
        const { outcome, bucket, write } = installPolicy.decide("skeleton",
            { exists: target.exists(file), theirs, asked: false }, { shippedBefore: () => known.has(file) });
        const as = entry.shown("seed", "100644", outcome, bucket);
        add(write === undefined ? entry.noted(file, as) : entry.written(file, write, as));
    }

    add(entry.heading("skills, merged by name"));
    // Everything the roster is decided from, read through the two views the run already holds: the
    // policy reads nothing itself, as it reads nothing for one path.
    entries.push(...installPolicy.decideRoster("skills", skills, {
        exists: file => target.exists(file),
        theirs: file => contentOf(atHead, file),
        held: file => (target.isFile(file) ? target.bytes(file) : null),
    }));

    // A list of strings on one line, as Prettier writes it: a project formatting its JSON with it
    // would otherwise reject the receipt at every push, and the next update would undo the fix.
    const receipt = JSON.stringify({ template: TEMPLATE, ref, commit: head, ...stamp, skeletons: Object.keys(SKELETONS) }, null, 2)
        .replace(/\[\n\s+("[^"\n]*"(?:,\n\s+"[^"\n]*")*)\n\s*\]/g, (all, items) => `[${items.split(/,\n\s+/).join(", ")}]`);
    add(entry.written(LOCK, receipt + "\n", entry.quiet()));
    return { entries, notices, base };
}

// ---------------------------------------------------------------- applying it

// An install rewrites someone else's repository, so it says what it did to every path while it does
// it, and --quiet asks for the summary alone. The mode is worth a column of its own: a hook that
// lands 100644 gates nothing and a skill link written as a regular file leaves the agent with no
// skills, and both look installed. A dry run prints the same lines straight from the plan.
//
// The writing is the repo-edit the run was handed, an entry at a time: the line for a path is said
// as the path is written, and an edit given the whole plan at once would leave a long install silent
// and then say all of it at the end. What order the work inside an entry goes in -- the parent
// folder before the file, the link's way cleared before the link, the mode after the content -- is
// the edit's, so this loop takes the plan's order as given and adds nothing to it. `out` is where a
// line goes as it happens; the run collects them, and only the command line prints.
// Returns the entries as they turned out, which the summary is built from.
function apply(entries, edit, options, out = say) {
    const done = [];
    for (const e of entries) {
        if (e.phase) { if (!options.quiet) out(`\n${e.phase}`); continue; }
        let actual = e;
        if (!options.dryRun) {
            const [result] = edit.apply([e]);
            // The edit reports; the policy decides. A symlink this platform will not make means the
            // target keeps whatever it already had, which is an outcome word and therefore this
            // run's to choose -- the edit says only that the link is not there and why.
            if (result && !result.done) {
                out(result.why);
                if (result.kind === "link") actual = entry.turnedOut(e, "yours", "kept");
            }
        }
        const line = entry.describe(actual);
        if (line && !options.quiet) out(line);
        done.push(actual);
    }
    return done;
}

// ---------------------------------------------------------------- after it

// First the Git hooks, pointed at .githooks/ before anything else: an install that stopped at a
// printed reminder left clones whose hooks never ran, and nothing says so -- Git skips a hooks
// folder it was never told about in silence. Then two files nothing copied: the per-harness skill
// links, which depend on which skills this project has rather than which the upstream ships, and the
// third-party notice, which must describe this project's lock file. All three are generated, so the
// install leaves a harness that works rather than a list of commands to remember. Each run names the
// target with --root: the shared resolver prefers a harness's project-dir variable to the checkout a
// script sits in, and an install started from a session open on another repo would otherwise wire,
// link and describe that repo instead.
//   { hooks, lines }: whether the hooks were wired, and what the three steps had to say
function finish(target, options) {
    const lines = [];
    if (!options.quiet) lines.push("\nGit hooks, links and notices");
    const steps = [["git hooks", "scripts/githooks-init.js", []], ["links", "scripts/skills.js", ["relink"]], ["notices", "scripts/skills.js", ["notices"]]];
    let hooks = true;
    for (const [label, script, args] of steps) {
        const r = lib.node([path.join(target, script), ...args, `${lib.ROOT_FLAG}${target}`], { cwd: target });
        lines.push(r.status === 0 ? r.output : `${label}: ${r.output}`);
        if (label === "git hooks" && r.status !== 0) hooks = false;
    }
    return { hooks, lines };
}

// Merging is not checking. The installer knows it wrote a file; it cannot know whether the result
// still works -- an AGENTS.md whose chain table no longer parses, routing sections naming an agent
// this repo does not have, a skill nothing links to, an upstream with no licence row. Those are the
// harness invariants, and scripts/check-harness.js holds them as functions of a repo-view.
//
// So they run from the upstream checkout against the target, and nothing is written into the target
// to run them. The upstream's copy rather than the one just installed, so the check is the one that
// matches the files this run wrote. The suite's fixtures stay upstream: they prove the harness
// scripts, which the upstream's own CI has already done.
//   { check, lines }: what the invariants made of the target, and what running them had to say
function selfCheck(target, templateDir, options) {
    const script = path.join(templateDir, "scripts", "check-harness.js");
    if (!fs.existsSync(script)) return { check: { skipped: "this upstream ref has no scripts/check-harness.js" }, lines: [] };
    const lines = options.quiet ? [] : ["\nself check: the harness invariants, run from the upstream against this repo"];
    const harness = require(script);
    // The root rather than a view of it: this is the upstream's copy of check-harness, at whichever
    // ref the run is installing, and a ref old enough to predate the view still expects a path.
    const r = harness.check(target);
    return { check: { failed: r.failed.length > 0, summary: r.summary, output: harness.format(r) }, lines };
}

// The two steps above, which are the only ones that reach outside this process: three scripts
// spawned in the target, and the upstream's own invariants required out of its checkout and run
// against it. Behind one adapter, because a run that wants to know what it would do has no target to
// spawn in and no checkout to require from -- and because every ordering fix this installer has
// needed landed in exactly these two steps, where nothing short of a real install could reach them.
//   wire(root, options)            -> { hooks, lines }
//   invariants(root, upstreamDir, options) -> { check, lines }
const onDisk = { wire: finish, invariants: selfCheck };

// Which paths joined which summary list. The lists are install-policy's to name: it is where a
// bucket is decided, and a second copy of the names here is a second place to forget one.
const bucketed = entries => {
    const notes = Object.fromEntries(installPolicy.BUCKETS.map(b => [b, []]));
    for (const e of entries) if (e.bucket) (notes[e.bucket] || []).push(e.file);
    return notes;
};

// Whether the run left anything for the reader to act on, and what. The one place that knows what
// makes an install fail: it used to be a single expression at the foot of the printer below, so the
// only way to ask was to run the install and read its stdout. Every reason is named, not the first
// one found -- a run with conflicts and unwired hooks has two things wrong with it.
function verdict({ entries, check, hooks = true }) {
    const notes = bucketed(entries);
    const why = [];
    for (const bucket of installPolicy.UNFINISHED) {
        const n = notes[bucket].length;
        if (n) why.push(bucket === "conflicted"
            ? `${n} path(s) hold conflict markers to resolve by hand`
            : `${n} path(s) could not be read out of the upstream checkout, so they are not installed`);
    }
    if (check && check.failed) why.push("the harness's own checks do not pass in the target");
    if (!hooks) why.push("the target's Git hooks are not wired, so nothing gates a commit there");
    return { failed: why.length > 0, why };
}

// The summary in words, as lines: what happened, then whatever the verdict says is outstanding.
// Returned rather than printed, so what a run reports can be read by a check the way a reader reads
// it. The verdict is read here and never worked out again -- two answers to "did this run fail?"
// drift, and the one CI reads is the one nobody is looking at.
function summarise({ entries, base, head, ref, target, check, hooks = true, options }) {
    const notes = bucketed(entries);
    const out = [];
    const say = line => out.push(line);
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
    if (!base) say("no merge base: this was an install, so a file already here was kept, or given only the part the harness needs");
    list("written", notes.written);
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

    // Git hooks are wired per clone: this one was wired above, and every other clone runs the script once.
    if (!options.dryRun && !hooks) say(`\nGIT HOOKS NOT WIRED: in ${target}, run node scripts/githooks-init.js`);
    if (!options.dryRun) say(`\nEvery other clone of ${target} wires its Git hooks once with: node scripts/githooks-init.js`);
    return out;
}

// ---------------------------------------------------------------- the run

// Whether the run has nothing to do: the receipt already names the upstream's head, and neither
// --adopt nor the flag of an optional part asks for more. The first --astro-docs usually comes after
// the harness is current, so an optional part is something to install even at the recorded commit.
function upToDate(previous, head, options, optional) {
    return !!previous && previous.commit === head && !options.adopt && !optional.some(name => options.wants(name));
}

// The parts of the harness a project has to ask for by name, as the manifest names them.
const optionalParts = rows => rows.filter(r => r.policy.startsWith("optional:")).map(r => r.policy.slice("optional:".length));

// One install, end to end, as a value. It decides whether there is anything to do, plans it, applies
// the plan through the target's repo-edit, takes the two steps that reach outside this process, and
// works out what it all came to -- and it returns every one of those rather than printing any of
// them. Which is the whole point: two-thirds of this file used to be reachable only by spawning the
// installer at somebody's repository, so an ordering question could be asked only of stdout after an
// eighteen-second install, and was therefore asked only after it had already gone wrong.
//
// `say` is where a line goes the moment it is produced, and defaults to nowhere. An install rewrites
// someone else's repository and has to narrate itself while it does it, so the lines cannot simply
// be handed over at the end; collecting them and passing them on at once is the same list either
// way, which is why a check can assert on what a run said without watching a terminal.
//   upstream { view, rows, head, ref, dir }   the upstream side, already checked out and read
//   target   { view, edit, root, previous }   the target side: what to read, what to write through
//   options, stamp                            the parsed command line, and what the receipt records
//   after                                     the steps outside this process; see onDisk above
//   -> { entries, notices, lines, base, head, ref, target, check, hooks, options, verdict }
function run({ upstream, target, options, stamp = {}, after = onDisk, say: out = () => {} }) {
    const lines = [];
    const said = line => { lines.push(line); out(line); };

    if (upToDate(target.previous, upstream.head, options, optionalParts(upstream.rows))) {
        said(`harness is already at ${upstream.head.slice(0, 8)} (${upstream.ref}); nothing to update`);
        return { entries: [], notices: [], lines, base: null, head: upstream.head, ref: upstream.ref,
            target: target.root, check: null, hooks: true, options, verdict: { failed: false, why: [] } };
    }

    const planned = plan({
        upstream: upstream.view, target: target.view, rows: upstream.rows,
        head: upstream.head, ref: upstream.ref, previous: target.previous, options, stamp,
    });
    for (const notice of planned.notices) said(notice);
    const entries = apply(planned.entries, target.edit, options, said);

    let check = null;
    let hooks = true;
    // After the plan is applied, because relink needs the skills in place and the invariants check
    // the links relink has just written. A dry run wrote nothing, so there is nothing to wire or
    // check and both steps are the target's own business until it is installed for real.
    if (!options.dryRun) {
        const wired = after.wire(target.root, options);
        hooks = wired.hooks;
        for (const line of wired.lines) said(line);
        if (options.check) {
            const ran = after.invariants(target.root, upstream.dir, options);
            check = ran.check;
            for (const line of ran.lines) said(line);
        }
    }

    const result = { entries, notices: planned.notices, base: planned.base, head: upstream.head,
        ref: upstream.ref, target: target.root, check, hooks, options };
    for (const line of summarise(result)) said(line);
    return { ...result, lines, verdict: verdict(result) };
}

// The command line: the one adapter over the run above. It works out which upstream and which target
// the arguments mean, clones if it has to, prints every line the run says as the run says it, and
// turns the verdict into the exit code npx and CI read. Nothing here decides anything about an
// install; everything it decides is about the process it is running in.
// Returns the exit code, and throws Stop for a run that could not start.
function main(args) {
    const options = parseOptions(args);
    if (options.help) { console.log(usage()); return 0; }
    const mistyped = mistypedArgs(args);
    if (mistyped.length) fail(`unknown argument(s): ${mistyped.join(" ")}. Nothing was written; run with --help for the options.`);
    const target = targetRoot(options);
    // One view of the target, read from here on: whether it is a checkout at all, what its receipt
    // says, and everything plan() asks of it. worktree() holds nothing between calls, so it still
    // answers for the tree as the run leaves it rather than as the run found it.
    const here = repoView.worktree(target);
    if (!here.exists(".git")) fail(`${target} is not a git checkout`);

    const previous = here.isFile(LOCK) ? JSON.parse(here.read(LOCK)) : null;
    const ref = options.ref || (previous ? previous.ref : DEFAULT_REF);
    const { dir: templateDir, temporary } = templateCheckout(ref, options);

    try {
        // Checked before anything is said about the target, so a bad argument is the only message.
        const rows = policies(templateDir);
        const unknown = unknownArgs(args, optionalParts(rows));
        if (unknown.length) fail(`unknown argument(s): ${unknown.join(" ")}. Nothing was written; run with --help for the options.`);
        const head = git(templateDir, ["rev-parse", "HEAD"]).output.trim();

        const result = run({
            upstream: { view: gitUpstream(templateDir), rows, head, ref, dir: templateDir },
            target: { view: here, edit: repoEdit.worktreeEdit(target), root: target, previous },
            options,
            stamp: { ...installer(), updated: new Date().toISOString().slice(0, 10) },
            say,
        });
        return result.verdict.failed ? 1 : 0;
    } finally {
        if (temporary) fs.rmSync(templateDir, { recursive: true, force: true });
    }
}

// run() is the interface: a whole install as a value, against whatever upstream, target and steps
// the caller hands it. The rest are the decisions under it, exported so a case can go in and an
// answer come out without a git checkout to reach one branch of one of them. main() is not among
// them: it is the command line, it writes to somebody's repository, and it is reached by running
// this file.
module.exports = { run, cloneArgs, installerStamp, upToDate, settleDropped, unknownArgs, mistypedArgs, usage, parseOptions, plan, apply, verdict, summarise, lineCounts, overlap, NEAREST, skeletonLines };

if (require.main === module) {
    try { process.exitCode = main(process.argv.slice(2)); }
    catch (e) {
        if (!(e instanceof Stop)) throw e;
        console.error(`update-harness: ${e.message}`);
        process.exitCode = 1;
    }
}
