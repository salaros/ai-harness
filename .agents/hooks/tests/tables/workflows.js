// .agents/hooks/tests/tables/workflows.js
// scripts/check-workflows.js's decisions: which staged paths are workflows, what actionlint is handed
// and from where, and what each of its exits becomes. actionlint itself is not installed on every
// machine the suite runs on, so each row hands the check a stand-in that records its arguments and
// answers as the real one would: -1 when it could not start, 0 when the files pass, 1 with -oneline
// reports when they do not.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const workflows = require("../../../../scripts/check-workflows");
const { withRoot, text } = require("../fixtures");

const git = (dir, ...args) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" });
const CI = ".github/workflows/ci.yml";
const GOOD = text("on: push", "jobs:", "  t:", "    runs-on: ubuntu-latest", "    steps:", "      - run: echo ok");
const BAD = text("on: push", "jobs:", "  t:", "    runs-on: ubuntu-latest", "    env:", "      T: ${{ runner.temp }}", "    steps:", "      - run: echo ok");

// Which staged paths are workflows: the folder GitHub reads, either YAML extension, nothing nested.
exports.workflowPaths = function workflowPaths(t) {
    const rows = [
        [".github/workflows/ci.yml", true, "a workflow"],
        [".github/workflows/release.yaml", true, "either extension"],
        [".github/workflows/README.md", false, "a document beside them"],
        [".github/workflows/shared/ci.yml", false, "GitHub reads no subfolder"],
        [".github/actions/setup/action.yml", false, "a composite action is not a workflow"],
        ["docs/workflows/ci.yml", false, "the folder is the one under .github"],
    ];
    for (const [file, want, why] of rows) t.ok(workflows.isWorkflow(file) === want, `workflow paths: ${why}`, file);
};

// A repo with `staged` added on top of `committed`, a stand-in actionlint answering `exit` with
// `output`, and the verdict: `summary` when nothing is wrong, `warns` when the tool stood down,
// `blocks` naming each problem. `handed` is what the stand-in must have received, or null when it
// must not have been called at all.
exports.workflowDecisions = function workflowDecisions(t) {
    const ONE = `${CI}:6:10: context "runner" is not allowed here. available contexts are "github", "inputs", "matrix", "needs", "secrets", "strategy", "vars" [expression]`;
    const rows = [
        // committed, staged, files, exit, output, handed, blocks, warns, summary, why
        [{}, { "README.md": "x\n" }, ["README.md"], 0, "", null, [], false, "no workflow staged", "a commit touching no workflow runs nothing"],
        [{}, { [CI]: GOOD }, [CI], 0, "", [CI], [], false, "workflows: 1 staged file(s) pass actionlint", "a workflow actionlint accepts passes"],
        [{}, { [CI]: BAD }, [CI], 1, ONE + "\n", [CI], [ONE], false, "", "a report line is a problem, as actionlint prints it"],
        [{}, { [CI]: BAD }, [CI], 1, text("garbage first", ONE, "not a report"), [CI], [ONE], false, "", "only report lines are kept"],
        [{}, { [CI]: BAD }, [CI], 3, "actionlint: fatal\n", [CI], ["actionlint exited 3: actionlint: fatal"], false, "", "an exit with no report is still a problem, named by its first line"],
        [{}, { [CI]: GOOD }, [CI], -1, "spawnSync actionlint ENOENT", [CI], [], true, "", "actionlint absent is a notice, not a block"],
        [{ [CI]: GOOD }, {}, [CI], 0, "", null, [], false, "no workflow staged", "a staged deletion has no blob to lint"],
    ];
    for (const [committed, staged, files, exit, output, handed, blocks, warns, summary, why] of rows) {
        withRoot(committed, dir => {
            if (git(dir, "init", "-q").status !== 0) { t.skip(`workflows: git is not available (${why})`); return; }
            git(dir, "commit", "-q", "--allow-empty", "-m", "base");
            if (Object.keys(committed).length) { git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "committed"); }
            for (const [rel, content] of Object.entries(staged)) {
                fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
                fs.writeFileSync(path.join(dir, rel), content);
            }
            for (const rel of Object.keys(committed)) if (!(rel in staged)) fs.rmSync(path.join(dir, rel));
            git(dir, "add", "-A");
            let got = null;
            const run = (cmd, args, opts) => {
                got = { cmd, args, cwd: opts.cwd, texts: args.filter(a => !a.startsWith("-")).map(a => fs.readFileSync(path.join(opts.cwd, a), "utf8")) };
                return { status: exit, output };
            };
            const r = workflows.check(dir, files, { run });
            const called = handed === null ? got === null
                : got !== null && got.cmd === "actionlint" && got.args.slice(0, 2).join(" ") === "-no-color -oneline"
                    && got.args.slice(2).join(" ") === handed.join(" ") && path.resolve(got.cwd) !== path.resolve(dir)
                    && got.texts.every((x, i) => x === staged[handed[i]]);
            const verdict = called && r.summary === summary && r.warnings.length === (warns ? 1 : 0)
                && r.problems.length === blocks.length && blocks.every((b, i) => r.problems[i] === b);
            t.ok(verdict, `workflows: ${why}`, JSON.stringify({ got, r }));
        });
    }
};

// The commit is judged as it will be recorded: a workflow staged in part is linted as staged, not
// as the working tree has it.
exports.workflowsAreLintedAsStaged = function workflowsAreLintedAsStaged(t) {
    withRoot({}, dir => {
        if (git(dir, "init", "-q").status !== 0) { t.skip("workflows: git is not available (as staged)"); return; }
        fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
        fs.writeFileSync(path.join(dir, CI), GOOD);
        git(dir, "add", "-A");
        fs.writeFileSync(path.join(dir, CI), BAD);
        let seen = null;
        workflows.check(dir, [CI], { run: (cmd, args, opts) => { seen = fs.readFileSync(path.join(opts.cwd, CI), "utf8"); return { status: 0, output: "" }; } });
        t.ok(seen === GOOD, "workflows: the staged text is linted, not the working tree's", seen);
    });
};
