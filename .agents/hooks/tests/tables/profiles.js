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

// apply and its MCP adapter (SPEC-0004/D-4, D-5): a server is switched off, never removed. Claude
// Code reads disabledMcpjsonServers in .claude/settings.json (verified 2026-11-11 with claude mcp
// list: a server listed there is not loaded), OpenCode reads `enabled` on each entry of opencode.json.
exports.profileApplyMcp = function profileApplyMcp(t) {
    const profiles = module_();
    if (!profiles || !profiles.applyTo) { t.skip("profile apply: no apply here"); return; }
    const repoEdit = require(path.join(lib.checkout, "scripts", "repo-edit.js"));
    const table = tsv([["tdd", "skill", "always"], ["atlassian", "mcp", "Issue tracker = Jira"], ["figma", "mcp", "Frontend != none"]]);
    const mcpJson = JSON.stringify({ mcpServers: { atlassian: { type: "http", url: "a" }, figma: { type: "http", url: "f" }, ours: { type: "http", url: "o" } } }, null, 2) + "\n";
    const settings = JSON.stringify({ hooks: { Stop: [] }, disabledMcpjsonServers: ["ours"] }, null, 4) + "\n";
    const opencode = JSON.stringify({ mcp: { atlassian: { type: "remote", url: "a", enabled: true }, figma: { type: "remote", url: "f" } } }, null, 2) + "\n";
    const memory = tracker => `# Memory\n\n- **Issue tracker:** ${tracker}\n- **Frontend:** React\n`;
    const edit = repoEdit.mapEdit({
        "scripts/profiles.tsv": table, "MEMORY.md": memory("none"), ".mcp.json": mcpJson,
        ".claude/settings.json": settings, "opencode.json": opencode,
    });
    const read = file => JSON.parse(edit.view().read(file));

    const dry = profiles.applyTo(edit.view(), edit, { dryRun: true });
    t.ok(dry.entries.length === 2 && read(".claude/settings.json").disabledMcpjsonServers.length === 1,
        "a dry run returns the entries and writes nothing", JSON.stringify(dry.entries.map(e => e.file)));

    const first = profiles.applyTo(edit.view(), edit);
    const s = read(".claude/settings.json");
    t.ok(JSON.stringify(s.disabledMcpjsonServers) === JSON.stringify(["ours", "atlassian"]) && "hooks" in s,
        "an inactive server joins disabledMcpjsonServers beside the project's own, and every other key stays", JSON.stringify(s));
    t.ok(edit.view().read(".claude/settings.json").includes('\n    "hooks"'), "the settings file keeps its indent",
        edit.view().read(".claude/settings.json"));
    const o = read("opencode.json").mcp;
    t.ok(o.atlassian.enabled === false && !("enabled" in o.figma),
        "OpenCode's entry for an inactive server is disabled, and an active one is left as it was", JSON.stringify(o));
    t.ok(!first.problems.length && first.lines.some(l => l.includes("atlassian")), "apply says what it switched", JSON.stringify(first));
    t.ok(edit.view().read(".mcp.json") === mcpJson, ".mcp.json is never edited, so its merge with the upstream sees no change");

    const again = profiles.applyTo(edit.view(), edit);
    t.ok(!again.entries.length && !again.lines.length, "a second run changes nothing", JSON.stringify(again));

    edit.apply([{ file: "MEMORY.md", write: memory("Jira (PROJ)") }]);
    profiles.applyTo(edit.view(), edit);
    t.ok(JSON.stringify(read(".claude/settings.json").disabledMcpjsonServers) === JSON.stringify(["ours"])
        && read("opencode.json").mcp.atlassian.enabled === true,
        "answering the fact switches the server back on, and the project's own entry stays", edit.view().read(".claude/settings.json"));

    const plain = repoEdit.mapEdit({ "scripts/profiles.tsv": table, ".mcp.json": mcpJson, ".claude/settings.json": settings });
    t.ok(!profiles.applyTo(plain.view(), plain).entries.length,
        "with no MEMORY.md every server stays on, and the project's own switches are left alone");

    const broken = repoEdit.mapEdit({ "scripts/profiles.tsv": table, "MEMORY.md": memory("none"), ".mcp.json": mcpJson, ".claude/settings.json": "{ not json" });
    const b = profiles.applyTo(broken.view(), broken);
    t.ok(!b.entries.length && b.problems.length === 1 && broken.view().read(".claude/settings.json") === "{ not json",
        "a settings file that is not JSON is left as it is and reported", JSON.stringify(b));

    const bad = repoEdit.mapEdit({ "scripts/profiles.tsv": "atlassian\tplugin\talways\n", "MEMORY.md": memory("none"), ".mcp.json": mcpJson, ".claude/settings.json": settings });
    const r = profiles.applyTo(bad.view(), bad);
    t.ok(!r.entries.length && r.problems.length === 1 && r.problems[0].includes(":1:"),
        "a table with an error changes nothing", JSON.stringify(r));
};

