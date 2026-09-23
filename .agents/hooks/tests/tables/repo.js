// .agents/hooks/tests/tables/repo.js
// scripts/repo-view.js's decisions: the four questions a check asks a repo, and the adapters that
// answer them -- a map held in memory, the working tree, Git's index, and the staged view a commit
// is judged against.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const lib = require("../../lib");
const docsCheck = require("../../../../scripts/docs-check");
const stagedDocs = require("../../../../scripts/check-staged-docs");
const repoView = require("../../../../scripts/repo-view");
const { withRoot, text } = require("../fixtures");

// A repo view answers the same four questions whichever adapter sits behind it. The map is what
// the docs-check self-checks run on, so its answers about folders are pinned here.
exports.repoViewDecisions = function repoViewDecisions(t) {
    const map = repoView.fromMap({ "docs/brd/0001-a.md": "A\n", "docs/brd/0002-b.md": "B\n", "docs/prd/0001-c.md": "C\n", "AGENTS.md": "x" });
    const rows = [
        [map.exists("docs"), true, "a folder is whatever a path implies"],
        [map.exists("docs/brd/"), true, "a folder written with its slash"],
        [map.isFile("docs/brd"), false, "a folder is not a file"],
        [map.exists("doc"), false, "a prefix of a name is not a folder"],
        [map.read("docs/brd/0001-a.md"), "A\n", "read gives the text as held"],
        [map.read("./AGENTS.md"), "x", "a path is normalised before it is looked up"],
        [map.read("docs/brd"), null, "read of a folder is null"],
        [map.read("MEMORY.md"), null, "read of an absent file is null"],
        [map.list("docs").join(), "brd,prd", "list gives the names directly inside, sorted"],
        [map.list("docs/adr").join(), "", "list of an absent folder is empty"],
    ];
    for (const [got, want, why] of rows) t.ok(got === want, `repo view: ${why}`, JSON.stringify(got));
    withRoot({ "a.md": "on disk\n", "sub/b.md": "b\n" }, dir => {
        const disk = repoView.worktree(dir);
        t.ok(disk.read("a.md") === "on disk\n" && disk.list(".").join() === "a.md,sub" && disk.isFile("sub") === false,
            "repo view: the working tree answers from the disk", disk.list(".").join());
        let threw = false;
        const missing = path.join(dir, "no-such-dir");
        try { repoView.index(missing); } catch { threw = true; }
        t.ok(threw && repoView.indexModes(missing) === null, "repo view: an index nobody can read throws rather than reading empty");
    });
};

// The pre-commit hook checks what the commit records. A real repo whose index and working tree
// disagree, each way round, with a source the documents cite only on disk.
exports.stagedChainDecisions = function stagedChainDecisions(t) {
    const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    const agents = fs.readFileSync(path.join(lib.checkout, "AGENTS.md"), "utf8");
    const brd = text("# BRD-0001: Billing", "", "**Derived from:** .scratch/interview.md", "", "- BR-1: Bill monthly.");
    const skillFiles = Object.fromEntries(docsCheck.readChain(repoView.worktree(lib.checkout))
        .stages.flatMap(s => s.skills).map(s => [`.agents/skills/${s}/SKILL.md`, ""]));
    withRoot({ "AGENTS.md": agents, ...skillFiles, ".scratch/interview.md": "notes\n", "docs/brd/0001-billing.md": brd }, dir => {
        if (git(dir, "init", "-q").status !== 0) { t.skip("staged chain: git is not available"); return; }
        git(dir, "add", "AGENTS.md", "docs");
        const docFile = path.join(dir, "docs", "brd", "0001-billing.md");
        const check = () => stagedDocs.check(dir, ["docs/brd/0001-billing.md"]);

        const clean = check();
        t.ok(!clean.problems.length && !clean.warnings.length, "staged chain: a staged document citing a source on disk passes",
            clean.problems.concat(clean.warnings).join("\n"));

        // Broken on disk only: the commit records the good blob.
        fs.writeFileSync(docFile, brd.replace("**Derived from:** .scratch/interview.md", ""));
        t.ok(!check().problems.length, "staged chain: a break saved but not staged does not block", check().problems.join("\n"));
        t.ok(docsCheck.check(dir).problems.length > 0, "staged chain: the same break does fail the working-tree check");

        // Broken in the index, fixed on disk: the commit would record the break.
        git(dir, "add", "docs");
        fs.writeFileSync(docFile, brd);
        const staged = check().problems;
        t.ok(staged.some(p => p.startsWith("docs/brd/0001-billing.md: missing a")),
            "staged chain: a break staged and fixed on disk blocks, naming the repo-relative path", staged.join("\n") || "(none)");

        // A document in the index and gone from the disk is still what the commit records.
        git(dir, "add", "docs");
        fs.writeFileSync(path.join(dir, "docs", "brd", "0002-late.md"), text("# BRD-0002: Late"));
        const view = repoView.staged(dir, docsCheck.CHAIN_PATHS);
        fs.rmSync(docFile);
        t.ok(view.isFile("docs/brd/0001-billing.md") && !view.exists("docs/brd/0002-late.md") && view.isFile(".scratch/interview.md"),
            "staged view: the chain from the index, an untracked document unseen, a source from the disk",
            view.list("docs/brd").join());
        t.ok(view.read("MEMORY.md") === null, "staged view: a chain file neither staged nor on disk reads null");

        const modes = repoView.indexModes(dir, ["AGENTS.md"]);
        t.ok(modes && modes.length === 1 && modes[0].file === "AGENTS.md" && !modes[0].link && !modes[0].exec && /^[0-9a-f]{40,64}$/.test(modes[0].object),
            "indexModes: a plain file, with its blob", JSON.stringify(modes));
    });
    withRoot({ "docs/brd/0001-x.md": "x\n" }, dir => {
        const r = stagedDocs.check(path.join(dir, "not-a-repo"), ["docs/brd/0001-x.md"]);
        t.ok(!r.problems.length && r.warnings.some(w => w.includes("could not read the staged documentation chain")),
            "staged chain: an unreadable index warns and lets the commit through", r.warnings.join("\n") || "(no warning)");
    });
};

