// .agents/hooks/tests/tables/todo.js
// scripts/check-todo.js's decisions: the todo-md shape TODO.md is held to, and the source rule it
// shares with a Derived from line.
const path = require("path");
const lib = require("../../lib");
const todo = require("../../../../scripts/check-todo");
const { withRoot, text } = require("../fixtures");

// A ledger's verdict: blocked with a problem containing `blocks`, or accepted with a summary
// containing `summary`. Sources that look like paths resolve against the root each row is given.
exports.todoDecisions = function todoDecisions(t) {
    const REPO = { "AGENTS.md": "# Agents\n", "scripts/githooks-init.js": "// init\n", "src/billing.cs": "// there\n" };
    const rows = [
        // ledger, blocks, summary, why
        [text("# TODO", "", "What has nowhere else to live. The loose-ends skill has the format.", "",
            "- [ ] Does the initialisation gate belong on push as well? #question (AGENTS.md)",
            "- [ ] Every clone has run githooks-init #assumption @yaroslav (scripts/githooks-init.js:1)",
            "- [ ] No test covers the relink path #deferred (jira:AB-42)",
            "  - [ ] and the absolute-link case under it is untested too",
            "- [ ] Revisit once the spec settles #deferred (https://example.com/spec)"),
            null, "all well formed", "every tag, a subtask, an assignee and each kind of source all pass"],
        [text("- [ ] An entry with no file header #question (AGENTS.md)"), 'must open with "# TODO"', null,
            "todo-md requires the header, so a file of bare entries is rejected"],
        [text("# TODO", "", "- [ ] Something vague #todo (AGENTS.md)"), "unknown tag", null, "a tag outside the three kinds is rejected"],
        [text("# TODO", "", "- [x] This one was answered #question (AGENTS.md)"), 'a "[x]" entry', null, "a resolved entry is deleted, not ticked"],
        [text("# TODO", "", "- [-] We decided against this #deferred (AGENTS.md)"), 'a "[-]" entry', null,
            "a declined entry is deleted too, though todo-md would keep it"],
        [text("# TODO", "", "- [ ] Where should this live? #question"), "no source", null,
            "an entry that says nothing about where it came from is rejected"],
        [text("# TODO", "", "- [ ] Where should this live? #question (during the review)"), "is not a source", null,
            "prose in place of a source is rejected"],
        [text("# TODO", "", "Nothing outstanding right now."), null, "0 open item(s)", "a file with the header and no entries passes"],
        ["", null, "nothing to check", "an empty ledger is not a problem"],
        [text("# TODO", "", "- [ ] Confirm the rounding rule #question (src/billing.cs:12)"), null, "1 open item(s)",
            "a path:line source resolves in the root it was given"],
        // As a command, the root is always this checkout, so a fixture could only cite a file the
        // template happens to ship; this is the row that proves the resolution rather than assuming it.
        [text("# TODO", "", "- [ ] Confirm the rounding rule #question (scripts/lib.js)"), "is not a source", null,
            "a path outside that root is not a source, however real it is here"],
        [text("# TODO", "", "- [ ] Split the billing folder #deferred (src)"), "is not a source", null,
            "a bare folder name is prose, as it is in a Derived from line"],
        [text("# TODO", "", "- [ ] Split the billing folder #deferred (src/)"), null, "1 open item(s)",
            "a folder written with its slash is a source"],
        [text("# TODO", "", "- [ ] Chase the ticket #deferred (jira:ab-42)"), "is not a source", null,
            "a lower-case Jira key is rejected, as docs-check rejects it"],
    ];
    for (const [ledger, blocks, summary, why] of rows) {
        const r = withRoot(REPO, root => todo.check(ledger, root));
        const verdict = blocks ? r.problems.some(p => p.includes(blocks)) : !r.problems.length && r.summary.includes(summary);
        t.ok(verdict, `check-todo: ${why}`, r.problems.join("\n") || r.summary);
    }
};

// The command's inputs: the root's TODO.md by default, stdin only with "-", and a given path that is
// not there is an error. The old default of stdin exited 0 here on the closed stdin spawnSync hands it.
exports.todoCommandInput = function todoCommandInput(t) {
    const script = path.join(lib.checkout, "scripts", "check-todo.js");
    const bad = text("- [ ] An entry with no file header #question (AGENTS.md)");
    withRoot({ "AGENTS.md": "# Agents\n", "TODO.md": bad }, root => {
        const flag = `${lib.ROOT_FLAG}${root}`;
        const plain = lib.node([script, flag], { cwd: root });
        t.ok(plain.status === 1 && plain.output.includes('must open with "# TODO"'),
            "check-todo: with no argument it checks the root's TODO.md, not stdin", plain.output);
        const piped = lib.node([script, "-", flag], { cwd: root, input: text("# TODO", "", "- [ ] Piped in #question (AGENTS.md)") });
        t.ok(piped.status === 0 && piped.output.includes("1 open item(s)"), 'check-todo: "-" reads stdin', piped.output);
        const typo = lib.node([script, "TOOD.md", flag], { cwd: root });
        t.ok(typo.status === 2 && typo.output.includes("no such file"), "check-todo: a path given that is not there fails", typo.output);
    });
};
