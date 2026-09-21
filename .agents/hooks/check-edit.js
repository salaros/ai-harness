#!/usr/bin/env node
// .agents/hooks/check-edit.js
// Runs after the harness writes or edits a file. Gets the edited paths from lib.event() (repo-relative,
// whatever the harness sent) and applies the first matching rule below that objects: a refusal
// when a vendored skill was edited in place, node --check for *.js, JSON validity for *.json, the
// documentation chain for any file docs-check counts in it (Markdown under docs/, AGENTS.md, MEMORY.md
// and INTENT.md),
// the harness invariants (scripts/check-harness.js) when a path they read changed, and, in the
// upstream only, the whole suite when any harness script, table or Git hook changed. Each rule
// catches something broken; none of them asks a project to keep bookkeeping current.
// Exit 2 = send the message on stderr back to the agent. Exit 0 = silent.
// Wire it to the post-tool-use event of the edit/write tools (.agents/README.md, "Files per AI tool").
const fs = require("fs");
const lib = require("./lib");
const docsCheck = require("../../scripts/docs-check");
const harness = require("../../scripts/check-harness");
const skills = require("../../scripts/skills");

// Read before the rules, because one of them hands the root to docs-check: the chain to validate is
// the one in the repo the harness is editing, which is what the event's root answers, and not
// whichever checkout this file happens to sit in.
const { root, paths } = lib.event();

// A lock that is not JSON vouches for nothing, so the skill is treated as local; the invariants
// report the lock itself.
const vendored = name => { try { return !!(skills.readRoster(root).lock || {})[name]; } catch { return false; } };

const rules = [
    {   // Vendored skills (recorded in skills-lock.json) must not be edited in place; local skills may be.
        when: /^(?:\.agents|\.claude)\/skills\/([^/]+)\/./,
        check: (file, m) => vendored(m[1])
            && `${file} belongs to the vendored skill '${m[1]}': npx skills update will overwrite it. Change it upstream, or copy it to a new local skill under .agents/skills/<other-name>/.`,
    },
    {
        when: /\.(?:js|mjs|cjs)$/,
        check: file => { const r = lib.node(["--check", file]); return r.status !== 0 && `JavaScript syntax error in ${file}: ${r.output}`; },
    },
    {
        when: /\.json$/,
        check: file => { try { JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return `invalid JSON in ${file}: ${e.message}`; } },
    },
    {   // The chain, by docs-check's own membership rule, which the pre-commit hook asks too: Markdown
        // under docs/, the AGENTS.md table, MEMORY.md's Requirements line and INTENT.md.
        when: docsCheck.inChain,
        check: () => { const r = docsCheck.check(root); return r.problems.length > 0 && `documentation chain check failed (see AGENTS.md, Documentation; fix with the docs-check skill):\n${r.problems.join("\n")}`; },
    },
    {   // The links, the skills folder, the routing, the Git hooks: facts every repo with the harness
        // must keep, checked in whichever repo root() names. check-harness owns the path list, so a
        // new invariant brings its own trigger.
        when: file => harness.reads(file) && [file],
        check: file => { const r = harness.check(root); return r.failed.length > 0 && `harness invariants failed after editing ${file}:\n${harness.format(r)}`; },
    },
    {   // The harness code itself changed: the suite must still pass (HOOK_TEST stops recursion).
        // The suite is the upstream's own, and a target has the hooks without the fixtures that
        // prove them. There is nothing to run there, which is not a failure: reporting one would
        // block every edit to a harness file in every target. The invariants above still run there.
        when: /^(?:\.agents\/hooks\/.+|\.githooks\/.+|scripts\/[^/]+\.(?:js|tsv))$/,
        check: file => {
            if (process.env.HOOK_TEST || !fs.existsSync(".agents/hooks/test.js")) return false;
            const r = lib.node([".agents/hooks/test.js"]);
            return r.status !== 0 && `hook tests failed after editing ${file}:\n${r.output}`;
        },
    },
];

// A shell call routed here by an over-wide matcher, or an edit outside the repo: nothing of ours.
if (!paths.length) lib.warn("no path inside this repo in the payload; nothing to check");
process.chdir(root);
let status = 0;
for (const file of paths) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    for (const rule of rules) {
        const m = typeof rule.when === "function" ? rule.when(file) : file.match(rule.when);
        if (!m) continue;
        const msg = rule.check(file, m);
        if (msg) { process.stderr.write(msg + "\n"); status = 2; break; }
    }
}
process.exit(status);
