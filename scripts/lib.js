// scripts/lib.js
// Small process and table-reading helpers shared by scripts and, through .agents/hooks/lib.js, by
// the hooks. Nothing here knows about a harness's hook payload; that lives in .agents/hooks/lib.js,
// which requires this file rather than the other way around, so scripts/ never reaches into the
// harness-specific folder.
//   const lib = require("./lib");
//   const root = lib.root();                 // the repo root: --root=<dir> if given, else one level above this file
//   const root = lib.chdirRoot();            // the same, and cd there
//   const [cmd, ...rest] = lib.args();       // the command line, without --root=<dir>
//   lib.stdin()                              // everything on stdin, or "" if there is none
//   lib.node(["scripts/skills.js", "missing"]) // run a script with this node; { status, output }
//   lib.shell("npm install")                 // run a command through the OS shell
//   lib.readTsv("scripts/stacks.tsv")        // rows as arrays of cells; blank and # lines skipped
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Every script under scripts/ resolves the repo root once, on its command line, and a script run as
// a command chdirs there so its relative paths (SKILL.md files, README.md, stacks.tsv) work no matter
// where it was invoked from. A script another script requires takes the root as an argument and
// resolves against it: chdir is a process-wide effect, so a library that moves the working directory
// moves it for its caller too.
// The root is the repo this file sits in, unless the command was given --root=<dir>. That flag is
// how a check reaches a repo other than its own checkout: the suite points a case at a throwaway
// directory rather than planting files in the tree it runs in, and the installer checks a target
// with the upstream's copy of a script. One token, so an argument parser that skips "--" flags skips
// it too.
const ROOT_FLAG = "--root=";
const root = () => {
    const given = process.argv.slice(2).find(a => a.startsWith(ROOT_FLAG));
    return path.resolve(given ? given.slice(ROOT_FLAG.length) : path.join(__dirname, ".."));
};
const args = () => process.argv.slice(2).filter(a => !a.startsWith(ROOT_FLAG));

function chdirRoot() {
    const dir = root();
    process.chdir(dir);
    return dir;
}

function stdin() { try { return fs.readFileSync(0, "utf8"); } catch { return ""; } }

// Runs a command; output is stdout and stderr combined, status is the exit code (-1 if it could not start).
function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
    const output = ((r.stdout || "") + (r.stderr || "")).replace(/\s+$/, "");
    return { status: r.status === null ? -1 : r.status, output: r.error ? `${r.error.message}${output ? "\n" + output : ""}` : output };
}
const node = (args, opts) => run(process.execPath, args, opts);
const shell = (cmd, opts) => run(cmd, [], { shell: true, ...opts });

function readTsv(file) {
    return fs.readFileSync(file, "utf8").split(/\r?\n/)
        .filter(l => l.trim() && !l.startsWith("#"))
        .map(l => l.split("\t"));
}

module.exports = { root, args, ROOT_FLAG, chdirRoot, stdin, run, node, shell, readTsv };
