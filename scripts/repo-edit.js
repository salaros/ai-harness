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
// A path a move in the same plan is moving to, claimed by some other entry as well. A plan that
// says two things about one path is a plan that contradicts itself, and the second of them is
// refused rather than performed: see `apply`, where the reason this can arise at all is set out.
const landed = (e, from) => `${e.file} is where ${from} was moved, so nothing else in the plan writes there`;
// A symlink that was not made, worded as the filesystem words it, because that is what the disk
// adapter is reporting: EEXIST for a path something is already at, EPERM for a platform that will
// not make one at all.
const noLink = (e, code) => `could not create the symlink ${e.file} -> ${e.link}: ${code}`;

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
            // W-2. A move empties a path, and an entry that links something at where it came from
            // reads naturally after it -- so a caller writes it that way and the edit, not the
            // caller, is what makes the order safe. Left in the caller's order, the link ran first,
            // `clear` took the project's own folder out of the way, and the move then carried the
            // link off to the destination: work destroyed, with both entries reporting success.
            // Moves go first instead, which is the order every caller already writes. The one thing
            // it costs: a move's source has to be in the tree already, not written by the same plan.
            const moves = entries.filter(e => work(e) === "move");
            // And what the reordering itself costs, paid here rather than by the caller. A move now
            // runs before an entry written above it, so the path it lands on is a path that entry
            // was about to land on -- and if that entry is a link, `clear` takes the moved work out
            // of its way: the same destruction, one end of the move further along. A move owns both
            // ends of its path, so the rest of the plan is refused at the destination. A mark is not
            // refused: it changes the mode of whatever is at the path rather than putting something
            // else there, which is how a hook is moved into place and then made executable.
            const to = new Map(moves.map(e => [e.file, e.move]));
            for (const e of [...moves, ...entries.filter(e => work(e) !== "move")]) {
                const kind = work(e);
                if (!kind) continue;
                const onAMove = kind !== "move" && kind !== "mark" && to.has(e.file);
                let why = onAMove ? landed(e, to.get(e.file)) : kind === "mark" ? null : act[kind](e);
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
    // Every key a path stands for: the file itself, and everything under it when it is a folder.
    // A map has no directories, so this is what "something is at this path" means here.
    const anyUnder = rel => [rel, ...Object.keys(held).filter(k => k.startsWith(`${rel}/`))].filter(k => k in held);
    // The ancestor a path cannot be reached through, because the map holds a file there. A map has
    // no folders to be blocked by, so this is the only shape in which "a file where a folder has to
    // go" exists here at all -- and on disk it is what makes mkdir and the write after it refuse.
    const ancestorFile = rel => rel.split("/").slice(0, -1)
        .map((_, i, parts) => parts.slice(0, i + 1).join("/"))
        .find(p => p in held) || null;
    return {
        ...editing({
            // A folder at the path is a refusal, which in a map is keys under it: the disk answers
            // EISDIR, and an adapter that quietly wrote instead would be the one place the suite
            // could not see the failure an install really gets.
            write: e => {
                if (anyUnder(e.file).some(k => k !== e.file)) return `could not write ${e.file}: EISDIR`;
                if (ancestorFile(e.file)) return `could not write ${e.file}: ENOTDIR`;
                held[e.file] = e.write;
                return null;
            },
            link: e => {
                if (!links) return noLink(e, "EPERM");
                if (ancestorFile(e.file)) return noLink(e, "ENOTDIR");
                // A file or a link at the path is replaced and a folder holding anything is not,
                // because that is what the disk does: `clear` unlinks, and its rmdir fallback fails
                // on a folder with something in it, so the symlink then refuses with EEXIST.
                if (anyUnder(e.file).some(k => k !== e.file)) return noLink(e, "EEXIST");
                held[e.file] = { link: e.link };
                return null;
            },
            // A map holds files, and a folder in it is whatever a path implies, so there is nothing
            // to make: the entry is satisfied the moment anything is written under it. A file at the
            // exact path is the one case with an answer to give, and it is the disk's.
            mkdir: e => {
                if (e.file in held) return `could not create the folder ${e.file}: EEXIST`;
                return ancestorFile(e.file) ? `could not create the folder ${e.file}: ENOTDIR` : null;
            },
            // A folder in a map is a prefix, so moving one is re-keying every path under it, and a
            // file is the exact key. Whatever each one held travels with it, mode and all.
            move: e => {
                const from = anyUnder(e.move);
                if (!from.length) return noSource(e);
                if (anyUnder(e.file).length) return taken(e);
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
        // The destination on its own and first. Given both paths at once, `git add` stages the
        // source's deletion and then fails on the destination -- a target whose .gitignore covers
        // where the harness keeps its skills is enough -- which leaves the index recording the skill
        // at neither path while the disk holds it at the new one. So the destination is offered
        // alone, and if Git will not have it the rename goes back and the index is untouched: the
        // refusal a real target actually produces costs the repository nothing.
        // Dropping the source afterwards is the step with no way back, because by then the
        // destination is staged. Nothing was found that makes it fail -- a path `git add -A` is
        // asked about is gone from the disk by this point, and staging that is a deletion Git takes
        // whether or not the path is ignored -- so the refusal is reported and TODO.md carries the
        // gap rather than this carrying a rollback no check can reach.
        const added = git(root, ["add", "-A", "--", e.file]);
        if (added.status !== 0) {
            try { fs.renameSync(at(e.file), at(e.move)); }
            catch { /* the way back is gone too; the message below is all there is to give */ }
            return `could not stage the move of ${e.move} to ${e.file}: ${(added.stderr || "").trim()}`;
        }
        const dropped = git(root, ["add", "-A", "--", e.move]);
        return dropped.status === 0 ? null : `could not stage the move of ${e.move} to ${e.file}: ${(dropped.stderr || "").trim()}`;
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
            // Both inside a try, for the same reason the move below is: a project with a folder
            // where a file goes, or a file where a folder goes, would otherwise take the whole
            // install down mid-way through with a throw out of `apply`. A refusal is this module's
            // contract, and it has to hold for the paths the harness writes as well.
            write: e => {
                try { parent(e.file); fs.writeFileSync(at(e.file), e.write); }
                catch (err) { return `could not write ${e.file}: ${err.code || err.message}`; }
                return null;
            },
            mkdir: e => {
                try { fs.mkdirSync(at(e.file), { recursive: true }); }
                catch (err) { return `could not create the folder ${e.file}: ${err.code || err.message}`; }
                return null;
            },
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
                // Before `clear`, so a parent that cannot be made refuses with the path still as it
                // was rather than with its way already cleared for a link that never arrives.
                try { parent(e.file); } catch (err) { return noLink(e, err.code || err.message); }
                clear(e.file);
                // Windows needs Developer Mode and core.symlinks=true for this to work at all, so a
                // refusal is a result rather than a throw: the harness still functions with the link
                // missing, it is just invisible to the agent harnesses that read it.
                try { fs.symlinkSync(e.link.split("/").join(path.sep), at(e.file), "dir"); }
                catch (err) { return noLink(e, err.code || err.message); }
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

// `kindOf` is exported for the plan's entries, which are built to be read by it: one name per kind
// across the two, checked rather than kept in step by hand. It covers the four an install plan
// builds; `move` is relink's alone, and relink assembles its entries directly rather than
// through `scripts/plan-entry.js`.
module.exports = { worktreeEdit, mapEdit, kindOf: work };
