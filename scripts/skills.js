#!/usr/bin/env node
// scripts/skills.js
// The one place that knows the skill roster: what is installed, how each skill is invoked, which
// agent routes it, where it came from, and how the per-harness links are laid out. Inputs are
// skills-lock.json, the frontmatter of .agents/skills/*/SKILL.md, the Route tables in
// .agents/agents/*.md with .agents/routing.md, and scripts/skill-licences.tsv.
// A module first: readRoster(root) reads all of it in one pass and writes nothing, and relink(root)
// and writeNotices(root) are the only two acts that change a file. None of them prints or exits, so
// check-harness and the hooks call them in-process. The command line below is a thin wrapper.
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

const SKILLS = ".agents/skills", AGENTS = ".agents/agents", LOCK = "skills-lock.json";
const SHARED = ".agents/routing.md", SHARED_REF = "routing.md";
const LICENCES = "scripts/skill-licences.tsv", NOTICES = "THIRD-PARTY-NOTICES.md";

// The keys of YAML frontmatter a harness reads: a plain or quoted scalar, or a `>` / `|` block
// scalar, whose indented lines are the value. Not a YAML parser, and nothing here needs one. null
// when the text does not open with a --- block.
function frontmatter(text) {
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
    if (!m) return null;
    const lines = m[1].split(/\r?\n/), fm = {};
    for (let i = 0; i < lines.length; i++) {
        const k = lines[i].match(/^([\w-]+):\s*(.*)$/);
        if (!k) continue;
        let value = k[2].trim();
        if (/^[>|][-+]?$/.test(value)) {
            const block = [];
            while (i + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[i + 1])) block.push(lines[++i].trim());
            value = block.join(" ").trim();
        } else if (/^(".*"|'.*')$/.test(value)) {
            value = value.slice(1, -1);
        }
        fm[k[1]] = value;
    }
    return fm;
}

const named = text => new Set([...text.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)].map(m => m[1]));
const body = text => text.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");

// Every entry under .agents/skills, whatever it is: a skill is a folder holding a SKILL.md, and
// anything else -- a link to another skill, a folder with no SKILL.md -- is listed too, marked, so
// the invariant that objects to it reads the same pass as everything else.
function readEntries(root) {
    const skills = path.join(root, SKILLS);
    if (!fs.existsSync(skills)) return [];
    return fs.readdirSync(skills).sort().map(name => {
        const folder = path.join(skills, name);
        const link = fs.lstatSync(folder).isSymbolicLink();
        let dir = false;
        try { dir = fs.statSync(folder).isDirectory(); } catch { /* a link to nothing */ }
        const file = path.join(folder, "SKILL.md");
        const hasSkillMd = dir && fs.existsSync(file);
        return { name, link, dir, hasSkillMd, frontmatter: hasSkillMd ? frontmatter(fs.readFileSync(file, "utf8")) : null };
    });
}

// .agents/routing.md holds the rows more than one agent routes through, in a section per audience.
// It sits outside AGENTS because .claude/agents is a symlink to that folder and a harness reads every
// file in there as an agent. Each section says which agents read it on a "Read by" line; an agent
// reads a section when its body names the file and quotes the heading, so a row moved there keeps
// exactly the agents it had. An agent is a file whose frontmatter names it; nothing else is one.
function readRouting(root) {
    const shared = path.join(root, SHARED);
    const sections = fs.existsSync(shared)
        ? body(fs.readFileSync(shared, "utf8")).split(/^## /m).slice(1).map(s => {
            const line = s.match(/^Read by .*$/m);
            return {
                title: s.split(/\r?\n/)[0].trim(),
                readBy: line ? [...line[0].matchAll(/`([a-z-]+)`/g)].map(m => m[1]).sort() : [],
                skills: named(s),
            };
        })
        : [];
    const agents = {};
    const dir = path.join(root, AGENTS);
    if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir).filter(n => n.endsWith(".md")).sort()) {
            const text = fs.readFileSync(path.join(dir, f), "utf8");
            const name = (frontmatter(text) || {}).name;
            if (!name) continue;
            const own = body(text);
            const readsShared = own.includes(SHARED_REF);
            const reads = readsShared ? sections.filter(s => own.includes(s.title)).map(s => s.title) : [];
            const skills = named(own);
            for (const s of sections) if (reads.includes(s.title)) for (const n of s.skills) skills.add(n);
            agents[name] = { skills, readsShared, sections: reads };
        }
    }
    return { sections, agents };
}

