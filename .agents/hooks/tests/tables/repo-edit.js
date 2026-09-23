// .agents/hooks/tests/tables/repo-edit.js
// SPEC-0001/W-1..W-5. scripts/repo-edit.js's decisions: what an install does to a repository, as
// values rather than as calls into `fs`. The map adapter is what makes these rows possible -- a case
// about a mode already correct or a link the platform refuses needs no checkout and no temp
// directory, and asserts on files rather than on a tree somebody has to walk afterwards.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const repoView = require("../../../../scripts/repo-view");
const repoEdit = require("../../../../scripts/repo-edit");
const { withRoot } = require("../fixtures");

// SPEC-0001/W-1. The smallest thing an edit does: it writes a file, and says it did.
exports.repoEditWritesAFile = function repoEditWritesAFile(t) {
    const edit = repoEdit.mapEdit({});
    const results = edit.apply([{ file: "docs/README.md", write: "hi\n" }]);
    t.ok(JSON.stringify(results) === JSON.stringify([{ file: "docs/README.md", kind: "write", done: true, why: null }]),
        "repo edit: a write is one result saying it was done", JSON.stringify(results));
    t.ok(edit.view().read("docs/README.md") === "hi\n", "repo edit: and the tree holds what it asked for");
};

// SPEC-0001/W-1. The other two kinds, and the entries that ask for nothing. A plan is mostly
// entries the run prints and does not act on -- a phase heading, a file the policy decided to leave
// exactly as it found it -- and an edit that returned a result for those would make the caller
// filter them back out to find what actually happened.
exports.repoEditLinksAndMakesFolders = function repoEditLinksAndMakesFolders(t) {
    const edit = repoEdit.mapEdit({});
    const results = edit.apply([
        { phase: "Skills" },
        { file: ".claude/skills", mkdir: true, silent: true },
        { file: ".claude/agents", link: "../.agents/agents" },
        { file: "AGENTS.md", policy: "merge", outcome: "kept" },
    ]);
    t.ok(results.map(r => `${r.kind} ${r.file}`).join(" ") === "mkdir .claude/skills link .claude/agents",
        "repo edit: only the entries asking for work come back, in the order they were given", JSON.stringify(results));
    t.ok(results.every(r => r.done && r.why === null), "repo edit: each of them went as planned", JSON.stringify(results));
    t.ok(edit.view().lstat(".claude/agents").link === "../.agents/agents",
        "repo edit: a link is a link in the tree afterwards, not a file holding a path",
        JSON.stringify(edit.view().lstat(".claude/agents")));
};

// SPEC-0001/W-4. Marking a file executable that already is executable is not work, and an edit that
// did it anyway would stage the project's own file into the project's own index for no change --
// which is how an install came to stage `.githooks/task-runner.json`. Closed at the seam: the edit
// asks what the mode already is, rather than anybody filtering file names.
// `marked()` is why this needs no checkout: the paths an edit actually marked are the difference
// between "already right" and "made right", and nothing in the tree afterwards can tell them apart.
exports.repoEditSkipsAMarkAlreadyCorrect = function repoEditSkipsAMarkAlreadyCorrect(t) {
    const edit = repoEdit.mapEdit({
        ".githooks/pre-commit": { text: "#!/bin/sh\n", exec: true },
        ".githooks/task-runner.json": "{}\n",
    });
    const results = edit.apply([
        { file: ".githooks/pre-commit", exec: true, silent: true },
        { file: ".githooks/task-runner.json", exec: true, silent: true },
    ]);
    t.ok(results.map(r => `${r.kind} ${r.file} ${r.done}`).join(" | ")
        === "mark .githooks/pre-commit true | mark .githooks/task-runner.json true",
        "repo edit: both marks are satisfied, whether or not either had to be made", JSON.stringify(results));
    t.ok(edit.marked().join() === ".githooks/task-runner.json",
        "repo edit: only the file that was not already executable is marked", JSON.stringify(edit.marked()));
    t.ok(edit.view().modes().every(r => r.exec), "repo edit: and both are executable afterwards",
        JSON.stringify(edit.view().modes()));
};

