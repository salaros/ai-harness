#!/usr/bin/env node
// .agents/hooks/test.js
// Runs the harness suite. Every line of tests/cases.tsv is six tab-separated columns:
//   <script and args> <fixture> <expected exit> <setup> <expected output> <note>
// The script is relative to the repo root and run with node; the fixture is piped to it as stdin
// with __ROOT__ replaced by this checkout; setup is "-" or "plant <path> <first line>", a file
// that exists only while that case runs; expected output is "-" or a substring that the combined
// stdout and stderr must contain. Afterward runs tests/self-checks.js, for invariants that don't
// fit that shape (add a new one there, not as a block below).
// A self check is handed `t`, which has two methods: t.ok(condition, title, detail) for a verdict,
// and t.skip(why) for a check this repo cannot run -- an optional folder it did not install, a
// tarball that is not a git checkout. Prints one FAIL line per mismatch and one SKIP line per
// check that stood down, then the tally, and exits 1 if anything failed.
// Usage: node .agents/hooks/test.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const selfChecks = require("./tests/self-checks");

const root = lib.checkout;
process.chdir(root);
const env = { ...process.env, HOOK_TEST: "1" };
for (const v of lib.ROOT_ENV_VARS) delete env[v];
const rootForFixtures = root.split(path.sep).join("/");

let planted = null;
const plant = (file, ...firstLine) => {
    planted = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, firstLine.join(" ") + "\n");
};
const cleanup = () => {
    if (!planted) return;
    try { fs.unlinkSync(planted); } catch { }
    try { fs.rmdirSync(path.dirname(planted)); } catch { }   // only when the case created it
    planted = null;
};
process.on("exit", cleanup);

let pass = 0, fail = 0;
const skipped = [];
const failed = (title, out) => { fail++; console.log(`FAIL ${title}`); if (out) console.log(out.replace(/^/gm, "    ")); };
// Two methods, and a check that cannot run says so with the second. A skip counted as neither pass
// nor fail leaves "N passed, 0 failed" reading exactly the same whether the check ran or quietly
// gave up, which is how five of these went unnoticed in an installed repo.
const t = {
    ok: (condition, title, detail) => condition ? pass++ : failed(title, detail),
    skip: why => skipped.push(why),
};

for (const [script, fixture, expect, setup, want, note] of lib.readTsv(".agents/hooks/tests/cases.tsv")) {
    if (setup.startsWith("plant ")) plant(...setup.split(" ").slice(1));
    const input = fs.readFileSync(path.join(".agents/hooks/tests", fixture), "utf8").split("__ROOT__").join(rootForFixtures);
    const { status, output } = lib.node(script.split(" "), { input, env });
    cleanup();
    const ok = String(status) === expect && (want === "-" || output.includes(want));
    if (ok) pass++;
    else failed(`${script} < ${fixture}: exit ${status}, expected ${expect}, output must contain "${want}" (${note})`, output);
}

for (const check of selfChecks) check(t, env);

for (const why of skipped) console.log(`SKIP ${why}`);
console.log(`harness tests: ${pass} passed, ${fail} failed${skipped.length ? `, ${skipped.length} skipped` : ""}`);
process.exit(fail ? 1 : 0);
