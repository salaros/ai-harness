// .agents/hooks/tests/tables/profiles.js
// scripts/profiles.tsv as scripts/profiles.js reads it, and the active set it selects from a
// project's facts (SPEC-0004/D-1, D-2, D-3). The selector fails open: a fact with no answer keeps
// a row active, so the upstream and an unconfigured clone keep everything. The last check runs on
// this checkout: every skill, agent and MCP server it ships has one row, and the RFC's reference
// profile fits the description budget.
const fs = require("fs");
const path = require("path");
const lib = require("../../lib");

const module_ = () => {
    const file = path.join(lib.checkout, "scripts", "profiles.js");
    return fs.existsSync(file) ? require(file) : null;
};
const tsv = rows => rows.map(r => r.join("\t")).join("\n") + "\n";

exports.profileTableParsing = function profileTableParsing(t) {
    const profiles = module_();
    if (!profiles) { t.skip("profile table: no scripts/profiles.js here"); return; }
    const ok = profiles.parse(tsv([
        ["# a comment"],
        ["tdd", "skill", "always"],
        ["frontend-design", "skill", "Frontend != none"],
        ["ef-core", "skill", "Language = C# and Unit type != library"],
        ["launch", "skill", "Roles = marketing or Roles = product-manager"],
        ["atlassian", "mcp", "issue tracker = Jira"],
        ["engineer", "agent", "Roles = engineer"],
    ]));
    t.ok(!ok.errors.length, "a well-formed table parses with no errors", JSON.stringify(ok.errors));
    t.ok(ok.rows.length === 6, "comments are skipped and every row is read", String(ok.rows.length));
    t.ok(ok.rows[1].line === 3, "a row keeps its line number for the errors that cite it", String(ok.rows[1].line));
    t.ok(ok.rows[4].clauses[0][0].fact === "Issue tracker", "a fact is named case-insensitively and read as MEMORY.md writes it",
        JSON.stringify(ok.rows[4].clauses));
    t.ok(ok.rows[3].clauses.length === 2 && ok.rows[2].clauses[0].length === 2, "or joins clauses and and joins tests",
        JSON.stringify([ok.rows[2].clauses, ok.rows[3].clauses]));

    const cases = [
        [["tdd", "skill"], "cells"],
        [["tdd", "plugin", "always"], "unknown kind"],
        [["tdd", "skill", ""], "empty condition"],
        [["tdd", "skill", "Stack = C#"], "unknown fact"],
        [["tdd", "skill", "Language ~ C#"], "not a test"],
        [["tdd", "skill", "Language > C#"], "not a test"],
    ];
    for (const [row, error] of cases) {
        const r = profiles.parse(tsv([row]));
        t.ok(r.errors.length === 1 && r.errors[0].line === 1 && r.errors[0].message.includes(error),
            `a row ${JSON.stringify(row.join(" | "))} is an error on its line: ${error}`, JSON.stringify(r.errors));
    }
    const twice = profiles.parse(tsv([["tdd", "skill", "always"], ["tdd", "skill", "Language = C#"], ["tdd", "agent", "always"]]));
    t.ok(twice.errors.length === 1 && twice.errors[0].line === 2 && twice.errors[0].message.includes("twice"),
        "a name listed twice for one kind is an error on the second line; the same name as another kind is not",
        JSON.stringify(twice.errors));
};

exports.profileSelection = function profileSelection(t) {
    const profiles = module_();
    if (!profiles) { t.skip("profile selection: no scripts/profiles.js here"); return; }
    const one = (when, facts) => {
        const { rows, errors } = profiles.parse(tsv([["x", "skill", when]]));
        if (errors.length) return { error: errors[0].message };
        return profiles.select(facts, rows)[0];
    };
    const cases = [
        // [when, facts, active, open]
        ["always", {}, true, []],
        ["Language = C#", { Language: "C#" }, true, []],
        ["Language = C#", { Language: "C# 13" }, true, []],
        ["Language = C#", { Language: "TypeScript, C#" }, true, []],
        ["Language = C#", { Language: "c#" }, true, []],
        ["Language = C#", { Language: "TypeScript" }, false, []],
        ["Language = C#", { Language: "C++" }, false, []],
        ["Frontend != none", { Frontend: "React" }, true, []],
        ["Frontend != none", { Frontend: "None" }, false, []],
        ["Runtime / package manager = dotnet", { "Runtime / package manager": ".NET 10 / dotnet" }, true, []],
        ["Roles = marketing", { Roles: "engineer, marketing" }, true, []],
        ["Roles = marketing", { Roles: "engineer, devops" }, false, []],
        ["Language = C# and Frontend != none", { Language: "C#", Frontend: "none" }, false, []],
        ["Language = PHP or Frontend != none", { Language: "C#", Frontend: "Vue" }, true, []],
        // Failing open: no line (null), an empty or placeholder-only answer (""), or a fact this
        // version does not read at all (undefined) keeps the row, and says which fact did it.
        ["Language = C#", { Language: null }, true, ["Language"]],
        ["Frontend != none", { Frontend: "" }, true, ["Frontend"]],
        ["Roles = marketing", {}, true, ["Roles"]],
        ["Language = C# and Roles = devops", { Language: "C#" }, true, ["Roles"]],
        ["Language = C# and Roles = devops", { Language: "PHP" }, false, []],
    ];
    for (const [when, facts, active, open] of cases) {
        const r = one(when, facts);
        t.ok(!r.error && r.active === active && JSON.stringify(r.open) === JSON.stringify(open),
            `"${when}" over ${JSON.stringify(facts)} is ${active ? "active" : "inactive"}${open.length ? `, open on ${open.join(", ")}` : ""}`,
            JSON.stringify(r));
    }
};

