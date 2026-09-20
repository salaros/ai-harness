// scripts/lib.js
// Small process and table-reading helpers shared by scripts and, through .agents/hooks/lib.js, by
// the hooks. Nothing here knows about a harness's hook payload; that lives in .agents/hooks/lib.js,
// which requires this file rather than the other way around, so scripts/ never reaches into the
// harness-specific folder.
//   const lib = require("./lib");
//   const root = lib.root();                 // the repo root (precedence below)
//   const root = lib.chdirRoot();            // the same, and cd there
//   const [cmd, ...rest] = lib.args();       // the command line, without --root=<dir>
//   lib.stdin()                              // everything on stdin, or "" if there is none
//   lib.node(["scripts/skills.js", "missing"]) // run a script with this node; { status, output }
//   lib.shell("npm install")                 // run a command through the OS shell
//   lib.readTsv("scripts/stacks.tsv")        // rows as arrays of cells; blank and # lines skipped
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Which repo an entry point is about, in one precedence every script and hook follows:
//   1. --root=<dir> on the command line, the explicit answer
//   2. CLAUDE_PROJECT_DIR, CURSOR_PROJECT_DIR or GEMINI_PROJECT_DIR, the harness's answer
//   3. the checkout this file sits in
// The flag is how a check reaches a repo other than its own checkout: the suite points a case at a
// throwaway directory rather than planting files in the tree it runs in, and the installer checks a
// target with the upstream's copy of a script. One token, so an argument parser that skips "--"
// flags skips it too. The variables are how a harness says which project it is editing, which is
// not always the checkout a hook file sits in. A variable naming another checkout is honoured and
// reported on stderr; one naming nothing that exists is ignored and reported.
// A script run as a command chdirs to the root so its relative paths (SKILL.md files, README.md,
// stacks.tsv) work wherever it was invoked from. A script another script requires takes the root as
// an argument and resolves against it: chdir is a process-wide effect, so a library that moves the
// working directory moves it for its caller too.
const ROOT_FLAG = "--root=";
const ROOT_ENV_VARS = ["CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "GEMINI_PROJECT_DIR"];
const CHECKOUT = path.resolve(__dirname, "..");

const win = process.platform === "win32";
const warn = msg => process.stderr.write(`harness: ${msg}\n`);
const same = (a, b) => win ? a.toLowerCase() === b.toLowerCase() : a === b;
// Git Bash reports C:\x as /c/x; Windows APIs may prefix \\?\. Bring both to a form path can resolve.
const fix = p => {
    let s = String(p).replace(/^\\\\\?\\/, "");
    if (win) { const m = s.match(/^\/([a-zA-Z])(?:\/(.*))?$/); if (m) s = `${m[1].toUpperCase()}:/${m[2] || ""}`; }
    return s;
};
const real = p => { try { return fs.realpathSync(p); } catch { return p; } };

function root() {
    const given = process.argv.slice(2).find(a => a.startsWith(ROOT_FLAG));
    if (given) return path.resolve(fix(given.slice(ROOT_FLAG.length)));
    const here = real(CHECKOUT);
    for (const v of ROOT_ENV_VARS) {
        const val = process.env[v];
        if (!val) continue;
        const dir = path.resolve(fix(val));
        let st; try { st = fs.statSync(dir); } catch { }
        if (!st || !st.isDirectory()) { warn(`${v} is not a directory; using the checkout this file lives in`); break; }
        if (!same(real(dir), here)) warn(`${v} (${dir}) is not the checkout this file lives in (${here}); using ${v}`);
        return dir;
    }
    return here;
}
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

module.exports = { root, args, ROOT_FLAG, ROOT_ENV_VARS, CHECKOUT, chdirRoot, fix, warn, stdin, run, node, shell, readTsv };
