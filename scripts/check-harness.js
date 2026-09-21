#!/usr/bin/env node
// scripts/check-harness.js
// Proves the harness in a repo still works: the harness invariants, facts about the harness files
// that must hold whatever the project around them does. Every skill visible to the agent, the skill
// links committed as links, every SKILL.md readable, the routing sections and the agents naming them
// in agreement, every Git hook executable and still a two-line wrapper, each hook launcher in
// .claude/settings.json the text this file writes, every vendored skill attributed and on disk, the
// chain table in AGENTS.md readable, one reader for the stacks table, and the docs portal reading
// the chain model rather than walking docs/ itself. Each one fails silently otherwise: nothing else
// in the harness exits non-zero when a skill quietly vanishes from an agent's view.
// It travels with the harness, so a project can run it after changing any of those files, and
// check-edit.js does whenever one of PATHS is edited. The installer runs the upstream's copy against
// the target it has just written, and the upstream's suite runs the same functions against itself.
// check(root) is the decision: nothing printed, nothing exited, and nothing but `root` read, so the
// repo being checked need not be the one this file sits in.
// Usage:
//   node scripts/check-harness.js                 check this repo
//   node scripts/check-harness.js --root=../other check another one
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const docsCheck = require("./docs-check");
const { HOOKS } = require("./githook");
const skills = require("./skills");
const repoView = require("./repo-view");

// What the invariants below read, as the path a harness reports for an edit: an exact file, or a
// prefix ending in / for everything under it. check-edit.js runs this script for an edit to any of
// them, so an invariant reading a new file adds it here and the trigger widens with it.
const PATHS = [
    ".agents/skills/", ".claude/skills", ".agents/agents/", ".agents/routing.md", ".githooks/",
    "skills-lock.json", "scripts/", "THIRD-PARTY-NOTICES.md", "AGENTS.md",
    ".claude/settings.json", "tools/docs-site/",
];
const reads = file => PATHS.some(p => p.endsWith("/") ? file.startsWith(p) : file === p);

// The skill roster is scripts/skills.js's: the entries under .agents/skills, the lock, the routing
// and the licence notice, read in one pass. check() reads it once and hands the same read to every
// invariant; an invariant called on its own reads its own.
const once = read => { let r; return () => r || (r = read()); };
const rosterOf = root => once(() => skills.readRoster(root));

// Git's view of a folder, as repo-view's index rows, or null outside a git checkout.
function indexed(root, dir) {
    const rows = repoView.indexModes(root, [dir]);
    return rows && { rows, output: rows.map(r => `${r.mode} ${r.file}`).join("\n") };
}

// A harness installed by scripts/update-harness.js has its files on disk and nothing in the index
// until the project makes its first commit. Both mode checks below assert what the index records, so
// that state is nothing to assert rather than a failure: saying the hooks are not executable when
// they have simply never been committed sends the reader looking for a bug that is not there.
const uncommitted = (root, dir, git) => !git.rows.length && fs.existsSync(path.join(root, dir));

// Git skips a hook that is not executable, and says nothing about it. On Windows core.fileMode is
// normally false, so chmod is a no-op and a hook added there is recorded 100644: it runs for its
// author and silently never runs on Linux or macOS. Only `git update-index --chmod=+x <file>` fixes
// the mode Git records, so the mode in the index is what this asserts.
function gitHooksAreExecutable(t, root) {
    const git = indexed(root, ".githooks");
    if (!git) { t.skip(".githooks mode check: not a git checkout"); return; }
    if (uncommitted(root, ".githooks", git)) { t.skip(".githooks mode check: present on disk, not committed yet"); return; }
    t.ok(git.rows.length > 0, "git tracks files under .githooks/", git.output);
    const notExecutable = git.rows.filter(r => !r.exec).map(r => r.file);
    t.ok(!notExecutable.length,
        "every .githooks/ hook is committed executable (git update-index --chmod=+x <file>)",
        notExecutable.join(", "));
}