// SPEC-0001/R-1. A file's bytes are a question of their own, never a flag on read(): a stand-in
// that holds text can answer read() honestly and has to be handed real bytes to answer this one.
// The installer's own stand-in returned a string where production returns a Buffer, which is why
// every branch it takes for binary content has never run in this suite.
exports.repoViewReadsBytes = function repoViewReadsBytes(t) {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0x1a]);   // a zero byte, so it is not text
    const map = repoView.fromMap({ "a.txt": "hi\n", "logo.png": png });
    const rows = [
        [Buffer.isBuffer(map.bytes("a.txt")) && map.bytes("a.txt").equals(Buffer.from("hi\n")), "text a map holds comes back as its bytes"],
        [map.bytes("logo.png").equals(png), "bytes a map holds come back byte for byte"],
        [map.bytes("nothing.txt") === null, "bytes of an absent file is null"],
        [map.bytes("docs") === null, "bytes of a folder is null"],
        [typeof map.read("logo.png") === "string", "read never gives bytes, whatever the entry holds"],
    ];
    for (const [got, why] of rows) t.ok(got, `repo view: ${why}`);

    withRoot({ "a.txt": "hi\n", "logo.png": png }, dir => {
        const disk = repoView.worktree(dir);
        t.ok(disk.bytes("logo.png").equals(png), "repo view: the working tree gives a file's actual bytes", JSON.stringify(disk.bytes("logo.png")));
        t.ok(disk.bytes("no-such-file") === null, "repo view: bytes of a file that is not there is null");
        if (spawnSync("git", ["init", "-q"], { cwd: dir }).status !== 0) { t.skip("repo view: git is not available for the index adapter"); return; }
        spawnSync("git", ["add", "-A"], { cwd: dir });
        const staged = repoView.index(dir);
        t.ok(staged.bytes("logo.png").equals(png), "repo view: the index gives a blob's bytes, not its decoding", JSON.stringify(staged.bytes("logo.png")));
    });
};

