// scripts/project-facts.js
// The one reader of a project's facts: the labelled lines of MEMORY.md, and the name and purpose an
// INTENT.md gives in its "## Product" section. The initialisation gate, the commit-message check,
// docs-check, the docs portal and the installer's MEMORY.md skeleton all ask this module, so a line
// one of them counts as present is present to every one of them, and a placeholder one of them
// treats as unanswered is unanswered everywhere.
// Shipped in the npm package beside update-harness.js and lib.js, because the installer builds its
// skeleton from FACTS, so the installer must not require anything else from scripts/.
// Usage:
//   const facts = require("./project-facts");
//   const f = facts.readFactsAt(root);           // { Name, Purpose, Requirements, ... }
//   f["Issue tracker"]                            // null: no line; "": unanswered; else the value
//   facts.unanswered(f)                           // the required labels with no answer
const fs = require("fs");
const path = require("path");

const MEMORY = "MEMORY.md";
const INTENT = "INTENT.md";

// Every fact, in the order MEMORY.md lists them. `required` facts gate initialisation; the rest are
// read by the skills that need them and never block. `intent` marks the two an INTENT.md owns.
// `Issue tracker` is optional because a tracker is a choice rather than a property of the code,
// `Frontend` because a service or a library has no UI, and `Prose language` because a missing line
// already means English.
const FACTS = [
    { label: "Name", required: true, intent: true, placeholder: "<name>" },
    { label: "Purpose", required: true, intent: true, placeholder: "<purpose>" },
    { label: "Prose language", required: false, placeholder: "<prose language>" },
    { label: "Requirements", required: true, placeholder: "<requirements>" },
    { label: "Unit type", required: true, placeholder: "<unit type>" },
    { label: "Language", required: true, placeholder: "<language>" },
    { label: "Runtime / package manager", required: true, placeholder: "<runtime>" },
    { label: "Frontend", required: false, placeholder: "<framework>" },
    { label: "Issue tracker", required: false, placeholder: "<tracker>" },
];

// INTENT.md (https://www.intentdocs.com/intent-md): the product's intent, one per product, at the
// root. Optional, so the harness neither ships nor requires one. Given its text, returns whether the
// "# INTENT.md" title is there, the product's bold name and the prose describing it from
// "## Product" (null when the section is missing), and whether "## MVP stories" is there; that heading
// may run on, as in "## MVP stories — build these first". docs-check holds the file to these sections.
function readIntent(text) {
    const lines = text.split(/\r?\n/);
    const h1 = lines.find(l => /^#\s/.test(l));
    const section = name => {
        const start = lines.findIndex(l => new RegExp(`^##\\s+${name}\\b`, "i").test(l));
        if (start < 0) return null;
        const end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
        return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n").trim();
    };
    const body = section("Product");
    let product = null;
    if (body !== null) {
        const bold = body.match(/\*\*([^*]+)\*\*/);
        product = {
            name: bold ? bold[1].trim().replace(/[:.]+$/, "").trim() : "",
            purpose: body.replace(/\*\*[^*]+\*\*/, "").replace(/^[\s:.,—–-]+/, "").replace(/\s+/g, " ").trim(),
        };
    }
    return { title: !!h1 && h1.trim() === "# INTENT.md", product, stories: section("MVP stories") !== null };
}

// A fact's line: a `-` or `*` bullet, then the label in bold with its colon inside or after the bold
// (`- **Name:** Acme`, `* **Name**: Acme`). An unbolded line is prose that happens to start with the
// word, so it is not a fact. The value is null when no line carries the label.
function lineValue(text, label) {
    if (text === null) return null;
    const escaped = label.replace(/[/.*+?^${}()|[\]\\]/g, "\\$&");
    const m = text.match(new RegExp(`^\\s*[-*]\\s*\\*\\*${escaped}(?::\\*\\*|\\*\\*:)[ \\t]*(.*)$`, "mi"));
    return m ? m[1].trim() : null;
}

// A value is unanswered when nothing is left once every <placeholder> is removed: `<language>` and
// `<language> <version>` are the template, `C#` and `see <link> in docs/` are answers, kept whole.
const answer = value => value.replace(/<[^>]*>/g, "").trim() ? value : "";

// Every fact, from the texts of MEMORY.md and INTENT.md, each null when that file is absent. A label
// maps to null when nothing gives it, "" when it is unanswered, and the trimmed value otherwise.
// With an INTENT.md, Name and Purpose come from its "## Product" alone: a MEMORY.md line for either
// is ignored, so a stale copy there never stands in for the product's own words.
function readFacts({ memory = null, intent = null } = {}) {
    const product = intent === null ? null : readIntent(intent).product;
    const facts = {};
    for (const { label, intent: owned } of FACTS) {
        const raw = owned && intent !== null
            ? (product ? product[label.toLowerCase()] : null)
            : lineValue(memory, label);
        facts[label] = raw === null ? null : answer(raw);
    }
    return facts;
}

// readFacts() for the files on disk under a root. A reader holding the texts some other way, such as
// docs-check through a repo view, calls readFacts() with them instead.
function readFactsAt(root) {
    const read = file => {
        const at = path.resolve(root, file);
        return fs.existsSync(at) ? fs.readFileSync(at, "utf8") : null;
    };
    return readFacts({ memory: read(MEMORY), intent: read(INTENT) });
}

// The required labels readFacts() found no answer for, in FACTS order.
const unanswered = facts => FACTS.filter(f => f.required && !facts[f.label]).map(f => f.label);

// MEMORY.md's fact lines as the installer lays them down, every one a placeholder. Beside an
// INTENT.md, Name and Purpose give way to a line saying where they are.
function skeleton(hasIntent) {
    const lines = FACTS.filter(f => !(hasIntent && f.intent)).map(f => `- **${f.label}:** ${f.placeholder}`);
    return hasIntent ? [`The name and purpose are in \`${INTENT}\`, under \`## Product\`.`, "", ...lines] : lines;
}

module.exports = { FACTS, MEMORY, INTENT, readFacts, readFactsAt, unanswered, readIntent, skeleton };
