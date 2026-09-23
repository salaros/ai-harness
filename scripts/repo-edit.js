// scripts/repo-edit.js
// A repo as a run changes it: the mirror of repo-view.js. An install is files in and files out, and
// this is the "out" -- every write the installer makes to somebody else's repository, in one
// implementation behind one substitutable adapter.
//   apply(entries)  carry out a finished plan, and return what became of it
// Each entry that asks for work gets one result:
//   { file, kind, done, why }
// `kind` is write, link, mkdir or mark; `done` is whether the tree now holds what the entry asked
// for; `why` is the mechanical reason it does not, or null. No outcome word and no summary bucket
// appears here: those are the install policy's, and the run translates these results into them.
// Nothing here prints or exits, so a refusal is a value the caller reads rather than a message a
// user has to be watching for.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const repoView = require("./repo-view");

// core.longpaths, because a vendored skill tree nests deeper than Windows' default limit.
const git = (root, args) => spawnSync("git", ["-c", "core.longpaths=true", "-C", root, ...args], { encoding: "utf8" });

const result = (file, kind, why) => ({ file, kind, done: !why, why: why || null });

// What an entry asks to have done, or null when it asks for nothing: a phase heading, or a path the
// plan decided to leave exactly as it found it.
function work(e) {
    if (e.link !== undefined) return "link";
    if (e.write !== undefined) return "write";
    if (e.mkdir) return "mkdir";
    if (e.exec) return "mark";
    return null;
}

// The common body: the ordering and the reporting, over whatever actually touches the repo.
// An entry may ask for two things at once -- the harness's hooks are written and then marked
// executable -- so the mark is part of whatever the entry chiefly asked for rather than a result of
// its own, and a caller still gets one line per entry to print. A write that failed is not then
// marked: there is nothing there to mark.
function editing(act) {
    return {
        apply(entries) {
            const out = [];
            for (const e of entries) {
                const kind = work(e);
                if (!kind) continue;
                let why = kind === "mark" ? null : act[kind](e);
                if (!why && e.exec) why = act.mark(e);
                out.push(result(e.file, kind, why));
            }
            return out;
        },
    };
}

// The same entry, as a map holds it once it is executable.
const asExec = held => {
    const spec = held && typeof held === "object" && !Buffer.isBuffer(held) ? held : { bytes: held };
    return { ...spec, exec: true };
};

// The entries applied to a map, with the resulting tree readable as a view. A check says what the
// repo held before and asserts on what it holds after, with no directory in between.
// `links: false` stands for a target the platform will not let anyone make a symlink in, which is
// every Windows checkout without Developer Mode. It is a shape a target really has, not a lever for
// a test: the case it makes reachable is the one the suite could otherwise only run on a machine
// that happens to refuse.
function mapEdit(files = {}, { links = true } = {}) {
    const held = { ...files };
    const marked = [];
    const view = () => repoView.fromMap(held);
    return {
        ...editing({
            write: e => { held[e.file] = e.write; return null; },
            link: e => {
                if (!links) return `could not create the symlink ${e.file} -> ${e.link}: EPERM`;
                held[e.file] = { link: e.link };
                return null;
            },
            // A map holds files, and a folder in it is whatever a path implies, so there is nothing
            // to make: the entry is satisfied the moment anything is written under it.
            mkdir: () => null,
            mark: e => {
                const row = view().modes().find(r => r.file === e.file);
                if (!row) return `nothing at ${e.file} to mark executable`;
                if (row.exec) return null;
                held[e.file] = asExec(held[e.file]);
                marked.push(e.file);
                return null;
            },
        }),
        view,
        marked: () => [...marked],
    };
}

// The files on disk under `root`. W-2 is this adapter's whole reason for existing: a parent folder
// is made before anything is written into it and whatever is in a link's way is removed before the
// link is made, so a caller orders its entries for a reader rather than for the filesystem.
function worktreeEdit(root) {
    const at = rel => path.resolve(root, String(rel));
    const parent = rel => fs.mkdirSync(path.dirname(at(rel)), { recursive: true });
    const clear = rel => { try { fs.unlinkSync(at(rel)); } catch { /* nothing was in the way */ } };
    const marked = [];
    // Git runs a hook only if it is executable and says nothing when it is not, so an installed
    // harness whose hooks are 644 looks installed and gates nothing. The upstream records them
    // 100755 and only Git can carry that: `chmod` alone is not enough, because on Windows
    // core.fileMode is false and the call does nothing, leaving the file to be staged 100644 later
    // and the hooks to run for whoever installed them and silently never for anyone else.
    // Which makes the index, not the disk, where "already marked" is true or false. Asking the disk
    // on Windows -- where the filesystem has no executable bit at all -- would mark every hook on
    // every run. A root with no index to read answers no, which marks: the safe way round.
    const alreadyExec = file => (repoView.indexModes(root, [file]) || []).some(r => r.file === file && r.exec);
    return {
        ...editing({
            write: e => { parent(e.file); fs.writeFileSync(at(e.file), e.write); return null; },
            mkdir: e => { fs.mkdirSync(at(e.file), { recursive: true }); return null; },
            link: e => {
                parent(e.file);
                clear(e.file);
                // Windows needs Developer Mode and core.symlinks=true for this to work at all, so a
                // refusal is a result rather than a throw: the harness still functions with the link
                // missing, it is just invisible to the agent harnesses that read it.
                try { fs.symlinkSync(e.link.split("/").join(path.sep), at(e.file), "dir"); }
                catch (err) { return `could not create the symlink ${e.file} -> ${e.link}: ${err.code || err.message}`; }
                return null;
            },
            mark: e => {
                if (alreadyExec(e.file)) return null;
                try { fs.chmodSync(at(e.file), 0o755); } catch { /* the filesystem does not do modes */ }
                const r = git(root, ["add", "--chmod=+x", "--", e.file]);
                if (r.status !== 0) return `could not mark ${e.file} executable: ${(r.stderr || "").trim()}`;
                marked.push(e.file);
                return null;
            },
        }),
        view: () => repoView.worktree(root),
        marked: () => [...marked],
    };
}

// `kindOf` is exported for the plan's entries, which are built to be read by it: one name per
// kind across the two, checked rather than kept in step by hand.
module.exports = { worktreeEdit, mapEdit, kindOf: work };