// source (or source#prefix) -> the terms that came with it. A row per upstream, not per skill: the
// notice is the same for every skill a repo ships, and 21 rows stay readable where 60 do not.
function readLicences(root) {
    const file = path.join(root, LICENCES);
    if (!fs.existsSync(file)) return [];
    return lib.readTsv(file).map(([key, spdx, holder, url, note]) => ({
        key, spdx, url,
        holder: holder === "-" ? null : holder,
        note: note === "-" ? null : note,
        source: key.split("#")[0],
        prefix: key.includes("#") ? key.split("#")[1] : null,
    }));
}

// The most specific row wins, so one upstream shipping two sets of terms splits by skill name.
const termsFor = (rows, name, source) =>
    rows.find(r => r.prefix && r.source === source && name.startsWith(r.prefix))
    || rows.find(r => !r.prefix && r.source === source)
    || null;

// MIT and Apache-2.0 both ask that the copyright and permission notice travel with copies, and
// vendoring a skill makes a copy. `npx skills` carries only what sits inside the skill folder, so an
// upstream that keeps its licence at the repo root sends none: the notice has to be written here
// instead. Generated rather than hand-kept, so it cannot drift from the lock file. A vendored skill
// no row covers is an orphan, and the notice is not written while there is one.
function noticesFor(skills, rows) {
    const held = new Map(rows.map(r => [r.key, []]));
    const orphans = [];
    for (const s of skills) {
        if (!s.vendored) continue;                           // written for this repo, not vendored
        const terms = termsFor(rows, s.name, s.source);
        if (!terms) { orphans.push(`${s.name} (${s.source})`); continue; }
        held.get(terms.key).push(s.name);
    }
    const used = rows.filter(r => held.get(r.key).length);
    const local = skills.filter(s => !s.vendored).map(s => s.name);
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
    return { text: out.join("\n") + "\n", orphans };
}

// The roster at `root`, read in one pass. Nothing is written and nothing but `root` is read. Throws
// only when the lock file is there and is not JSON.
//   lock      skills-lock.json's skills, or null when there is no lock file
//   entries   every entry under .agents/skills: { name, link, dir, hasSkillMd, frontmatter }
//   skills    the entries that are skills, as { name, frontmatter, invoke, source, vendored, agents, everywhere }
//   missing   skills the lock records and the disk lacks
//   routing   { sections: [{ title, readBy, skills }], agents: { name: { skills, readsShared, sections } } }
//   notices   { text, orphans, current }: the notice this roster calls for, and whether the file matches
function readRoster(root) {
    const lockFile = path.join(root, LOCK);
    let lock = null;
    if (fs.existsSync(lockFile)) {
        try { lock = JSON.parse(fs.readFileSync(lockFile, "utf8")).skills || {}; }
        catch (e) { throw new Error(`${LOCK} is not valid JSON: ${e.message}`); }
    }
    const vendored = lock || {};
    const entries = readEntries(root);
    const routing = readRouting(root);
    // AGENTS.md is loaded by every session, agent or not, so a skill it names is reached without any
    // agent routing it: the four that suit any kind of work, and `git-commit`. Reporting those as
    // routed nowhere would bury the case the column is for, a skill nothing at all points at.
    const agentsMd = path.join(root, "AGENTS.md");
    const everywhere = fs.existsSync(agentsMd) ? named(fs.readFileSync(agentsMd, "utf8")) : new Set();
    const skills = entries.filter(e => e.hasSkillMd).map(e => {
        const fm = e.frontmatter || {};
        return {
            name: e.name,
            frontmatter: e.frontmatter,
            invoke: fm["disable-model-invocation"] === "true" ? `\`/${e.name}\`` : "by description",
            source: vendored[e.name] ? vendored[e.name].source : "local",
            vendored: !!vendored[e.name],
            agents: Object.keys(routing.agents).filter(a => routing.agents[a].skills.has(e.name)),
            everywhere: everywhere.has(e.name),
        };
    });
    const on = new Set(skills.map(s => s.name));
    const notices = noticesFor(skills, readLicences(root));
    const noticeFile = path.join(root, NOTICES);
    notices.current = fs.existsSync(noticeFile) && fs.readFileSync(noticeFile, "utf8") === notices.text;
    return { lock, entries, skills, missing: Object.keys(vendored).filter(n => !on.has(n)), routing, notices };
}

