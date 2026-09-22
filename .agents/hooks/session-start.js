#!/usr/bin/env node
// .agents/hooks/session-start.js
// One-screen brief for an agent starting a session in this repo. Harness-neutral: takes no
// arguments, ignores stdin, always exits 0. Whatever it prints lands in the agent's context.
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
if (!fs.existsSync("docs/agents/issue-tracker.md")) say('issue tracker: not configured. code-review, to-tickets and triage need docs/agents/issue-tracker.md (.agents/README.md, "What each skill expects")');
process.exit(0);
