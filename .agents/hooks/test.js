#!/usr/bin/env node
// .agents/hooks/test.js
// Runs the harness suite. Every line of tests/cases.tsv is six tab-separated columns:
//   <script and args> <fixture> <expected exit> <setup> <expected output> <note>
// The script is relative to the repo root and run with node; the fixture is piped to it as stdin
// with __ROOT__ replaced by the root the case runs against; setup is "-", "plant <path> <first
// line>" or "absent <path>"; expected output is "-" or a substring that the combined stdout and
// stderr must contain. Afterward runs tests/self-checks.js and the decision tables under
// tests/tables/, one file per module, for checks that do not fit that shape (add a new one there,
// not as a block below).
// A case with no setup runs against this checkout. A case with one runs against a temp root instead,
// seeded with the two files the scripts read from any root (AGENTS.md for the chain table,
// scripts/stacks.tsv for the stacks) plus whatever it plants, and removed afterwards: a plant written
// into this checkout would, in an installed repo, overwrite the project's own TODO.md or lock file.
// Every entry point is pointed at that root the same way, with --root: scripts and hooks share one
// resolver, so the runner no longer has to know which rule the script it is running follows.
// A self check is handed `t`, which has two methods: t.ok(condition, title, detail) for a verdict,
// and t.skip(why) for a check this repo cannot run -- an optional folder it did not install, a
// tarball that is not a git checkout. Prints one FAIL line per mismatch and one SKIP line per
// check that stood down, then the tally, and exits 1 if anything failed.
// Usage: node .agents/hooks/test.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("./lib");
const scriptsLib = require("../../scripts/lib");
const selfChecks = require("./tests/self-checks");
const tables = require("./tests/tables");

const root = lib.checkout;
process.chdir(root);
const env = { ...process.env, HOOK_TEST: "1" };
for (const v of lib.ROOT_ENV_VARS) delete env[v];
const slashes = p => p.split(path.sep).join("/");

const SEED = ["AGENTS.md", "scripts/stacks.tsv"];
let temp = null;
const tempRoot = () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "harness-case-"));
    for (const file of SEED) {
        fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
        fs.copyFileSync(file, path.join(temp, file));
    }
    return temp;
};
const cleanup = () => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); temp = null; };
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
    const args = script.split(" ");
    let caseRoot = root;
    if (setup !== "-") {
        caseRoot = tempRoot();
        const [kind, file, ...firstLine] = setup.split(" ");
        if (kind === "plant") {
            fs.mkdirSync(path.dirname(path.join(caseRoot, file)), { recursive: true });
            fs.writeFileSync(path.join(caseRoot, file), firstLine.join(" ") + "\n");
        } else if (kind === "absent") {
            fs.rmSync(path.join(caseRoot, file), { force: true });
        } else {
            failed(`${script} < ${fixture}: unknown setup "${setup}" (${note})`);
            cleanup();
            continue;
        }
        args.push(`${scriptsLib.ROOT_FLAG}${caseRoot}`);
    }
    const input = fs.readFileSync(path.join(".agents/hooks/tests", fixture), "utf8").split("__ROOT__").join(slashes(caseRoot));
    const { status, output } = lib.node(args, { input, env });
    cleanup();
    const ok = String(status) === expect && (want === "-" || output.includes(want));
    if (ok) pass++;
    else failed(`${script} < ${fixture}: exit ${status}, expected ${expect}, output must contain "${want}" (${note})`, output);
}

for (const check of [...selfChecks, ...tables]) check(t, env);

for (const why of skipped) console.log(`SKIP ${why}`);
console.log(`harness tests: ${pass} passed, ${fail} failed${skipped.length ? `, ${skipped.length} skipped` : ""}`);
process.exit(fail ? 1 : 0);