// A Git hook is a wrapper and nothing else: find the repo, hand over to scripts/githook.js. Every
// decision it used to make -- reading the index, computing the merge diff, working out whether Git
// had run it at all, chaining checks with `||` -- sat in a file no test could reach, and one of those
// decisions was wrong for as long as nobody could test it. The shape is the invariant, so it is
// asserted rather than trusted: strip the shebang and the comments, and two lines are left.
// Only the hooks githook.js handles are the harness's. A hook a project wrote itself is its own
// business, and an update leaves it alone for the same reason.
function noGitHookDecidesAnything(t, root) {
    const dir = path.join(root, ".githooks");
    if (!fs.existsSync(dir)) { t.skip("git hook shape: no .githooks folder"); return; }
    const hooks = fs.readdirSync(dir).filter(name => HOOKS[name]);
    t.ok(hooks.length > 0, "there are harness hooks in .githooks/");
    for (const name of hooks) {
        const body = fs.readFileSync(path.join(dir, name), "utf8")
            .split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#"));
        const want = [
            "root=$(git rev-parse --show-toplevel) || exit 1",
            `exec node "$root/scripts/githook.js" ${name} "$@"`,
        ];
        t.ok(body.length === want.length && body.every((l, i) => l === want[i]),
            `.githooks/${name} decides nothing; it calls githook.js ${name}`, body.join("\n"));
    }
}

// The three events the harness hooks into, and the script each one launches. A matcher of null is an
// entry that runs on every tool call. Claude Code reads this table's file; so do Copilot's CLI and
// VS Code extension, which is why the launcher below names no harness-specific variable.
const CLAUDE_HOOKS = [
    { event: "SessionStart", matcher: null, script: "session-start.js" },
    { event: "PreToolUse", matcher: "Bash", script: "guard-command.js" },
    { event: "PostToolUse", matcher: "Edit|Write|MultiEdit", script: "check-edit.js" },
];

// The one command text that launches a hook, written once here rather than three times in a settings
// file nobody re-reads. node asks git for the root instead of reading $CLAUDE_PROJECT_DIR, because
// Copilot reads the same file without setting that variable and denies a tool whose pre-tool hook
// errors. The trailing `; exit $LASTEXITCODE` is for PowerShell, which reports a native exit 2 as 1:
// bash exits with the last status when the variable is empty, and cmd.exe hands the two words to
// `node -e`, which ignores them. .agents/README.md explains the same thing to a person.
const launcher = script =>
    `node -e "require(require('child_process').execFileSync('git',['rev-parse','--show-toplevel'],`
    + `{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim()+'/.agents/hooks/${script}')"`
    + "; exit $LASTEXITCODE";

// Nothing reads .claude/settings.json back after an update merges it, and a hook that stopped being
// wired fails the way every harness failure does: in silence, with the session simply not checking
// anything any more. So the file is held to the table above -- each of our three scripts launched
// once, on its event, behind its matcher, by the launcher text every shell runs. Only those three
// entries are ours; a hook or a permission the project added is its own business and is not read.
function claudeHookLaunchersAreWired(t, root) {
    const file = path.join(root, ".claude/settings.json");
    if (!fs.existsSync(file)) { t.skip("hook launcher check: no .claude/settings.json"); return; }
    let hooks;
    try { hooks = JSON.parse(fs.readFileSync(file, "utf8")).hooks; }
    catch (e) { t.ok(false, ".claude/settings.json is readable JSON", e.message); return; }
    for (const { event, matcher, script } of CLAUDE_HOOKS) {
        const groups = (hooks && hooks[event]) || [];
        const ours = groups.flatMap(g => (g.hooks || [])
            .filter(h => typeof h.command === "string" && h.command.includes(`/${script}`))
            .map(h => ({ matcher: g.matcher === undefined ? null : g.matcher, command: h.command })));
        t.ok(ours.length === 1, `.claude/settings.json launches ${script} on ${event}, once`, `${ours.length} entries`);
        if (ours.length !== 1) continue;
        t.ok(ours[0].matcher === matcher,
            `the ${event} entry for ${script} matches ${matcher || "every tool"}`, `matcher ${JSON.stringify(ours[0].matcher)}`);
        t.ok(ours[0].command === launcher(script),
            `the ${event} command for ${script} is the launcher every shell runs`, ours[0].command);
    }
}