// SPEC-0001/R-1. What a link in the way is, which is the question the installer asks before it
// writes a skill link: nothing there, the project's own file, or a link already pointing somewhere.
// A link's target is POSIX whatever the platform spells it as, since the answer is compared against
// the target the harness would write.
exports.repoViewLstatsLinks = function repoViewLstatsLinks(t) {
    const map = repoView.fromMap({ "a.txt": "hi\n", ".claude/skills": { link: "../.agents/skills" } });
    const rows = [
        [JSON.stringify(map.lstat("a.txt")), `{"link":null}`, "a plain file is there and is not a link"],
        [JSON.stringify(map.lstat(".claude/skills")), `{"link":"../.agents/skills"}`, "a link says where it points"],
        [map.lstat("nothing"), null, "nothing there is null, not a file that is not a link"],
        [map.read(".claude/skills"), "../.agents/skills", "a link reads as the path it holds, as its blob does"],
    ];
    for (const [got, want, why] of rows) t.ok(got === want, `repo view: ${why}`, JSON.stringify(got));

    withRoot({ "a.txt": "hi\n", "sub/b.txt": "b\n" }, dir => {
        const disk = repoView.worktree(dir);
        t.ok(JSON.stringify(disk.lstat("a.txt")) === `{"link":null}`, "repo view: the working tree reports a plain file as no link");
        t.ok(JSON.stringify(disk.lstat("sub")) === `{"link":null}`, "repo view: a folder is there and is not a link");
        t.ok(disk.lstat("gone") === null, "repo view: the working tree reports nothing there as null");
        try { fs.symlinkSync(path.join("sub", "b.txt"), path.join(dir, "link"), "file"); }
        catch { t.skip("repo view: this platform refuses to create a symlink"); return; }
        t.ok(disk.lstat("link").link === "sub/b.txt", "repo view: a link on disk gives its target with forward slashes", JSON.stringify(disk.lstat("link")));
        t.ok(disk.exists("link"), "repo view: a link that resolves still exists");
    });
};

// SPEC-0001/R-1. Every path the view holds, with the mode Git records for it, which is the listing
// the installer walks to decide what to write and the invariants walk to decide what is executable.
// A map answers it from its entries, so a case about a symlink or an executable needs neither a
// checkout nor a platform that has an executable bit.
exports.repoViewListsModes = function repoViewListsModes(t) {
    const map = repoView.fromMap({
        "b.txt": "plain\n",
        ".githooks/pre-commit": { text: "#!/bin/sh\n", exec: true },
        ".claude/agents": { link: "../.agents/agents" },
    });
    const rows = map.modes();
    const by = f => rows.find(r => r.file === f);
    const cases = [
        [rows.map(r => r.file).join(), ".claude/agents,.githooks/pre-commit,b.txt", "every path the view holds, sorted"],
        [by("b.txt").mode, "100644", "a plain file is 100644"],
        [by(".githooks/pre-commit").mode, "100755", "an executable is 100755"],
        [by(".githooks/pre-commit").exec, true, "and says so without the caller reading the mode"],
        [by(".claude/agents").mode, "120000", "a symlink is 120000"],
        [by(".claude/agents").link, true, "and says so"],
        [by("b.txt").exec || by("b.txt").link, false, "a plain file is neither"],
        [map.read(".githooks/pre-commit"), "#!/bin/sh\n", "an entry carrying a mode still reads as its text"],
    ];
    for (const [got, want, why] of cases) t.ok(got === want, `repo view: ${why}`, JSON.stringify(got));

    withRoot({ "a.txt": "x\n", "sub/b.txt": "y\n" }, dir => {
        // The working tree walks itself. It records no blob, since nothing has been recorded yet,
        // and on Windows it reports no executable, because the filesystem there has no such bit --
        // which is why the invariants ask the index about hook modes and not the disk.
        const disk = repoView.worktree(dir).modes();
        t.ok(disk.map(r => r.file).join() === "a.txt,sub/b.txt", "repo view: the working tree walks itself, recursively and sorted", JSON.stringify(disk));
        t.ok(disk.every(r => r.object === null), "repo view: a file nobody has recorded carries no blob");

        if (spawnSync("git", ["init", "-q"], { cwd: dir }).status !== 0) { t.skip("repo view: git is not available for the index adapter"); return; }
        spawnSync("git", ["add", "-A"], { cwd: dir });
        const staged = repoView.index(dir).modes();
        t.ok(staged.map(r => r.file).join() === "a.txt,sub/b.txt", "repo view: the index lists every tracked path, recursively", JSON.stringify(staged));
        t.ok(staged.every(r => /^[0-9a-f]{40,64}$/.test(r.object)), "repo view: each row carries the blob Git recorded", JSON.stringify(staged));
        t.ok(repoView.index(dir, ["sub"]).modes().map(r => r.file).join() === "sub/b.txt",
            "repo view: an index scoped to a path lists only what is under it");
    });
};

