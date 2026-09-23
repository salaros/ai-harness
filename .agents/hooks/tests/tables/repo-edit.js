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
