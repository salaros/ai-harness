// .agents/hooks/tests/tables/harness.js
// How an entry point finds a repo and what it then asserts about the harness in it: the root
// resolver every script and hook shares, the hook launcher the settings file is held to, the skill
// roster, and the frontmatter check that decides whether an agent can see a skill at all.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const lib = require("../../lib");
const scriptsLib = require("../../../../scripts/lib");
const checkHarness = require("../../../../scripts/check-harness");
const skills = require("../../../../scripts/skills");
const repoView = require("../../../../scripts/repo-view");
const { withRoot, text } = require("../fixtures");

// A minimal valid SKILL.md, which both roster rows below build their skills from: the frontmatter
// the check demands and nothing else, plus whatever one line a row wants to add to it.
const skill = (name, extra = "") => text("---", `name: ${name}`, "description: Does one thing.", ...(extra ? [extra] : []), "---", "Body");

// Which repo an entry point is about. Six places used to answer that differently -- a script read
// --root and ignored the variables, a hook read the variables and ignored --root -- so a check run
// one way saw a different repo from the same check run the other. One resolver answers now, and
// this is its precedence: the flag, then the first project-dir variable that is set, then the
// checkout the file lives in. root() reads argv and the environment, so each row is a real child
// process; the probe sits in a throwaway directory and requires the checkout's copy of the library.
exports.rootDecisions = function rootDecisions(t) {
    const LIB = path.join(lib.checkout, "scripts", "lib");
    const probe = `const lib = require(${JSON.stringify(LIB)});\n`
        + "process.stdout.write(JSON.stringify({ root: lib.root(), args: lib.args() }));\n";
    const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
    const CHECKOUT = real(scriptsLib.CHECKOUT);
    const flag = dir => `${scriptsLib.ROOT_FLAG}${dir}`;
    withRoot({ "probe.js": probe, "not-a-dir.txt": "x\n" }, dir => {
        const elsewhere = real(os.tmpdir());
        const run = (args, vars) => {
            const env = { ...process.env };
            for (const v of scriptsLib.ROOT_ENV_VARS) delete env[v];
            const r = spawnSync(process.execPath, [path.join(dir, "probe.js"), ...args],
                { encoding: "utf8", env: { ...env, ...vars } });
            return { ...JSON.parse(r.stdout), warning: (r.stderr || "").trim() };
        };
        const rows = [
            // args, environment, the root it must return, the warning it must carry, why
            [[], {}, CHECKOUT, null, "nothing said: the checkout the file lives in"],
            [[flag(dir)], {}, dir, null, "the flag is the explicit answer"],
            [[flag(dir)], { CLAUDE_PROJECT_DIR: elsewhere }, dir, null, "the flag beats the harness's variable"],
            [[], { CLAUDE_PROJECT_DIR: dir }, dir, "is not the checkout this file lives in",
                "a hook follows the harness's variable, and says it is another checkout"],
            [[], { CURSOR_PROJECT_DIR: dir }, dir, "is not the checkout this file lives in", "every harness's variable, not just Claude's"],
            [[], { GEMINI_PROJECT_DIR: dir }, dir, "is not the checkout this file lives in", "Gemini's too"],
            [[], { CURSOR_PROJECT_DIR: elsewhere, CLAUDE_PROJECT_DIR: dir }, dir, "CLAUDE_PROJECT_DIR", "the first variable in the list wins"],
            [[], { CLAUDE_PROJECT_DIR: path.join(dir, "not-a-dir.txt") }, CHECKOUT, "is not a directory",
                "a variable naming no directory is ignored, and said so"],
            [[], { CLAUDE_PROJECT_DIR: path.join(dir, "gone") }, CHECKOUT, "is not a directory", "so is one naming nothing at all"],
        ];
        for (const [args, vars, want, warns, why] of rows) {
            const r = run(args, vars);
            t.ok(r.root === want && (warns === null ? !r.warning : r.warning.includes(warns)),
                `root: ${why}`, `${r.root}\n${r.warning || "(no warning)"}`);
        }
        const r = run([flag(dir), "--dry-run", "install"], {});
        t.ok(r.args.join(" ") === "--dry-run install", "root: args() hands on the command line without the flag", r.args.join(" "));
    });
};

