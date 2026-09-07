// .agents/hooks/lib.js
// The harness-specific layer on top of scripts/lib.js: the one place that knows how a harness
// hands a hook its payload and where the repo root is. Process running and TSV reading are
// general-purpose and live in scripts/lib.js instead, so scripts/ never has to reach into this
// folder to get them.
//   const lib = require("./lib");
//   const root = lib.root();                 // repo root (see below)
//   const payload = lib.payload();           // stdin parsed as JSON, or null (warned on stderr)
//   const files = lib.filePaths(payload, root); // edited file(s), repo-relative, forward slashes
//   const cmd = lib.commandText(payload)     // the shell command text, or "" if the shape is unknown
//   lib.node(["scripts/skills.js", "missing"]) // run a script with this node; { status, output }
//   lib.readTsv("scripts/stacks.tsv")        // rows as arrays of cells; blank and # lines skipped
// Root: CLAUDE_PROJECT_DIR, CURSOR_PROJECT_DIR or GEMINI_PROJECT_DIR when set, else the checkout
// these hooks live in; a variable naming another checkout is used and reported on stderr.
// Paths: tool_input.file_path (Claude Code, Gemini CLI), file_path at the top level (Cursor
// afterFileEdit) or toolArgs.path with toolArgs a JSON string (Copilot). A path outside the root
// is dropped. Fails open: an unreadable payload yields null and says why on stderr.
const fs = require("fs");
const path = require("path");
const scripts = require("../../scripts/lib");

const win = process.platform === "win32";
const checkout = path.resolve(__dirname, "..", "..");
const warn = msg => process.stderr.write(`hook: ${msg}\n`);
const same = (a, b) => win ? a.toLowerCase() === b.toLowerCase() : a === b;

// Git Bash reports C:\x as /c/x; Windows APIs may prefix \\?\. Bring both to a form path can resolve.
const fix = p => {
    let s = String(p).replace(/^\\\\\?\\/, "");
    if (win) { const m = s.match(/^\/([a-zA-Z])(?:\/(.*))?$/); if (m) s = `${m[1].toUpperCase()}:/${m[2] || ""}`; }
    return s;
};
const real = p => { try { return fs.realpathSync(p); } catch { return p; } };

// The project-dir variables a harness may set to say where the repo root is. root() checks these,
// in order; test.js clears them before running a fixture, so a variable set on the developer's own
// machine can't leak into a case that expects the checkout's own root.
const ROOT_ENV_VARS = ["CLAUDE_PROJECT_DIR", "CURSOR_PROJECT_DIR", "GEMINI_PROJECT_DIR"];

function root() {
    const here = real(checkout);
    for (const v of ROOT_ENV_VARS) {
        const val = process.env[v];
        if (!val) continue;
        const dir = path.resolve(fix(val));
        let st; try { st = fs.statSync(dir); } catch { }
        if (!st || !st.isDirectory()) { warn(`${v} is not a directory; using the checkout these hooks live in`); break; }
        if (!same(real(dir), here)) warn(`${v} (${dir}) is not the checkout these hooks live in (${here}); using ${v}`);
        return dir;
    }
    return here;
}

function payload() {
    const raw = scripts.stdin();
    let j;
    try { j = JSON.parse(raw); } catch { warn(`payload is not JSON (${raw.length} bytes)`); return null; }
    if (!j || typeof j !== "object") { warn("payload is not a JSON object"); return null; }
    return j;
}

// The one place that knows the three shapes a harness nests a field in: tool_input (Claude Code,
// Gemini CLI; tiKeys lists which keys under it count), the top level (Cursor) or toolArgs, a JSON
// string, under taKey (Copilot). Returns the values found, in that priority order; a caller with
// nothing decides for itself what "nothing" means and how to say so.
function payloadField(j, { tiKeys, topKey, taKey }) {
    const found = [];
    const ti = j.tool_input;
    if (ti && typeof ti === "object") for (const k of tiKeys) if (typeof ti[k] === "string") found.push(ti[k]);
    if (typeof j[topKey] === "string") found.push(j[topKey]);
    let ta = j.toolArgs;
    if (typeof ta === "string") { try { ta = JSON.parse(ta); } catch { ta = null; } }
    if (ta && typeof ta === "object" && typeof ta[taKey] === "string") found.push(ta[taKey]);
    return found;
}

function filePaths(j, rootDir) {
    if (!j) return [];
    const found = payloadField(j, { tiKeys: ["file_path", "notebook_path", "path", "filePath"], topKey: "file_path", taKey: "path" });
    if (!found.length) { warn(`no file path in payload (keys: ${Object.keys(j).join(", ") || "none"})`); return []; }
    const out = new Set();
    for (const p of found) {
        const rel = path.relative(rootDir, path.resolve(rootDir, fix(p)));
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue;   // outside the repo
        out.add(rel.split(path.sep).join("/"));
    }
    return [...out];
}

// The shell command text a pre-tool-use payload carries: tool_input.command (Claude Code, Gemini
// CLI), command at the top level (Cursor beforeShellExecution) or toolArgs.command where toolArgs
// is a JSON string (Copilot). Returns "" (and warns) when the shape is unrecognised, so a caller
// that only wants to inspect the real command text can fall back to the raw payload for safety.
function commandText(j) {
    if (!j) return "";
    const found = payloadField(j, { tiKeys: ["command"], topKey: "command", taKey: "command" });
    if (!found.length) { warn(`no command text in payload (keys: ${Object.keys(j).join(", ") || "none"})`); return ""; }
    return found.join("\n");
}

// scripts/lib.js first, so what this file defines wins where the two names meet: scripts/lib.js
// resolves the root from its own location, and a hook must honour the harness's project-dir
// variable instead.
module.exports = { ...scripts, checkout, warn, fix, root, ROOT_ENV_VARS, payload, filePaths, commandText };
