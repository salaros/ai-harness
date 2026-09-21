// .agents/hooks/lib.js
// The harness-specific layer on top of scripts/lib.js: the one place that knows how a harness
// hands a hook its payload. Process running and TSV reading are general-purpose and live in
// scripts/lib.js instead, so scripts/ never has to reach into this folder to get them.
//   const lib = require("./lib");
//   const { root, paths, command, raw } = lib.event();   // stdin, read once and normalised
//   lib.root()                                          // the repo root, for a hook that reads no stdin
//   lib.node(["scripts/skills.js", "missing"])          // run a script with this node; { status, output }
// The event:
//   root     scripts/lib.js's root(), the one precedence every entry point follows -- --root=<dir>,
//            then the harness's project-dir variable, then the checkout these hooks live in.
//   paths    the edited files, repo-relative with forward slashes; a path outside the root is dropped.
//   command  the shell command text. When the payload is in no shape below, every string in it,
//            one per line, so a guard scanning it fails safe rather than open; when it is not JSON
//            at all, the raw text.
//   raw      stdin as it arrived.
// Shapes: tool_input.<key> (Claude Code, Gemini CLI), <key> at the top level (Cursor), or
// toolArgs.<key> with toolArgs a JSON string (Copilot). An unreadable or unrecognised payload is
// said on stderr and never thrown: a hook that cannot read its input fails open.
const path = require("path");
const scripts = require("../../scripts/lib");

const { fix } = scripts;
const checkout = scripts.CHECKOUT;
const warn = msg => process.stderr.write(`hook: ${msg}\n`);

const parse = text => { try { return JSON.parse(text); } catch { return undefined; } };

// Where each field sits in the three shapes: the keys under tool_input that count, the key at the
// top level, and the key inside toolArgs.
const FIELDS = {
    command: { tiKeys: ["command"], topKey: "command", taKey: "command" },
    path: { tiKeys: ["file_path", "notebook_path", "path", "filePath"], topKey: "file_path", taKey: "path" },
};

// The values of one field, in the order the shapes are listed above.
function field(j, { tiKeys, topKey, taKey }) {
    const found = [];
    const ti = j.tool_input;
    if (ti && typeof ti === "object") for (const k of tiKeys) if (typeof ti[k] === "string") found.push(ti[k]);
    if (typeof j[topKey] === "string") found.push(j[topKey]);
    const ta = typeof j.toolArgs === "string" ? parse(j.toolArgs) : j.toolArgs;
    if (ta && typeof ta === "object" && typeof ta[taKey] === "string") found.push(ta[taKey]);
    return found;
}

// Every string in a value, depth first. A string that is itself a JSON object or array, the way
// Copilot sends toolArgs, is walked rather than taken whole, so what comes back is text a command
// could be, never JSON syntax around it.
function strings(v, out = []) {
    if (typeof v === "string") {
        const nested = /^\s*[[{]/.test(v) ? parse(v) : undefined;
        if (nested && typeof nested === "object") strings(nested, out); else out.push(v);
    } else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
    return out;
}

// The event a payload describes, against the repo at `root`. `say` receives each note an event
// read the hard way leaves; event() hands it warn, and a test hands it a list.
function readEvent(raw, root, say = warn) {
    const j = parse(raw);
    if (j === undefined) {
        say(`payload is not JSON (${raw.length} bytes); scanning it as text`);
        return { root, paths: [], command: raw, raw };
    }
    const obj = j && typeof j === "object" && !Array.isArray(j) ? j : {};
    const commands = field(obj, FIELDS.command), found = field(obj, FIELDS.path);
    if (!commands.length && !found.length) {
        const what = obj === j ? `keys: ${Object.keys(j).join(", ") || "none"}` : `a JSON ${Array.isArray(j) ? "array" : j === null ? "null" : typeof j}`;
        say(`payload is in no shape this harness knows (${what}); scanning every string in it`);
        return { root, paths: [], command: strings(j).join("\n"), raw };
    }
    const paths = new Set();
    for (const p of found) {
        const rel = path.relative(root, path.resolve(root, fix(p)));
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) continue;   // outside the repo
        paths.add(rel.split(path.sep).join("/"));
    }
    return { root, paths: [...paths], command: commands.join("\n"), raw };
}

// stdin is a pipe and reads once, so a hook asks for its event once.
const event = () => readEvent(scripts.stdin(), scripts.root());

// scripts/lib.js first, so what this file defines wins where the two names meet.
module.exports = { ...scripts, checkout, warn, event, readEvent };