// Writes THIRD-PARTY-NOTICES.md from the roster. Refuses while a vendored skill has no licence row,
// because a notice that leaves one out is the failure the file exists to prevent.
//   { written: true | false, orphans }
function writeNotices(root) {
    const { notices } = readRoster(root);
    if (notices.orphans.length) return { written: false, orphans: notices.orphans };
    if (notices.current) return { written: false, orphans: [] };
    fs.writeFileSync(path.join(root, NOTICES), notices.text);
    return { written: true, orphans: [] };
}

// `npx skills` creates absolute junctions on Windows; Git needs relative symlinks. It also only links
// what it vendored, so a local skill written by hand has no link at all and the harness never sees
// it. A directory that already holds skill links gets one per installed skill, which is what makes a
// hand-written skill visible without anyone remembering to create the link. Directories are
// discovered rather than listed: whichever harnesses this clone wires up, the ones with a skills/
// folder are the ones that want links.
//   { added, fixed, kept, whole, copies, dangling }: counts, then the paths each note is about
function relink(root) {
    const installed = readRoster(root).skills.map(s => s.name);
    const canonical = path.resolve(root, SKILLS);
    const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
    const inside = p => same(p.slice(0, canonical.length), canonical);
    const present = p => { try { fs.lstatSync(p); return true; } catch { return false; } };
    const report = { added: 0, fixed: 0, kept: 0, whole: [], copies: [], dangling: [] };
    for (const top of fs.readdirSync(root, { withFileTypes: true })) {
        if (!top.isDirectory() || top.name === ".agents" || top.name === ".git") continue;
        const dir = path.join(root, top.name, "skills");
        if (!fs.existsSync(dir)) continue;
        // A harness whose skills/ is itself a link to .agents/skills already sees every skill,
        // including one written by hand, and needs no per-skill link at all. Reading through it would
        // list the skills themselves, which are directories rather than links: the loop below would
        // call all of them copies and then try to link them into their own folder. .claude is this
        // form; the per-skill path stays for a harness that wants one link each.
        if (fs.lstatSync(dir).isSymbolicLink()) { report.whole.push(`${top.name}/skills`); continue; }
        for (const name of fs.readdirSync(dir)) {
            const link = path.join(dir, name);
            const st = fs.lstatSync(link);
            if (!st.isSymbolicLink()) {
                if (st.isDirectory() && fs.existsSync(path.join(canonical, name))) report.copies.push(`${top.name}/skills/${name}`);
                continue;
            }
            const target = fs.readlinkSync(link).replace(/^\\\\\?\\/, "");
            const resolved = path.resolve(dir, target);
            if (!inside(resolved)) continue;                    // points elsewhere: not ours
            // The skill it names is gone: uninstalled, or renamed. Reported, never deleted, because
            // the answer is a `npx skills` command rather than a guess made here.
            if (!fs.existsSync(resolved)) { report.dangling.push(`${top.name}/skills/${name}`); continue; }
            const rel = path.relative(dir, resolved).split(path.sep).join("/");
            if (!path.isAbsolute(target) && target.split(path.sep).join("/") === rel) { report.kept++; continue; }
            try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); }   // dir symlinks and junctions on Windows need rmdir
            fs.symlinkSync(rel, link, "dir");
            report.fixed++;
        }
        for (const name of installed) {
            const link = path.join(dir, name);
            if (present(link)) continue;
            fs.symlinkSync(path.relative(dir, path.join(canonical, name)).split(path.sep).join("/"), link, "dir");
            report.added++;
        }
    }
    return report;
}

