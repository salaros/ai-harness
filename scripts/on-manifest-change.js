#!/usr/bin/env node
// scripts/on-manifest-change.js
// Reads changed file paths on stdin (one per line, repo-relative) and runs the restore command of
// every row in scripts/stacks.tsv whose trigger patterns match one of them, provided the row's
// "needs" file exists at the repo root. The post-merge Git hook pipes `git diff-tree` output into
// it; the harness suite pipes fixtures with --dry-run.
// Usage: node scripts/on-manifest-change.js [--dry-run] < changed-paths
//   --dry-run  print "would run: <command>" per matching row instead of running it
const lib = require("./lib");
const stacks = require("./stacks");

const root = lib.chdirRoot();
const dry = process.argv.includes("--dry-run");
const changed = lib.stdin().split(/\r?\n/).filter(Boolean);
if (!changed.length) { if (dry) console.log("nothing to restore"); process.exit(0); }

let status = 0, ran = false;
// active() drops the rows whose "needs" file is absent, so a stack that is not really here restores
// nothing; the pattern matcher is the table's own, shared with the format check.
for (const { stack, triggers, restore } of stacks.active(root)) {
    if (!restore || !stacks.matches(triggers, changed)) continue;
    ran = true;
    if (dry) { console.log(`would run: ${restore} (${stack})`); continue; }
    console.log(`${stack} manifests changed: running ${restore}`);
    const r = lib.shell(restore, { stdio: "inherit" });
    if (r.status !== 0) { console.error(`${restore} failed`); status = 1; }
}
if (!ran && dry) console.log("nothing to restore");
process.exit(status);
