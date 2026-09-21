// .agents/hooks/tests/tables/project.js
// scripts/project-facts.js and the gate that reads it: how a fact line is read, what the
// initialisation gate makes of the answer, and the template the project-init skill writes.
const fs = require("fs");
const path = require("path");
const lib = require("../../lib");
const facts = require("../../../../scripts/project-facts");
const { withRoot, text } = require("../fixtures");

// What every reader of project facts sees, from the texts of MEMORY.md and INTENT.md (null: no such
// file). A label reads null when nothing gives it, "" when it is unanswered, and its value otherwise.
function projectFactDecisions(t) {
    const INTENT = text("# INTENT.md", "", "## Product", "", "**Acme Billing** invoices small firms monthly.", "", "## MVP stories", "");
    const rows = [
        // memory, intent, label, expected, why
        [text("- **Language:** C#"), null, "Language", "C#", "a dash bullet with the colon inside the bold"],
        [text("* **Language**: C#"), null, "Language", "C#", "a star bullet with the colon after the bold"],
        [text("-**Language:** C#"), null, "Language", "C#", "no space after the bullet"],
        [text("- **language:** C#"), null, "Language", "C#", "the label in another case"],
        [text("- **Language:**   C#  "), null, "Language", "C#", "the value is trimmed"],
        ["- **Language:** C#\r\n- **Unit type:** service\r\n", null, "Unit type", "service", "CRLF line endings"],
        [text("Language: C#"), null, "Language", null, "an unbolded line is prose, not a fact"],
        [text("- Language: C#"), null, "Language", null, "an unbolded bullet is prose too"],
        [text("**Language:** C#"), null, "Language", null, "a bold label with no bullet is not a fact line"],
        [text("- **Languages:** C#"), null, "Language", null, "a longer label is another fact"],
        [text("- **Runtime / package manager:** Node 22 / pnpm"), null, "Runtime / package manager", "Node 22 / pnpm",
            "a label holding a slash"],
        [null, null, "Language", null, "no MEMORY.md at all"],
        [text("- **Language:**"), null, "Language", "", "an empty value is unanswered"],
        [text("- **Language:** <language>"), null, "Language", "", "a placeholder is unanswered"],
        [text("- **Language:** <language> <version>"), null, "Language", "", "several placeholders and nothing else are unanswered"],
        [text("- **Issue tracker:** <tracker> at <url>"), null, "Issue tracker", "<tracker> at <url>",
            "words beside placeholders make an answer, kept whole"],
        [text("- **Issue tracker:** none"), null, "Issue tracker", "none", "an optional fact reads like any other"],
        // INTENT.md owns the name and purpose outright; the configuration stays MEMORY.md's.
        [text("- **Name:** Old Name"), INTENT, "Name", "Acme Billing", "INTENT.md's bold name wins over MEMORY.md"],
        [text("- **Purpose:** old"), INTENT, "Purpose", "invoices small firms monthly.", "the purpose is INTENT.md's prose"],
        [text("- **Name:** Old Name"), INTENT.replace("**Acme Billing** ", ""), "Name", "",
            "an INTENT.md naming no product leaves Name unanswered, with no fallback"],
        [text("- **Name:** Old Name"), text("# INTENT.md", "", "## MVP stories"), "Name", null,
            "an INTENT.md with no Product gives no name, with no fallback"],
        [null, text("# INTENT.md", "", "## Product", "", "**<name>** <purpose>"), "Name", "", "a template INTENT.md is unanswered"],
        [text("- **Language:** C#"), INTENT, "Language", "C#", "INTENT.md does not stand in for configuration"],
        [text("- **Name:** Acme"), null, "Name", "Acme", "without INTENT.md the name is MEMORY.md's"],
    ];
    for (const [memory, intent, label, want, why] of rows) {
        const got = facts.readFacts({ memory, intent })[label];
        t.ok(got === want, `project facts: ${why}`, `${label} -> ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    }

    const all = text(...facts.FACTS.map(f => `- **${f.label}:** x`));
    t.ok(facts.unanswered(facts.readFacts({ memory: all })).length === 0, "project facts: nothing unanswered when every line has a value");
    t.ok(facts.unanswered(facts.readFacts({ memory: text("- **Issue tracker:** Jira") })).join() === facts.FACTS.filter(f => f.required).map(f => f.label).join(),
        "project facts: unanswered lists the required facts only, in order", facts.unanswered(facts.readFacts({})).join());

    const parsed = facts.readIntent(INTENT);
    t.ok(parsed.title && parsed.stories && parsed.product.name === "Acme Billing" && parsed.product.purpose === "invoices small firms monthly.",
        "project facts: readIntent separates the bold name from the purpose", JSON.stringify(parsed));

    // readFactsAt reads the files a root holds.
    withRoot({ "MEMORY.md": text("- **Language:** C#") }, root => {
        t.ok(facts.readFactsAt(root).Language === "C#", "project facts: readFactsAt reads MEMORY.md at the root");
    });
}

// The project-init gate. Exercised against a throwaway repo rather than this checkout, whose own
// answer depends on whether the developer running the suite has created the marker file. How a line
// is read is projectFactDecisions'; this is what the gate makes of the answer: which file it blames,
// what it names as missing, and the marker.
function initialisationGateAnswersEveryState(t) {
    const init = require("../../../../scripts/check-initialised");
    const full = ["# Project memory", "", "- **Name:** Acme Billing", "- **Purpose:** Invoices customers monthly.",
        "- **Requirements:** jira:AB-1", "- **Unit type:** service", "- **Language:** C#",
        "- **Runtime / package manager:** .NET 9 / NuGet", "- **Issue tracker:** Jira at https://acme.atlassian.net, project `AB`", ""].join("\n");
    withRoot({}, dir => {
        const write = (name, body) => { fs.writeFileSync(path.join(dir, name), body); };
        const clear = () => { for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f)); };
        t.ok(!init.check(dir).ok, "an unconfigured clone is blocked", init.check(dir).reason);

        write("MEMORY.md", full.replace("C#", "<language>"));
        const placeheld = init.check(dir);
        t.ok(!placeheld.ok && placeheld.missing.join() === "Language" && placeheld.reason.includes("MEMORY.md records no Language"),
            "a fact left as a <placeholder> is blocked and named", placeheld.reason);

        write("MEMORY.md", full);
        t.ok(init.check(dir).ok, "a MEMORY.md with every required fact passes", init.check(dir).reason);

        // INTENT.md, when there is one, owns the name and purpose; the configuration stays in MEMORY.md.
        const intent = ["# INTENT.md", "", "## Product", "", "**Acme Billing** invoices small firms monthly, so nobody cuts invoices by hand.",
            "", "## MVP stories — build these first", "", "### Send an invoice", ""].join("\n");
        const configOnly = full.split("\n").filter(l => !/\*\*(?:Name|Purpose):/.test(l)).join("\n");
        clear();
        write("INTENT.md", intent);
        write("MEMORY.md", configOnly);
        const fromIntent = init.check(dir);
        t.ok(fromIntent.ok && fromIntent.reason.includes("INTENT.md"),
            "INTENT.md's Product gives the name and purpose MEMORY.md leaves out", fromIntent.reason);

        write("INTENT.md", intent.replace("**Acme Billing** ", ""));
        write("MEMORY.md", full);
        const nameless = init.check(dir);
        t.ok(!nameless.ok && nameless.missing.join() === "Name" && nameless.reason.includes("INTENT.md"),
            "an INTENT.md whose Product names no product is blocked, even when MEMORY.md has a Name", nameless.reason);

        write("INTENT.md", intent.replace(/## Product[\s\S]*?(?=## MVP)/, ""));
        fs.unlinkSync(path.join(dir, "MEMORY.md"));
        const bare = init.check(dir);
        t.ok(!bare.ok && ["Name", "Purpose", "Language"].every(f => bare.missing.includes(f)),
            "an INTENT.md with no Product and no MEMORY.md is blocked on both", bare.reason);

        clear();
        write(".skip-project-init", "");
        t.ok(init.check(dir).ok, "the marker file passes a clone with no MEMORY.md at all", init.check(dir).reason);
    });
}

// The project-init skill writes MEMORY.md from a template of its own, which the installer's skeleton
// and the gate never read. The labels are what every reader agrees on, so the template must list
// exactly the facts scripts/project-facts.js holds, in the same order; its placeholders are the
// skill's to word.
function projectInitTemplateMatchesFacts(t) {
    const skill = path.join(lib.checkout, ".agents", "skills", "project-init", "SKILL.md");
    if (!fs.existsSync(skill)) { t.skip("project-init template: no project-init skill here"); return; }
    const block = fs.readFileSync(skill, "utf8").match(/```md\r?\n\s*# Project memory[\s\S]*?```/);
    t.ok(!!block, "project-init: SKILL.md carries a MEMORY.md template", skill);
    if (!block) return;
    const labels = [...block[0].matchAll(/^\s*- \*\*([^*]+?):\*\*/gm)].map(m => m[1]);
    const wanted = facts.FACTS.map(f => f.label);
    t.ok(labels.join("|") === wanted.join("|"),
        "project-init: the template lists the facts scripts/project-facts.js holds, in order",
        `template: ${labels.join(", ")}\nfacts:    ${wanted.join(", ")}`);
}

module.exports = [
    projectFactDecisions,
    initialisationGateAnswersEveryState,
    projectInitTemplateMatchesFacts,
];
