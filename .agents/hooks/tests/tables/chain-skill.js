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
    { stage: "BDD", lives: "docs/bdd/", folder: "bdd", skills: ["bdd-scenarios"] },
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

    // A skill only the user can start is one the agent cannot load, so "load it first" is an order
    // nobody can follow. A stage with no other skill says what to ask the user for and what to do
    // until they answer; a stage with one the agent can load names that one and sets the other aside.
    const theirs = name => name === "domain-modeling" || name === "implement";
    const adr = chainSkill.decide(["docs/adr/0003-x.md"], STAGES, "", theirs);
    for (const want of ["Only the user can start it", "/domain-modeling", "#deferred", "TODO.md"])
        t.ok(adr.verdict === "block" && adr.message.includes(want), `chain skill: a stage only the user can write says ${want}`, adr.message);
    t.ok(!/Load (it|them) first/.test(adr.message), "chain skill: and does not tell the agent to load what it cannot", adr.message);
    const code = chainSkill.decide(["src/billing.js"], STAGES, "", theirs);
    t.ok(code.verdict === "block" && code.message.includes("Load `codebase-design` first (/codebase-design)")
        && code.message.includes("`implement` is the user's to start") && !code.message.includes("/implement"),
        "chain skill: a stage with one loadable skill names that one and sets the user's aside", code.message);
    // With no transcript the hook only warns, and the warning holds to the same rule.
    const unseen = chainSkill.decide(["docs/adr/0003-x.md"], STAGES, null, theirs);
    t.ok(unseen.verdict === "warn" && unseen.message.includes("Only the user can start it") && unseen.message.includes("#deferred")
        && !/load (it|them) before/.test(unseen.message),
        "chain skill: a warning for a stage only the user can write asks for them, not for a load", unseen.message);
    const unseenCode = chainSkill.decide(["src/billing.js"], STAGES, null, theirs);
    t.ok(unseenCode.verdict === "warn" && unseenCode.message.includes("load `codebase-design` before")
        && unseenCode.message.includes("`implement` is the user's to start"),
        "chain skill: a warning names the loadable skill and sets the user's aside", unseenCode.message);
};

// A stage can have a shape rule its skill does not know: a BDD document is held to the shape its
// feature file needs, and the vendored skill writes Gherkin without this chain's `# SC-n` line. Every
// message about such a stage carries the rule, and when the skill is loaded and there is nothing to
// block the decision still says it once, as a note rather than a verdict, so the document is written
// right the first time instead of refused by the edit hook and repaired.
exports.chainSkillPointsAtAShape = function chainSkillPointsAtAShape(t) {
    const shapeOf = stage => stage.stage === "BDD" ? "SHAPE: one Feature, # SC-n above each scenario." : null;
    const bdd = `{"name":"Skill","input":{"skill":"bdd-scenarios"}}`;
    const decide = (files, transcript) => chainSkill.decide(files, STAGES, transcript, () => false, shapeOf);
    const blocked = decide(["docs/bdd/0001-checkout.md"], "");
    t.ok(blocked.verdict === "block" && blocked.message.includes("/bdd-scenarios") && blocked.message.endsWith(shapeOf(STAGES[2])),
        "chain skill: a blocked BDD creation names the skill and ends with the shape", blocked.message);
    const warned = decide(["docs/bdd/0001-checkout.md"], null);
    t.ok(warned.verdict === "warn" && warned.message.includes("# SC-n"), "chain skill: so does the warning when no transcript came", warned.message);
    const noted = decide(["docs/bdd/0001-checkout.md"], bdd);
    t.ok(noted && noted.verdict === "note" && noted.files[0] === "docs/bdd/0001-checkout.md"
        && noted.message.includes("docs/bdd/0001-checkout.md is the BDD stage") && noted.message.includes("# SC-n"),
        "chain skill: with the skill loaded the shape is still said, as a note", JSON.stringify(noted));
    t.ok(decide(["docs/prd/0001-billing.md"], `{"name":"Skill","input":{"skill":"prd"}}`) === null,
        "chain skill: a stage with no shape and its skill loaded gets nothing");
    t.ok(decide(["docs/prd/0001-billing.md"], "").message.includes("# SC-n") === false,
        "chain skill: a block on a stage with no shape carries none");
    const both = decide(["docs/bdd/0001-checkout.md", "docs/prd/0001-billing.md"], bdd);
    t.ok(both.verdict === "block" && both.files[0] === "docs/prd/0001-billing.md",
        "chain skill: a block on another file outranks the note", JSON.stringify(both));
    const noSkill = chainSkill.decide(["docs/bdd/0001-checkout.md"], [{ stage: "BDD", lives: "docs/bdd/", folder: "bdd", skills: [] }], "", () => false, shapeOf);
    t.ok(noSkill && noSkill.verdict === "note", "chain skill: a stage with no skill to check still gets its shape", JSON.stringify(noSkill));
    // The default rule is scripts/feature-file.js's, so the author hears what docs-check refuses.
    const real = chainSkill.decide(["docs/bdd/0001-checkout.md"], STAGES, bdd);
    for (const want of ["```gherkin", "`Feature:`", "`# SC-n`", "ADR-0008", "docs/agents/chain.md", "docs-check"])
        t.ok(real && real.verdict === "note" && real.message.includes(want), `chain skill: the BDD shape names ${want}`, real && real.message);
};
