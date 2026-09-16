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
const { readIntent } = require("./docs-check");

const MARKER = ".skip-project-init";
const FACTS = "MEMORY.md";
// What a project must know about itself. An empty file, or one still carrying the template's
// <angle-bracket> placeholders, is not an initialised project: it is the skill half-run.
// `Issue tracker` is deliberately absent. A tracker is a choice, not a property of the code, and a
// repo with no tracker at all is a real repo; `to-tickets` is the only skill that needs one, and it
// can say so itself. The same goes for Figma: nothing here requires it. `Frontend` is absent for the
// same reason: a service or a library has no UI, so it has no framework to name.
const REQUIRED = ["Name", "Purpose", "Requirements", "Unit type", "Language", "Runtime / package manager"];
// INTENT.md is optional. When a project has one, its "## Product" section owns the name and the
// purpose, so MEMORY.md need not repeat them and the gate reads them from there instead; the rest
// are configuration, which INTENT.md leaves out by design, and stay in MEMORY.md.
const INTENT = "INTENT.md";
const FROM_INTENT = ["Name", "Purpose"];

// { ok, reason } for a repo root, so the suite can exercise every answer against a temp directory
// rather than depending on whether the checkout it runs in happens to be configured.
function check(root = ".") {
    if (fs.existsSync(path.join(root, MARKER))) return { ok: true, reason: `${MARKER} present, initialisation not required` };
    const intentFile = path.join(root, INTENT);
    const intent = fs.existsSync(intentFile) ? readIntent(fs.readFileSync(intentFile, "utf8")) : null;
    const fromIntent = intent ? FROM_INTENT.filter(label => !(intent.product && intent.product[label.toLowerCase()])) : [];
    const required = intent ? REQUIRED.filter(label => !FROM_INTENT.includes(label)) : REQUIRED;
    const intentReason = fromIntent.length ? `; ${INTENT} "## Product" gives no ${fromIntent.join(", ")}` : "";

    const file = path.join(root, FACTS);
    if (!fs.existsSync(file)) return { ok: false, reason: `${FACTS} is missing${intentReason}`, missing: [...fromIntent, ...required] };

    const text = fs.readFileSync(file, "utf8");
    const missing = required.filter(label => {
        const m = text.match(new RegExp(`^\\s*-\\s*\\*\\*${label.replace(/[/.*+?^${}()|[\]\\]/g, "\\$&")}:\\*\\*\\s*(.*)$`, "mi"));
        if (!m) return true;
        const value = m[1].trim();
        // A value that is only a placeholder, or empty, is the template rather than an answer.
        return !value || /^<[^>]*>$/.test(value) || value.replace(/<[^>]*>/g, "").trim() === "";
    });
    if (missing.length || fromIntent.length) {
        const reason = missing.length ? `${FACTS} records no ${missing.join(", ")}${intentReason}` : intentReason.slice(2);
        return { ok: false, reason, missing: [...fromIntent, ...missing] };
    }
    return intent
        ? { ok: true, reason: `${INTENT} gives the name and purpose, ${FACTS} the other ${required.length} facts` }
        : { ok: true, reason: `${FACTS} records all ${REQUIRED.length} facts` };
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
