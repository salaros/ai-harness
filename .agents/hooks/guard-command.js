#!/usr/bin/env node
// .agents/hooks/guard-command.js
// Refuses destructive shell commands before the harness runs them. Takes the command text from
// lib.event(), which finds it in whatever shape the harness sent and, for a shape it does not know,
// hands over every string in the payload instead, so an unfamiliar harness is scanned rather than
// waved through. Each rule matches only where it could be a real invocation: at the start of the
// text or right after a shell operator (&&, ||, ;, |, a newline or an open paren). A dangerous
// phrase quoted as data inside another command's own arguments (`printf '...git push --force...'`)
// sits after none of those and is not matched; text in an unrelated payload field never reaches the
// match at all.
// Always runs: the hook launcher require()s this file rather than running it as node's main module,
// so a require.main guard would never fire and the hook would allow everything.
// Exit 2 = block, reason on stderr. Exit 0 = allow.
// Wire it to the pre-tool-use event of the shell tool (.agents/README.md, "Files per AI tool").
const lib = require("./lib");

// A token ends at a space or the end of a line: the text is a command, never the JSON around one.
const end = String.raw`( |$)`;
const boundary = String.raw`(?:^|&&|\|\||;|\||\n|\()\s*`;
// The rest of one simple command: up to the next operator, so a flag after && belongs to the next.
const rest = String.raw`[^;&|\n]*`;
const rules = [
    [new RegExp(boundary + String.raw`git push` + rest + String.raw` (-f|--force)` + end, "m"), "force push (use --force-with-lease, and never on master/main)"],
    [new RegExp(boundary + String.raw`git (reset --hard|checkout -- \.|clean -[a-zA-Z]*f)`, "m"), "it discards uncommitted work"],
    [new RegExp(boundary + String.raw`git branch -D`, "m"), "it force-deletes a branch"],
    [new RegExp(boundary + String.raw`rm -[a-zA-Z]*[rR][a-zA-Z]* +(/|~|\$HOME|\.git|\*)` + end, "m"), "recursive delete of a root, home, .git or wildcard path"],
];

const { command } = lib.event();
for (const [re, why] of rules) {
    if (!re.test(command)) continue;
    process.stderr.write(`guard-command.js blocked this command: ${why}. If it is really needed, ask the user to run it.\n`);
    process.exit(2);
}
process.exit(0);
