// .agents/hooks/tests/tables/bdd-features.js
// What scripts/bdd-features.js makes of a BDD document and of the folder of them: the feature file
// it writes, and the shapes it refuses. The rules are the convention docs/agents/chain.md states for
// the BDD stage, pinned here so a document that passes docs-check and still cannot run is named
// rather than written out as a feature file nothing executes.
const fs = require("fs");
const path = require("path");
const lib = require("../../lib");
const { withRoot, text } = require("../fixtures");

const SCRIPT = path.join(lib.checkout, "scripts", "bdd-features.js");
const FILE = "docs/bdd/0001-checkout.md";
// A BDD document around its gherkin blocks: the chain's heading and Derived from line, then each
// block fenced.
const doc = (...gherkinBlocks) => text("# BDD-0001: Checkout", "", "**Derived from:** EARS-0001", "",
    ...gherkinBlocks.flatMap(b => ["```gherkin", ...b, "```", ""]));
const FEATURE = ["Feature: Checkout", "", "# SC-1", "Scenario: Pay", "  Given a cart"];

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

    const german = extract(doc(["# language: de", "Funktionalität: Kasse", "", "# SC-1", "Szenario: Zahlen", "  Angenommen ein Warenkorb"]), FILE);
    t.ok(!german.problems.length && (german.feature || "").startsWith("# language: de\n# Generated from"),
        "a # language: line stays first, above the header, and another language's keywords are the runner's to read", german.feature || german.problems.join("\n"));

    const refused = (lines, want, title) => {
        const r = extract(doc(lines), FILE);
        t.ok(r.feature === null && r.problems.some(p => p.startsWith(`${FILE}: `) && p.includes(want)), title, r.problems.join("\n") || "(written)");
    };
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
// and leaves alone. The chain table is the smallest one readDocs accepts, with no skill named so a
// temp root without .agents/skills/ raises no problem of its own.
exports.bddFeatureFolder = function bddFeatureFolder(t) {
    if (!fs.existsSync(SCRIPT)) { t.skip("bdd-features: no scripts/bdd-features.js here"); return; }
    const { features, compare, apply, MARK } = require(SCRIPT);
    const table = (...rows) => text("# Agents", "", "| Stage | Answers | Lives in | Cites | Status | Skill |", "| --- | --- | --- | --- | --- | --- |", ...rows);
    withRoot({
        "AGENTS.md": table("| EARS | requirements | `docs/ears/` | backwards | | |", "| BDD | behaviour | `docs/bdd/` | backwards | | |"),
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
        t.ok(!r.files.length && r.problems.some(p => p.includes("no stage living in docs/bdd/")),
            "a chain table without a BDD stage is reported rather than extracting nothing in silence", r.problems.join("\n"));
    });
};