// SPEC-0001/W-5. A target that cannot make symlinks is a target shape, not an accident: Windows
// without Developer Mode refuses them outright, and the harness still works with the link missing --
// it is just invisible to the agent harnesses that read it. So the refusal is a value the run reads
// and decides about, and the edit neither throws it, prints it, nor relabels the entry the way
// perform() did. What a refused link means for the summary is the install policy's business.
exports.repoEditReportsARefusedLink = function repoEditReportsARefusedLink(t) {
    const edit = repoEdit.mapEdit({}, { links: false });
    const results = edit.apply([
        { file: ".claude/agents", link: "../.agents/agents" },
        { file: "AGENTS.md", write: "x\n" },
    ]);
    const [refused, after] = results;
    t.ok(refused.done === false && /symlink/.test(refused.why || ""),
        "repo edit: a link the target refuses comes back as done:false with the reason", JSON.stringify(refused));
    t.ok(!edit.view().exists(".claude/agents"),
        "repo edit: and nothing is left at the path for a reader to mistake for the link");
    t.ok(after.done === true && edit.view().read("AGENTS.md") === "x\n",
        "repo edit: the rest of the plan still runs -- one refusal is not the end of the install", JSON.stringify(after));
    t.ok(Object.keys(refused).join() === "file,kind,done,why",
        "repo edit: a result carries no outcome word and no summary bucket: those are the policy's", Object.keys(refused).join());
};

// SPEC-0001/W-2, W-4. The adapter that writes to a real checkout, against the two things only a
// real one can show: that the edit orders its own work, and what the index looks like afterwards.
// The mark is the point. `git add --chmod=+x` does not only carry a mode -- it stages whatever the
// working tree holds, so running it on a file whose mode was already right stages the project's own
// unsaved edit to it along the way. That is what happened to a repo's `.githooks/task-runner.json`,
// and it is invisible in the tree: only the index shows it.
exports.repoEditWritesToAWorkingTree = function repoEditWritesToAWorkingTree(t) {
    withRoot({ ".githooks/task-runner.json": "{}\n", "keep.txt": "mine\n" }, dir => {
        const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
        if (git("init", "-q").status !== 0) { t.skip("repo edit: git is not available for the working-tree adapter"); return; }
        git("config", "user.email", "t@example.com");
        git("config", "user.name", "T");
        git("add", "-A");
        git("update-index", "--chmod=+x", ".githooks/task-runner.json");
        if (git("commit", "-qm", "theirs").status !== 0) { t.skip("repo edit: this git cannot commit here"); return; }

        // The project edits its own data file and has not staged it. The mode is already right.
        fs.writeFileSync(path.join(dir, ".githooks", "task-runner.json"), `{ "tasks": ["theirs"] }\n`);

        const edit = repoEdit.worktreeEdit(dir);
        const results = edit.apply([
            { file: "deep/nested/new.md", write: "written\n" },
            { file: ".githooks/task-runner.json", exec: true, silent: true },
        ]);
        t.ok(results.every(r => r.done && r.why === null), "repo edit: a working tree carries out the plan", JSON.stringify(results));

        const disk = repoView.worktree(dir);
        t.ok(disk.read("deep/nested/new.md") === "written\n",
            "repo edit: a parent folder is made before the file is written into it, unasked");
        t.ok(edit.marked().length === 0, "repo edit: a mode already recorded is not marked again", JSON.stringify(edit.marked()));
        // Porcelain's first column is the index and its second the working tree, so " M" is an edit
        // nobody has staged and "M " is one somebody has.
        const status = git("status", "--porcelain").stdout.split("\n").find(l => l.includes("task-runner.json")) || "";
        t.ok(status.startsWith(" M"), "repo edit: and the project's own unsaved edit stays unstaged", JSON.stringify(status));
    });
};

