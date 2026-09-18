// scripts/repo-view.js
// A repo as a check reads it: four questions about repo-relative paths, answered from the working
// tree, from Git's index, or from a map a test builds. A check that takes a view reads what a
// commit will record as easily as what is on disk, and a test hands it the files it is about
// instead of building a tree or pointing it at a file that does not exist.
//   exists(rel)   a file, or a folder holding one
//   isFile(rel)   a file
//   read(rel)     its text, or null when there is none
//   list(rel)     the names directly inside a folder, sorted; [] when there is none
// Paths are repo-relative with forward slashes. Nothing here writes, prints or exits.
// indexModes() is the one reader of `git ls-files -s`: the mode Git records is how the harness
// tells a symlink (120000) and an executable (100755) from a plain file.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// stdout alone and untrimmed, since a blob's trailing newline is part of its text.
const git = (dir, args) => spawnSync("git", ["-c", "core.quotepath=off", ...args], { cwd: dir, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

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
// paths imply, which is all an index or a map has of them.
function filesView(loaders) {
    const cache = new Map();
    const under = rel => rel ? rel + "/" : "";
    return {
        exists: rel => { rel = norm(rel); return loaders.has(rel) || [...loaders.keys()].some(f => f.startsWith(under(rel))); },
        isFile: rel => loaders.has(norm(rel)),
        read: rel => {
            rel = norm(rel);
            if (!loaders.has(rel)) return null;
            if (!cache.has(rel)) cache.set(rel, loaders.get(rel)());
            return cache.get(rel);
        },
        list: rel => {
            const prefix = under(norm(rel));
            const names = new Set([...loaders.keys()].filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length).split("/")[0]));
            return [...names].sort();
        },
    };
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
        list: rel => { const s = stat(rel); return s && s.isDirectory() ? fs.readdirSync(at(rel)).sort() : []; },
    };
}

// Git's index at `root`, limited to `paths` when given: what the next commit records, and nothing
// the working tree holds besides. Throws when `root` is not a git checkout, since an index nobody
// could read is not an empty one.
function index(root, paths = []) {
    const rows = indexModes(root, paths);
    if (!rows) throw new Error(`could not read the git index in ${root}`);
    const blob = object => {
        const r = git(root, ["cat-file", "blob", object]);
        if (r.status !== 0) throw new Error(`could not read blob ${object}: ${r.stderr}`);
        return r.stdout;
    };
    return filesView(new Map(rows.map(row => [row.file, () => blob(row.object)])));
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
        list: rel => pick(rel).list(rel),
    };
}

// The files a test names, path -> text, and nothing else.
const fromMap = files => filesView(new Map(Object.entries(files).map(([f, text]) => [norm(f), () => text])));

module.exports = { worktree, index, staged, fromMap, indexModes };