// SPEC-0004/D-6 for agents (ADR-0009/D-2, D-3): an active catalog agent gets a generated link in
// .agents/agents, listed in the clone's exclude block; an inactive one loses it; the project's own
// file of the same name wins; and a clone that refuses the link gets a copy that later runs keep.
exports.profileApplyAgents = function profileApplyAgents(t) {
    const profiles = module_();
    if (!profiles || !profiles.applyTo || !profiles.EXCLUDE) { t.skip("profile apply for agents: no agent adapter here"); return; }
    const repoEdit = require(path.join(lib.checkout, "scripts", "repo-edit.js"));
    const table = tsv([["engineer", "agent", "Roles = engineer"], ["devops", "agent", "Roles = devops"], ["marketing", "agent", "Roles = marketing"]]);
    const memory = roles => `# Memory\n\n- **Roles:** ${roles}\n`;
    const agent = name => `---\nname: ${name}\n---\n`;
    const exclude = "# the clone's own\n*.log\n";
    const files = roles => ({
        "scripts/profiles.tsv": table, "MEMORY.md": memory(roles), ".git/info/exclude": exclude,
        ".agents/catalog/agents/engineer.md": agent("engineer"), ".agents/catalog/agents/devops.md": agent("devops"),
        ".agents/catalog/agents/marketing.md": agent("marketing"),
    });
    const edit = repoEdit.mapEdit(files("engineer, devops"));
    const view = () => edit.view();

    const dry = profiles.applyTo(view(), edit, { dryRun: true });
    t.ok(dry.entries.length === 3 && !view().lstat(".agents/agents/engineer.md"),
        "a dry run returns two links and the exclude block, and writes nothing", JSON.stringify(dry.entries.map(e => e.file)));

    const first = profiles.applyTo(view(), edit);
    t.ok(view().lstat(".agents/agents/engineer.md").link === "../catalog/agents/engineer.md"
        && view().lstat(".agents/agents/devops.md").link === "../catalog/agents/devops.md"
        && !view().lstat(".agents/agents/marketing.md"),
        "each active agent is linked into the catalog, and an inactive one is not", JSON.stringify(first));
    const block = view().read(".git/info/exclude");
    t.ok(block.startsWith(exclude) && block.includes("\n/.agents/agents/devops.md\n/.agents/agents/engineer.md\n# end ai-harness profiles\n"),
        "the exclude block lists the links after the clone's own lines", block);
    t.ok(first.lines.some(l => l.includes("linked devops, engineer")), "apply names what it linked", JSON.stringify(first.lines));

    const again = profiles.applyTo(view(), edit);
    t.ok(!again.entries.length && !again.lines.length, "a second run changes nothing", JSON.stringify(again));

    edit.apply([{ file: "MEMORY.md", write: memory("engineer") }]);
    const narrowed = profiles.applyTo(view(), edit);
    t.ok(!view().lstat(".agents/agents/devops.md") && view().lstat(".agents/agents/engineer.md")
        && !view().read(".git/info/exclude").includes("devops"),
        "dropping a role removes its link and its line in the block", JSON.stringify(narrowed));

    edit.apply([{ file: "MEMORY.md", write: memory("") }]);
    profiles.applyTo(view(), edit);
    t.ok(["engineer", "devops", "marketing"].every(n => view().lstat(`.agents/agents/${n}.md`)),
        "with Roles unanswered every agent is linked, failing open");

    const own = repoEdit.mapEdit({ ...files("engineer"), ".agents/agents/engineer.md": "# the project's engineer\n" });
    const shadowed = profiles.applyTo(own.view(), own);
    t.ok(own.view().read(".agents/agents/engineer.md") === "# the project's engineer\n"
        && !shadowed.entries.some(e => e.file === ".agents/agents/engineer.md"),
        "the project's own agent of a catalog name is left alone", JSON.stringify(shadowed.entries));
    const p = profiles.plan(own.view());
    t.ok(p.shadowed.includes("agent engineer"), "plan reports the shadow", JSON.stringify(p.shadowed));

    // A clone that refuses links: the link entry fails, and the copy stands in for it.
    const refusing = repoEdit.mapEdit(files("engineer"));
    const refuse = { view: () => refusing.view(), apply: entries => entries.map(e => e.link !== undefined
        ? { file: e.file, kind: "link", done: false, why: "symlinks refused" } : refusing.apply([e])[0]) };
    const copied = profiles.applyTo(refusing.view(), refuse);
    t.ok(refusing.view().read(".agents/agents/engineer.md") === agent("engineer") && !copied.problems.length
        && copied.lines.some(l => l.includes("copied from the catalog")),
        "where the link is refused, the agent is copied and the run says so", JSON.stringify(copied));
    t.ok(!profiles.applyTo(refusing.view(), refuse).entries.length, "a copy that matches the catalog is current");
    refusing.apply([{ file: ".agents/catalog/agents/engineer.md", write: agent("engineer") + "changed\n" }]);
    profiles.applyTo(refusing.view(), refuse);
    t.ok(refusing.view().read(".agents/agents/engineer.md").includes("changed"), "a copy that drifted from the catalog is rewritten");

    // An agent the catalog dropped loses its generated entry.
    const dropped = repoEdit.mapEdit(files("engineer"));
    profiles.applyTo(dropped.view(), dropped);
    dropped.apply([{ file: ".agents/catalog/agents/engineer.md", remove: true }]);
    const gone = profiles.applyTo(dropped.view(), dropped);
    t.ok(!dropped.view().lstat(".agents/agents/engineer.md") && dropped.view().read(".git/info/exclude") === exclude,
        "a generated entry whose catalog agent is gone is removed, and so is the block it was in", JSON.stringify(gone));

    const { ".git/info/exclude": _, ...outside } = files("engineer");
    const nogit = repoEdit.mapEdit(outside);
    profiles.applyTo(nogit.view(), nogit, { exclude: null });
    t.ok(nogit.view().lstat(".agents/agents/engineer.md") && nogit.view().read(".git/info/exclude") === null,
        "outside a Git checkout the links are made and no exclude file is written");
};