// SPEC-0001/W-2. Whatever stands in a link's way is removed before the link is made, and the entry
// does not have to say so. The installer's plan carried a `replace` flag for this, which meant the
// plan had to have looked at the target to know whether to set it, and an entry built without that
// look threw EEXIST from inside the write. Ordering is the edit's job: an entry says where the link
// goes and what it points at, and nothing about what is there now.
exports.repoEditClearsALinksWay = function repoEditClearsALinksWay(t) {
    withRoot({ ".claude/agents": "the project's own file\n", ".claude/skills": "x\n" }, dir => {
        const edit = repoEdit.worktreeEdit(dir);
        const [onAFile, onALink] = edit.apply([
            { file: ".claude/agents", link: "../.agents/agents" },
            { file: ".claude/skills", link: "../.agents/skills" },
        ]);
        if (!onAFile.done && /symlink/.test(onAFile.why || "")) { t.skip("repo edit: this platform refuses to create a symlink"); return; }
        t.ok(onAFile.done && onALink.done, "repo edit: a link lands over what was in its way", JSON.stringify([onAFile, onALink]));
        t.ok(edit.view().lstat(".claude/agents").link === "../.agents/agents",
            "repo edit: and the path is a link afterwards, not the file that was there",
            JSON.stringify(edit.view().lstat(".claude/agents")));

        // Again over the link just made, pointing somewhere else: the second run of an install.
        const [again] = edit.apply([{ file: ".claude/skills", link: "../.agents/elsewhere" }]);
        t.ok(again.done && edit.view().lstat(".claude/skills").link === "../.agents/elsewhere",
            "repo edit: a link already there is replaced, not left pointing at the old target",
            JSON.stringify(edit.view().lstat(".claude/skills")));
    });
    const map = repoEdit.mapEdit({ ".claude/agents": "the project's own file\n" });
    map.apply([{ file: ".claude/agents", link: "../.agents/agents" }]);
    t.ok(map.view().lstat(".claude/agents").link === "../.agents/agents",
        "repo edit: a map answers the same, so the case needs no platform that has symlinks",
        JSON.stringify(map.view().lstat(".claude/agents")));
};

// A skill a project keeps under .claude/skills and nowhere else is invisible to every other agent
// harness in the clone, and the harness's answer is to move it into .agents/skills and link back.
// Which is a fourth thing an install does to a repository: it relocates what is already there,
// rather than writing something new. The destination is the entry's path, because that is what
// exists afterwards; a move onto something already there is refused rather than performed, since
// the whole point is that nothing is lost.
exports.repoEditMovesWhatIsAlreadyThere = function repoEditMovesWhatIsAlreadyThere(t) {
    if (repoEdit.kindOf({ file: "a", move: "b" }) !== "move") { t.skip("repo edit: this scripts/repo-edit.js does not move"); return; }

    const edit = repoEdit.mapEdit({
        ".claude/skills/mine/SKILL.md": "mine\n",
        ".claude/skills/mine/run.sh": { text: "run\n", exec: true },
        ".agents/skills/theirs/SKILL.md": "theirs\n",
    });
    const [moved] = edit.apply([{ file: ".agents/skills/mine", move: ".claude/skills/mine" }]);
    t.ok(moved.done && moved.kind === "move", "repo edit: a move is one result about the path it made", JSON.stringify(moved));
    t.ok(edit.view().read(".agents/skills/mine/SKILL.md") === "mine\n",
        "repo edit: a folder arrives whole, every file under it", JSON.stringify(edit.view().list(".agents/skills/mine")));
    t.ok(!edit.view().exists(".claude/skills/mine"), "repo edit: and is gone from where it was", JSON.stringify(edit.view().list(".claude/skills")));
    t.ok(edit.view().modes().some(r => r.file === ".agents/skills/mine/run.sh" && r.exec),
        "repo edit: a script that arrived executable is still executable", JSON.stringify(edit.view().modes().map(r => r.file + " " + r.mode)));

    const onto = repoEdit.mapEdit({ ".claude/skills/mine/SKILL.md": "mine\n", ".agents/skills/mine/SKILL.md": "theirs\n" });
    const [refused] = onto.apply([{ file: ".agents/skills/mine", move: ".claude/skills/mine" }]);
    t.ok(!refused.done && /already/.test(refused.why || ""), "repo edit: a move onto something already there is refused", JSON.stringify(refused));
    t.ok(onto.view().read(".agents/skills/mine/SKILL.md") === "theirs\n" && onto.view().exists(".claude/skills/mine"),
        "repo edit: and neither side is touched", JSON.stringify(onto.view().list("")));

    const missing = repoEdit.mapEdit({});
    const [nothing] = missing.apply([{ file: ".agents/skills/mine", move: ".claude/skills/mine" }]);
    t.ok(!nothing.done && /nothing/.test(nothing.why || ""), "repo edit: a move of nothing says so rather than throwing", JSON.stringify(nothing));

    // The same on a real tree, which is where a rename crosses a filesystem rather than a map.
    withRoot({ ".claude/skills/mine/SKILL.md": "mine\n" }, root => {
        const disk = repoEdit.worktreeEdit(root);
        const [r] = disk.apply([{ file: ".agents/skills/mine", move: ".claude/skills/mine" }]);
        t.ok(r.done && disk.view().read(".agents/skills/mine/SKILL.md") === "mine\n" && !disk.view().exists(".claude/skills/mine"),
            "repo edit: a move on disk relocates the folder, parent made for it", `${JSON.stringify(r)} ${JSON.stringify(disk.view().list(".agents/skills"))}`);
    });
};

