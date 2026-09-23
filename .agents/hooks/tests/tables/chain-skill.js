// .agents/hooks/tests/tables/chain-skill.js
// scripts/chain-skill.js's decisions: which stage of the chain a file about to be created belongs
// to, whether this session has already loaded that stage's skill, and what the hook does when it
// cannot tell. The stage table comes from AGENTS.md, so these rows carry one of their own rather
// than pinning the repo's current chain.
const chainSkill = require("../../../../scripts/chain-skill");

// A chain table in the shape readChain() returns, small enough to read at a glance.
const STAGES = [
    { stage: "PRD", lives: "docs/prd/", folder: "prd", skills: ["prd"] },
    { stage: "ADR", lives: "docs/adr/", folder: "adr", skills: ["domain-modeling"] },
    { stage: "TDD", lives: "tests/", folder: null, skills: ["tdd"] },
    { stage: "IPLAN", lives: ".scratch/", folder: null, skills: ["create-implementation-plan", "to-tickets"] },
    { stage: "Code", lives: "src/", folder: null, skills: ["implement", "codebase-design"] },
];

// A path belongs to the stage whose folder it sits under, and to no stage at all when it sits
// outside every one of them. A stage living in a folder as broad as src/ owns everything under it,
// which is the point: a new module is the Code stage whatever it is called.
exports.chainStageOfAPath = function chainStageOfAPath(t) {
    const rows = [
        ["docs/prd/0001-billing.md", "PRD", "a document in a stage's folder"],
        ["docs/prd/README.md", "PRD", "any file in it, not only a numbered document"],
        ["docs/adr/0002-one-seam.md", "ADR", "each stage owns its own folder"],
        ["tests/billing.test.js", "TDD", "a stage living outside docs/ owns its folder just the same"],
        ["src/billing/invoice.js", "Code", "however deep the path"],
        [".scratch/plan.md", "IPLAN", "and whatever the folder is called"],
        ["AGENTS.md", null, "a file outside every stage belongs to none"],
        ["docs/agents/chain.md", null, "a folder under docs/ that is not a stage is not one"],
        ["scripts/repo-view.js", null, "a script is not the Code stage: the table says src/"],
        ["docs/prd", null, "the folder itself is not a document in it"],
    ];
    for (const [file, want, why] of rows) {
        const got = chainSkill.stageFor(file, STAGES);
        t.ok((got ? got.stage : null) === want, `chain skill: ${why}`, JSON.stringify(got && got.stage));
    }
};

// Whether the session has the skill. The transcript is whatever the harness wrote, so the markers
// are read generously: a wrong "no" would block the file from ever being created, while a wrong
// "yes" only costs a reminder nobody needed.
exports.chainSkillIsRecognisedInATranscript = function chainSkillIsRecognisedInATranscript(t) {
    const rows = [
        [`{"name":"Skill","input":{"skill":"prd"}}`, true, "the skill tool naming it"],
        [`{"name":"Skill","input":{"skill":"some-plugin:prd"}}`, true, "the same, qualified by a plugin"],
        [`<command-name>/prd</command-name>`, true, "a slash command"],
        [`Path: C:\\\\Users\\\\x\\\\.agents\\\\skills\\\\prd\\\\SKILL.md`, true, "the skill's own file, on a Windows path"],
        [`read .agents/skills/prd/SKILL.md`, true, "the same with forward slashes"],
        [`writing docs/prd/0001-billing.md now`, false, "the folder's name is not the skill being loaded"],
        [`{"name":"Skill","input":{"skill":"prd-review"}}`, false, "a different skill whose name starts the same"],
        [``, false, "an empty transcript"],
    ];
    for (const [text, want, why] of rows) t.ok(chainSkill.used(text, "prd") === want, `chain skill: ${why}`, text);
};

// The whole decision. A creation in a stage's folder without its skill is blocked and told which
// skill to load; with it, nothing is said. A transcript the harness never named leaves the hook
// unable to tell, and a hook that cannot read its input fails open, as every other one here does.
exports.chainSkillDecisions = function chainSkillDecisions(t) {
    const loaded = `{"name":"Skill","input":{"skill":"prd"}}`;
    const rows = [
        // files, transcript, verdict, what the message must name, why
        [["docs/prd/0001-billing.md"], "", "block", "prd", "creating a PRD with no skill loaded is blocked"],
        [["docs/prd/0001-billing.md"], loaded, "allow", null, "the same creation passes once the skill is loaded"],
        [["AGENTS.md"], "", "allow", null, "a file in no stage is nothing to do with this hook"],
        [["src/billing.js"], "", "block", "codebase-design", "every skill the stage names is offered, not just the first"],
        [["src/billing.js"], `{"name":"Skill","input":{"skill":"implement"}}`, "allow", null,
            "any one of a stage's skills is enough"],
        [["docs/prd/0001-billing.md"], null, "warn", "prd", "a session with no transcript is warned, never blocked"],
        [["AGENTS.md", "docs/adr/0003-x.md"], "", "block", "domain-modeling", "one chain file among several is enough to fire"],
    ];
    for (const [files, transcript, verdict, names, why] of rows) {
        const d = chainSkill.decide(files, STAGES, transcript);
        const got = d ? d.verdict : "allow";
        const said = names === null || (d && d.message.includes(names));
        t.ok(got === verdict && said, `chain skill: ${why}`, JSON.stringify(d));
    }
    // The message is for an agent that has to act on it: it names the file, the stage and the skill,
    // and says how to load it rather than only that it should have been.
    const d = chainSkill.decide(["docs/prd/0001-billing.md"], STAGES, "");
    for (const want of ["docs/prd/0001-billing.md", "PRD", "prd", "AGENTS.md"])
        t.ok(d.message.includes(want), `chain skill: the message names ${want}`, d.message);
};