// SPEC-0004/D-6 and D-7 for skills (ADR-0009/D-2): the agents' rules, for folders, plus the two
// fallbacks a folder has, a junction and then a copy, and collecting what `npx skills` wrote.
exports.profileApplySkills = function profileApplySkills(t) {
    const profiles = module_();
    if (!profiles || !profiles.applyTo || !profiles.EXCLUDE) { t.skip("profile apply for skills: no skill adapter here"); return; }
    const repoEdit = require(path.join(lib.checkout, "scripts", "repo-edit.js"));
    const table = tsv([["tdd", "skill", "always"], ["frontend-design", "skill", "Frontend != none"]]);
    const memory = frontend => `# Memory\n\n- **Frontend:** ${frontend}\n`;
    const skill = (name, extra = "") => `---\nname: ${name}\ndescription: ${name}\n---\n${extra}`;
    const files = (frontend, more = {}) => ({
        "scripts/profiles.tsv": table, "MEMORY.md": memory(frontend), ".git/info/exclude": "",
        ".agents/catalog/skills/tdd/SKILL.md": skill("tdd"), ".agents/catalog/skills/tdd/refs/a.md": "a\n",
        ".agents/catalog/skills/frontend-design/SKILL.md": skill("frontend-design"), ...more,
    });
    // A view whose index holds nothing: what a clone looks like right after `npx skills add`.
    const untracked = edit => ({ ...edit.view(), recorded: () => [] });

    const edit = repoEdit.mapEdit(files("none"));
    const first = profiles.applyTo(edit.view(), edit);
    t.ok(edit.view().lstat(".agents/skills/tdd").link === "../catalog/skills/tdd" && !edit.view().lstat(".agents/skills/frontend-design"),
        "an active skill is linked into the catalog as a folder, and an inactive one is not", JSON.stringify(first));
    t.ok(edit.view().read(".git/info/exclude").includes("/.agents/skills/tdd\n"), "the link is listed in the exclude block",
        edit.view().read(".git/info/exclude"));
    t.ok(!profiles.applyTo(edit.view(), edit).entries.length, "a second run changes nothing");
    edit.apply([{ file: "MEMORY.md", write: memory("React") }]);
    profiles.applyTo(edit.view(), edit);
    edit.apply([{ file: "MEMORY.md", write: memory("none") }]);
    const narrowed = profiles.applyTo(edit.view(), edit);
    t.ok(!edit.view().lstat(".agents/skills/frontend-design") && narrowed.lines.some(l => l.includes("switched off frontend-design")),
        "a skill the facts switch off loses its link", JSON.stringify(narrowed));

    const own = repoEdit.mapEdit(files("none", { ".agents/skills/tdd/SKILL.md": skill("tdd", "ours\n") }));
    const shadowed = profiles.applyTo(own.view(), own);
    t.ok(own.view().read(".agents/skills/tdd/SKILL.md").includes("ours") && !shadowed.entries.some(e => e.file === ".agents/skills/tdd")
        && profiles.plan(own.view()).shadowed.includes("skill tdd"),
        "the project's own tracked skill of a catalog name is left alone, and plan reports the shadow", JSON.stringify(shadowed.entries));

    // npx skills add: an untracked folder the lock records moves into the catalog, over any copy
    // there, and is then linked. One the lock does not record is somebody's own work, left alone.
    const lock = JSON.stringify({ version: 1, skills: { tdd: { source: "x/y" }, added: { source: "x/y" } } });
    const added = repoEdit.mapEdit(files("none", {
        "skills-lock.json": lock, ".agents/skills/added/SKILL.md": skill("added", "new\n"),
        ".agents/catalog/skills/added/SKILL.md": skill("added", "old\n"), ".agents/skills/handmade/SKILL.md": skill("handmade"),
    }));
    const collected = profiles.applyTo(untracked(added), added);
    t.ok(added.view().read(".agents/catalog/skills/added/SKILL.md").includes("new")
        && added.view().lstat(".agents/skills/added").link === "../catalog/skills/added"
        && added.view().read(".agents/skills/handmade/SKILL.md") === skill("handmade")
        && collected.lines.some(l => l.includes("collected added")) && !collected.problems.length,
        "a folder npx skills wrote is collected into the catalog over the old copy and linked; one it did not write stays",
        JSON.stringify(collected));

    // npx skills experimental_install replaces a generated link with a folder of its own. The next
    // run puts the link back, rather than refusing it for the folder in the way.
    const restored = repoEdit.mapEdit(files("none"));
    profiles.applyTo(restored.view(), restored);
    restored.apply([{ file: ".agents/skills/tdd", remove: true }, { file: ".agents/skills/tdd/SKILL.md", write: skill("tdd", "upstream\n") }]);
    const relinked = profiles.applyTo(restored.view(), restored);
    t.ok(restored.view().lstat(".agents/skills/tdd").link === "../catalog/skills/tdd" && !relinked.problems.length
        && !relinked.lines.some(l => l.includes("copied")),
        "a folder written over a generated link is replaced by the link again", JSON.stringify(relinked));

    // npx skills update does the same with a newer version. Where the clone still holds a generated
    // link, apply never wrote a copy, so the folder is the CLI's and the update reaches the catalog.
    const updating = repoEdit.mapEdit(files("React", { "skills-lock.json": lock }));
    profiles.applyTo(updating.view(), updating);
    updating.apply([{ file: ".agents/skills/tdd", remove: true }, { file: ".agents/skills/tdd/SKILL.md", write: skill("tdd", "newer\n") }]);
    const updated = profiles.applyTo(untracked(updating), updating);
    t.ok(updating.view().read(".agents/catalog/skills/tdd/SKILL.md").includes("newer")
        && updating.view().lstat(".agents/skills/tdd").link === "../catalog/skills/tdd" && !updated.problems.length,
        "an update npx skills wrote over a generated link is collected into the catalog and linked", JSON.stringify(updated));

    // A clone that refuses symlinks gets an absolute junction, rewritten once the clone has moved.
    const junctions = repoEdit.mapEdit(files("none"), { links: false });
    profiles.applyTo(junctions.view(), junctions, { root: "/clone" });
    const target = junctions.view().lstat(".agents/skills/tdd").link;
    t.ok(target && target.endsWith("/clone/.agents/catalog/skills/tdd"), "where the symlink is refused, a junction points at the catalog", target);
    t.ok(!profiles.applyTo(junctions.view(), junctions, { root: "/clone" }).entries.length, "a junction into this clone's catalog is current");
    profiles.applyTo(junctions.view(), junctions, { root: "/moved" });
    t.ok(junctions.view().lstat(".agents/skills/tdd").link.endsWith("/moved/.agents/catalog/skills/tdd"),
        "a junction into another folder's catalog is rewritten", junctions.view().lstat(".agents/skills/tdd").link);

    // And one that refuses junctions too gets a copy of the folder, kept while it matches.
    const copies = repoEdit.mapEdit(files("none"), { links: false, junctions: false });
    const copied = profiles.applyTo(copies.view(), copies, { root: "/clone" });
    t.ok(copies.view().read(".agents/skills/tdd/refs/a.md") === "a\n" && copied.lines.some(l => l.includes("copied from the catalog")),
        "where no link can be made, the skill folder is copied and the run says so", JSON.stringify(copied));
    t.ok(!profiles.applyTo(copies.view(), copies, { root: "/clone" }).entries.length, "a copy that matches the catalog is current");
    copies.apply([{ file: ".agents/catalog/skills/tdd/refs/a.md", write: "b\n" }]);
    profiles.applyTo(copies.view(), copies, { root: "/clone" });
    t.ok(copies.view().read(".agents/skills/tdd/refs/a.md") === "b\n", "a copy that drifted from the catalog is rewritten");

    edit.apply([{ file: ".agents/catalog/skills/tdd", remove: true }]);
    profiles.applyTo(edit.view(), edit);
    t.ok(!edit.view().lstat(".agents/skills/tdd") && !edit.view().read(".git/info/exclude").includes("tdd"),
        "a generated link whose catalog skill is gone is removed");
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
    // A project that only gathers requirements (SPEC-0004/D-11): no language, so the coding skills
    // and the engineering agents go off, and the chain up to SPEC stays on.
    const requirements = profiles.plan(view, { facts: { ...profiles.REFERENCE, Language: "none", Roles: "product-manager, business-analyst" } });
    const coding = ["tdd", "implement", "codebase-design", "code-review", "pr-sweep", "create-implementation-plan"];
    const chain = ["pdd", "brd", "prd", "trd", "feature-forge", "bdd-scenarios", "rfc", "grill-with-docs", "spec", "git-commit", "loose-ends"];
    t.ok(coding.every(n => requirements.kinds.skill.inactive.includes(n)),
        "a requirements-only profile switches the coding skills off", coding.filter(n => !requirements.kinds.skill.inactive.includes(n)).join(", "));
    t.ok(chain.every(n => requirements.kinds.skill.active.includes(n)),
        "a requirements-only profile keeps the chain up to SPEC", chain.filter(n => !requirements.kinds.skill.active.includes(n)).join(", "));
    t.ok(["engineer", "devops"].every(n => requirements.kinds.agent.inactive.includes(n)) && requirements.kinds.agent.active.includes("business-analyst"),
        "a requirements-only profile keeps the requirements agents and drops the engineering ones", requirements.kinds.agent.active.join(", "));
    t.ok(coding.every(n => reference.kinds.skill.active.includes(n)), "the reference profile keeps the coding skills",
        coding.filter(n => !reference.kinds.skill.active.includes(n)).join(", "));
};

