// scripts/repo-view.js
// A repo as a check reads it: a handful of questions about repo-relative paths, answered from the working
// tree, from Git's index, or from a map a test builds. A check that takes a view reads what a
// commit will record as easily as what is on disk, and a test hands it the files it is about
// instead of building a tree or pointing it at a file that does not exist.
//   exists(rel)   a file, or a folder holding one
//   isFile(rel)   a file
//   read(rel)     its text, or null when there is none
//   bytes(rel)    its bytes, or null when there is none
//   list(rel)     the names directly inside a folder, sorted; [] when there is none
//   lstat(rel)    { link } for whatever is at the path, or null when nothing is: `link` is where a
//                 symlink points, with forward slashes, and null for anything that is not one
//   modes()       every path the view holds, sorted, as { file, mode, object, link, exec }
// bytes() is a question of its own rather than a flag on read(), so that a view holding text answers
// read() honestly and has to be handed real bytes to answer bytes(). A flag is what the installer's
// own stand-in had, and it satisfied the flag by re-encoding its text: every branch production takes
// for a blob with a zero byte in it was unreachable from the suite for as long as that lasted.
// Paths are repo-relative with forward slashes. Nothing here writes, prints or exits.
// indexModes() is the one reader of `git ls-files -s`: the mode Git records is how the harness
// tells a symlink (120000) and an executable (100755) from a plain file.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// stdout alone and untrimmed, since a blob's trailing newline is part of its text.
const git = (dir, args) => spawnSync("git", ["-c", "core.quotepath=off", ...args], { cwd: dir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
// The same, with stdout left as bytes: a blob is read this way and decoded only if someone asks for
// its text, since a decode a file never had is not recoverable afterwards.
const gitBytes = (dir, args) => spawnSync("git", ["-c", "core.quotepath=off", ...args], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });

const norm = rel => path.posix.normalize(String(rel).split(path.sep).join("/")).replace(/^\.\/?$|\/+$/g, "");

// Every path Git's index holds in `dir`, optionally under `paths` (pathspecs), as
// { file, mode, object, link, exec }. null when `dir` is not a git checkout.
function indexModes(dir, paths = []) {
    const r = git(dir, ["ls-files", "-s", "-z", ...(paths.length ? ["--", ...paths] : [])]);
    if (r.status !== 0) return null;
    return r.stdout.split("\0").filter(Boolean).map(entry => {
        const [meta, file] = entry.split("\t");
        const [mode, object] = meta.split(" ");
        return { file, mode, object, link: mode === "120000", exec: mode === "100755" };
    });
}

// One entry of such a set: the mode Git records, the blob it recorded when there is one, and a
// loader for the content, called on first use. Written this way round because modes() has to answer
// for every path without reading a single blob: an index knows a file's mode from `ls-files -s`
// long before anyone asks what is in it, and a listing that read them all would make the cheapest
// question in the module the most expensive.
const entry = (mode, object, load) => ({ mode, object, load });

// A view over a set of entries known up front. Folders are whatever the paths imply, which is all
// an index or a map has of them. A loader gives text or bytes, whichever its source holds; read()
// and bytes() convert what they were given rather than what they wish for. A 120000 entry loads the
// path it points at, which is what Git keeps in its blob, so a source with no filesystem still
// answers the question the installer asks of a link.
function filesView(entries) {
    const cache = new Map();
    const under = rel => rel ? rel + "/" : "";
    const held = rel => {
        rel = norm(rel);
        if (!entries.has(rel)) return null;
        if (!cache.has(rel)) cache.set(rel, entries.get(rel).load());
        return cache.get(rel);
    };
    const view = {
        exists: rel => { rel = norm(rel); return entries.has(rel) || [...entries.keys()].some(f => f.startsWith(under(rel))); },
        isFile: rel => entries.has(norm(rel)),
        read: rel => { const v = held(rel); return v === null ? null : Buffer.isBuffer(v) ? v.toString("utf8") : v; },
        bytes: rel => { const v = held(rel); return v === null ? null : Buffer.isBuffer(v) ? v : Buffer.from(v, "utf8"); },
        lstat: rel => {
            if (!view.exists(rel)) return null;
            const e = entries.get(norm(rel));
            return { link: e && e.mode === "120000" ? view.read(rel) : null };
        },
        list: rel => {
            const prefix = under(norm(rel));
            const names = new Set([...entries.keys()].filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length).split("/")[0]));
            return [...names].sort();
        },
        modes: () => [...entries.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
            .map(([file, e]) => ({ file, mode: e.mode, object: e.object, link: e.mode === "120000", exec: e.mode === "100755" })),
    };
    return view;
}

