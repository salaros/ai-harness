// .agents/hooks/tests/tables/relink.js
// scripts/skills.js's relink decisions: which per-skill links a repo is missing, which point the
// wrong way, and which are somebody else's business. The harness's central promise is that every
// skill is visible to every agent harness in the clone, and it rests on this.
//
// relink used to classify a link and unlink, rmdir and symlink it in the same loop, so the only way
// to reach any of it was with real symlinks -- which Windows refuses unless the session is elevated,
// so the one check that existed skipped on the maintainer's own machine. The decision is a value
// now, made from a repo-view, and these are maps: five link shapes, none of them asked of the OS.
const path = require("path");
const repoView = require("../../../../scripts/repo-view");
const skills = require("../../../../scripts/skills");
const { text } = require("../fixtures");

const skill = name => text("---", `name: ${name}`, "description: Does one thing.", "---", "Body");
const plan = (files, root) => skills.relinkPlan(repoView.fromMap(files), root);
const linksIn = p => Object.fromEntries(p.entries.map(e => [e.file, e]));

// The five shapes a per-skill folder can hold, each answered without touching a filesystem.
exports.relinkDecidesWhichLinksAreMissingOrWrong = function relinkDecidesWhichLinksAreMissingOrWrong(t) {
    if (!skills.relinkPlan) { t.skip("relink: this scripts/skills.js relinks without deciding first"); return; }

    // `npx skills` links only what it vendored, so a skill written by hand has no link and the
    // harness never sees it. A folder that already holds skill links gets one per installed skill.
    const missing = plan({ ".agents/skills/one/SKILL.md": skill("one"), ".cursor/skills/.keep": "" });
    const added = linksIn(missing)[".cursor/skills/one"];
    t.ok(added && added.link === "../../.agents/skills/one", "relink: a skill with no link gets one, relative to the folder it lands in", JSON.stringify(missing.entries));
    t.ok(added && !added.replace, "relink: a link that was not there replaces nothing", JSON.stringify(added));

    const right = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".cursor/skills/one": { link: "../../.agents/skills/one" },
    });
    t.ok(!right.entries.length && right.kept === 1, "relink: a link that is already relative and right is left alone", JSON.stringify(right));

    // Git needs relative symlinks; `npx skills` writes absolute junctions on Windows, which is the
    // shape this whole function exists to correct.
    // The \\?\ prefix is how Windows spells a junction back at whoever reads it.
    const absolute = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".cursor/skills/one": { link: "//?/C:/repo/.agents/skills/one" },
    }, "C:/repo");
    const fixed = linksIn(absolute)[".cursor/skills/one"];
    t.ok(fixed && fixed.replace === true && fixed.link === "../../.agents/skills/one",
        "relink: an absolute link is rewritten relative, replacing what is there", JSON.stringify(absolute));
    t.ok(absolute.kept === 0, "relink: an absolute link is never counted as one already in order", JSON.stringify(absolute));

    // Reported, never deleted: the answer is an `npx skills` command rather than a guess made here.
    const gone = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".cursor/skills/two": { link: "../../.agents/skills/two" },
    });
    t.ok(gone.dangling.includes(".cursor/skills/two") && !linksIn(gone)[".cursor/skills/two"],
        "relink: a link to a skill that is not installed is named, not rewritten and not removed", JSON.stringify(gone));

    // A folder that is itself one link to .agents/skills already sees every skill, hand-written ones
    // included. Reading through it would list the skills themselves -- directories, not links -- and
    // the loop would call every one of them a copy and try to link it into its own folder.
    const whole = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".claude/skills": { link: "../.agents/skills" },
    });
    t.ok(whole.whole.includes(".claude/skills") && !whole.entries.length,
        "relink: a folder that is one link to the skills folder needs no per-skill link", JSON.stringify(whole));

    const copied = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".cursor/skills/one/SKILL.md": skill("one"),
    });
    t.ok(copied.copies.includes(".cursor/skills/one") && !linksIn(copied)[".cursor/skills/one"],
        "relink: a real copy of a skill is named for the reader to delete, never written over", JSON.stringify(copied));

    const elsewhere = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".cursor/skills/one": { link: "../../vendor/one" },
    });
    t.ok(!linksIn(elsewhere)[".cursor/skills/one"] && !elsewhere.dangling.length,
        "relink: a link pointing outside the skills folder is somebody else's and is left alone", JSON.stringify(elsewhere));
};

