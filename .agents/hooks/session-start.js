#!/usr/bin/env node
// .agents/hooks/session-start.js
// One-screen brief for an agent starting a session in this repo. Harness-neutral: takes no
// arguments, ignores stdin, always exits 0. Whatever it prints lands in the agent's context.
// Wire it to your harness's session-start event (.agents/README.md, "Files per AI tool").
const fs = require("fs");
const path = require("path");
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
// Open pull requests nobody has been offered a sweep of: the pr-sweep skill reviews, fixes and merges
// them once the user says yes. Named once each -- the numbers offered are kept in the git dir every
// worktree of the clone shares, and a pull request no longer open drops out of it. An origin that is
// not GitHub, or a gh that is missing or signed out, says nothing. Neither does a test run
// (HOOK_TEST), which would otherwise use up the offer by reading it.
if (!process.env.HOOK_TEST && /github\.com[:/]/.test(git(["remote", "get-url", "origin"]))) {
    const r = lib.run("gh", ["pr", "list", "--state", "open", "--json", "number,title,isDraft", "--limit", "50"], { timeout: 8000 });
    let open = [];
    try { if (r.status === 0) open = JSON.parse(r.output).filter(p => !p.isDraft); } catch { /* nothing to say */ }
    const file = path.join(git(["rev-parse", "--git-common-dir"]) || ".git", "pr-sweep-offered");
    let offered = [];
    try { offered = fs.readFileSync(file, "utf8").split(/\s+/).filter(Boolean).map(Number); } catch { /* none yet */ }
    const fresh = open.filter(p => !offered.includes(p.number));
    if (fresh.length) {
        say(`pull requests: ${fresh.map(p => `#${p.number} "${p.title}"`).join(", ")} ${fresh.length > 1 ? "are" : "is"} open and not yet offered. ` +
            "Ask the user through the question tool whether to run the pr-sweep skill on them.");
    }
    if (r.status === 0) try { fs.writeFileSync(file, open.map(p => p.number).join("\n") + "\n"); } catch { /* ask again next time */ }
}
if (!fs.existsSync("docs/agents/issue-tracker.md")) say('issue tracker: not configured. code-review, to-tickets and triage need docs/agents/issue-tracker.md (.agents/README.md, "What each skill expects")');
process.exit(0);
