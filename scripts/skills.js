#!/usr/bin/env node
// scripts/skills.js
// The one place that knows the skill roster: what is installed, how each skill is invoked, which
// agent routes it, where it came from, and how the per-harness links are laid out. Inputs are
// skills-lock.json, the frontmatter of .agents/skills/*/SKILL.md, and the Route tables in
// .agents/agents/*.md. Callers: .agents/hooks/session-start.js, check-edit.js and test.js.
// Everything here reports; nothing obliges. A project built on this template decides for itself
// which skills it installs and which agent, if any, routes each one.
//   node scripts/skills.js list             every installed skill: name, invocation, agents, source
//   node scripts/skills.js missing          skills in the lock but not on disk, one per line; exit 1 if any
//   node scripts/skills.js vendored <name>  exit 0 when <name> is recorded in skills-lock.json
//   node scripts/skills.js relink           link every installed skill into each <dir>/skills, as a relative symlink
//   node scripts/skills.js install          restore every skill in skills-lock.json with npx skills, then relink
//   node scripts/skills.js notices          write THIRD-PARTY-NOTICES.md; --check compares instead of writing
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const root = lib.chdirRoot();
const SKILLS = ".agents/skills", AGENTS = ".agents/agents", LOCK = "skills-lock.json";
const SHARED = ".agents/routing.md", SHARED_REF = "routing.md";
const LICENCES = "scripts/skill-licences.tsv", NOTICES = "THIRD-PARTY-NOTICES.md";

const lock = () => fs.existsSync(LOCK) ? (JSON.parse(fs.readFileSync(LOCK, "utf8")).skills || {}) : {};
const frontmatter = file => {
    const m = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const fm = {};
    if (m) for (const line of m[1].split(/\r?\n/)) { const k = line.match(/^([\w-]+):\s*(.*)$/); if (k) fm[k[1]] = k[2].trim(); }
    return fm;
};
const installed = () => fs.existsSync(SKILLS)
    ? fs.readdirSync(SKILLS).filter(n => fs.existsSync(path.join(SKILLS, n, "SKILL.md"))).sort() : [];