// Which folders are looked in at all. Discovered rather than listed: whichever agent harnesses a
// clone wires up, the ones with a skills/ folder are the ones that want links.
exports.relinkLooksInEveryHarnessFolderButItsOwn = function relinkLooksInEveryHarnessFolderButItsOwn(t) {
    if (!skills.relinkPlan) { t.skip("relink folders: this scripts/skills.js relinks without deciding first"); return; }
    const p = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".cursor/skills/.keep": "",
        ".codex/skills/.keep": "",
        "docs/README.md": "no skills folder here\n",
    });
    const files = p.entries.map(e => e.file).sort();
    t.ok(files.join(" ") === ".codex/skills/one .cursor/skills/one",
        "relink: every folder holding a skills/ gets a link, and a folder without one is not touched", files.join(" "));
    t.ok(!files.some(f => f.startsWith(".agents/")), "relink: the skills folder itself is never linked into", files.join(" "));
};

// A skill a project keeps under .claude/skills and nowhere else. It is invisible to every other
// agent harness in the clone -- Codex and Cursor read their own folders, and nothing links there --
// and relink used to walk straight past it: the branch that names a copy asks whether
// .agents/skills already holds that name, and for a skill only this folder has, it does not.
// Which is how an install into a repo that vendored its skills the `npx skills` way came to exit 1
// on its own self check: the folders stayed real folders, and every .claude/skills entry is meant to
// be a link.
exports.relinkAdoptsASkillOnlyOneHarnessHas = function relinkAdoptsASkillOnlyOneHarnessHas(t) {
    if (!skills.relinkPlan) { t.skip("relink adopt: this scripts/skills.js relinks without deciding first"); return; }
    const p = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".claude/skills/mine/SKILL.md": skill("mine"),
        ".claude/skills/one/SKILL.md": skill("one"),
    });
    const moves = p.entries.filter(e => e.move !== undefined);
    t.ok(moves.length === 1 && moves[0].move === ".claude/skills/mine" && moves[0].file === ".agents/skills/mine",
        "relink: a skill only one harness folder has moves into the skills folder", JSON.stringify(p.entries));
    const linked = p.entries.filter(e => e.link !== undefined).map(e => e.file).sort();
    t.ok(linked.join(" ") === ".claude/skills/mine", "relink: and is linked back where it came from", linked.join(" "));
    t.ok(p.adopted.includes(".claude/skills/mine"), "relink: the move is reported, because it is the project's own work being moved", JSON.stringify(p.adopted));

    // The move comes before the link that replaces it: a link written first would be what the move
    // then tried to relocate.
    const order = p.entries.map(e => (e.move !== undefined ? "move" : "link"));
    t.ok(order.indexOf("move") < order.indexOf("link"), "relink: the move is planned before the link into its place", order.join(" "));

    // Unchanged: a name the skills folder already has is still a copy to be named, never moved over.
    t.ok(p.copies.includes(".claude/skills/one") && !moves.some(e => e.move === ".claude/skills/one"),
        "relink: a folder whose name the skills folder already holds is still the reader's to settle", JSON.stringify(p.copies));
};

// Adoption is for a skill, not for whatever else a harness folder holds. A SKILL.md is what makes a
// folder one, and without it the folder is somebody else's business.
exports.relinkAdoptsOnlyWhatIsASkill = function relinkAdoptsOnlyWhatIsASkill(t) {
    if (!skills.relinkPlan) { t.skip("relink adopt: this scripts/skills.js relinks without deciding first"); return; }
    const p = plan({
        ".agents/skills/one/SKILL.md": skill("one"),
        ".claude/skills/notes/README.md": "not a skill\n",
        ".claude/skills/settings.json": "{}\n",
    });
    t.ok(!p.entries.some(e => e.move !== undefined), "relink: a folder with no SKILL.md is not adopted", JSON.stringify(p.entries));
    t.ok(!p.adopted.length, "relink: and nothing is reported as moved", JSON.stringify(p.adopted));
    t.ok(!p.entries.some(e => e.file === ".claude/skills/settings.json"), "relink: a plain file in the folder is left alone", JSON.stringify(p.entries));
};
