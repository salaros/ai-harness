// .agents/hooks/tests/tables/bdd-features.js
// What scripts/feature-file.js makes of a BDD document, what scripts/bdd-features.js makes of the
// folder of them, and that docs-check holds the same rule: the feature file written, the shapes
// refused, and the refusal reaching a commit. The rules are the convention docs/agents/chain.md
// states for the BDD stage (ADR-0008), pinned here so a document that passes the chain and still
// cannot run is named rather than written out as a feature file nothing executes.
const fs = require("fs");
const path = require("path");
const lib = require("../../lib");
const { withRoot, text } = require("../fixtures");

const SCRIPT = path.join(lib.checkout, "scripts", "bdd-features.js");
const FILE = "docs/bdd/0001-checkout.md";
// A BDD document around its gherkin blocks: the chain's heading and Derived from line, then each
// block fenced.
const doc = (...gherkinBlocks) => text("# BDD-0001: Checkout", "", "**Derived from:** https://example.com/brief", "",
    ...gherkinBlocks.flatMap(b => ["```gherkin", ...b, "```", ""]));
const FEATURE = ["Feature: Checkout", "", "# SC-1", "Scenario: Pay", "  Given a cart"];
// The smallest chain table readDocs accepts, with no skill named so a temp root without
// .agents/skills/ raises no problem of its own.
const table = (...rows) => text("# Agents", "", "| Stage | Answers | Lives in | Cites | Status | Skill |", "| --- | --- | --- | --- | --- | --- |", ...rows);
const BDD_ROW = "| BDD | behaviour | `docs/bdd/` | backwards | | |";

exports.bddFeatureExtraction = function bddFeatureExtraction(t) {
    if (!fs.existsSync(SCRIPT)) { t.skip("bdd-features: no scripts/bdd-features.js here"); return; }
    const { extract } = require(SCRIPT);

    const ok = extract(doc(FEATURE), FILE);
    t.ok(!ok.problems.length && ok.feature !== null, "one Feature with # SC-n above each scenario extracts", ok.problems.join("\n"));
    t.ok((ok.feature || "").startsWith(`# Generated from ${FILE} by scripts/bdd-features.js`),
        "the feature file opens by naming the document it came from", ok.feature);
    t.ok((ok.feature || "").endsWith("\n\nFeature: Checkout\n\n# SC-1\nScenario: Pay\n  Given a cart\n"),
        "the gherkin block is written as it stands, the SC-n comment kept for the runner's report", ok.feature);
    t.ok(ok.ids.join() === "SC-1", "the scenario ids are reported", ok.ids.join());

    const tagged = extract(doc(["Feature: Checkout", "", "# SC-1", "@EARS-0001/REQ-1 @slow", "Scenario Outline: Pay", "  Given <n> items",
        "", "# SC-2", "Example: Refund", "  Given a paid order"]), FILE);
    t.ok(!tagged.problems.length, "the SC-n line sits above the scenario's tags, and Scenario Outline and Example are scenarios", tagged.problems.join("\n"));

    const english = extract(doc(["# language: en", ...FEATURE]), FILE);
    t.ok(!english.problems.length && (english.feature || "").startsWith("# language: en\n# Generated from"),
        "a # language: en line is allowed and stays first, above the header, where Gherkin reads it", english.feature || english.problems.join("\n"));

    const refused = (lines, want, title) => {
        const r = extract(doc(lines), FILE);
        t.ok(r.feature === null && r.problems.some(p => p.startsWith(`${FILE}: `) && p.includes(want)), title, r.problems.join("\n") || "(written)");
    };
    refused(["# language: de", "Funktionalität: Kasse", "", "# SC-1", "Szenario: Zahlen", "  Angenommen ein Warenkorb"], "names a Gherkin dialect",
        "a # language: line other than en is refused: the keywords are English and the prose language is in the step text");
    refused(["Feature: Checkout", "", "Scenario: Pay", "  Given a cart"], "has no `# SC-n` line directly above it", "a scenario with no # SC-n above it is refused");
    refused(["Feature: Checkout", "", "  # SC-1", "  Scenario: Pay"], "has no `# SC-n` line", "an indented # SC-1 is no item to docs-check, so it does not count here either");
    refused(["Feature: Checkout", "", "# SC-1", "Scenario: Pay", "", "# SC-1", "Scenario: Refund"], "SC-1 names both", "two scenarios sharing an id are refused");
    refused(["# SC-1", "Scenario: Pay"], "holds 0 `Feature:` lines", "a document with no Feature line is refused");
    refused(["Feature: A", "", "# SC-1", "Scenario: Pay", "", "Feature: B"], "holds 2 `Feature:` lines", "two Features in one document are refused");

    const none = extract(text("# BDD-0001: Checkout", "", "**Derived from:** EARS-0001", "", "```md", "Feature: prose, not gherkin", "```"), FILE);
    t.ok(none.feature === null && none.problems.some(p => p.includes("no ```gherkin block")),
        "a document with no gherkin block is refused, and a block of another language is not one", none.problems.join("\n"));

    const two = extract(doc(["Feature: Checkout"], ["# SC-1", "Scenario: Pay", "  Given a cart"]), FILE);
    t.ok(!two.problems.length && (two.feature || "").endsWith("Feature: Checkout\n\n# SC-1\nScenario: Pay\n  Given a cart\n"),
        "several gherkin blocks are written as one file, in order, a blank line between them", two.feature || two.problems.join("\n"));

    const quoted = extract(text("# BDD-0001: Checkout", "", "```md", "```gherkin", "Feature: Quoted", "```", "", "```gherkin", ...FEATURE, "```"), FILE);
    t.ok(!quoted.problems.length && (quoted.feature || "").includes("Feature: Checkout") && !(quoted.feature || "").includes("Quoted"),
        "a ```gherkin line inside another fenced block opens no block, as CommonMark reads it", quoted.feature || quoted.problems.join("\n"));
};

