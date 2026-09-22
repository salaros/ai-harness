#!/usr/bin/env node
// scripts/githooks-init.js
// Points Git at the committed hooks in .githooks/ (core.hooksPath), so this clone runs them and
// picks up every change to them on pull; nothing is copied. Run once per clone.
// It also repairs the one mode that matters. Git runs a hook only when it is executable and says
// nothing when it is not, so a hook recorded 100644 gates nothing while looking installed. On
// Windows core.fileMode is false, which means `chmod` does nothing and any `git add` restages the
// file 100644 -- so a harness installed there, or a hook edited there, loses the bit silently and
// the loss reaches everyone else on the next push. Setting it here makes every clone self-healing,
// and the harness suite fails on the mode if this was never run.
// Usage: node scripts/githooks-init.js
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const lib = require("./lib");
const repoView = require("./repo-view");
const { HOOKS } = require("./githook");

lib.chdirRoot();
const r = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status === null ? 1 : r.status);

// Only the hooks githook.js runs: .githooks/ may hold a project's own files beside them, such as
// Husky.Net's task-runner.json, and marking a data file executable stages a change nobody asked for.
const runs = name => Object.hasOwn(HOOKS, path.posix.basename(name));
const hooks = fs.readdirSync(".githooks").filter(runs);
const wrong = (repoView.indexModes(process.cwd(), [".githooks"]) || []).filter(r => !r.exec && runs(r.file)).map(r => r.file);
for (const file of wrong) {
    try { fs.chmodSync(file, 0o755); } catch { /* the filesystem does not do modes */ }
    lib.run("git", ["update-index", "--chmod=+x", "--", file]);
}

console.log(`Git hooks: core.hooksPath = .githooks (${hooks.join(" ")})`);
if (wrong.length) console.log(`marked executable in the index, stage the change: ${wrong.join(" ")}`);
