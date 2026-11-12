#!/usr/bin/env node
// scripts/profiles.js
// The one reader of scripts/profiles.tsv: which skills, agents and MCP servers a project's facts
// make active (SPEC-0004). A module first, as skills.js is: parse(text) reads the table, select()
// is a pure function of the facts and the rows, and plan(view) reads both through a repo view and
// says what the profile would do. applyTo(view, edit) is the one act that changes a file, through a
// repo edit. Nothing here prints or exits; the command line below is a wrapper.
//   node scripts/profiles.js plan [--json]      the active set and its description size; exit 1 on table errors
//   node scripts/profiles.js apply [--dry-run]  expose the active set; exit 1 on table errors or a refused write
// The selector fails open: a test over a fact the project has not answered is true, and the fact
// is reported as open. A profile narrows what a project has; a missing fact never hides anything,
// so the upstream, which has no MEMORY.md, keeps everything.
const path = require("path");
const { spawnSync } = require("child_process");
const lib = require("./lib");
const repoView = require("./repo-view");
const repoEdit = require("./repo-edit");
const projectFacts = require("./project-facts");

const FILE = "scripts/profiles.tsv";
const KINDS = ["skill", "agent", "mcp"];
const COLUMNS = ["name", "kind", "when"];
const SKILLS = ".agents/skills", AGENTS = ".agents/agents";
const CATALOG_SKILLS = ".agents/catalog/skills", CATALOG_AGENTS = ".agents/catalog/agents";
const LOCK = "skills-lock.json";

// The generated links are the clone's, not the repository's (ADR-0009/D-2), so Git is told to ignore
// them in the clone's own exclude file, in a block this script owns and rewrites whole. The block is
// also the record of what apply made: an entry in .agents/agents that it does not list, and that is
// not a link into the catalog, is the project's own.
const EXCLUDE = ".git/info/exclude";
const BLOCK_START = "# ai-harness profiles: written by scripts/profiles.js apply";
const BLOCK_END = "# end ai-harness profiles";

// RFC-0001's reference profile and the cap it must load under (RFC-0001/C-1): the check that the
// table keeps its promise, run on the upstream by its decision table.
const REFERENCE = { "Unit type": "daemon", Language: "C#", Frontend: "none", "Issue tracker": "none", Roles: "engineer, devops" };
const BUDGET = 14300;

// The facts a condition may name: MEMORY.md's. A label is matched case-insensitively and reported
// as MEMORY.md writes it.
const factLabels = () => new Map(projectFacts.FACTS.map(f => [f.label.toLowerCase(), f.label]));

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

// The paths the block lists, and the exclude file's text with the block rewritten to list `paths`:
// anything of the clone's own around it stays as it was, and no paths leave no block.
function generatedPaths(text) {
    const lines = (text || "").split(/\r?\n/);
    const start = lines.indexOf(BLOCK_START), end = lines.indexOf(BLOCK_END);
    if (start < 0 || end < start) return new Set();
    return new Set(lines.slice(start + 1, end).filter(l => l.startsWith("/")).map(l => l.slice(1)));
}
function withBlock(text, paths) {
    let lines = (text || "").split(/\r?\n/);
    const start = lines.indexOf(BLOCK_START), end = lines.indexOf(BLOCK_END);
    if (start >= 0 && end >= start) lines = [...lines.slice(0, start), ...lines.slice(end + 1)];
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    const all = [...lines, ...(paths.length ? [BLOCK_START, ...paths.map(p => `/${p}`), BLOCK_END] : [])];
    return all.length ? all.join("\n") + "\n" : "";
}

// Each catalog agent as the folder the harnesses read holds it: the generated entry's path, what it
// should link to, and whether something is there that apply did not make, which shadows it (D-6).
function agentEntries(view, generated) {
    return view.list(CATALOG_AGENTS).filter(n => n.endsWith(".md")).map(n => {
        const name = n.slice(0, -3), file = `${AGENTS}/${n}`, link = `../catalog/agents/${n}`;
        const at = view.lstat(file);
        const ours = !at || generated.has(file) || at.link === link;
        return { name, file, link, source: `${CATALOG_AGENTS}/${n}`, at, shadowed: !ours };
    });
}