// The files on disk under `root`. A path outside it resolves as it stands, which is what a cited
// `../` path means.
function worktree(root) {
    const at = rel => path.resolve(root, String(rel));
    const stat = rel => { try { return fs.statSync(at(rel)); } catch { return null; } };
    return {
        exists: rel => !!stat(rel),
        isFile: rel => !!(stat(rel) || { isFile: () => false }).isFile(),
        read: rel => { const s = stat(rel); return s && s.isFile() ? fs.readFileSync(at(rel), "utf8") : null; },
        bytes: rel => { const s = stat(rel); return s && s.isFile() ? fs.readFileSync(at(rel)) : null; },
        list: rel => { const s = stat(rel); return s && s.isDirectory() ? fs.readdirSync(at(rel)).sort() : []; },
        // lstatSync, not statSync: a link pointing nowhere is still something in the way, and a link
        // pointing somewhere must not be mistaken for what it points at.
        lstat(rel) {
            let s;
            try { s = fs.lstatSync(at(rel)); } catch { return null; }
            return { link: s.isSymbolicLink() ? fs.readlinkSync(at(rel)).split(path.sep).join("/") : null };
        },
        // The tree walked from the root, .git excepted. There is no blob to name, because nothing
        // here has been recorded yet; on Windows there is no executable bit either, which is why
        // the harness asks the index and not the disk what mode a hook was committed with.
        modes() {
            const walk = (rel) => fs.readdirSync(at(rel) || root, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)
                .flatMap(d => {
                    const file = rel ? `${rel}/${d.name}` : d.name;
                    if (d.isDirectory()) return d.name === ".git" ? [] : walk(file);
                    const mode = d.isSymbolicLink() ? "120000"
                        : ((fs.lstatSync(at(file)).mode & 0o111) ? "100755" : "100644");
                    return [{ file, mode, object: null, link: mode === "120000", exec: mode === "100755" }];
                });
            return fs.existsSync(root) ? walk("") : [];
        },
    };
}

// Git's index at `root`, limited to `paths` when given: what the next commit records, and nothing
// the working tree holds besides. Throws when `root` is not a git checkout, since an index nobody
// could read is not an empty one.
function index(root, paths = []) {
    const rows = indexModes(root, paths);
    if (!rows) throw new Error(`could not read the git index in ${root}`);
    const blob = object => {
        const r = gitBytes(root, ["cat-file", "blob", object]);
        if (r.status !== 0) throw new Error(`could not read blob ${object}: ${r.stderr.toString("utf8")}`);
        return r.stdout;
    };
    return filesView(new Map(rows.map(row =>
        [row.file, entry(row.mode, row.object, () => row.link ? blob(row.object).toString("utf8") : blob(row.object))])));
}

