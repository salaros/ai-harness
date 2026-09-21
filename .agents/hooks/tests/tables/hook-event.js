// .agents/hooks/tests/tables/hook-event.js
// .agents/hooks/lib.js's readEvent: what every hook sees of a payload, whichever harness sent it.
// The end-to-end fixtures in cases.tsv prove the hooks run; these rows pin the shapes, so a new
// harness is a row here rather than a JSON file and a case line.
const os = require("os");
const path = require("path");
const lib = require("../../lib");

// A root the rows resolve against. Never touched on disk: readEvent's path handling is lexical.
const ROOT = path.resolve(os.tmpdir(), "harness-event-root");
const at = rel => `${ROOT}/${rel}`;

function hookEventDecisions(t) {
    const copilot = args => ({ toolName: "edit", toolArgs: JSON.stringify(args) });
    const rows = [
        // payload (an object is sent as JSON, a string as it is), paths, command, note, why
        [{ tool_name: "Edit", tool_input: { file_path: at("src/a.js") } }, ["src/a.js"], "", null,
            "Claude Code: tool_input.file_path, absolute"],
        [{ tool_name: "Edit", tool_input: { file_path: "src/a.js" } }, ["src/a.js"], "", null,
            "a repo-relative path resolves against the root"],
        [{ tool_name: "NotebookEdit", tool_input: { notebook_path: at("nb.ipynb") } }, ["nb.ipynb"], "", null,
            "a notebook edit names its file as notebook_path"],
        [{ tool_input: { filePath: at("docs/x.md") } }, ["docs/x.md"], "", null, "filePath under tool_input counts too"],
        [{ hook_event_name: "afterFileEdit", file_path: at("src/a.js"), edits: [] }, ["src/a.js"], "", null,
            "Cursor: file_path at the top level"],
        [copilot({ path: at("src/a.js") }), ["src/a.js"], "", null, "Copilot: toolArgs is a JSON string holding path"],
        [{ tool_input: { file_path: at("../elsewhere.md") } }, [], "", null,
            "a path outside the root is dropped, and the payload was still read"],
        [{ tool_input: { file_path: at("src/a.js"), path: "src/a.js" } }, ["src/a.js"], "", null,
            "one file named twice is one path"],
        [{ tool_name: "Bash", tool_input: { command: "git status", description: "rm -rf ~" } }, [], "git status", null,
            "Claude Code: tool_input.command, and no other field"],
        [{ hook_event_name: "beforeShellExecution", command: "ls" }, [], "ls", null, "Cursor: command at the top level"],
        [{ toolName: "bash", toolArgs: JSON.stringify({ command: "git push --force" }) }, [], "git push --force", null,
            "Copilot: toolArgs is a JSON string holding command"],
        [{ tool: "shell", args: { cmd: "git push --force" } }, [], "shell\ngit push --force", "no shape this harness knows",
            "an unknown shape hands over every string in it, one per line"],
        [{ toolArgs: JSON.stringify({ cmd: "rm -rf /" }) }, [], "rm -rf /", "no shape this harness knows",
            "a JSON string inside an unknown shape is walked, not taken whole"],
        [["git push --force"], [], "git push --force", "a JSON array", "an array is an unknown shape too"],
        ["null", [], "", "a JSON null", "null is an unknown shape with nothing to scan"],
        [{}, [], "", "keys: none", "an empty payload is an unknown shape with nothing to scan"],
        ["git push --force", [], "git push --force", "not JSON", "a payload that is not JSON is scanned as text"],
    ];
    for (const [payload, paths, command, note, why] of rows) {
        const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
        const notes = [];
        const e = lib.readEvent(raw, ROOT, msg => notes.push(msg));
        const got = { paths: e.paths, command: e.command, notes };
        const ok = e.paths.join("|") === paths.join("|") && e.command === command
            && (note ? notes.length === 1 && notes[0].includes(note) : notes.length === 0)
            && e.raw === raw && e.root === ROOT;
        t.ok(ok, `hook event: ${why}`, `${raw}\n-> ${JSON.stringify(got)}`);
    }
}

module.exports = [
    hookEventDecisions,
];
