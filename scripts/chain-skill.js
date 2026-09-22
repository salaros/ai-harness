// scripts/chain-skill.js
// Which skill writes the file about to be created, and whether this session has it.
// AGENTS.md's chain table gives every stage one skill, and a document written without it is a
// document the next stage cannot derive from: a PRD with no `prd` behind it has the shape of a PRD
// and none of its questions answered, and the stage after inherits the gap. The table has said so
// since the chain existed, and an agent mid-task reads past it, so `.agents/hooks/chain-skill.js`
// asks for the skill at the moment the file is created rather than in a paragraph read beforehand.
// The decision is here, and is pure: it takes the paths, the stage table readChain() returns, and
// the session transcript as text, and returns what to do. It reads no files, prints nothing and
// exits nothing, so a case about a chain nobody has is a row rather than a clone.
//   stageFor(rel, stages)              the stage whose folder the path is under, or null
//   used(transcript, skill)            whether the session loaded it
//   decide(files, stages, transcript)  the verdict, or null when no file is in the chain
// `transcript` is null when the harness named none, which is not the same as an empty one: a hook
// that cannot read its input fails open, the way every other hook here does.
const fs = require("fs");

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The stage a repo-relative path belongs to: the row whose "Lives in" folder it sits under, the
// most specific where several match, so a `docs/prd/` row wins over a hypothetical `docs/` one.
// The folder itself is not a file in it, and a folder that merely starts with the same letters is
// a different folder.
function stageFor(rel, stages) {
    const file = String(rel).split("\\").join("/").replace(/^\.\//, "");
    let best = null;
    for (const s of stages) {
        const dir = String(s.lives || "").replace(/\/*$/, "/");
        if (dir === "/" || !file.startsWith(dir)) continue;
        if (!best || dir.length > String(best.lives).length) best = s;
    }
    return best;
}

// Whether `transcript` shows the skill was loaded: the skill tool naming it, a slash command, or
// the skill's own SKILL.md by path, on either platform's separator.
// Read generously on purpose. A wrong "no" blocks a file from ever being created, which is a wall;
// a wrong "yes" costs a reminder nobody needed. The name is bounded at both ends so that neither
// the folder a stage lives in nor a longer skill name beginning the same way counts as a load.
function used(transcript, skill) {
    if (!transcript) return false;
    const name = esc(skill);
    const marker = new RegExp(
        `"skill"\\s*:\\s*"(?:[\\w.-]+:)?${name}"`          // the skill tool, plugin-qualified or not
        + `|<command-name>[^<]*?/?${name}</command-name>`  // a slash command
        + `|skills[\\\\/]+${name}[\\\\/]+SKILL`            // the skill's own file, read or injected
    );
    return marker.test(transcript);
}

// The whole decision for one write. Returns null when no path is in the chain, and otherwise
// { verdict, stage, skills, files, message } with verdict one of:
//   allow  a stage's skill is already loaded, or none of the files is in the chain
//   block  a chain file is being created and no skill of its stage was loaded
//   warn   the harness named no transcript, so the hook cannot tell and says so instead
function decide(files, stages, transcript) {
    for (const file of files) {
        const stage = stageFor(file, stages);
        if (!stage) continue;
        const skills = stage.skills || [];
        if (!skills.length) continue;
        if (transcript !== null && skills.some(s => used(transcript, s))) continue;
        const list = skills.map(s => `\`${s}\``).join(" and ");
        const how = skills.map(s => `/${s}`).join(" then ");
        const many = skills.length > 1;
        const verdict = transcript === null ? "warn" : "block";
        const message = verdict === "warn"
            ? `chain skill: ${file} is the ${stage.stage} stage, which ${list} ${many ? "write" : "writes"}. This harness `
                + `sent no transcript, so whether ${many ? "they are" : "it is"} loaded cannot be checked here -- `
                + `load ${many ? "them" : "it"} before writing the file.`
            : `${file} is the ${stage.stage} stage of the documentation chain, and ${list} ${many ? "are the skills" : "is the skill"} that ${many ? "write" : "writes"} it.\n`
                + `Load ${many ? "them" : "it"} first (${how}), then create the file. AGENTS.md's chain table is where that mapping lives.\n`
                + `The skill carries the questions that stage has to answer; a file written without it has the right name and not the work.`;
        return { verdict, stage, skills, files: [file], message };
    }
    return null;
}

// The session's transcript as text, or null when the harness named none or it cannot be read. A
// transcript too large to read whole is not read: the check is a courtesy, not worth a stall.
const MAX = 64 * 1024 * 1024;
function readTranscript(file) {
    if (!file) return null;
    try {
        if (fs.statSync(file).size > MAX) return null;
        return fs.readFileSync(file, "utf8");
    } catch { return null; }
}

module.exports = { stageFor, used, decide, readTranscript };