// .claude/settings.json wires the three hooks, and nothing read it back after an update merged it.
// Each row is a settings file and the failure claudeHookLaunchersAreWired must report about it, run
// through check() against a root holding nothing else, so every other invariant stands down.
exports.hookLauncherDecisions = function hookLauncherDecisions(t) {
    const entry = (script, matcher) => ({
        ...(matcher ? { matcher } : {}),
        hooks: [{ type: "command", command: checkHarness.launcher(script), timeout: 20 }],
    });
    // Two scripts share the pre-tool-use event, one behind each matcher, so the entries accumulate
    // per event rather than the later row replacing the earlier one.
    const wired = () => {
        const hooks = {};
        for (const h of checkHarness.CLAUDE_HOOKS) (hooks[h.event] = hooks[h.event] || []).push(entry(h.script, h.matcher));
        return { hooks };
    };
    const mine = { type: "command", command: "npm run lint" };
    const rows = [
        // the settings file, the failure it must produce (null: none), why
        [wired(), null, "the launcher table's own wiring passes"],
        [{ hooks: { ...wired().hooks, PreToolUse: [{ matcher: "Bash", hooks: [mine] }, ...wired().hooks.PreToolUse] } },
            null, "a hook the project added beside ours is not ours to judge"],
        [{ ...wired(), permissions: { allow: ["Bash(git status)"] } }, null, "a setting that is not a hook is left alone"],
        [{ hooks: { ...wired().hooks, SessionStart: undefined } }, "launches session-start.js on SessionStart, once",
            "an event whose entry a merge dropped"],
        [{ hooks: { ...wired().hooks, PostToolUse: [...wired().hooks.PostToolUse, ...wired().hooks.PostToolUse] } },
            "launches check-edit.js on PostToolUse, once", "the same script wired twice"],
        [{ hooks: { ...wired().hooks, PreToolUse: [entry("guard-command.js", "Bash|Edit")] } },
            "matches Bash", "a matcher that widened"],
        [{ hooks: { ...wired().hooks, SessionStart: [entry("session-start.js", "Bash")] } },
            "matches every tool", "a matcher on the entry that must have none"],
        [{ hooks: { ...wired().hooks, PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/.agents/hooks/guard-command.js"' }] }] }},
            "is the launcher every shell runs", "a command built on a variable only Claude Code sets"],
    ];
    for (const [settings, wants, why] of rows) {
        withRoot({ ".claude/settings.json": JSON.stringify(settings, null, 2) }, dir => {
            const said = checkHarness.check(repoView.worktree(dir)).failed.map(f => `${f.title}\n${f.detail}`).join("\n");
            t.ok(wants === null ? !said : said.includes(wants), `hook launcher: ${why}`, said || "(nothing reported)");
        });
    }
    withRoot({ ".claude/settings.json": "{ not json" }, dir => {
        const said = checkHarness.check(repoView.worktree(dir)).failed.map(f => f.title).join("\n");
        t.ok(said.includes("readable JSON"), "hook launcher: a settings file that is not JSON fails rather than passing quietly", said);
    });
};

// The skill roster of a repo built for it: what the lock records against what the disk holds, who
// routes each skill and through which file, and whether the licence notice is current. The
// upstream's own roster only ever shows the healthy case, so every odd shape lives here.
exports.skillRosterDecisions = function skillRosterDecisions(t) {
    const lock = names => JSON.stringify({ version: 1, skills: Object.fromEntries(Object.entries(names).map(([n, source]) => [n, { source }])) });
    const ACME = "acme/skills\tMIT\tCopyright (c) Acme\thttps://example.com/LICENSE\t-\n";
    const files = {
        ".agents/skills/local-one/SKILL.md": skill("local-one", "disable-model-invocation: true"),
        ".agents/skills/vendored-one/SKILL.md": skill("vendored-one"),
        ".agents/skills/vendored-two/SKILL.md": skill("vendored-two"),
        ".agents/skills/no-skill-md/notes.md": "not a skill\n",
        ".agents/skills/stray.txt": "a file, not a folder\n",
        "skills-lock.json": lock({ "vendored-one": "acme/skills", "vendored-two": "other/skills", "gone-one": "acme/skills" }),
        "scripts/skill-licences.tsv": text("# comment", ACME.trim()),
        ".agents/routing.md": text("# Routing", "", "Preamble naming `local-one`.", "", "## Shared rows", "", "Read by `alpha`.", "", "| `vendored-one` | ... |"),
        ".agents/agents/alpha.md": text("---", "name: alpha", "---", "Route through `local-one`, then routing.md, \"Shared rows\"."),
        ".agents/agents/beta.md": text("---", "name: beta", "---", "Mentions \"Shared rows\" but never the routing file."),
        ".agents/agents/not-an-agent.md": text("Names `vendored-two` with no frontmatter."),
        "AGENTS.md": text("Every session may run `vendored-two`."),
    };
    withRoot(files, root => {
        const r = skills.readRoster(repoView.worktree(root));
        const entry = name => r.entries.find(e => e.name === name) || {};
        const s = name => r.skills.find(x => x.name === name) || {};
        t.ok(r.entries.map(e => e.name).join() === "local-one,no-skill-md,stray.txt,vendored-one,vendored-two",
            "skill roster: every entry under .agents/skills is listed, sorted", r.entries.map(e => e.name).join());
        t.ok(entry("no-skill-md").dir && !entry("no-skill-md").hasSkillMd && entry("no-skill-md").frontmatter === null,
            "skill roster: a folder with no SKILL.md is an entry marked as such, and not a skill");
        t.ok(!entry("stray.txt").dir && !entry("stray.txt").hasSkillMd, "skill roster: a stray file is an entry marked not a folder");
        t.ok(r.skills.map(x => x.name).join() === "local-one,vendored-one,vendored-two", "skill roster: skills are the entries holding a SKILL.md",
            r.skills.map(x => x.name).join());
        t.ok(r.missing.join() === "gone-one", "skill roster: a skill the lock records and the disk lacks is missing", r.missing.join());
        t.ok(s("local-one").source === "local" && !s("local-one").vendored && s("vendored-one").source === "acme/skills" && s("vendored-one").vendored,
            "skill roster: the source is the lock's, or local when the lock does not record the skill");
        t.ok(s("local-one").invoke === "`/local-one`" && s("vendored-one").invoke === "by description",
            "skill roster: disable-model-invocation makes a skill invoked by name");
        t.ok(s("local-one").agents.join() === "alpha", "skill roster: an agent routes a skill its own body names", s("local-one").agents.join());
        t.ok(s("vendored-one").agents.join() === "alpha",
            "skill roster: a routing.md section credits its skills to the agents naming the file and the section, and no other",
            s("vendored-one").agents.join());
        t.ok(!r.routing.agents["not-an-agent"], "skill roster: a file with no frontmatter name is not an agent");
        t.ok(s("vendored-two").everywhere && !s("vendored-two").agents.length && !s("vendored-one").everywhere,
            "skill roster: a skill AGENTS.md names is reached everywhere, apart from any agent");
        const [section] = r.routing.sections;
        t.ok(r.routing.sections.length === 1 && section.title === "Shared rows" && section.readBy.join() === "alpha" && !section.skills.has("local-one"),
            "skill roster: routing.md's sections exclude its preamble and carry their Read by line", JSON.stringify(r.routing.sections.map(x => x.title)));

        t.ok(r.notices.orphans.join() === "vendored-two (other/skills)" && !r.notices.current,
            "skill roster: a vendored skill no licence row covers is an orphan", r.notices.orphans.join());
        t.ok(!skills.writeNotices(root).written && !fs.existsSync(path.join(root, skills.NOTICES)),
            "skill roster: the notice is not written while there is an orphan");
        fs.appendFileSync(path.join(root, skills.LICENCES), "other/skills\tApache-2.0\t-\thttps://example.com/APACHE\tKeep the NOTICE file.\n");
        t.ok(skills.writeNotices(root).written && skills.readRoster(repoView.worktree(root)).notices.current,
            "skill roster: once every upstream has a row the notice is written, and then current");
        const notice = fs.readFileSync(path.join(root, skills.NOTICES), "utf8");
        t.ok(/`vendored-one`/.test(notice) && /not stated upstream/.test(notice) && /Keep the NOTICE file/.test(notice) && /`local-one`/.test(notice),
            "skill roster: the notice lists each upstream's skills, a missing holder, the notes and the local skills", notice);
        t.ok(!skills.writeNotices(root).written, "skill roster: a current notice is not rewritten");

    });

    // The two cases a map answers better than a directory does. A roster is a read, so a check about
    // its shape hands readRoster a repo-view over a map and never touches the disk: no temp tree to
    // build, and -- the reason the first of these used to be skipped half the time -- no symlink to
    // ask Windows for, which it refuses unless the session happens to be elevated.
    t.ok(!!skills.readRoster(repoView.fromMap({
        ".agents/skills/real/SKILL.md": text("---", "name: real", "description: A skill.", "---"),
        ".agents/skills/alias": { link: "real" },
    })).entries.find(e => e.name === "alias").link, "skill roster: a link under .agents/skills is an entry marked as a link");

    {
        const r = skills.readRoster(repoView.fromMap({}));
        t.ok(r.lock === null && !r.entries.length && !r.skills.length && !r.missing.length && !r.routing.sections.length,
            "skill roster: a repo with no harness files has an empty roster and no lock");
    }

    withRoot({ ".agents/skills/one/SKILL.md": skill("one"), ".cursor/skills/.keep": "" }, root => {
        // What relink decides is checked from maps in tables/relink.js; what is left for this one is
        // that the decision reaches the disk. A platform that refuses symlinks now says so as a
        // refusal rather than a throw, so this stands down on the reason rather than on an exception.
        const first = skills.relink(root);
        if (first.refused.length) { t.skip(`skill roster: this OS refuses symlinks, so relink on disk goes unchecked (${first.refused[0]})`); return; }
        const link = path.join(root, ".cursor/skills/one");
        t.ok(first.added === 1 && fs.readlinkSync(link).split(path.sep).join("/") === "../../.agents/skills/one",
            "skill roster: relink links an unlinked skill into a per-skill folder, relative", JSON.stringify(first));
        const again = skills.relink(root);
        t.ok(again.added === 0 && again.kept === 1, "skill roster: relink leaves a relative link alone", JSON.stringify(again));
    });
};

// THIRD-PARTY-NOTICES.md exists to stop a vendored skill going unattributed, and it had a way of
// doing the opposite. A skill somebody copied in by hand rather than vendoring with `npx skills` has
// no lock entry -- that tool is what writes one -- so the roster called it local and the notice
// listed it under "written for this repository, with no upstream": authorship claimed, in writing,
// over somebody else's work. What tells a copy from a skill written here is what a copy brings with
// it and a new file has no reason to carry, a licence of its own, in the folder or the frontmatter.
// Both shapes are asked here, beside a skill that really was written here, which has to stay listed.
exports.skillNoticesWillNotClaimACopyAsItsOwn = function skillNoticesWillNotClaimACopyAsItsOwn(t) {
    const view = repoView.fromMap({
        ".agents/skills/written-here/SKILL.md": skill("written-here"),
        ".agents/skills/copied-by-hand/SKILL.md": skill("copied-by-hand"),
        ".agents/skills/copied-by-hand/LICENSE.txt": "MIT License\n\nCopyright (c) Somebody\n",
        ".agents/skills/says-so-itself/SKILL.md": skill("says-so-itself", "license: Apache-2.0"),
        ".agents/skills/gpl-by-hand/SKILL.md": skill("gpl-by-hand"),
        ".agents/skills/gpl-by-hand/COPYING": "GNU GENERAL PUBLIC LICENSE\n",
    });
    const r = skills.readRoster(view);
    const s = n => r.skills.find(x => x.name === n) || {};
    // Membership first. Every assertion below reads a field off a skill looked up by name, and a
    // lookup that finds nothing answers for a skill with no licence, which is what two of them are
    // asking about. Pinned here, a skill dropped from the roster fails on this line instead of
    // passing on those.
    t.ok(r.skills.map(x => x.name).sort().join() === "copied-by-hand,gpl-by-hand,says-so-itself,written-here",
        "skill notices: the roster holds all four skills", r.skills.map(x => x.name).join());
    t.ok(!s("written-here").carries, "skill notices: a skill written here carries no licence of its own", s("written-here").carries);
    t.ok(/LICENSE\.txt/.test(s("copied-by-hand").carries || ""),
        "skill notices: a licence file in the folder says the skill came from somewhere", s("copied-by-hand").carries);
    t.ok(/Apache-2\.0/.test(s("says-so-itself").carries || ""),
        "skill notices: and so does a licence named in the frontmatter", s("says-so-itself").carries);
    t.ok(/COPYING/.test(s("gpl-by-hand").carries || ""),
        "skill notices: COPYING, the GPL's name for its file, is a licence signal too (ADR-0006)", s("gpl-by-hand").carries);

    const orphans = r.notices.orphans.join(" | ");
    t.ok(r.notices.orphans.length === 3 && /copied-by-hand/.test(orphans) && /says-so-itself/.test(orphans) && /gpl-by-hand/.test(orphans)
        && r.notices.orphans.every(o => /skills-lock\.json/.test(o)),
        "skill notices: each of them is an orphan naming the lock, not a line in the notice", orphans);
    t.ok(!/copied-by-hand|says-so-itself|gpl-by-hand/.test(r.notices.text) && /`written-here`/.test(r.notices.text),
        "skill notices: only the skill actually written here is listed as written here", r.notices.text);

    // And the gate that actually runs. `node scripts/skills.js notices` is not what a project meets
    // day to day -- the invariants are, on every edit -- and that one used to skip a repo with no
    // lock, which is precisely the repo a hand-copied skill lives in. The orphan was computed and
    // thrown away. It waits on the orphans now, so both halves are asked here: a carrier with no
    // lock fails it, and a repo that really has nothing vendored still skips.
    const gate = checkHarness.INVARIANTS.find(f => f.name === "vendoredSkillsAreAttributed");
    const outcome = v => {
        const said = [];
        gate({ ok: (c, title, detail) => c || said.push(detail || title), skip: why => said.push(`skip: ${why}`) }, v);
        return said.join("\n");
    };
    const said = outcome(view);
    t.ok(/copied-by-hand/.test(said) && /says-so-itself/.test(said) && !/^skip:/.test(said),
        "skill notices: the invariant reports the orphan rather than skipping a repo with no lock", said);
    t.ok(/^skip:/.test(outcome(repoView.fromMap({ ".agents/skills/written-here/SKILL.md": skill("written-here") }))),
        "skill notices: a repo that vendored nothing and carries no licence still skips");
};

// The upstream's own skills all pass the frontmatter check, so harnessInvariantsHoldHere proves only
// that it passes. Each broken shape gets a skill of its own, and the check must name every one of
// them and none of the valid ones: quoted values and a folded description included.
// SPEC-0001/S-3. The shapes are a map, not a directory: an invariant reads one repo-view now, so the
// nine skills here are nine entries rather than a temporary tree, and the folder holding no SKILL.md
// is a file beside the one that is missing rather than a mkdirSync the fixture could not express.
exports.skillFrontmatterCheckNamesEachProblem = function skillFrontmatterCheckNamesEachProblem(t) {
    const bodies = {
        "plain-ok": "---\nname: plain-ok\ndescription: Does one thing.\n---\nBody\n",
        "quoted-ok": "---\nname: \"quoted-ok\"\ndescription: 'Does one thing.'\n---\n",
        "folded-ok": "---\nname: folded-ok\ndescription: >\n  Spans\n  two lines.\nlicense: MIT\n---\n",
        "no-frontmatter": "# Just a heading\n",
        "wrong-name": "---\nname: other\ndescription: x\n---\n",
        "Bad_Name": "---\nname: Bad_Name\ndescription: x\n---\n",
        "no-description": "---\nname: no-description\n---\n",
        "empty-folded": "---\nname: empty-folded\ndescription: >\n---\n",
        "too-long": `---\nname: too-long\ndescription: ${"x".repeat(1025)}\n---\n`,
    };
    const files = { ".agents/skills/no-file/notes.md": "a folder, and no SKILL.md in it\n" };
    for (const [name, body] of Object.entries(bodies)) files[`.agents/skills/${name}/SKILL.md`] = body;
    const found = [];
    const probe = {
        ok: (condition, title, detail) => { if (!condition) found.push(...detail.split("\n")); },
        skip: why => found.push(`skip: ${why}`),
    };
    checkHarness.INVARIANTS.find(fn => fn.name === "everySkillHasValidFrontmatter")(probe, repoView.fromMap(files));

    const expected = {
        "no-file": "no SKILL.md",
        "no-frontmatter": "does not start with --- frontmatter",
        "wrong-name": "name is 'other'",
        "Bad_Name": "lowercase letters",
        "no-description": "no description",
        "empty-folded": "no description",
        "too-long": "over 1024",
    };
    for (const [name, says] of Object.entries(expected)) {
        t.ok(found.some(line => line.startsWith(`${name}:`) && line.includes(says)),
            `the skill frontmatter check reports ${name} (${says})`, found.join("\n"));
    }
    const noise = found.filter(line => /^(plain-ok|quoted-ok|folded-ok):/.test(line) || line.startsWith("skip:"));
    t.ok(!noise.length, "the skill frontmatter check accepts plain, quoted and folded values", noise.join("\n"));
};

// Invariants that bind the harness's own files, and must leave a project's files beside them alone:
// a target's .githooks/ can hold a task runner's config, and a target's portal is its own once
// installed. Each row runs one invariant against a throwaway repo and names the outcome it expects.
exports.invariantScopeDecisions = function invariantScopeDecisions(t) {
    const invariant = name => checkHarness.INVARIANTS.find(f => f.name === name);
    const run = (name, repo) => {
        const r = { passed: 0, failed: [], skipped: [] };
        invariant(name)({ ok: (c, title, detail) => c ? r.passed++ : r.failed.push(detail || title), skip: why => r.skipped.push(why) }, repo);
        return r.failed.length ? "fail" : r.passed ? "pass" : "skip";
    };
    const git = (dir, ...args) => lib.run("git", ["-C", dir, ...args]);
    // Hooks committed with the given modes: name -> true for executable.
    const hooks = modes => dir => {
        git(dir, "init", "--quiet");
        for (const [name, exec] of Object.entries(modes)) {
            git(dir, "add", "--", `.githooks/${name}`);
            git(dir, "update-index", `--chmod=${exec ? "+" : "-"}x`, "--", `.githooks/${name}`);
        }
    };
    const portal = text("import fs from 'node:fs';", "fs.readdirSync('docs');");
    const rows = [
        // invariant, files, setup (null: the files are all of it, so a map stands in for a checkout), expected, why
        ["gitHooksAreExecutable", { ".githooks/pre-commit": text("#!/bin/sh"), ".githooks/task-runner.json": text("{}") },
            hooks({ "pre-commit": true, "task-runner.json": false }), "pass",
            "a project file in .githooks/ that Git never runs need not be executable"],
        ["gitHooksAreExecutable", { ".githooks/pre-commit": text("#!/bin/sh") },
            hooks({ "pre-commit": false }), "fail", "a harness hook committed 100644 still fails"],
        ["theDocsPortalReadsTheChainModel", { "tools/docs-site/chain.mjs": portal }, null, "skip",
            "a project's own portal may read docs/ however it likes"],
        ["theDocsPortalReadsTheChainModel", { "tools/docs-site/chain.mjs": portal, "scripts/update-harness.js": "" }, null, "fail",
            "the upstream's portal must read the chain model"],
    ];
    for (const [name, files, setup, want, why] of rows) {
        const got = setup
            ? withRoot(files, dir => { setup(dir); return run(name, repoView.worktree(dir)); })
            : run(name, repoView.fromMap(files));
        t.ok(got === want, `invariant scope: ${why}`, `${name}: expected ${want}, got ${got}`);
    }
};

// SPEC-0001/S-3. The .claude/skills link in each shape it comes in: one link to the whole folder,
// one pointing at the wrong thing, and a folder of per-skill links with one skill left out. An
// invariant reads a repo-view now, so a link is an entry in a map -- which is the only reason these
// run at all. A real symlink needs a Windows session that happens to be elevated, and the branch
// that reads the whole-folder link had never run in this suite on any platform.
exports.skillLinkShapeDecisions = function skillLinkShapeDecisions(t) {
    const invariant = checkHarness.INVARIANTS.find(f => f.name === "everyInstalledSkillIsLinked");
    const skill = name => text("---", `name: ${name}`, "description: Does one thing.", "---");
    const run = files => {
        const said = [];
        invariant({ ok: (c, title, detail) => { if (!c) said.push(`${title} :: ${detail}`); }, skip: why => said.push(`skip: ${why}`) },
            repoView.fromMap(files));
        return said.join("\n");
    };
    const one = { ".agents/skills/one/SKILL.md": skill("one") };
    const rows = [
        [{ ...one, ".claude/skills": { link: "../.agents/skills" } }, null, "one link to the whole folder shows every skill"],
        [{ ...one, ".claude/skills": { link: "../.agents/agents" } }, "points at .agents/skills",
            "a whole-folder link pointing somewhere else is caught"],
        [{ ...one, ".agents/skills/two/SKILL.md": skill("two"), ".claude/skills/one": { link: "../../.agents/skills/one" } },
            "two", "a folder of per-skill links is checked name by name"],
        [one, "skip:", "skills with no links folder beside them is nothing to check"],
    ];
    for (const [files, wants, why] of rows) {
        const said = run(files);
        t.ok(wants === null ? !said : said.includes(wants), `skill links: ${why}`, said || "(nothing reported)");
    }
};
