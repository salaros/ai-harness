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
function repoViewDecisions(t) {
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
}

// The pre-commit hook checks what the commit records. A real repo whose index and working tree
// disagree, each way round, with a source the documents cite only on disk.
function stagedChainDecisions(t) {
    const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    const agents = fs.readFileSync(path.join(lib.checkout, "AGENTS.md"), "utf8");
    const brd = text("# BRD-0001: Billing", "", "**Derived from:** .scratch/interview.md", "", "- BR-1: Bill monthly.");
    const skillFiles = Object.fromEntries(docsCheck.readChain(lib.checkout)
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
}

// SPEC-0001/R-1. A file's bytes are a question of their own, never a flag on read(): a stand-in
// that holds text can answer read() honestly and has to be handed real bytes to answer this one.
// The installer's own stand-in returned a string where production returns a Buffer, which is why
// every branch it takes for binary content has never run in this suite.
function repoViewReadsBytes(t) {
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
}

// SPEC-0001/R-1. What a link in the way is, which is the question the installer asks before it
// writes a skill link: nothing there, the project's own file, or a link already pointing somewhere.
// A link's target is POSIX whatever the platform spells it as, since the answer is compared against
// the target the harness would write.
function repoViewLstatsLinks(t) {
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
}

module.exports = [
    repoViewDecisions,
    repoViewReadsBytes,
    repoViewLstatsLinks,
    stagedChainDecisions,
];