// SPEC-0001/S-3. What a commit would record under a path, which is not what the disk shows: on
// Windows the filesystem has no executable bit, so a hook's mode is only ever a fact about the
// index. Two invariants in check-harness turn on it, and until the view answered it they had to be
// handed a root and reach for git themselves -- which is why neither had ever run against anything
// but this repo. A view that is already a record -- a map, an index, a commit -- answers with its
// own rows, so the same invariant reads a map on a machine with no git at all.
exports.repoViewAnswersForWhatGitRecorded = function repoViewAnswersForWhatGitRecorded(t) {
    const map = repoView.fromMap({
        ".githooks/pre-commit": { text: "#!/bin/sh\n", exec: true },
        ".githooks/pre-push": "#!/bin/sh\n",
        "README.md": "x\n",
    });
    const recorded = map.recorded([".githooks"]);
    t.ok(recorded.map(r => r.file).join() === ".githooks/pre-commit,.githooks/pre-push",
        "repo view: a map records what it holds under the path, and nothing beside it", JSON.stringify(recorded));
    t.ok(recorded.find(r => r.file === ".githooks/pre-commit").exec,
        "repo view: a map's record carries the mode its entry was written with");
    t.ok(map.recorded().length === 3, "repo view: no path means everything the view records");

    withRoot({ ".githooks/pre-commit": "#!/bin/sh\n", "README.md": "x\n" }, dir => {
        const disk = repoView.worktree(dir);
        t.ok(disk.recorded([".githooks"]) === null, "repo view: outside a checkout nothing records anything, which is not the same as recording nothing");
        if (spawnSync("git", ["init", "-q"], { cwd: dir }).status !== 0) { t.skip("repo view: git is not available for the recorded() check"); return; }
        t.ok(disk.recorded([".githooks"]).length === 0, "repo view: a checkout that has staged nothing records nothing under the path");
        spawnSync("git", ["add", ".githooks"], { cwd: dir });
        const rows = disk.recorded([".githooks"]);
        t.ok(rows.map(r => r.file).join() === ".githooks/pre-commit",
            "repo view: the disk asks the index, so a file it has not staged is not recorded", JSON.stringify(rows));
    });
};

// SPEC-0001/R-2. One commit, answering the same questions as the disk does. This is how the
// upstream is read during an install: not the checkout it happens to have on disk, which may hold a
// half-finished edit, but the commit the receipt names. What the working tree does afterwards --
// gaining a file, losing one -- is none of the view's business.
exports.repoViewReadsACommit = function repoViewReadsACommit(t) {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]);
    withRoot({ "a.txt": "first\n", "docs/b.md": "b\n", "logo.png": png }, dir => {
        const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
        if (git("init", "-q").status !== 0) { t.skip("repo view: git is not available for the commit adapter"); return; }
        git("config", "user.email", "t@example.com");
        git("config", "user.name", "T");
        git("add", "-A");
        if (git("commit", "-qm", "first").status !== 0) { t.skip("repo view: this git cannot commit here"); return; }

        // The disk moves on; the commit does not.
        fs.writeFileSync(path.join(dir, "a.txt"), "second\n");
        fs.writeFileSync(path.join(dir, "late.txt"), "not committed\n");
        fs.rmSync(path.join(dir, "docs", "b.md"));

        const at = repoView.commit(dir, "HEAD");
        const rows = [
            [at.read("a.txt"), "first\n", "a file edited since reads as the commit recorded it"],
            [at.exists("late.txt"), false, "a file written since the commit is not in it"],
            [at.isFile("docs/b.md"), true, "a file deleted since the commit is still in it"],
            [at.list("docs").join(), "b.md", "a folder lists what the commit holds"],
            [at.bytes("logo.png").equals(png), true, "a blob's bytes come back byte for byte"],
            [JSON.stringify(at.lstat("a.txt")), `{"link":null}`, "a recorded file is not a link"],
            [at.modes().map(r => r.file).join(), "a.txt,docs/b.md,logo.png", "modes lists the tree, recursively and sorted"],
            [at.modes().every(r => /^[0-9a-f]{40,64}$/.test(r.object)), true, "each row carries the blob the commit recorded"],
        ];
        for (const [got, want, why] of rows) t.ok(got === want, `repo view: ${why}`, JSON.stringify(got));

        let threw = false;
        try { repoView.commit(dir, "0000000000000000000000000000000000000000"); } catch { threw = true; }
        t.ok(threw, "repo view: a commit nobody can read throws rather than reading empty");
    });
};