// .claude/skills is one symlink to .agents/skills, so a skill has one copy on disk. A harness that
// wants a link per skill gets .claude/skills/<name> instead, and both shapes are mode 120000.
// `npx skills add` recreates per-skill links absolute, and `node scripts/skills.js relink` rewrites
// them relative -- but a skill staged before the relink goes into the index as the directory it was
// at the time, one 100644 blob per file. That commits a second copy of the skill that no longer
// tracks the first, and leaves the worktree permanently dirty against it. Mode 120000 is the
// symlink, so the mode in the index is what this asserts.
function claudeSkillLinksAreSymlinks(t, root) {
    const git = indexed(root, ".claude/skills");
    if (!git) { t.skip(".claude/skills mode check: not a git checkout"); return; }
    if (uncommitted(root, ".claude/skills", git)) { t.skip(".claude/skills mode check: present on disk, not committed yet"); return; }
    t.ok(git.rows.length > 0, "git tracks entries under .claude/skills/", git.output);
    const notLinks = git.rows.filter(r => !r.link).map(r => r.file);
    t.ok(!notLinks.length,
        "every .claude/skills/ entry is committed as a symlink (node scripts/skills.js relink, then stage)",
        notLinks.slice(0, 10).join(", "));
}

// A harness surfaces the skills it can see, so a skill with no link is a skill that does not exist
// as far as the agent is concerned. One link to the whole folder shows every skill, a local one
// written by hand included, and the only thing left to check is where it points. A folder of
// per-skill links shows what someone linked and nothing else -- `npx skills` links what it
// vendored -- so there the count is the check. Reading a name through the whole-folder link would
// compare .agents/skills with itself and pass whatever the state.
function everyInstalledSkillIsLinked(t, root, roster = rosterOf(root)) {
    const skillsDir = path.join(root, ".agents/skills"), links = path.join(root, ".claude/skills");
    if (!fs.existsSync(skillsDir) || !fs.existsSync(links)) { t.skip("skill link check: no skills directories"); return; }
    const installed = roster().skills.map(s => s.name);
    t.ok(installed.length > 0, "skills are installed under .agents/skills/");
    if (fs.lstatSync(links).isSymbolicLink()) {
        const target = fs.readlinkSync(links);
        t.ok(path.resolve(path.dirname(links), target) === path.resolve(skillsDir),
            "the .claude/skills link points at .agents/skills", target);
        return;
    }
    const unlinked = installed.filter(n => { try { fs.lstatSync(path.join(links, n)); return false; } catch { return true; } });
    t.ok(!unlinked.length,
        "every installed skill has a .claude/skills/ link (node scripts/skills.js relink)",
        unlinked.slice(0, 10).join(", "));
}

// .claude/skills resolves to .agents/skills, so anything a tool writes into the first lands in the
// second. `npx skills` links what it vendors into every harness folder it finds, and a link it puts
// there would appear beside the skills as a sibling pointing at one of them. Nothing else in the
// harness ever creates one, so an entry here that is not a directory is that, and it is worth
// catching: the roster reads this folder, and a skill that is really a link to another skill counts
// twice and vendors as neither.
function skillsFolderHoldsSkillsNotLinks(t, root, roster = rosterOf(root)) {
    if (!fs.existsSync(path.join(root, ".agents/skills"))) { t.skip("skills folder check: no skills directory"); return; }
    const links = roster().entries.filter(e => e.link).map(e => e.name);
    t.ok(!links.length,
        "every entry under .agents/skills/ is a skill, not a link to one",
        links.slice(0, 10).join(", "));
}

// A harness finds a skill by the frontmatter of its SKILL.md, and one it cannot read is dropped
// without a word: no error in the session, just a skill the agent never sees. The rules are the
// Agent Skills specification's (https://agentskills.io/specification): `name` is 1-64 lowercase
// letters, digits and single hyphens, and matches the folder; `description` is 1-1024 characters,
// because it is all an agent matches a task against. A folder with no SKILL.md is caught here too,
// since everything else that lists skills filters it out. Vendored skills are held to the same
// rules, because a broken one is just as invisible; the fix goes upstream.
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function everySkillHasValidFrontmatter(t, root, roster = rosterOf(root)) {
    if (!fs.existsSync(path.join(root, ".agents/skills"))) { t.skip("skill frontmatter check: no skills directory"); return; }
    const problems = [];
    // A link is skillsFolderHoldsSkillsNotLinks's to report, and a stray file is nobody's skill.
    for (const { name, link, dir, hasSkillMd, frontmatter: fm } of roster().entries) {
        if (link || !dir) continue;
        if (!hasSkillMd) { problems.push(`${name}: no SKILL.md`); continue; }
        if (!fm) { problems.push(`${name}: SKILL.md does not start with --- frontmatter`); continue; }
        if (!fm.name) problems.push(`${name}: no name`);
        else if (fm.name !== name) problems.push(`${name}: name is '${fm.name}', not the folder name`);
        else if (name.length > 64 || !SKILL_NAME.test(name)) problems.push(`${name}: name must be at most 64 lowercase letters, digits and single hyphens`);
        if (!fm.description) problems.push(`${name}: no description`);
        else if (fm.description.length > 1024) problems.push(`${name}: description is ${fm.description.length} characters, over 1024`);
    }
    t.ok(!problems.length, "every skill under .agents/skills/ has a SKILL.md with a valid name and description", problems.join("\n"));
}

