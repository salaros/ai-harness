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

// A view over a set of files known up front, each read on first use. Folders are whatever the
// paths imply, which is all an index or a map has of them. A loader gives text or bytes, whichever
// its source holds; read() and bytes() convert what they were given rather than what they wish for.
// A loader giving { link } is a symlink, and reads as the path it holds, which is what Git records
// in its blob: a source with no filesystem still answers the question the installer asks of a link.
function filesView(loaders) {
    const cache = new Map();
    const under = rel => rel ? rel + "/" : "";
    const held = rel => {
        rel = norm(rel);
        if (!loaders.has(rel)) return null;
        if (!cache.has(rel)) cache.set(rel, loaders.get(rel)());
        const v = cache.get(rel);
        return v && typeof v === "object" && !Buffer.isBuffer(v) && "link" in v ? v.link : v;
    };
    const view = {
        exists: rel => { rel = norm(rel); return loaders.has(rel) || [...loaders.keys()].some(f => f.startsWith(under(rel))); },
        isFile: rel => loaders.has(norm(rel)),
        read: rel => { const v = held(rel); return v === null ? null : Buffer.isBuffer(v) ? v.toString("utf8") : v; },
        bytes: rel => { const v = held(rel); return v === null ? null : Buffer.isBuffer(v) ? v : Buffer.from(v, "utf8"); },
        lstat: rel => {
            if (!view.exists(rel)) return null;
            if (!loaders.has(norm(rel))) return { link: null };
            held(rel);                                        // a loader is what says whether this is a link
            const v = cache.get(norm(rel));
            return { link: v && typeof v === "object" && !Buffer.isBuffer(v) && "link" in v ? v.link : null };
        },
        list: rel => {
            const prefix = under(norm(rel));
            const names = new Set([...loaders.keys()].filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length).split("/")[0]));
            return [...names].sort();
        },
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
    return filesView(new Map(rows.map(row => [row.file, () => row.link ? { link: blob(row.object).toString("utf8") } : blob(row.object)])));
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
    };
}

// The files a test names, path -> text or bytes, and nothing else.
const fromMap = files => filesView(new Map(Object.entries(files).map(([f, held]) => [norm(f), () => held])));

module.exports = { worktree, index, staged, fromMap, indexModes };