// Git checks .claude/skills out before apply makes .agents/skills, and Windows then records a file
// link, which opens as nothing once the folder exists. apply remakes it as a folder link with the
// same target. Only Windows records the kind, so elsewhere there is nothing to repair.
exports.folderLinkMadeBeforeItsFolderIsRepaired = function folderLinkMadeBeforeItsFolderIsRepaired(t) {
    const profiles = module_();
    if (!profiles || !profiles.repairFolderLinks) { t.skip("folder link repair: no scripts/profiles.js here"); return; }
    if (process.platform !== "win32") { t.skip("folder link repair: only Windows records a symlink's kind"); return; }
    const root = fs.mkdtempSync(path.join(require("os").tmpdir(), "folder-link-"));
    try {
        fs.mkdirSync(path.join(root, ".claude"));
        try { fs.symlinkSync(path.join("..", ".agents", "skills"), path.join(root, ".claude", "skills"), "file"); }
        catch { t.skip("folder link repair: this machine refuses symlinks"); return; }
        fs.mkdirSync(path.join(root, ".agents", "skills", "tdd"), { recursive: true });
        fs.writeFileSync(path.join(root, ".agents", "skills", "tdd", "SKILL.md"), "x\n");
        const lines = profiles.repairFolderLinks(root);
        t.ok(lines.length === 1 && fs.existsSync(path.join(root, ".claude", "skills", "tdd", "SKILL.md")),
            "a file link to the skills folder is remade as a folder link", lines.join("\n"));
        t.ok(fs.readlinkSync(path.join(root, ".claude", "skills")).split(path.sep).join("/") === "../.agents/skills",
            "the remade link keeps its relative target, so Git sees no change", fs.readlinkSync(path.join(root, ".claude", "skills")));
        t.ok(!profiles.repairFolderLinks(root).length, "a folder link that opens is left alone", "");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
};