// The lock file and .agents/skills must agree. This is breakage, not bookkeeping: a skill recorded
// in the lock but absent from disk means a damaged or partial checkout, and `skills.js install`
// fixes it. Nothing here requires a project to route, document or tabulate the skills it installs.
function noSkillIsMissingFromDisk(t, root, roster = rosterOf(root)) {
    const { missing } = roster();
    t.ok(!missing.length, "every skill in skills-lock.json is on disk (node scripts/skills.js install)", missing.join("\n"));
}

// Vendoring a skill copies someone else's work into this repo, and MIT and Apache-2.0 both ask that
// the copyright and permission notice travel with the copy. `npx skills` carries only what sits
// inside the skill folder, so an upstream keeping its licence at the repo root sends nothing, and
// the notice has to be written here. Nothing about adding a skill prompts anyone to do that, which
// is what this check is for: THIRD-PARTY-NOTICES.md is generated, so a new upstream with no row in
// scripts/skill-licences.tsv fails rather than shipping unattributed.
function vendoredSkillsAreAttributed(t, root, roster = rosterOf(root)) {
    const { lock, notices } = roster();
    if (!lock) { t.skip("licence notice check: no skills-lock.json, so nothing is vendored"); return; }
    const why = notices.orphans.length
        ? `no row in ${skills.LICENCES} covers:\n  ${notices.orphans.join("\n  ")}`
        : !notices.current
            ? `${skills.NOTICES} is ${fs.existsSync(path.join(root, skills.NOTICES)) ? "out of date with " + skills.LOCK + " and " + skills.LICENCES : "missing"}`
            : "";
    t.ok(!why, "THIRD-PARTY-NOTICES.md covers every vendored skill (node scripts/skills.js notices)", why);
}

// .agents/routing.md holds the rows more than one agent routes through, in a section per audience:
// each section names its agents, each agent names its sections, and the two must agree. Either half
// is a silent failure otherwise. A section nobody names is dead rows; an agent naming a section that
// does not exist routes nothing, and neither shows up as a broken link or a bad exit code anywhere
// else. The roster credits a moved row to the agents that read its section, so this also pins what
// `scripts/skills.js list` reports.
// The file lives above .agents/agents/ on purpose: .claude/agents is a symlink to that folder, and a
// harness reads everything in there as an agent definition.
function agentRoutingSectionsAgreeOnTheirAudience(t, root, roster = rosterOf(root)) {
    const shared = "routing.md";
    if (!fs.existsSync(path.join(root, ".agents", shared)) || !fs.existsSync(path.join(root, ".agents/agents"))) {
        t.skip("routing section check: no routing.md"); return;
    }
    const { sections, agents } = roster().routing;
    const readers = Object.keys(agents).filter(n => agents[n].readsShared);
    t.ok(sections.length > 0 && readers.length > 0,
        `${shared} has sections and agents point at it`, `${sections.length} section(s), ${readers.length} agent(s)`);
    for (const { title, readBy: stated } of sections) {
        const actual = readers.filter(n => agents[n].sections.includes(title)).sort();
        t.ok(stated.length > 0, `"${title}" says which agents read it, on a "Read by" line`);
        t.ok(stated.join(",") === actual.join(","),
            `"${title}" is read by exactly the agents it names`,
            `names ${stated.join(", ") || "(none)"}; named by ${actual.join(", ") || "(none)"}`);
    }
}

// docs-check reads the stages of the documentation chain out of the table in AGENTS.md, so a table
// it cannot read turns every document check into a problem about the table. AGENTS.md reconciles on
// every update, and a merge that mangles the table is exactly what a harness invariant is for.
function chainTableIsReadable(t, root) {
    if (!fs.existsSync(path.join(root, "AGENTS.md"))) { t.skip("chain table: no AGENTS.md"); return; }
    const { stages, problems } = docsCheck.readChain(root);
    t.ok(!problems.length && stages.length > 0, "the chain table in AGENTS.md is readable", problems.join("\n"));
}