// The folder: which file each document becomes, what --check sees, and what a run writes, removes
// and leaves alone.
exports.bddFeatureFolder = function bddFeatureFolder(t) {
    if (!fs.existsSync(SCRIPT)) { t.skip("bdd-features: no scripts/bdd-features.js here"); return; }
    const { features, compare, apply, MARK } = require(SCRIPT);
    withRoot({
        "AGENTS.md": table("| EARS | requirements | `docs/ears/` | backwards | | |", BDD_ROW),
        "docs/bdd/0001-checkout.md": doc(FEATURE),
        "docs/bdd/0002-broken.md": doc(["Feature: Broken", "", "Scenario: No id"]),
        "tests/features/0009-gone.feature": `# Generated from docs/bdd/0009-gone.md ${MARK}.\n\nFeature: Gone\n`,
        "tests/features/hand-written.feature": "Feature: Mine\n",
    }, root => {
        const result = features(root);
        t.ok(result.files.map(f => f.file).join() === "tests/features/0001-checkout.feature",
            "a document becomes <out>/NNNN-<slug>.feature, under tests/features by default", result.files.map(f => f.file).join());
        t.ok(result.problems.length === 1 && result.problems[0].startsWith("docs/bdd/0002-broken.md: "),
            "a refused document is reported and the others are still written", result.problems.join("\n"));

        const before = compare(root, result);
        t.ok(before.missing.join() === "tests/features/0001-checkout.feature" && before.leftover.join() === "tests/features/0009-gone.feature" && !before.stale.length,
            "--check sees the file missing and the one left over from a document that no longer exists", JSON.stringify(before));

        const first = apply(root, result);
        const after = fs.readdirSync(path.join(root, "tests", "features")).sort().join();
        t.ok(after === "0001-checkout.feature,hand-written.feature" && first.written.length === 1 && first.removed.length === 1,
            "a run writes the feature, removes the leftover it wrote, and leaves a hand-written .feature alone", `${after}\n${JSON.stringify(first)}`);
        const second = apply(root, result);
        t.ok(!second.written.length && second.unchanged.length === 1 && !second.removed.length, "a second run changes nothing", JSON.stringify(second));

        const elsewhere = features(root, "tests/Acme.Acceptance/Features");
        t.ok(elsewhere.files[0].file === "tests/Acme.Acceptance/Features/0001-checkout.feature", "--out moves the folder", elsewhere.files[0].file);
    });

    withRoot({ "AGENTS.md": table("| PRD | what | `docs/prd/` | backwards | | |") }, root => {
        const r = features(root);
        t.ok(!r.files.length && r.problems.some(p => p.includes("no BDD stage")),
            "a chain table without a BDD stage is reported rather than extracting nothing in silence", r.problems.join("\n"));
    });

    withRoot({ "AGENTS.md": table("| BDD | behaviour | `docs/scenarios/` | backwards | | |"), "docs/scenarios/0001-checkout.md": doc(FEATURE) }, root => {
        const r = features(root);
        t.ok(r.files.map(f => f.file).join() === "tests/features/0001-checkout.feature" && !r.problems.length,
            "the stage is found by its name in the table, whatever folder the table gives it", `${r.files.map(f => f.file).join()}\n${r.problems.join("\n")}`);
    });
};

// The same rule is the chain's: docs-check reports a BDD document that would not run, so the
// pre-commit hook, which runs docs-check over the staged chain, refuses the commit (ADR-0008 D-8).
exports.bddShapeIsAChainRule = function bddShapeIsAChainRule(t) {
    if (!fs.existsSync(SCRIPT)) { t.skip("bdd-features: no scripts/bdd-features.js here"); return; }
    const docsCheck = require(path.join(lib.checkout, "scripts", "docs-check.js"));
    withRoot({
        "AGENTS.md": table("| PRD | what | `docs/prd/` | backwards | | |", BDD_ROW),
        "docs/prd/0001-checkout.md": text("# PRD-0001: Checkout", "", "**Derived from:** https://example.com/brief", "", "```gherkin", "Scenario: not a BDD document, so not held to the shape", "```"),
        "docs/bdd/0001-checkout.md": text("# BDD-0001: Checkout", "", "**Derived from:** PRD-0001", "", "```gherkin", ...FEATURE, "```"),
        "docs/bdd/0002-unnumbered.md": text("# BDD-0002: Refund", "", "**Derived from:** PRD-0001", "", "```gherkin", "Feature: Refund", "", "Scenario: No id", "```"),
        "docs/bdd/0003-dialect.md": text("# BDD-0003: Kasse", "", "**Derived from:** PRD-0001", "", "```gherkin", "# language: de", "Funktionalität: Kasse", "```"),
    }, root => {
        const { problems } = docsCheck.check(root);
        const of = file => problems.filter(p => p.startsWith(`${file}: `));
        t.ok(!of("docs/prd/0001-checkout.md").length && !of("docs/bdd/0001-checkout.md").length,
            "a BDD document that would run passes, and a gherkin block in another stage is nobody's business", problems.join("\n"));
        t.ok(of("docs/bdd/0002-unnumbered.md").some(p => p.includes("has no `# SC-n` line")),
            "docs-check reports a scenario without an id, so the commit is refused before the runner sees it", problems.join("\n"));
        t.ok(of("docs/bdd/0003-dialect.md").some(p => p.includes("names a Gherkin dialect")),
            "docs-check reports a # language: line other than en", problems.join("\n"));
    });
};