// A rename on disk is invisible to Git: the index goes on recording the path a folder was committed
// at, and that index is what the harness invariant about .claude/skills reads. So a move stages its
// own result -- the same reason `mark` goes through Git rather than chmod, that the disk cannot say
// it. Narrowly, though: only a source Git was already tracking, because that is the only case where
// the index and the disk now disagree. Anything else would sweep a repository's own uncommitted
// work into whatever commit somebody makes next.
// SPEC-0001/W-1. `done` says whether the tree now holds what the entry asked for, so a move that
// happened may not report otherwise -- and a refusal has to be one, rather than a half-done move
// wearing a refusal's words. Git is asked for the destination on its own and first, because given
// both paths at once it stages the source's deletion and then fails on the destination: a target
// whose .gitignore covers where the harness keeps its skills was enough to leave a project's skill
// recorded at neither path while the disk held it at the new one. The rename goes back instead.
exports.repoEditPutsAMoveBackWhenGitWillNotRecordIt = function repoEditPutsAMoveBackWhenGitWillNotRecordIt(t) {
    if (repoEdit.kindOf({ file: "a", move: "b" }) !== "move") { t.skip("repo edit rollback: this scripts/repo-edit.js does not move"); return; }
    const git = (root, args) => spawnSync("git", ["-c", "core.longpaths=true", "-C", root, ...args], { encoding: "utf8" });
    if (git(".", ["--version"]).status !== 0) { t.skip("repo edit rollback: git is not installed"); return; }

    withRoot({ ".claude/skills/mine/SKILL.md": "mine\n", ".gitignore": ".agents/\n" }, root => {
        git(root, ["init", "-q", "."]);
        git(root, ["config", "user.email", "t@t"]);
        git(root, ["config", "user.name", "t"]);
        git(root, ["add", "-A"]);
        git(root, ["commit", "-qm", "init"]);
        const before = git(root, ["ls-files", "-s"]).stdout;

        const [r] = repoEdit.worktreeEdit(root).apply([{ file: ".agents/skills/mine", move: ".claude/skills/mine" }]);
        t.ok(!r.done && /could not stage/.test(r.why || ""), "repo edit rollback: a move Git will not record is a refusal", JSON.stringify(r));
        t.ok(fs.existsSync(path.join(root, ".claude/skills/mine/SKILL.md")),
            "repo edit rollback: and the skill is back where it was, not stranded at the destination", JSON.stringify(fs.readdirSync(path.join(root, ".claude/skills"))));
        t.ok(git(root, ["ls-files", "-s"]).stdout === before,
            "repo edit rollback: and the index still records it, rather than recording it nowhere", git(root, ["ls-files", "-s"]).stdout);
    });
};
exports.repoEditStagesAMoveItCannotOtherwiseRecord = function repoEditStagesAMoveItCannotOtherwiseRecord(t) {
    if (repoEdit.kindOf({ file: "a", move: "b" }) !== "move") { t.skip("repo edit stage: this scripts/repo-edit.js does not move"); return; }
    const git = (root, args) => spawnSync("git", ["-c", "core.longpaths=true", "-C", root, ...args], { encoding: "utf8" });
    if (git(".", ["--version"]).status !== 0) { t.skip("repo edit stage: git is not installed"); return; }
    const entry = { file: ".agents/skills/mine", move: ".claude/skills/mine" };

    withRoot({ ".claude/skills/mine/SKILL.md": "mine\n", "README.md": "hi\n" }, root => {
        git(root, ["init", "-q", "-b", "main", "."]);
        git(root, ["config", "user.email", "a@b.c"]);
        git(root, ["config", "user.name", "T"]);
        git(root, ["add", "-A"]);
        git(root, ["commit", "-qm", "initial"]);

        const [r] = repoEdit.worktreeEdit(root).apply([entry]);
        const staged = git(root, ["ls-files", "-s"]).stdout;
        t.ok(r.done, "repo edit stage: the move itself is done", JSON.stringify(r));
        t.ok(staged.includes(".agents/skills/mine/SKILL.md"),
            "repo edit stage: the index records the skill where it now is", staged);
        t.ok(!staged.includes(".claude/skills/mine"),
            "repo edit stage: and no longer where it was, which is what the invariant reads", staged);
    });

    // The same repo and the same move, but nothing there was ever committed: no disagreement to
    // settle, so the index is left exactly as its owner had it.
    withRoot({ ".claude/skills/mine/SKILL.md": "mine\n", "README.md": "hi\n" }, root => {
        git(root, ["init", "-q", "-b", "main", "."]);
        const [r] = repoEdit.worktreeEdit(root).apply([entry]);
        const staged = git(root, ["ls-files", "-s"]).stdout;
        t.ok(r.done, "repo edit stage: an untracked skill still moves", JSON.stringify(r));
        t.ok(staged.trim() === "", "repo edit stage: and nothing of the project's is staged on its behalf", staged);
    });

    // A target that is no checkout at all -- an extracted tarball, a folder somebody made -- has no
    // index to keep in step, and answering that with a refusal would fail an install over nothing.
    withRoot({ ".claude/skills/mine/SKILL.md": "mine\n" }, root => {
        const [r] = repoEdit.worktreeEdit(root).apply([entry]);
        t.ok(r.done && !r.why, "repo edit stage: a root with no index moves and refuses nothing", JSON.stringify(r));
    });
};

