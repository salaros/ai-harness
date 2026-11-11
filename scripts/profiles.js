#!/usr/bin/env node
// scripts/profiles.js
// The one reader of scripts/profiles.tsv: which skills, agents and MCP servers a project's facts
// make active (SPEC-0004). A module first, as skills.js is: parse(text) reads the table, select()
// is a pure function of the facts and the rows, and plan(view) reads both through a repo view and
// says what the profile would do. Nothing here writes, prints or exits; the command line below
// is a wrapper.
//   node scripts/profiles.js plan [--json]   the active set and its description size; exit 1 on table errors
// The selector fails open: a test over a fact the project has not answered is true, and the fact
// is reported as open. A profile narrows what a project has; a missing fact never hides anything,
// so the upstream, which has no MEMORY.md, keeps everything.
const path = require("path");
const lib = require("./lib");
const repoView = require("./repo-view");
const projectFacts = require("./project-facts");

const FILE = "scripts/profiles.tsv";
const KINDS = ["skill", "agent", "mcp"];
const COLUMNS = ["name", "kind", "when"];
const SKILLS = ".agents/skills", AGENTS = ".agents/agents";
const CATALOG_SKILLS = ".agents/catalog/skills", CATALOG_AGENTS = ".agents/catalog/agents";

// RFC-0001's reference profile and the cap it must load under (RFC-0001/C-1): the check that the
// table keeps its promise, run on the upstream by its decision table.
const REFERENCE = { "Unit type": "daemon", Language: "C#", Frontend: "none", "Issue tracker": "none", Roles: "engineer, devops" };
const BUDGET = 14300;

// The facts a condition may name: MEMORY.md's, and Roles until project-facts.js reads it itself.
// A label is matched case-insensitively and reported as MEMORY.md writes it.
const factLabels = () => {
    const labels = projectFacts.FACTS.map(f => f.label);
    return new Map([...labels, ...(labels.includes("Roles") ? [] : ["Roles"])].map(l => [l.toLowerCase(), l]));
};

// A condition: clauses joined by " or ", each tests joined by " and ", each test `always`,
// `<fact> = <value>` or `<fact> != <value>`. Returns { clauses } or { error }.
function parseWhen(when, labels) {
    if (!when) return { error: "empty condition: write always for a row that is always active" };
    const clauses = [];
    for (const clause of when.split(/\s+or\s+/i)) {
        const tests = [];
        for (const raw of clause.split(/\s+and\s+/i)) {
            const test = raw.trim();
            if (/^always$/i.test(test)) { tests.push({ always: true }); continue; }
            const m = test.match(/^([^=!<>~]+?)\s*(!=|=)\s*([^=!<>~]+)$/);
            if (!m) return { error: `"${test}" is not a test: write always, <fact> = <value> or <fact> != <value>` };
            const label = labels.get(m[1].trim().toLowerCase());
            if (!label) return { error: `unknown fact "${m[1].trim()}": one of ${[...labels.values()].join(", ")}` };
            tests.push({ fact: label, op: m[2], value: m[3].trim() });
        }
        clauses.push(tests);
    }
    return { clauses };
}

// The table's rows, each with the line it came from, and an error per line that cannot be read.
function parse(text) {
    const labels = factLabels();
    const rows = [], errors = [], seen = new Set();
    text.split(/\r?\n/).forEach((raw, i) => {
        const line = i + 1;
        if (!raw.trim() || raw.startsWith("#")) return;
        const cells = raw.split("\t").map(c => c.trim());
        if (cells.length !== COLUMNS.length) {
            errors.push({ line, message: `${cells.length} cells, expected ${COLUMNS.length}: ${COLUMNS.join(" | ")}` });
            return;
        }
        const [name, kind, when] = cells;
        if (!KINDS.includes(kind)) { errors.push({ line, message: `unknown kind "${kind}": one of ${KINDS.join(", ")}` }); return; }
        const key = `${kind} ${name}`;
        if (seen.has(key)) { errors.push({ line, message: `${name} is listed twice as a ${kind}` }); return; }
        seen.add(key);
        const parsed = parseWhen(when, labels);
        if (parsed.error) { errors.push({ line, message: parsed.error }); return; }
        rows.push({ line, name, kind, when, clauses: parsed.clauses });
    });
    return { rows, errors };
}

// A fact's value as the words a test compares: split on "," and "/", the first word of each item,
// lowercased. "C# 13" is c#, "TypeScript, C#" is typescript and c#, ".NET 10 / dotnet" is .net and dotnet.
const items = value => value.split(/[,/]/).map(s => s.trim().split(/\s+/)[0].toLowerCase()).filter(Boolean);
const unanswered = value => value === null || value === undefined || value === "";