exports.profilePlan = function profilePlan(t) {
    const profiles = module_();
    if (!profiles) { t.skip("profile plan: no scripts/profiles.js here"); return; }
    const repoView = require(path.join(lib.checkout, "scripts", "repo-view.js"));
    const skill = (name, description, extra = "") => `---\nname: ${name}\ndescription: ${description}\n${extra}---\n# ${name}\n`;
    const view = repoView.fromMap({
        "MEMORY.md": "# Memory\n\n- **Language:** C#\n- **Frontend:** none\n",
        "scripts/profiles.tsv": tsv([
            ["tdd", "skill", "always"],
            ["frontend-design", "skill", "Frontend != none"],
            ["ef-core", "skill", "Language = C#"],
            ["retro", "skill", "always"],
            ["ads", "skill", "Roles = marketing"],
            ["gone", "skill", "always"],
            ["engineer", "agent", "Roles = engineer"],
            ["atlassian", "mcp", "Issue tracker = Jira"],
        ]),
        ".agents/skills/tdd/SKILL.md": skill("tdd", "1234567890"),
        ".agents/skills/frontend-design/SKILL.md": skill("frontend-design", "12345"),
        ".agents/skills/ef-core/SKILL.md": skill("ef-core", "123"),
        ".agents/skills/retro/SKILL.md": skill("retro", "12345678901234567890", "disable-model-invocation: true\n"),
        ".agents/skills/ads/SKILL.md": skill("ads", "1234567"),
        ".agents/skills/mine/SKILL.md": skill("mine", "12"),
        ".agents/agents/engineer.md": "---\nname: engineer\ndescription: x\n---\n",
        ".mcp.json": JSON.stringify({ mcpServers: { atlassian: { type: "http", url: "https://example.invalid" } } }),
    });
    const p = profiles.plan(view);
    const want = {
        skill: { active: ["ads", "ef-core", "mine", "retro", "tdd"], inactive: ["frontend-design"] },
        agent: { active: ["engineer"], inactive: [] },
        mcp: { active: ["atlassian"], inactive: [] },
    };
    t.ok(JSON.stringify(p.kinds) === JSON.stringify(want),
        "plan sorts what is on disk into active and inactive; an entry with no row stays active", JSON.stringify(p.kinds));
    // tdd 10 + ef-core 3 + ads 7 + mine 2 active, frontend-design 5 more in total; retro is user-only.
    t.ok(p.chars.active === 22 && p.chars.total === 27,
        "the description count covers model-invocable skills only, active against all", JSON.stringify(p.chars));
    t.ok(JSON.stringify(p.open) === JSON.stringify(["Issue tracker", "Roles"]),
        "plan names the facts left open, each once, sorted", JSON.stringify(p.open));
    t.ok(JSON.stringify(p.unlisted) === JSON.stringify(["skill mine"]) && JSON.stringify(p.missing) === JSON.stringify(["skill gone"]),
        "plan reports an entry with no row and a row with no entry", JSON.stringify([p.unlisted, p.missing]));

    const overridden = profiles.plan(view, { facts: { Language: "PHP", Frontend: "Vue", Roles: "engineer", "Issue tracker": "none" } });
    t.ok(JSON.stringify(overridden.kinds.skill.inactive) === JSON.stringify(["ads", "ef-core"])
        && JSON.stringify(overridden.kinds.mcp.inactive) === JSON.stringify(["atlassian"]) && !overridden.open.length,
        "plan takes facts in place of MEMORY.md's, for a profile the project does not hold", JSON.stringify(overridden.kinds));

    const broken = profiles.plan(repoView.fromMap({ "scripts/profiles.tsv": "tdd\tplugin\talways\n" }));
    t.ok(broken.errors.length === 1, "plan carries the table's errors", JSON.stringify(broken.errors));
    const none = profiles.plan(repoView.fromMap({}));
    t.ok(none.errors.length === 1 && none.errors[0].message.includes("not found"), "a missing table is an error", JSON.stringify(none.errors));
};

// The upstream's own table: every skill, agent and server this checkout ships is classified, every
// row names one of them, and the RFC's reference profile stays under its cap (RFC-0001/C-1).
exports.profileTableCoversThisCheckout = function profileTableCoversThisCheckout(t) {
    const profiles = module_();
    if (!profiles || !fs.existsSync(path.join(lib.checkout, "scripts", "profiles.tsv"))) {
        t.skip("profile table coverage: no table here"); return;
    }
    const repoView = require(path.join(lib.checkout, "scripts", "repo-view.js"));
    const view = repoView.worktree(lib.checkout);
    const p = profiles.plan(view);
    t.ok(!p.errors.length, "scripts/profiles.tsv parses with no errors", p.errors.map(e => `${e.line}: ${e.message}`).join("\n"));
    t.ok(!p.unlisted.length, "every skill, agent and MCP server shipped here has a row in scripts/profiles.tsv", p.unlisted.join(", "));
    t.ok(!p.missing.length, "every row in scripts/profiles.tsv names something shipped here", p.missing.join(", "));
    const reference = profiles.plan(view, { facts: profiles.REFERENCE });
    t.ok(reference.chars.active <= profiles.BUDGET,
        `the reference profile loads at most ${profiles.BUDGET} description characters`,
        `${reference.chars.active} of ${reference.chars.total}`);
    t.ok(!reference.open.length, "the reference profile answers every fact a row asks", reference.open.join(", "));
};
