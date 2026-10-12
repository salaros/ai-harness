// .agents/hooks/tests/fixtures.js
// What the suite's checks build their cases out of. One temp-root helper, so a check that needs a
// repo of its own says which files it holds rather than growing a tenth mkdtemp call of its own, and
// one chain-document helper, so a check that needs a document to exist names its stage rather than
// copying the shape docs-check demands.
//   withRoot({ "MEMORY.md": "..." }, dir => check(dir))   a throwaway repo, removed afterwards
//   text("# TODO", "", "- [ ] ...")                        lines, newline-terminated
//   smallest("BRD", 9300, "https://example.com/brief")   the smallest document of a stage docs-check accepts
//   smallestChain()                                       one per document stage, each derived from the one before
//   installer()                                            the installer module, or null
//   installPolicy()                                        scripts/install-policy.js, or null
//   planEntry()                                            scripts/plan-entry.js, or null
const fs = require("fs");
const os = require("os");
const path = require("path");
const lib = require("../lib");
const docsCheck = require("../../../scripts/docs-check");
const repoView = require("../../../scripts/repo-view");
const featureFile = require("../../../scripts/feature-file");

// A temp repo holding `files` (repo-relative path -> content), handed to `use`, and removed after.
function withRoot(files, use) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-table-"));
    try {
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
            fs.writeFileSync(path.join(dir, rel), text);
        }
        return use(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const text = (...lines) => lines.join("\n") + "\n";

// The smallest document of a stage that docs-check accepts, built from this checkout's chain table
// and the rule files rather than written out: the heading its file name gives it, the Derived from
// line, a Status where the stage lists them (the first one a later stage may build on, so the
// document can be cited), and for the BDD stage a gherkin block holding one Feature and one scenario
// under its `# SC-n` line. That scenario is the one line here docs-check does not demand, kept
// because a Feature with nothing under it is a document the runner has nothing to do with. A check
// that only needs a document to exist, as the upstream of the one it is about or the file a hook
// fires on, takes this rather than copying the shape, and tables/docs-chain.js holds the result to
// docs-check, so a stage that gains a rule fails there before it fails in a check built on this.
let stages = null;
const docStages = () => stages || (stages = docsCheck.readChain(repoView.worktree(lib.checkout)).stages.filter(s => s.folder));
const pad = n => String(n).padStart(4, "0");

function smallest(stage, n = 1, from = "https://example.com/source") {
    const s = docStages().find(x => x.stage === stage);
    if (!s) throw new Error(`smallest: no document stage ${stage} in the chain table of ${lib.checkout}`);
    const id = `${stage}-${pad(n)}`;
    const buildable = s.statuses.find(x => x.buildable);
    const lines = [
        `# ${id}: Smallest`, "",
        ...(buildable ? [`**Status:** ${buildable.value}`] : []),
        `**Derived from:** ${from}`,
        ...(stage === featureFile.STAGE ? ["", "```gherkin", "Feature: Smallest", "", "# SC-1", "Scenario: Smallest", "```"] : []),
    ];
    return { id, stage, file: `docs/${s.folder}/${pad(n)}-smallest.md`, lines, text: text(...lines) };
}

// One smallest document per document stage, in table order, the first derived from a source and each
// of the rest from the one before it: a chain docs-check accepts whole.
function smallestChain(n = 1) {
    const docs = [];
    for (const s of docStages()) docs.push(smallest(s.stage, n, docs.length ? docs[docs.length - 1].id : undefined));
    return docs;
}

// scripts/update-harness.js is the upstream's own and is never installed, so a project that borrowed
// this suite has no installer to test. Required lazily for that reason: at the top it would throw
// before the first check ran, and take the whole suite with it.
const INSTALLER = path.join(__dirname, "..", "..", "..", "scripts", "update-harness.js");
const installer = () => fs.existsSync(INSTALLER) ? require(INSTALLER) : null;
// The installer's policy decisions, the upstream's own for the same reason.
const INSTALL_POLICY = path.join(__dirname, "..", "..", "..", "scripts", "install-policy.js");
const installPolicy = () => fs.existsSync(INSTALL_POLICY) ? require(INSTALL_POLICY) : null;
// The plan's entries, the upstream's own for the same reason.
const PLAN_ENTRY = path.join(__dirname, "..", "..", "..", "scripts", "plan-entry.js");
const planEntry = () => fs.existsSync(PLAN_ENTRY) ? require(PLAN_ENTRY) : null;

module.exports = { withRoot, text, smallest, smallestChain, installer, INSTALLER, installPolicy, planEntry };