// Each row with whether it is active and the facts left open that made it so. A clause's open
// facts count only when that clause is the one that held.
function select(facts, rows) {
    return rows.map(row => {
        for (const tests of row.clauses) {
            const open = [];
            const holds = tests.every(t => {
                if (t.always) return true;
                const value = facts[t.fact];
                if (unanswered(value)) { open.push(t.fact); return true; }
                const hit = items(value).includes(t.value.toLowerCase());
                return t.op === "=" ? hit : !hit;
            });
            if (holds) return { ...row, active: true, open };
        }
        return { ...row, active: false, open: [] };
    });
}

// What is on disk to be selected: skills and agents from the catalog and from the folders the
// harnesses read, MCP servers from the files that register them.
const json = (view, file) => { try { return JSON.parse(view.read(file)); } catch { return null; } };
function present(view) {
    const skills = new Map();
    for (const dir of [CATALOG_SKILLS, SKILLS]) {
        for (const name of view.list(dir)) {
            const file = `${dir}/${name}/SKILL.md`;
            if (!skills.has(name) && view.isFile(file)) skills.set(name, file);
        }
    }
    const agents = new Set([CATALOG_AGENTS, AGENTS].flatMap(dir => view.list(dir).filter(n => n.endsWith(".md")).map(n => n.slice(0, -3))));
    const mcp = new Set([
        ...Object.keys((json(view, ".mcp.json") || {}).mcpServers || {}),
        ...Object.keys((json(view, "opencode.json") || {}).mcp || {}),
    ]);
    return { skill: skills, agent: agents, mcp };
}

// The length of a skill's description as a harness lists it, or 0 for one no harness lists.
function descriptionSize(view, file) {
    const fm = require("./skills").frontmatter(view.read(file) || "") || {};
    return fm["disable-model-invocation"] === "true" ? 0 : (fm.description || "").length;
}

// What the profile would do, changing nothing. `facts` stands in for MEMORY.md's, to ask about a
// profile the project does not hold.
function plan(view, { facts } = {}) {
    const text = view.read(FILE);
    const { rows, errors } = text === null ? { rows: [], errors: [{ line: 0, message: `${FILE} not found` }] } : parse(text);
    const memory = facts || projectFacts.readFacts({ memory: view.read(projectFacts.MEMORY), intent: view.read(projectFacts.INTENT) });
    const selection = select(memory, rows);
    const on = disk => new Set(disk instanceof Map ? disk.keys() : disk);
    const disk = present(view);
    const byKey = new Map(selection.map(s => [`${s.kind} ${s.name}`, s]));
    const kinds = {}, unlisted = [];
    for (const kind of KINDS) {
        kinds[kind] = { active: [], inactive: [] };
        for (const name of [...on(disk[kind])].sort()) {
            const s = byKey.get(`${kind} ${name}`);
            if (!s) unlisted.push(`${kind} ${name}`);
            kinds[kind][!s || s.active ? "active" : "inactive"].push(name);
        }
    }
    const missing = selection.filter(s => !on(disk[s.kind]).has(s.name)).map(s => `${s.kind} ${s.name}`);
    const chars = { active: 0, total: 0 };
    for (const [name, file] of disk.skill) {
        const size = descriptionSize(view, file);
        chars.total += size;
        if (kinds.skill.active.includes(name)) chars.active += size;
    }
    const open = [...new Set(selection.flatMap(s => s.open))].sort();
    return { kinds, chars, open, unlisted, missing, errors };
}

function printPlan(p) {
    const n = x => x.toLocaleString("en-US");
    const count = kind => `${p.kinds[kind].active.length} of ${p.kinds[kind].active.length + p.kinds[kind].inactive.length} active`;
    const share = p.chars.total ? ` (${Math.round(100 * p.chars.active / p.chars.total)}%)` : "";
    console.log(`skills: ${count("skill")}, ${n(p.chars.active)} of ${n(p.chars.total)} description characters${share}`);
    console.log(`agents: ${count("agent")}`);
    console.log(`mcp: ${count("mcp")}`);
    console.log(`open facts: ${p.open.join(", ") || "none"}`);
    for (const kind of KINDS) if (p.kinds[kind].inactive.length) console.log(`inactive ${kind}s: ${p.kinds[kind].inactive.join(", ")}`);
    for (const u of p.unlisted) console.log(`no row: ${u}. Add one to ${FILE}`);
    for (const m of p.missing) console.log(`nothing to select: ${m} has a row but is not shipped here`);
}

const commands = {
    plan(root, ...args) {
        const p = plan(repoView.worktree(root));
        if (args.includes("--json")) console.log(JSON.stringify(p, null, 2));
        else printPlan(p);
        for (const e of p.errors) console.error(`${FILE}:${e.line}: ${e.message}`);
        return p.errors.length ? 1 : 0;
    },
};

if (require.main === module) {
    const [cmd, ...args] = lib.args();
    if (!commands[cmd]) { console.error(`usage: node scripts/profiles.js <${Object.keys(commands).join("|")}>`); process.exit(2); }
    process.exit(commands[cmd](lib.root(), ...args));
}

module.exports = { FILE, KINDS, REFERENCE, BUDGET, parse, select, plan };