const agents = () => {   // agent name -> Set of backticked names in its body (Route table and Steps alike)
    const out = {};
    if (!fs.existsSync(AGENTS)) return out;
    const body = file => fs.readFileSync(file, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
    const named = text => new Set([...text.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)].map(m => m[1]));
    // .agents/routing.md holds the rows more than one agent routes through, in a section per
    // audience. It sits outside AGENTS because .claude/agents is a symlink to that folder and a
    // harness reads every file in there as an agent. Each section counts for the agents that name
    // the file and quote the heading, so a row moved there keeps exactly the agents it had.
    const sections = fs.existsSync(SHARED)
        ? body(SHARED).split(/^## /m).slice(1).map(s => ({ title: s.split(/\r?\n/)[0].trim(), skills: named(s) }))
        : [];
    for (const f of fs.readdirSync(AGENTS).filter(n => n.endsWith(".md")).sort()) {
        const file = path.join(AGENTS, f);
        const name = frontmatter(file).name;
        if (!name) continue;                                 // frontmatter names an agent; nothing else is one
        const text = body(file);
        const skills = named(text);
        if (text.includes(SHARED_REF)) {
            for (const sec of sections) if (text.includes(sec.title)) for (const n of sec.skills) skills.add(n);
        }
        out[name] = skills;
    }
    return out;
};
// AGENTS.md is loaded by every session, agent or not, so a skill it names is reached without any
// agent routing it: the four that suit any kind of work, and `git-commit`. Reporting those as routed
// nowhere would bury the case the column is for, a skill nothing at all points at.
const inAgentsMd = () => fs.existsSync("AGENTS.md")
    ? new Set([...fs.readFileSync("AGENTS.md", "utf8").matchAll(/`([a-z0-9][a-z0-9-]*)`/g)].map(m => m[1]))
    : new Set();

// source (or source#prefix) -> the terms that came with it. A row per upstream, not per skill: the
// notice is the same for every skill a repo ships, and 21 rows stay readable where 60 do not.
const licences = () => lib.readTsv(LICENCES).map(([key, spdx, holder, url, note]) => ({
    key, spdx, url,
    holder: holder === "-" ? null : holder,
    note: note === "-" ? null : note,
    source: key.split("#")[0],
    prefix: key.includes("#") ? key.split("#")[1] : null,
}));

// The most specific row wins, so one upstream shipping two sets of terms splits by skill name.
const termsFor = (rows, name, source) =>
    rows.find(r => r.prefix && r.source === source && name.startsWith(r.prefix))
    || rows.find(r => !r.prefix && r.source === source)
    || null;

function noticesText() {
    const l = lock(), rows = licences();
    const held = new Map(rows.map(r => [r.key, []]));
    const orphans = [];
    for (const name of installed()) {
        if (!l[name]) continue;                          // written for this repo, not vendored
        const terms = termsFor(rows, name, l[name].source);
        if (!terms) { orphans.push(`${name} (${l[name].source})`); continue; }
        held.get(terms.key).push(name);
    }
    if (orphans.length) {
        console.error(`no row in ${LICENCES} covers:\n  ${orphans.join("\n  ")}\n` +
            `Add one per upstream: source, SPDX id, copyright line, licence URL, and any restriction.`);
        process.exit(1);
    }
    const used = rows.filter(r => held.get(r.key).length);
    const local = installed().filter(n => !l[n]);
    const out = [
        "# Third-party notices",
        "",
        "The skills under `.agents/skills/` are vendored copies of work published elsewhere, listed in `skills-lock.json`. MIT and Apache-2.0 both ask that the copyright and permission notice travel with a copy, and `npx skills` carries only what sits inside a skill's own folder, so an upstream keeping its licence at the repo root sends none. This file is that notice.",
        "",
        "Generated by `node scripts/skills.js notices` from `skills-lock.json` and `scripts/skill-licences.tsv`. Edit those, not this.",
        "",
        "| Licence | Upstream | Copyright | Skills |",
        "| --- | --- | --- | --- |",
        ...used.map(r => `| [${r.spdx}](${r.url}) | ${r.source} | ${r.holder || "not stated upstream"} | ${held.get(r.key).sort().map(n => `\`${n}\``).join(", ")} |`),
    ];
    const noted = used.filter(r => r.note);
    if (noted.length) {
        out.push("", "## Notes on individual upstreams", "",
            `${noted.length} of the rows above carry something the table cannot: a restriction that outlives this notice, or where the licence actually lives.`, "");
        for (const r of noted) out.push(`- **${r.source}** (${r.spdx}): ${r.note}`);
    }
    if (local.length) {
        out.push("", "## Written for this repository", "",
            `Under this repository's own licence, with no upstream: ${local.sort().map(n => `\`${n}\``).join(", ")}.`);
    }
    return out.join("\n") + "\n";
}

