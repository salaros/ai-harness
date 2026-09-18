#!/usr/bin/env node
// scripts/check-initialised.js
// Refuses to let work leave an unconfigured clone of this template. `MEMORY.md` holds the facts no
// file derives -- what the project is, where its requirements live, the stack --
// and every skill that reads them guesses while it is missing, so the `project-init` skill is meant
// to run before anything else. This is what makes that an order rather than a suggestion.
// The escape hatch is an empty `.skip-project-init` at the repo root: untracked and ignored, so it
// is per clone and never travels. The template's own repo needs it, having no project to configure.
// Called by .githooks/pre-commit and .githooks/pre-push, which pass the action for the last line.
// A hook is a local courtesy, not a wall: `--no-verify` skips it, and hooks run at all only after
// `node scripts/githooks-init.js`. It stops the honest mistake, which is the one worth stopping.
// Usage:
//   node scripts/check-initialised.js [commit|push]
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const projectFacts = require("./project-facts");

const MARKER = ".skip-project-init";
const { MEMORY: FACTS, INTENT } = projectFacts;

// { ok, reason } for a repo root, so the suite can exercise every answer against a temp directory
// rather than depending on whether the checkout it runs in happens to be configured. What a project
// must know about itself, and what counts as unanswered, is scripts/project-facts.js's; an empty
// MEMORY.md, or one still carrying the template's <placeholders>, is the skill half-run. When an
// INTENT.md exists its "## Product" owns the name and purpose, so those two are reported against it.
function check(root = ".") {
    if (fs.existsSync(path.join(root, MARKER))) return { ok: true, reason: `${MARKER} present, initialisation not required` };
    const hasIntent = fs.existsSync(path.join(root, INTENT));
    const missing = projectFacts.unanswered(projectFacts.readFactsAt(root));
    const owned = label => hasIntent && projectFacts.FACTS.some(f => f.label === label && f.intent);
    const fromIntent = missing.filter(owned);
    const fromMemory = missing.filter(label => !owned(label));
    const intentReason = fromIntent.length ? `${INTENT} "## Product" gives no ${fromIntent.join(", ")}` : "";

    const reasons = [];
    if (!fs.existsSync(path.join(root, FACTS))) reasons.push(`${FACTS} is missing`);
    else if (fromMemory.length) reasons.push(`${FACTS} records no ${fromMemory.join(", ")}`);
    if (intentReason) reasons.push(intentReason);
    if (reasons.length) return { ok: false, reason: reasons.join("; "), missing: [...fromIntent, ...fromMemory] };

    const required = projectFacts.FACTS.filter(f => f.required);
    return hasIntent
        ? { ok: true, reason: `${INTENT} gives the name and purpose, ${FACTS} the other ${required.filter(f => !f.intent).length} facts` }
        : { ok: true, reason: `${FACTS} records all ${required.length} facts` };
}

// Why the work was refused, and what to do about it. Exported beside check() because the hooks now
// decide in scripts/githook.js rather than in the shell, and the refusal a developer reads should
// not depend on which of the two ran.
function explain(action, r) {
    console.error(`
This repository has not been initialised, so nothing should ${action} yet.

${r.reason}. That file records the facts no other file derives -- what the project
is, where its requirements live and the stack -- and every skill
that reads them guesses while they are absent or still a <placeholder>.
When ${INTENT} exists, its "## Product" section gives the name and purpose instead.

Missing: ${r.missing.join(", ")}

Run the project-init skill first (/project-init in Claude Code). It asks for
those facts and writes ${FACTS}, the README and docs/agents/issue-tracker.md.

If this clone has no project to configure -- the template's own repo, say --
create an empty ${MARKER} at the root. Git ignores it, so it stays yours.

To ${action} anyway: git ${action} --no-verify
`);
}

module.exports = { check, explain, MARKER, FACTS, INTENT };

if (require.main === module) {
    lib.chdirRoot();
    const action = lib.args()[0] === "push" ? "push" : "commit";
    const r = check();
    if (r.ok) { console.log(`project: ${r.reason}`); process.exit(0); }
    explain(action, r);
    process.exit(1);
}