// The two adapters have to answer the same question the same way, and "is something already there"
// is where they could quietly differ: a map holds a link as an entry like any other, while
// existsSync on disk follows a link and reports a dangling one's path free. Then the map refuses a
// move the disk performs. The case that tells them apart is the one this harness makes most of all
// -- a .claude/skills full of links, some of them pointing at skills that are gone.
exports.repoEditAdaptersAgreeAboutSomethingInTheWay = function repoEditAdaptersAgreeAboutSomethingInTheWay(t) {
    if (repoEdit.kindOf({ file: "a", move: "b" }) !== "move") { t.skip("repo edit dangling: this scripts/repo-edit.js does not move"); return; }
    const entry = { file: ".agents/skills/mine", move: ".claude/skills/mine" };
    const [onMap] = repoEdit.mapEdit({
        ".claude/skills/mine/SKILL.md": "mine\n",
        ".agents/skills/mine": { link: "../../nowhere" },
    }).apply([entry]);

    withRoot({ ".claude/skills/mine/SKILL.md": "mine\n" }, root => {
        fs.mkdirSync(path.join(root, ".agents", "skills"), { recursive: true });
        try { fs.symlinkSync(path.join("..", "..", "nowhere"), path.join(root, ".agents", "skills", "mine"), "dir"); }
        catch { t.skip("repo edit dangling: this platform will not make a symlink"); return; }
        const [onDisk] = repoEdit.worktreeEdit(root).apply([entry]);
        t.ok(!onMap.done && !onDisk.done,
            "repo edit: a dangling link is something in the way, whichever adapter is asked",
            `${JSON.stringify(onMap)} ${JSON.stringify(onDisk)}`);
        t.ok(onMap.why === onDisk.why, "repo edit: and both say so in the same words", `${onMap.why} | ${onDisk.why}`);
    });
};

