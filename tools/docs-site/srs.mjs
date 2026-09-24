// tools/docs-site/srs.mjs
// The SRS view (SPEC-0002): the Software Requirements Specification a client asks for, as one page
// rendering the PRD, TRD and EARS documents under the outline IEEE 29148-2018 gives an SRS, in that
// outline's order rather than the chain's. It is a view and not a stage: nothing is written to
// docs/, nothing cites it, and docs-check has nothing to validate. The page is built from the model
// collect() returns and reads nothing itself, so what it renders is what the validator checked.
import { markdownFor } from "./chain.mjs";

// Where the outline puts what each stage says. A document is placed whole: a TRD's rows are not
// sorted into the outline's performance, interface and constraint subsections by category, which is
// why 3.2 stands for 3.2 to 3.7 and says so.
const SECTIONS = [
    { heading: "## 1 Introduction", stage: "PRD",
        lead: "Purpose, scope and product overview: the product's users, what it does for them and what stays out, as the PRD states them." },
    { heading: "## 2 References", references: true,
        lead: "The documents this specification is rendered from, and what each derives from." },
    { heading: "## 3 Requirements" },
    { heading: "### 3.1 Functions", stage: "EARS",
        lead: "Each requirement as one testable statement, as the EARS document states them." },
    { heading: "### 3.2 Quality requirements and constraints", stage: "TRD",
        lead: "This section stands for the outline's 3.2 to 3.7: performance, usability, interface, logical database, design constraints and software system attributes. The TRD holds them by category, each with a target and how it is measured, and is rendered whole rather than split across six headings." },
    { heading: "## 4 Verification", stage: "BDD", linksOnly: true,
        lead: "The behaviour scenarios the requirements are verified against, one document per link." },
    { heading: "## 5 Appendices", appendices: true },
];

const stageOf = (chain, name) => chain.stages.find(s => s.stage === name);
const docsOf = (chain, name) => chain.docs.filter(d => d.stage === name);

// An empty section in the overview's voice, naming the skill the stage table gives the stage.
function noneYet(chain, name) {
    const stage = stageOf(chain, name);
    const skill = stage && stage.skills && stage.skills[0];
    return skill ? `none yet: the \`${skill}\` skill writes the ${name}.` : "none yet.";
}

// The provenance line a document carries, linked as it is on the document's own page.
function derivedFrom(doc, chain) {
    const line = doc.lines.find(l => /^\**Derived from:?\**:?/i.test(l));
    return line ? markdownFor({ ...doc, lines: [line] }, chain, { anchors: false }) : "";
}

function body(section, chain) {
    if (section.references) {
        const rendered = SECTIONS.filter(s => s.stage && !s.linksOnly).flatMap(s => docsOf(chain, s.stage));
        return rendered.length
            ? rendered.map(d => `- [${d.title}](${d.link}), ${derivedFrom(d, chain) || "with no provenance line"}`)
            : ["none yet."];
    }
    if (section.appendices) {
        return [chain.glossary
            ? "Assumptions, dependencies and acronyms: the terms this project uses are in `CONTEXT.md`, the glossary the chain's documents share."
            : "Nothing recorded yet."];
    }
    if (!section.stage) return [];
    const docs = docsOf(chain, section.stage);
    if (!docs.length) return [noneYet(chain, section.stage)];
    if (section.linksOnly) return docs.map(d => `- [${d.title}](${d.link})`);
    return docs.flatMap(d => [`### [${d.title}](${d.link})`, "", markdownFor(d, chain, { anchors: false, demote: 2 }), ""]);
}

// The page as markdown for Starlight: a lead paragraph, then the outline, each section headed as
// the outline heads it and holding the documents of its stage, or saying it holds none.
export function srs(chain) {
    const out = [
        "The Software Requirements Specification, generated from the documentation chain in the order IEEE 29148-2018 gives its sections. Nothing here is written by hand: the PRD, TRD and EARS documents are rendered where the outline puts what they say, and a change to one of them changes this page. A citation links to the document it names, and an item ID is plain text here and a link target on its own page.",
    ];
    for (const section of SECTIONS) {
        out.push("", section.heading, "");
        if (section.lead) out.push(section.lead, "");
        out.push(...body(section, chain));
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}