module.exports = { readRoster, relink, writeNotices, frontmatter, LOCK, NOTICES, LICENCES };

// ---------------------------------------------------------------- the command line

function printRelink(r) {
    for (const c of r.copies) console.log(`${c} is a copy, not a link: delete it and re-run to link it`);
    for (const d of r.whole) console.log(`${d} is one link to the skills folder: every skill is visible, nothing to link`);
    console.log(`skill links: ${r.added} created, ${r.fixed} rewritten as relative, ${r.kept} already relative`);
    for (const d of r.dangling) console.log(`${d} points at a skill that is not installed: remove the link, or restore the skill`);
}

const orphanMessage = orphans => `no row in ${LICENCES} covers:\n  ${orphans.join("\n  ")}\n` +
    `Add one per upstream: source, SPDX id, copyright line, licence URL, and any restriction.`;

// Each command returns its exit code.
const commands = {
    list(root) {
        for (const r of readRoster(root).skills) {
            const where = r.agents.join(",") || (r.everywhere ? "AGENTS.md" : "-");
            console.log(`${r.name}\t${r.invoke.replace(/`/g, "")}\t${where}\t${r.source}`);
        }
        return 0;
    },
    missing(root) {
        const gone = readRoster(root).missing;
        if (gone.length) console.log(gone.join("\n"));
        return gone.length ? 1 : 0;
    },
    vendored(root, name) {
        if (!name) { console.error("usage: skills.js vendored <name>"); return 2; }
        return (readRoster(root).lock || {})[name] ? 0 : 1;
    },
    relink(root) { printRelink(relink(root)); return 0; },
    notices(root, ...args) {
        if (!args.includes("--check")) {
            const r = writeNotices(root);
            if (r.orphans.length) { console.error(orphanMessage(r.orphans)); return 1; }
            console.log(`${NOTICES}: ${r.written ? "written" : "already current"}`);
            return 0;
        }
        const { notices } = readRoster(root);
        if (notices.orphans.length) { console.error(orphanMessage(notices.orphans)); return 1; }
        if (notices.current) { console.log(`${NOTICES}: current`); return 0; }
        console.error(!fs.existsSync(path.join(root, NOTICES))
            ? `${NOTICES} is missing. Write it: node scripts/skills.js notices`
            : `${NOTICES} is out of date with ${LOCK} and ${LICENCES}. Rewrite it: node scripts/skills.js notices`);
        return 1;
    },
    install(root) {
        // Skills are committed, so a normal clone never needs this; run it when .agents/skills is
        // missing or damaged, or after a merge that changed the lock (the post-merge Git hook does).
        if (!fs.existsSync(path.join(root, LOCK))) { console.error(`${LOCK} not found in ${root}`); return 1; }
        const r = lib.shell("npx --yes skills@latest experimental_install", { cwd: root, stdio: "inherit" });
        if (r.status !== 0) return r.status === null ? 1 : r.status;
        printRelink(relink(root));
        console.log(`Skills restored from ${LOCK}.`);
        return 0;
    },
};

if (require.main === module) {
    const [cmd, ...args] = lib.args();
    if (!commands[cmd]) { console.error(`usage: node scripts/skills.js <${Object.keys(commands).join("|")}>`); process.exit(2); }
    process.exit(commands[cmd](lib.root(), ...args));
}