// SPEC-0001/W-2. Ordering is the edit's job, and a move is where that was nearly untrue: it empties
// a path, so an entry linking something at where it came from reads naturally after it, and read in
// the caller's order the link went first. `clear` took the project's own work out of the link's way
// and the move then carried the link off to the destination -- with both entries reporting done.
// The rule W-2 is really making is that no order a caller writes can cost anybody their work, so
// both shapes are put in the wrong order on purpose here and both have to come out whole.
exports.repoEditOrdersAMoveBeforeALinkThatWouldEatIt = function repoEditOrdersAMoveBeforeALinkThatWouldEatIt(t) {
    if (repoEdit.kindOf({ file: "a", move: "b" }) !== "move") { t.skip("repo edit order: this scripts/repo-edit.js does not move"); return; }

    // A folder: what an adopted skill is. This shape survived even before the edit ordered the
    // entries, because rmdir will not clear a folder with anything in it, so it pins the promise
    // rather than the bug.
    withRoot({ ".claude/skills/mine/SKILL.md": "mine\n" }, root => {
        const edit = repoEdit.worktreeEdit(root);
        const [link, move] = edit.apply([
            { file: ".claude/skills/mine", link: "../../.agents/skills/mine" },
            { file: ".agents/skills/mine", move: ".claude/skills/mine" },
        ]);
        t.ok(move.done && edit.view().read(".agents/skills/mine/SKILL.md") === "mine\n",
            "repo edit order: a move written after the link that needs it still happens first", JSON.stringify(move));
        if (!link.done && /symlink/.test(link.why || "")) t.skip("repo edit order: this platform refuses to create a symlink");
        else t.ok(link.done, "repo edit order: and the link then lands on the path the move emptied", JSON.stringify(link));
    });

    // A file: the shape that was being destroyed. unlink clears a regular file without complaint, so
    // nothing refused and nothing reported -- the content was simply gone, and the destination was a
    // dangling link that exists() then called absent.
    withRoot({ "notes.md": "the project's own work\n" }, root => {
        const edit = repoEdit.worktreeEdit(root);
        const [link, move] = edit.apply([
            { file: "notes.md", link: ".agents/somewhere" },
            { file: "kept/notes.md", move: "notes.md" },
        ]);
        t.ok(move.done && edit.view().read("kept/notes.md") === "the project's own work\n",
            "repo edit order: a file a link was about to eat arrives at the move's destination instead",
            JSON.stringify([move, edit.view().exists("kept/notes.md")]));
        t.ok(!link.done || (edit.view().lstat("notes.md") || {}).link === ".agents/somewhere",
            "repo edit order: and the link is a link, not the file that was standing there",
            JSON.stringify(link));
    });
};

// SPEC-0001/W-2, the other end of the same rule. Ordering moves to the front is what makes the
// shape above safe, and it is also what makes this one dangerous: a move now runs before an entry
// written above it, so the path it lands on is a path that entry was about to land on. A link there
// clears its way first, which is the moved work gone -- the identical loss as the check above, one
// end of the move further along, and reported done by both entries just the same. A move owns both
// ends of its path and the rest of the plan is refused at the destination, so the entries are
// written here in the order that used to destroy and the content has to still be readable.
exports.repoEditRefusesAnEntryThatLandsOnWhatAMoveMoved = function repoEditRefusesAnEntryThatLandsOnWhatAMoveMoved(t) {
    if (repoEdit.kindOf({ file: "a", move: "b" }) !== "move") { t.skip("repo edit landed: this scripts/repo-edit.js does not move"); return; }
    const entries = [
        { file: "kept", link: "somewhere" },
        { file: "kept", move: "notes.md" },
    ];

    // A file, because unlink clears one without complaint: nothing refuses, nothing is reported,
    // and the destination is left a link to a path that was never there.
    withRoot({ "notes.md": "the project's own work\n" }, root => {
        const edit = repoEdit.worktreeEdit(root);
        const [move, link] = edit.apply(entries);
        t.ok(move.done && edit.view().read("kept") === "the project's own work\n",
            "repo edit landed: the move happens and its destination holds the work",
            JSON.stringify([move, edit.view().read("kept")]));
        t.ok(!link.done && /is where notes\.md was moved/.test(link.why || ""),
            "repo edit landed: and the entry that would have landed on it is refused, saying whose path it is",
            JSON.stringify(link));
    });

    // The map adapter reproduced this identically, which is what made it a decision of the shared
    // body rather than of either adapter, so it is asked in the same words.
    const edit = repoEdit.mapEdit({ "notes.md": "the project's own work\n" });
    const [move, link] = edit.apply(entries);
    t.ok(move.done && edit.view().read("kept") === "the project's own work\n",
        "repo edit landed: the map adapter keeps the work too", JSON.stringify([move, edit.view().modes()]));
    t.ok(!link.done && link.why === "kept is where notes.md was moved, so nothing else in the plan writes there",
        "repo edit landed: and refuses in the same words the disk does", JSON.stringify(link));

    // A mark is the exception: it changes the mode of what is at the path rather than putting
    // something else there, so moving a hook into place and then marking it has to keep working.
    const marking = repoEdit.mapEdit({ "src/pre-commit": "#!/bin/sh\n" });
    const [moved, mark] = marking.apply([
        { file: ".githooks/pre-commit", move: "src/pre-commit" },
        { file: ".githooks/pre-commit", exec: true },
    ]);
    t.ok(moved.done && mark.done, "repo edit landed: a mark on a moved path is not refused", JSON.stringify([moved, mark]));
    t.ok(marking.marked().includes(".githooks/pre-commit"), "repo edit landed: it marks what the move put there", JSON.stringify(marking.marked()));
};

