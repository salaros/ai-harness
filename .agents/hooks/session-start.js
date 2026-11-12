#!/usr/bin/env node
// .agents/hooks/session-start.js
// One-screen brief for an agent starting a session in this repo. Harness-neutral: takes no
// arguments, ignores stdin, always exits 0. Its calls off the machine are `gh pr list` and the open
// Dependabot alerts, and only on a GitHub clone. Whatever it prints lands in the agent's context.
// Wire it to your harness's session-start event (.agents/README.md, "Files per AI tool").
const fs = require("fs");
const lib = require("./lib");

process.chdir(lib.root());
const say = line => process.stdout.write(line + "\n");
const git = args => { const r = lib.run("git", args); return r.status === 0 ? r.output.trim() : ""; };

say(`branch: ${git(["rev-parse", "--abbrev-ref", "HEAD"]) || "not a git checkout"}`);
if (git(["config", "--get", "core.hooksPath"]) !== ".githooks") say("git hooks: not installed. Run: node scripts/githooks-init.js");

// The brief never fails a session: a roster it cannot read -- no scripts/skills.js, a lock file that
// is not JSON -- is left for check-harness to report.
try {
    const missing = require("../../scripts/skills").readRoster(require("../../scripts/repo-view").worktree(process.cwd())).missing.join(" ");
    if (missing) say(`skills in skills-lock.json but missing from .agents/skills: ${missing}. Run: node scripts/skills.js install`);
} catch { /* nothing to say */ }

// A clone with no project to configure says so with the empty marker check-initialised.js accepts in
// place of MEMORY.md. Telling it to run project-init anyway is a line the agent learns to read past,
// and a brief with one such line teaches it to read past the rest.
const noProject = (() => { try { return fs.existsSync(require("../../scripts/check-initialised").MARKER); } catch { return false; } })();
say(fs.existsSync("MEMORY.md") ? "project: facts in MEMORY.md"
    : noProject ? "project: none to configure (.skip-project-init), so there is no MEMORY.md to read"
    : "project: not initialised (no MEMORY.md). Run the project-init skill first");
if (fs.existsSync("INTENT.md")) say("intent: product and MVP stories in INTENT.md");
// The generated links are the clone's (ADR-0009/D-2): a fresh clone has none, and a pull that adds
// an agent or changes a fact leaves one missing or stale. apply changes nothing when nothing is out
// of date, so it runs every session and speaks only when it did something. The facts nobody answered
// are named once a project has a MEMORY.md, since each one keeps everything its rows would narrow.
try {
    const profiles = require("../../scripts/profiles");
    if (fs.existsSync(profiles.FILE)) {
        const root = process.cwd();
        const r = profiles.applyTo(require("../../scripts/repo-view").worktree(root), require("../../scripts/repo-edit").worktreeEdit(root),
            { exclude: profiles.excludeFile(root), root });
        if (r.lines.length || r.problems.length) say(`profile: ${[...r.lines, ...r.problems].join("; ")}`);
        if (fs.existsSync("MEMORY.md") && r.open.length) say(`profile: no answer in MEMORY.md for ${r.open.join(", ")}, so everything those facts select stays on`);
    }
} catch { /* the brief never fails a session */ }
if (fs.existsSync("CONTEXT-MAP.md")) say("domain: multi-context, start at CONTEXT-MAP.md");
// Where the terms are: GLOSSARY.md, and CONTEXT.md's "## Language" in a repo that has not moved them
// out yet. A glossary nobody can read is left for the edit hook and the commit to report.
try {
    const glossary = require("../../scripts/check-glossary");
    const found = glossary.read(require("../../scripts/repo-view").worktree(process.cwd()));
    if (found && fs.existsSync(glossary.FILE)) {
        say(`domain: glossary in ${glossary.FILE}` + (found.legacy ? `, and ${found.legacy} term(s) still in ${glossary.CONTEXT} to move there` : ""));
    } else if (found) {
        say(`domain: glossary in ${glossary.CONTEXT}`);
    }
} catch { /* nothing to say */ }
if (fs.existsSync("docs/adr")) say(`decisions: docs/adr (${fs.readdirSync("docs/adr").length} ADRs)`);
// An iteration that outlives one context window keeps what it decided and verified in
// .scratch/<slug>/notes.md (.scratch/README.md). A session picking the work up reads that first:
// it is a screen, where the transcript it would otherwise read back is a hundred of them.
try {
    const notes = fs.readdirSync(".scratch", { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(`.scratch/${d.name}/notes.md`))
        .map(d => `.scratch/${d.name}/notes.md`);
    if (notes.length) say(`notes in progress: ${notes.join(", ")}. Read them before the transcript or the commit log`);
} catch { /* no .scratch folder */ }
// The pull requests open on GitHub, by number, so the agent can offer a pr-sweep; the skill says how
// to ask. Listed every session rather than once: an offer nobody has to remember cannot be used up by
// a worktree, a harness or a session that never asked, and a pull request that gained comments since
// is offered again. Numbers only, since a title is text anyone with a fork can write into the brief.
// An origin that is not GitHub, or a gh that is missing or signed out, says nothing; so does a test
// run (HOOK_TEST), which has no network to wait on.
if (!process.env.HOOK_TEST && /github\.com[:/]/.test(git(["remote", "get-url", "origin"]))) {
    const r = lib.run("gh", ["pr", "list", "--state", "open", "--json", "number,isDraft", "--limit", "50"],
        { timeout: 5000, env: { ...process.env, GH_NO_UPDATE_NOTIFIER: "1", GH_PROMPT_DISABLED: "1" } });
    let open = [];
    try { if (r.status === 0) open = JSON.parse(r.output).filter(p => !p.isDraft).map(p => `#${p.number}`); } catch { /* nothing to say */ }
    if (open.length) say(`pull requests open: ${open.join(", ")}. Offer a pr-sweep of them, as the skill says.`);
    // The open Dependabot alerts, counted by severity, because otherwise they surface only in the
    // remote's banner after a push, when the work is already out. A token without access to them
    // (403), or a repository with them turned off, says nothing.
    const a = lib.run("gh", ["api", "repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100",
        "--jq", 'map(.security_advisory.severity) | group_by(.) | map("\\(length) \\(.[0])") | join(", ")'],
        { timeout: 5000, env: { ...process.env, GH_NO_UPDATE_NOTIFIER: "1", GH_PROMPT_DISABLED: "1" } });
    const alerts = a.status === 0 ? a.output.trim() : "";
    if (alerts) say(`dependabot alerts open: ${alerts}. Tell the user, and list them with gh api repos/{owner}/{repo}/dependabot/alerts before changing dependencies.`);
}
// How a session ends, from the routing row of that name: the deferred-work ledger first, so the
// retrospective opens on what was actually put off. retro and handoff only run when the user types
// them, so the agent offers each rather than starting it; handoff only matters when someone else
// carries on. Only the skills this repo installed are named.
const ending = [
    fs.existsSync(".agents/skills/loose-ends/SKILL.md") && "sweep the deferred-work comments with loose-ends",
    fs.existsSync(".agents/skills/retro/SKILL.md") && "offer the user /retro, which only they can start",
    fs.existsSync(".agents/skills/handoff/SKILL.md") && "offer the user /handoff when someone else carries the work on, which only they can start",
].filter(Boolean);
if (ending.length) say(`session end, after the last push (.agents/routing.md): ${ending.join(", then ")}`);
if (!fs.existsSync("docs/agents/issue-tracker.md")) say('issue tracker: not configured. code-review, to-tickets and triage need docs/agents/issue-tracker.md (.agents/README.md, "What each skill expects")');
process.exit(0);
