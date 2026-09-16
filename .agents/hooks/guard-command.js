#!/usr/bin/env node
// .agents/hooks/guard-command.js
// Refuses destructive shell commands before the harness runs them. Reads the harness's hook
// payload from stdin, takes the actual command text via lib.commandText (falling back to the raw
// payload only when the shape is unrecognised), and matches each rule only where it could be a
// real invocation: at the start of the text or right after a shell operator (&&, ||, ;, |, a
// newline or an open paren). A dangerous phrase quoted as data inside another command's own
// arguments (`printf '...git push --force...'`) sits after none of those and is not matched;
// text in an unrelated payload field never reaches the match at all.
// Exit 2 = block, reason on stderr. Exit 0 = allow.
// Wire it to the pre-tool-use event of the shell tool (.agents/README.md, "Files per AI tool").
const lib = require("./lib");

// A token ends at a space, a JSON escape (backslash), the closing quote, or end of line.
const end = String.raw`( |\\|"|$)`;
const boundary = String.raw`(?:^|&&|\|\||;|\||\n|\()\s*`;
const rules = [
    [new RegExp(boundary + String.raw`git push[^"]* (-f|--force)` + end, "m"), "force push (use --force-with-lease, and never on master/main)"],
    [new RegExp(boundary + String.raw`git (reset --hard|checkout -- \.|clean -[a-zA-Z]*f)`, "m"), "it discards uncommitted work"],
    [new RegExp(boundary + String.raw`git branch -D`, "m"), "it force-deletes a branch"],
    [new RegExp(boundary + String.raw`rm -[a-zA-Z]*[rR][a-zA-Z]* +(/|~|\$HOME|\.git|\*)` + end, "m"), "recursive delete of a root, home, .git or wildcard path"],
];

const raw = lib.stdin();                          // read once: stdin is a pipe, not re-readable
let j = null;
try { j = JSON.parse(raw); } catch { }
const cmd = (j && typeof j === "object" && lib.commandText(j)) || raw;   // unrecognised shape: fail safe, scan everything
for (const [re, why] of rules) {
    if (!re.test(cmd)) continue;
    process.stderr.write(`guard-command.js blocked this command: ${why}. If it is really needed, ask the user to run it.\n`);
    process.exit(2);
}
process.exit(0);