// Every blob of one tree, read in two calls rather than a `git show` per path. An install reads
// every file of the upstream's head, and a process per file made a first install take most of a
// minute on Windows. null when the batch could not be read, which leaves each path to the fallback.
function treeBlobs(root, rows) {
    const r = spawnSync("git", ["-c", "core.quotepath=off", "cat-file", "--batch"],
        { cwd: root, input: rows.map(e => e.object).join("\n") + "\n", maxBuffer: 1024 * 1024 * 1024 });
    if (r.status !== 0) return null;
    const blobs = new Map();
    let at = 0;
    for (const { file } of rows) {
        const eol = r.stdout.indexOf(10, at);
        const size = Number(r.stdout.toString("utf8", at, eol).split(" ")[2]);
        blobs.set(file, Buffer.from(r.stdout.subarray(eol + 1, eol + 1 + size)));
        at = eol + 1 + size + 1;
    }
    return blobs;
}

// One commit of the checkout at `root`: what it recorded, whatever the working tree has done since.
// This is how the upstream is read during an install -- the commit the receipt names, not the
// checkout that happens to be on disk. Throws when the commit cannot be read, for the same reason
// index() does: a commit nobody could read is not an empty one.
// A submodule is not a blob, and is left out, as `git show` would fail on it too.
function commit(root, sha) {
    const listing = gitBytes(root, ["ls-tree", "-r", "-z", sha]);
    if (listing.status !== 0) throw new Error(`could not read the commit ${sha} in ${root}`);
    const rows = listing.stdout.toString("utf8").split("\0").filter(Boolean).map(line => {
        const tab = line.indexOf("\t");
        const [mode, type, object] = line.slice(0, tab).split(" ");
        return { mode, type, object, file: line.slice(tab + 1) };
    }).filter(e => e.type === "blob");

    let batch;                                    // read whole on first use, and only if anyone asks
    const content = row => {
        if (batch === undefined) batch = treeBlobs(root, rows);
        if (batch && batch.has(row.file)) return batch.get(row.file);
        const r = gitBytes(root, ["show", `${sha}:${row.file}`]);
        if (r.status !== 0) throw new Error(`could not read ${row.file} at ${sha}: ${r.stderr.toString("utf8")}`);
        return r.stdout;
    };
    return filesView(new Map(rows.map(row => [row.file, entry(row.mode, row.object, () => content(row))])));
}

// What a commit will record for `paths`, and the working tree for everything else. Each of `paths`
// is read from the index when the index holds anything under it, and from the disk when it holds
// nothing: a repo that keeps one of them untracked still gets a meaningful answer.
function staged(root, paths) {
    const idx = index(root, paths), disk = worktree(root);
    const owner = rel => { rel = norm(rel); return paths.map(norm).find(p => rel === p || rel.startsWith(p + "/")); };
    const pick = rel => { const p = owner(rel); return p !== undefined && idx.exists(p) ? idx : disk; };
    return {
        exists: rel => pick(rel).exists(rel),
        isFile: rel => pick(rel).isFile(rel),
        read: rel => pick(rel).read(rel),
        bytes: rel => pick(rel).bytes(rel),
        list: rel => pick(rel).list(rel),
        lstat: rel => pick(rel).lstat(rel),
        // The index's, not a mix of the two: a mode is a question about what a commit will record,
        // and the disk has no answer to it that this view would rather give.
        modes: () => idx.modes(),
    };
}

// The files a test names, and nothing else. An entry is the content -- text or bytes -- or, when the
// case is about a mode rather than a content, `{ link }` for a symlink and `{ text|bytes, exec }`
// for an executable. That is the whole of what a map has to say, so a case about a link in the way
// or a mode already correct needs no checkout and no platform that has an executable bit.
function fromMap(files) {
    return filesView(new Map(Object.entries(files).map(([f, held]) => {
        const spec = held && typeof held === "object" && !Buffer.isBuffer(held) ? held : { bytes: held };
        const content = "link" in spec ? spec.link : "text" in spec ? spec.text : spec.bytes;
        const mode = "link" in spec ? "120000" : spec.exec ? "100755" : "100644";
        return [norm(f), entry(mode, null, () => content)];
    })));
}

module.exports = { worktree, index, commit, staged, fromMap, indexModes };