// A refusal is a value, says the module header, and for three shapes it was not: the write and the
// mkdir reached `fs` unguarded, so a project with a folder where the harness writes a file -- or a
// file where it makes a folder -- got a throw out of `apply` rather than a line in the report, with
// every entry after it never attempted. The map adapter meanwhile answered done to all three, so
// the suite could not have seen it. Asked of both, because agreeing on a refusal is the point.
exports.repoEditAnswersRatherThanThrowing = function repoEditAnswersRatherThanThrowing(t) {
    const shapes = [
        ["a folder where a file goes", { "out/kept.md": "x\n" }, { file: "out", write: "x\n" }],
        ["a file where a folder goes", { out: "x\n" }, { file: "out", mkdir: true }],
        ["a file where a parent goes", { out: "x\n" }, { file: "out/under/a.md", write: "x\n" }],
    ];
    for (const [what, held, entry] of shapes) {
        let onMap;
        try { [onMap] = repoEdit.mapEdit(held).apply([entry]); }
        catch (err) { t.ok(false, `repo edit refusal: the map adapter answers for ${what}`, err.message); onMap = null; }
        if (onMap) t.ok(!onMap.done && onMap.why, `repo edit refusal: the map adapter refuses ${what}`, JSON.stringify(onMap));

        withRoot(held, root => {
            let onDisk;
            try { [onDisk] = repoEdit.worktreeEdit(root).apply([entry]); }
            catch (err) { t.ok(false, `repo edit refusal: the worktree adapter answers for ${what}`, err.code || err.message); return; }
            t.ok(!onDisk.done && onDisk.why, `repo edit refusal: the worktree adapter refuses ${what}`, JSON.stringify(onDisk));
        });
    }
};

// Both adapters answer for every kind the module names. `apply` reaches into the adapter by the kind
// `work()` returned, so a sixth kind added to one of them and forgotten in the other is not a wrong
// answer but a TypeError, thrown halfway through somebody else's repository at the entry that hits
// it -- which is the failure plan-entry.js was written to stop happening at the other end of the
// same plan. Adding `move` was the first time the vocabulary grew since the seam was built.
exports.repoEditAdaptersAnswerForEveryKind = function repoEditAdaptersAnswerForEveryKind(t) {
    // One path per kind. Sharing one tests nothing extra and does mislead: the link case leaves a
    // dangling symlink, and mkdir over that fails ENOENT because it follows the link to a target that
    // is not there -- an artefact of how the case is set up rather than anything the adapter got wrong.
    const kinds = [
        ["write", { file: "w", write: "x\n" }],
        ["link", { file: "l", link: "b" }],
        ["mkdir", { file: "d", mkdir: true }],
        ["mark", { file: ".keep", exec: true }],
        ["move", { file: "m", move: ".keep" }],
    ].filter(([kind, entry]) => repoEdit.kindOf(entry) === kind);
    t.ok(kinds.length >= 4, "repo edit kinds: the module names the kinds this check knows about", JSON.stringify(kinds.map(k => k[0])));

    // Asked of a map holding nothing, so every kind either does its work or refuses: either is an
    // answer. A kind an adapter does not implement cannot give one.
    for (const [kind, entry] of kinds) {
        let answered = false;
        try { answered = repoEdit.mapEdit({}).apply([entry]).length === 1; }
        catch (err) { answered = false; t.ok(false, `repo edit kinds: the map adapter answers for ${kind}`, err.message); continue; }
        t.ok(answered, `repo edit kinds: the map adapter answers for ${kind}`, JSON.stringify(entry));
    }
    // A file rather than nothing, so the root itself exists: withRoot makes the folder for what it
    // is given, and every kind here is about a path inside it.
    withRoot({ ".keep": "\n" }, root => {
        for (const [kind, entry] of kinds) {
            try { repoEdit.worktreeEdit(root).apply([entry]); }
            catch (err) { t.ok(false, `repo edit kinds: the worktree adapter answers for ${kind}`, err.message); continue; }
            t.ok(true, `repo edit kinds: the worktree adapter answers for ${kind}`, JSON.stringify(entry));
        }
    });
};