// scripts/stacks.tsv has one reader, scripts/stacks.js, and every script that wants a stack asks it
// by name. Two readers taking a row apart by position is how the second came to be written
// `[stack, , needs, , , formats, format]`: correct, unreadable, and wrong the moment a column moved.
// Code only: lib.js names the table in the usage comment at its top, which documents the helper
// rather than reading the table. This file names it too, in the rule below rather than as a reader,
// so it excuses itself by the name it is saved under -- the same name in the target it checks.
function onlyTheStacksReaderNamesTheTable(t, root) {
    const dir = path.join(root, "scripts");
    if (!fs.existsSync(path.join(dir, "stacks.tsv")) || !fs.existsSync(path.join(dir, "stacks.js"))) {
        t.skip("stacks table: no table or no reader here"); return;
    }
    const code = file => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(l => !l.trim().startsWith("//")).join("\n");
    const others = fs.readdirSync(dir)
        .filter(n => n.endsWith(".js") && n !== "stacks.js" && n !== path.basename(__filename))
        .filter(n => code(path.join(dir, n)).includes("stacks.tsv"));
    t.ok(!others.length, "only scripts/stacks.js reads scripts/stacks.tsv itself", others.join(", "));
}

// The portal presents the chain model; it does not go looking for documents of its own. A directory
// read in chain.mjs is a second walk of docs/, and a second walk grew a second file-name rule last
// time. tools/docs-site is optional, so a repo that publishes straight to Jira owes nothing here.
function theDocsPortalReadsTheChainModel(t, root) {
    const entry = path.join(root, "tools", "docs-site", "chain.mjs");
    if (!fs.existsSync(entry)) { t.skip("docs portal: the optional portal is not installed"); return; }
    t.ok(!/readdirSync/.test(fs.readFileSync(entry, "utf8")),
        "the docs portal reads the chain model rather than walking docs/ itself", entry);
}

const INVARIANTS = [
    gitHooksAreExecutable,
    noGitHookDecidesAnything,
    claudeHookLaunchersAreWired,
    claudeSkillLinksAreSymlinks,
    everyInstalledSkillIsLinked,
    skillsFolderHoldsSkillsNotLinks,
    everySkillHasValidFrontmatter,
    noSkillIsMissingFromDisk,
    vendoredSkillsAreAttributed,
    agentRoutingSectionsAgreeOnTheirAudience,
    chainTableIsReadable,
    onlyTheStacksReaderNamesTheTable,
    theDocsPortalReadsTheChainModel,
];

// Every invariant against `root`. A failure carries its title and what was found; a skip is an
// invariant this repo gives nothing to check, counted so that "all passed" never hides it.
function check(root) {
    const result = { passed: 0, failed: [], skipped: [] };
    const t = {
        ok: (condition, title, detail) => { if (condition) result.passed++; else result.failed.push({ title, detail: detail || "" }); },
        skip: why => result.skipped.push(why),
    };
    const roster = rosterOf(root);
    for (const invariant of INVARIANTS) {
        // A roster that cannot be read at all -- a lock file that is not JSON -- fails the invariant
        // asking, rather than the whole check.
        try { invariant(t, root, roster); }
        catch (e) { result.failed.push({ title: `${invariant.name} could not run`, detail: e.message }); }
    }
    const skips = result.skipped.length ? `, ${result.skipped.length} skipped` : "";
    result.summary = `harness invariants: ${result.passed} passed, ${result.failed.length} failed${skips}`;
    return result;
}

// The report a person reads, from what check() returned: one line per failure and skip, then the
// tally. The installer prints the same text.
const format = r => [
    ...r.failed.map(f => `FAIL ${f.title}${f.detail ? "\n" + f.detail.replace(/^/gm, "    ") : ""}`),
    ...r.skipped.map(why => `SKIP ${why}`),
    r.summary,
].join("\n");

module.exports = { check, format, reads, PATHS, INVARIANTS, CLAUDE_HOOKS, launcher };

if (require.main === module) {
    const r = check(lib.root());
    console.log(format(r));
    process.exit(r.failed.length ? 1 : 0);
}