const roster = () => {
    const l = lock(), a = agents(), everywhere = inAgentsMd();
    return installed().map(name => {
        const fm = frontmatter(path.join(SKILLS, name, "SKILL.md"));
        return {
            name,
            invoke: fm["disable-model-invocation"] === "true" ? `\`/${name}\`` : "by description",
            agents: Object.keys(a).filter(k => a[k].has(name)),
            everywhere: everywhere.has(name),
            source: l[name] ? l[name].source : "local",
        };
    });
};
const commands = {
    list() {
        for (const r of roster()) {
            const where = r.agents.join(",") || (r.everywhere ? "AGENTS.md" : "-");
            console.log(`${r.name}\t${r.invoke.replace(/`/g, "")}\t${where}\t${r.source}`);
        }
    },
    missing() {
        const on = new Set(installed());
        const gone = Object.keys(lock()).filter(n => !on.has(n));
        if (gone.length) { console.log(gone.join("\n")); process.exit(1); }
    },
    vendored(name) {
        if (!name) { console.error("usage: skills.js vendored <name>"); process.exit(2); }
        process.exit(lock()[name] ? 0 : 1);
    },
    relink() {
        // `npx skills` creates absolute junctions on Windows; Git needs relative symlinks. It also
        // only links what it vendored, so a local skill written by hand has no link at all and the
        // harness never sees it. A directory that already holds skill links gets one per installed
        // skill, which is what makes a hand-written skill visible without anyone remembering to
        // create the link. Directories are discovered rather than listed: whichever harnesses this
        // clone wires up, the ones with a skills/ folder are the ones that want links.
        const canonical = path.resolve(root, SKILLS);
        const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
        const inside = p => same(p.slice(0, canonical.length), canonical);
        const present = p => { try { fs.lstatSync(p); return true; } catch { return false; } };
        let fixed = 0, kept = 0, added = 0;
        const dangling = [], whole = [];
        for (const top of fs.readdirSync(root, { withFileTypes: true })) {
            if (!top.isDirectory() || top.name === ".agents" || top.name === ".git") continue;
            const dir = path.join(root, top.name, "skills");
            if (!fs.existsSync(dir)) continue;
            // A harness whose skills/ is itself a link to .agents/skills already sees every skill,
            // including one written by hand, and needs no per-skill link at all. Reading through it
            // would list the skills themselves, which are directories rather than links: the loop
            // below would call all of them copies and then try to link them into their own folder.
            // .claude is this form; the per-skill path stays for a harness that wants one link each.
            if (fs.lstatSync(dir).isSymbolicLink()) { whole.push(`${top.name}/skills`); continue; }
            for (const name of fs.readdirSync(dir)) {
                const link = path.join(dir, name);
                const st = fs.lstatSync(link);
                if (!st.isSymbolicLink()) {
                    if (st.isDirectory() && fs.existsSync(path.join(canonical, name)))
                        console.log(`${top.name}/skills/${name} is a copy, not a link: delete it and re-run to link it`);
                    continue;
                }
                const target = fs.readlinkSync(link).replace(/^\\\\\?\\/, "");
                const resolved = path.resolve(dir, target);
                if (!inside(resolved)) continue;                    // points elsewhere: not ours
                // The skill it names is gone: uninstalled, or renamed. Reported, never deleted,
                // because the answer is a `npx skills` command rather than a guess made here.
                if (!fs.existsSync(resolved)) { dangling.push(`${top.name}/skills/${name}`); continue; }
                const rel = path.relative(dir, resolved).split(path.sep).join("/");
                if (!path.isAbsolute(target) && target.split(path.sep).join("/") === rel) { kept++; continue; }
                try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); }   // dir symlinks and junctions on Windows need rmdir
                fs.symlinkSync(rel, link, "dir");
                fixed++;
            }
            for (const name of installed()) {
                const link = path.join(dir, name);
                if (present(link)) continue;
                const rel = path.relative(dir, path.join(canonical, name)).split(path.sep).join("/");
                fs.symlinkSync(rel, link, "dir");
                added++;
            }
        }
        for (const d of whole) console.log(`${d} is one link to the skills folder: every skill is visible, nothing to link`);
        console.log(`skill links: ${added} created, ${fixed} rewritten as relative, ${kept} already relative`);
        for (const d of dangling) console.log(`${d} points at a skill that is not installed: remove the link, or restore the skill`);
    },
    // MIT and Apache-2.0 both ask that the copyright and permission notice travel with copies, and
    // vendoring a skill makes a copy. `npx skills` carries only what sits inside the skill folder, so
    // an upstream that keeps its licence at the repo root sends none: the notice has to be written
    // here instead. Generated rather than hand-kept, so it cannot drift from the lock file.
    notices(...args) {
        const check = args.includes("--check");
        const text = noticesText();
        const now = fs.existsSync(NOTICES) ? fs.readFileSync(NOTICES, "utf8") : null;
        if (!check) {
            if (now === text) { console.log(`${NOTICES}: already current`); return; }
            fs.writeFileSync(NOTICES, text);
            console.log(`${NOTICES}: written`);
            return;
        }
        if (now === text) { console.log(`${NOTICES}: current`); return; }
        console.error(now === null
            ? `${NOTICES} is missing. Write it: node scripts/skills.js notices`
            : `${NOTICES} is out of date with ${LOCK} and ${LICENCES}. Rewrite it: node scripts/skills.js notices`);
        process.exit(1);
    },
    install() {
        // Skills are committed, so a normal clone never needs this; run it when .agents/skills is missing
        // or damaged, or after a merge that changed the lock (the post-merge Git hook does).
        if (!fs.existsSync(LOCK)) { console.error(`${LOCK} not found in ${root}`); process.exit(1); }
        const r = lib.shell("npx --yes skills@latest experimental_install", { stdio: "inherit" });
        if (r.status !== 0) process.exit(r.status === null ? 1 : r.status);
        commands.relink();
        console.log(`Skills restored from ${LOCK}.`);
    },
};

const [cmd, ...args] = process.argv.slice(2);
if (!commands[cmd]) { console.error(`usage: node scripts/skills.js <${Object.keys(commands).join("|")}>`); process.exit(2); }
commands[cmd](...args);
