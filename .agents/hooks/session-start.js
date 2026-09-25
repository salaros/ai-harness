#!/usr/bin/env node
// .agents/hooks/session-start.js
// One-screen brief for an agent starting a session in this repo. Harness-neutral: takes no
// arguments, ignores stdin, always exits 0. Its one call off the machine is `gh pr list`, and only on
// a GitHub clone. Whatever it prints lands in the agent's context.
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

say(fs.existsSync("MEMORY.md") ? "project: facts in MEMORY.md" : "project: not initialised (no MEMORY.md). Run the project-init skill first");
if (fs.existsSync("INTENT.md")) say("intent: product and MVP stories in INTENT.md");
if (fs.existsSync("CONTEXT-MAP.md")) say("domain: multi-context, start at CONTEXT-MAP.md");
if (fs.existsSync("CONTEXT.md")) say("domain: glossary in CONTEXT.md");
if (fs.existsSync("docs/adr")) say(`decisions: docs/adr (${fs.readdirSync("docs/adr").length} ADRs)`);
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
}
// How a session ends, from the routing row of that name: the deferred-work ledger first, so the
// retrospective opens on what was actually put off. retro only runs when the user types it, so the
// agent offers it rather than starting it; handoff only matters when someone else carries on. Only the
// skills this repo installed are named.
const ending = [
    fs.existsSync(".agents/skills/duck-debt/SKILL.md") && "run duck-debt",
    fs.existsSync(".agents/skills/retro/SKILL.md") && "offer the user /retro, which only they can start",
    fs.existsSync(".agents/skills/handoff/SKILL.md") && "run handoff when someone else carries the work on",
].filter(Boolean);
if (ending.length) say(`session end, after the last push (.agents/routing.md): ${ending.join(", then ")}`);
if (!fs.existsSync("docs/agents/issue-tracker.md")) say('issue tracker: not configured. code-review, to-tickets and triage need docs/agents/issue-tracker.md (.agents/README.md, "What each skill expects")');
process.exit(0);
