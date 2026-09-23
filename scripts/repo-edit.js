// scripts/repo-edit.js
// A repo as a run changes it: the mirror of repo-view.js. An install is files in and files out, and
// this is the "out" -- every write the installer makes to somebody else's repository, in one
// implementation behind one substitutable adapter.
//   apply(entries)  carry out a finished plan, and return what became of it
// Each entry that asks for work gets one result:
//   { file, kind, done, why }
// `kind` is write, link, mkdir, mark or move; `done` is whether the tree now holds what the entry asked
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

// A move's two refusals, worded once. Both adapters answer the same question and have to answer it
// the same way, which is easier to keep true when there is one sentence rather than two copies.
const noSource = e => `nothing at ${e.move} to move to ${e.file}`;
const taken = e => `${e.file} is already there, so ${e.move} was left where it is`;

// What an entry asks to have done, or null when it asks for nothing: a phase heading, or a path the
// plan decided to leave exactly as it found it.
function work(e) {
    // Before the rest, because a move is about a path that does not exist yet and the entry naming
    // it may well go on to link something at where it came from.
    if (e.move !== undefined) return "move";
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
            // A folder in a map is a prefix, so moving one is re-keying every path under it, and a
            // file is the exact key. Whatever each one held travels with it, mode and all.
            move: e => {
                const under = rel => [rel, ...Object.keys(held).filter(k => k.startsWith(`${rel}/`))].filter(k => k in held);
                const from = under(e.move);
                if (!from.length) return noSource(e);
                if (under(e.file).length) return taken(e);
                for (const key of from) {
                    held[`${e.file}${key.slice(e.move.length)}`] = held[key];
                    delete held[key];
                }
                return null;
            },
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
    // rmdir after unlink, because a directory symlink on Windows -- and a junction, which is what
    // `npx skills` leaves behind -- is a directory to unlink and a link to rmdir, and only one of the
    // two calls works on either. Without the second, replacing a junction with a relative symlink
    // fails at the symlink for want of clearing its way.
    const clear = rel => {
        try { fs.unlinkSync(at(rel)); } catch { try { fs.rmdirSync(at(rel)); } catch { /* nothing was in the way */ } }
    };
    // Whether anything is at the path, the link itself counting rather than what it points at.
    const there = rel => { try { fs.lstatSync(at(rel)); return true; } catch { return false; } };
    // The rename is the filesystem's, but its record is Git's: moving a committed folder leaves the
    // index recording the old path, and no amount of writing to disk corrects that. The same reason
    // `mark` below goes through Git rather than chmod -- the disk cannot say it. Staged only when
    // the source was committed, which is the only case where the index now contradicts the disk: a
    // path nothing tracked leaves nothing to correct, so a repository mid-edit keeps its index, and
    // a root with no index at all has nothing to keep in step.
    const stage = e => {
        const tracked = repoView.indexModes(root, [e.move]);
        if (!tracked || !tracked.length) return null;
        const r = git(root, ["add", "-A", "--", e.move, e.file]);
        return r.status === 0 ? null : `could not stage the move of ${e.move} to ${e.file}: ${(r.stderr || "").trim()}`;
    };
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
            // Git is not asked to do the rename: a skill being adopted is usually untracked, and
            // `git mv` refuses that. Nothing is overwritten, so a name already taken at the
            // destination is a refusal rather than a project's work quietly replaced. Asked with
            // lstat rather than existsSync, because a dangling symlink is something in the way and
            // exists() follows the link and reports the path free -- and because the map adapter,
            // holding a link as an entry like any other, answers that question the same way.
            move: e => {
                if (!there(e.move)) return noSource(e);
                if (there(e.file)) return taken(e);
                // Inside the try with the rename, unlike the writes above: those go to the harness's
                // own paths, while a move's destination is made under whatever the project already
                // has there. A repository with a file where .agents/skills should be would take the
                // whole install down mid-way through, and a refusal is this module's contract.
                try {
                    parent(e.file);
                    fs.renameSync(at(e.move), at(e.file));
                }
                catch (err) { return `could not move ${e.move} to ${e.file}: ${err.code || err.message}`; }
                return stage(e);
            },
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