// A link target as readlink spells it, compared with a path this clone would write: Windows hands a
// junction back absolute, sometimes with a \\?\ prefix, and compares paths without case.
const spelled = p => String(p).split("\\").join("/").replace(/^\/\/\?\//, "").replace(/\/+$/, "");
const samePath = (a, b) => process.platform === "win32"
    ? spelled(a).toLowerCase() === spelled(b).toLowerCase() : spelled(a) === spelled(b);

// Every file under a folder, as paths relative to it.
const tree = (view, dir) => view.list(dir).flatMap(n => view.isFile(`${dir}/${n}`) ? [n] : tree(view, `${dir}/${n}`).map(f => `${n}/${f}`));
const sameTree = (view, a, b) => {
    const files = tree(view, a);
    return files.join("\n") === tree(view, b).join("\n") && files.every(f => view.bytes(`${a}/${f}`).equals(view.bytes(`${b}/${f}`)));
};

// What the skills folder holds besides the generated entries: the skills Git tracks there, by name,
// or null where there is no index to ask, which counts every one as tracked so nothing is collected;
// and the lock's skills, which are what `npx skills` wrote.
function skillContext(view, root) {
    const rows = view.recorded([SKILLS]);
    const tracked = rows ? new Set(rows.map(r => r.file.slice(SKILLS.length + 1).split("/")[0])) : null;
    let lock = {};
    try { lock = JSON.parse(view.read(LOCK) || "{}").skills || {}; } catch { /* the invariants report the lock */ }
    return { root, tracked, lock };
}

// Each catalog skill, and each skill `npx skills` just wrote into the skills folder, as that folder
// holds it (D-6, D-7). `junction` is the absolute target a clone that refuses the symlink gets
// instead, known only with the root to resolve it from. An untracked folder the lock records, which
// apply did not make, is collected into the catalog; anything else there that apply did not make, and
// that is not a link into this clone's catalog, is the project's and shadows the catalog's.
function skillEntries(view, generated, { root = null, tracked = null, lock = {} } = {}) {
    const catalog = new Set(view.list(CATALOG_SKILLS).filter(n => view.isFile(`${CATALOG_SKILLS}/${n}/SKILL.md`)));
    const entry = name => {
        const file = `${SKILLS}/${name}`, link = `../catalog/skills/${name}`, source = `${CATALOG_SKILLS}/${name}`;
        const junction = root ? path.resolve(root, source).split(path.sep).join("/") : null;
        const at = view.lstat(file);
        const current = !!(at && at.link && (at.link === link || (junction && samePath(at.link, junction))));
        const made = generated.has(file);
        const collect = !!(at && !at.link && !made && tracked && !tracked.has(name) && lock[name] && view.isFile(`${file}/SKILL.md`));
        return { name, file, link, junction, source, at, current, collect, inCatalog: catalog.has(name), shadowed: !!(at && !made && !current && !collect) };
    };
    const names = new Set([...catalog, ...view.list(SKILLS).filter(n => !catalog.has(n))]);
    return [...names].sort().map(entry).filter(s => s.inCatalog || s.collect);
}

// What the profile would do, changing nothing. `facts` stands in for MEMORY.md's, to ask about a
// profile the project does not hold.
function plan(view, { facts, exclude = EXCLUDE, root = null } = {}) {
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
    const generated = generatedPaths(exclude && view.read(exclude));
    const shadowed = [
        ...skillEntries(view, generated, skillContext(view, root)).filter(s => s.shadowed).map(s => `skill ${s.name}`),
        ...agentEntries(view, generated).filter(a => a.shadowed).map(a => `agent ${a.name}`),
    ];
    return { kinds, chars, open, unlisted, missing, shadowed, errors };
}

// ---------------------------------------------------------------- apply

const SETTINGS = ".claude/settings.json", MCP_JSON = ".mcp.json", OPENCODE = "opencode.json";
const isObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
const facts = view => projectFacts.readFacts({ memory: view.read(projectFacts.MEMORY), intent: view.read(projectFacts.INTENT) });

// A JSON file rewritten as it was found: its indent, its line endings, a final newline.
function rewrite(text, value) {
    const indent = (text.match(/^([ \t]+)"/m) || [null, "  "])[1];
    return lib.asFound(JSON.stringify(value, null, indent) + "\n", lib.isCrlf(text));
}
// A file's JSON object, null when the file is absent, or false when it is not an object.
function object(view, file) {
    const text = view.read(file);
    if (text === null) return null;
    try { const v = JSON.parse(text); return isObject(v) ? v : false; } catch { return false; }
}

// SPEC-0004/D-5. A server is switched off, never removed, so turning it back on needs nothing from
// the upstream. Claude Code skips a .mcp.json server named in disabledMcpjsonServers; that list may
// hold the project's own names too, so only names with a row are added or taken out. OpenCode reads
// `enabled` on each entry of opencode.json; an entry the file does not hold is not added.
function mcpAdapter(selection, view) {
    const rows = selection.filter(s => s.kind === "mcp");
    const out = { entries: [], lines: [], problems: [] };
    if (!rows.length) return out;
    const managed = new Set(rows.map(r => r.name));
    const registered = Object.keys((object(view, MCP_JSON) || {}).mcpServers || {});
    const off = rows.filter(r => !r.active && registered.includes(r.name)).map(r => r.name).sort();

    const settings = object(view, SETTINGS);
    if (settings === false) {
        out.problems.push(`${SETTINGS} is not a JSON object, so its MCP servers were left as they are`);
    } else if (settings || off.length) {
        const was = settings && Array.isArray(settings.disabledMcpjsonServers) ? settings.disabledMcpjsonServers : [];
        const next = [...was.filter(n => !managed.has(n)), ...off];
        if (JSON.stringify(next) !== JSON.stringify(was)) {
            const updated = { ...(settings || {}) };
            if (next.length) updated.disabledMcpjsonServers = next; else delete updated.disabledMcpjsonServers;
            const text = view.read(SETTINGS);
            out.entries.push({ file: SETTINGS, write: text === null ? JSON.stringify(updated, null, 2) + "\n" : rewrite(text, updated) });
            for (const n of off.filter(n => !was.includes(n))) out.lines.push(`mcp: ${n} switched off for Claude Code in ${SETTINGS}`);
            for (const n of was.filter(n => managed.has(n) && !off.includes(n))) out.lines.push(`mcp: ${n} switched back on for Claude Code in ${SETTINGS}`);
        }
    }

    const opencode = object(view, OPENCODE);
    if (opencode === false) {
        out.problems.push(`${OPENCODE} is not a JSON object, so its MCP servers were left as they are`);
    } else if (opencode && isObject(opencode.mcp)) {
        const mcp = { ...opencode.mcp };
        for (const r of rows) {
            if (!isObject(mcp[r.name]) || (mcp[r.name].enabled !== false) === r.active) continue;
            mcp[r.name] = { ...mcp[r.name], enabled: r.active };
            out.lines.push(`mcp: ${r.name} switched ${r.active ? "back on" : "off"} for OpenCode in ${OPENCODE}`);
        }
        if (JSON.stringify(mcp) !== JSON.stringify(opencode.mcp)) out.entries.push({ file: OPENCODE, write: rewrite(view.read(OPENCODE), { ...opencode, mcp }) });
    }
    return out;
}

// SPEC-0004/D-6 for agents. Each active catalog agent gets a generated link in .agents/agents, which
// .claude/agents already points at; an inactive one loses the link it had. An agent with no row stays
// active, as an unlisted one does in `plan`. A shadowed name is the project's and is left alone. An
// entry may carry `copy`, what applyTo writes instead where the clone refuses the link, and a copy a
// later run finds is current while it matches the catalog. `generated` is what the block will list.
function agentAdapter(selection, view, { generated }) {
    const out = { entries: [], lines: [], problems: [], generated: [] };
    const rows = new Map(selection.filter(s => s.kind === "agent").map(s => [s.name, s]));
    const on = [], off = [];
    const entries = agentEntries(view, generated);
    for (const a of entries) {
        if (a.shadowed) continue;
        const row = rows.get(a.name);
        if (row && !row.active) {
            if (a.at) { out.entries.push({ file: a.file, remove: true }); off.push(a.name); }
            continue;
        }
        out.generated.push(a.file);
        if (a.at && a.at.link === a.link) continue;
        const source = view.read(a.source);
        if (a.at && !a.at.link && view.read(a.file) === source) continue;
        out.entries.push({ file: a.file, link: a.link, copy: () => source });
        on.push(a.name);
    }
    // A generated entry whose catalog agent is gone: renamed or dropped upstream.
    const known = new Set(entries.map(a => a.file));
    for (const file of generated) {
        if (file.startsWith(`${AGENTS}/`) && !known.has(file) && view.lstat(file)) {
            out.entries.push({ file, remove: true });
            off.push(path.posix.basename(file, ".md"));
        }
    }
    if (on.length) out.lines.push(`agents: linked ${on.join(", ")} from the catalog`);
    if (off.length) out.lines.push(`agents: switched off ${off.join(", ")}`);
    return out;
}

// SPEC-0004/D-6 and D-7 for skills: the agents' adapter, for folders. A link the clone refuses falls
// back to the absolute junction and then to a copy of the folder, and a junction pointing at another
// clone's catalog, or a copy that no longer matches this one's, is rewritten. A folder `npx skills`
// wrote is collected first: moved into the catalog, over any copy there (`before` clears the way, in
// a pass of its own, since a move owns its destination), then linked like any other. A skill with no
// row stays active, so one just added does not vanish before anyone classifies it (D-8 asks them to).
function skillAdapter(selection, view, { generated, ...context }) {
    const out = { before: [], entries: [], lines: [], problems: [], generated: [] };
    const rows = new Map(selection.filter(s => s.kind === "skill").map(s => [s.name, s]));
    const on = [], off = [], collected = [];
    const entries = skillEntries(view, generated, context);
    for (const s of entries) {
        if (s.shadowed) continue;
        if (s.collect) {
            if (s.inCatalog) out.before.push({ file: s.source, remove: true });
            out.entries.push({ file: s.source, move: s.file });
            collected.push(s.name);
        }
        const row = rows.get(s.name);
        if (row && !row.active) {
            if (s.at && !s.collect) { out.entries.push({ file: s.file, remove: true }); off.push(s.name); }
            continue;
        }
        out.generated.push(s.file);
        if (s.current) continue;
        if (s.at && !s.at.link && !s.collect && sameTree(view, s.file, s.source)) continue;
        const copy = () => tree(view, s.source).map(f => ({ file: f, write: view.bytes(`${s.source}/${f}`) }));
        out.entries.push({ file: s.file, link: s.link, ...(s.junction ? { junction: s.junction } : {}), copy });
        on.push(s.name);
    }
    const known = new Set(entries.map(s => s.file));
    for (const file of generated) {
        if (file.startsWith(`${SKILLS}/`) && !known.has(file) && view.lstat(file)) {
            out.entries.push({ file, remove: true });
            off.push(path.posix.basename(file));
        }
    }
    if (collected.length) out.lines.push(`skills: collected ${collected.join(", ")} into ${CATALOG_SKILLS}; commit it with ${LOCK}`);
    if (on.length) out.lines.push(`skills: linked ${on.join(", ")} from the catalog`);
    if (off.length) out.lines.push(`skills: switched off ${off.join(", ")}`);
    return out;
}

const ADAPTERS = [mcpAdapter, skillAdapter, agentAdapter];

// SPEC-0004/D-4: select, hand the selection to each adapter, and apply what they return through
// one repo edit. A table with an error changes nothing. Returns the entries, what each adapter had
// to say, and the problems: table errors, files that could not be read, writes that were refused.
// `exclude` is the clone's exclude file (the command line asks Git where it is, which a linked
// worktree needs), or null for a root that is no Git checkout, where there is nothing to ignore
// anything in. `root` is the clone's folder, which a junction's absolute target is resolved from. A
// link the clone refuses is written as a copy instead, and only a copy refused too is a problem.
function applyTo(view, edit, { dryRun = false, exclude = EXCLUDE, root = null } = {}) {
    const text = view.read(FILE);
    const { rows, errors } = text === null ? { rows: [], errors: [{ line: 0, message: `${FILE} not found` }] } : parse(text);
    if (errors.length) return { entries: [], lines: [], problems: errors.map(e => `${FILE}:${e.line}: ${e.message}`), open: [] };
    const selection = select(facts(view), rows);
    const excluded = exclude ? view.read(exclude) : null;
    const ctx = { generated: generatedPaths(excluded), ...skillContext(view, root) };
    const results = ADAPTERS.map(adapter => adapter(selection, view, ctx));
    const before = results.flatMap(r => r.before || []);
    const out = {
        entries: [...before, ...results.flatMap(r => r.entries)],
        lines: results.flatMap(r => r.lines),
        problems: results.flatMap(r => r.problems),
        open: [...new Set(selection.flatMap(s => s.open))].sort(),
    };
    if (exclude) {
        const block = withBlock(excluded, results.flatMap(r => r.generated || []).sort());
        if (block !== (excluded || "")) out.entries.push({ file: exclude, write: block });
    }
    if (!dryRun && out.entries.length) {
        const copies = new Map(out.entries.filter(e => e.copy !== undefined).map(e => [e.file, e.copy]));
        const failed = r => { if (!r.done) out.problems.push(r.why); return !r.done; };
        before.forEach(e => edit.apply([e]).forEach(failed));
        for (const r of edit.apply(out.entries.slice(before.length).map(({ copy, ...e }) => e))) {
            if (r.done) continue;
            if (r.kind !== "link" || !copies.has(r.file)) { failed(r); continue; }
            // A file's copy is its text; a folder's is its files, written once the way is clear.
            const copy = copies.get(r.file)();
            const writes = typeof copy === "string" ? [{ file: r.file, write: copy }]
                : [{ file: r.file, remove: true }, ...copy.map(f => ({ file: `${r.file}/${f.file}`, write: f.write }))];
            if (!edit.apply(writes).some(failed)) out.lines.push(`${r.file}: copied from the catalog, since this clone refuses the link`);
        }
    }
    return out;
}

// Where Git keeps this clone's exclude file, or null outside a checkout.
function excludeFile(root) {
    const r = spawnSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8" });
    return r.status === 0 && r.stdout.trim() ? path.resolve(root, r.stdout.trim()) : null;
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
    for (const s of p.shadowed || []) console.log(`shadowed: ${s} is the project's own, so the catalog's is not linked`);
}

const commands = {
    plan(root, ...args) {
        const p = plan(repoView.worktree(root), { exclude: excludeFile(root), root });
        if (args.includes("--json")) console.log(JSON.stringify(p, null, 2));
        else printPlan(p);
        for (const e of p.errors) console.error(`${FILE}:${e.line}: ${e.message}`);
        return p.errors.length ? 1 : 0;
    },
    apply(root, ...args) {
        const dryRun = args.includes("--dry-run");
        const r = applyTo(repoView.worktree(root), repoEdit.worktreeEdit(root), { dryRun, exclude: excludeFile(root), root });
        const verb = e => e.remove ? "remove" : e.move !== undefined ? `move ${e.move} to` : e.link !== undefined ? "link" : "write";
        if (dryRun) for (const e of r.entries) console.log(`would ${verb(e)} ${e.file}`);
        for (const line of r.lines) console.log(line);
        if (!r.entries.length && !r.problems.length) console.log("profiles: nothing to change");
        for (const p of r.problems) console.error(`profiles: ${p}`);
        return r.problems.length ? 1 : 0;
    },
};

if (require.main === module) {
    const [cmd, ...args] = lib.args();
    if (!commands[cmd]) { console.error(`usage: node scripts/profiles.js <${Object.keys(commands).join("|")}>`); process.exit(2); }
    process.exit(commands[cmd](lib.root(), ...args));
}

module.exports = { FILE, KINDS, REFERENCE, BUDGET, EXCLUDE, parse, select, plan, applyTo, excludeFile };
