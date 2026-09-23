// scripts/plan-entry.js
// One line of an install plan: at most one thing done to one path, and how the run reports it.
//
// An install rewrites somebody else's repository, and it decides everything before it writes
// anything, so the plan is the whole of what a run is. Its entries used to be a record with eleven
// optional keys, built in three places and read in three others, with the rules for both written out
// as a comment above the loop. A comment is not checked: apply() padded `policy` on every entry not
// marked silent, so a producer that left the column out would have thrown halfway through somebody's
// repo, at print time, with no way to tell which producer built the entry.
//
// The kinds below are the whole vocabulary. Each says what is done to the path -- the same four
// words repo-edit.js reads, write, link, mkdir and mark, plus doing nothing at all -- and carries
// how it is reported, which is either `shown(...)`, four columns demanded where the entry is made,
// or `quiet(...)`, counted in the summary and never printed. Nothing here touches a repo, prints, or
// decides an outcome word: repo-edit does the first, the run does the second, install-policy the
// third.

// How an entry is reported: the policy the manifest gave the path, the mode Git recorded, the
// outcome word, and the summary list the path joins. The bucket is the one that may be left out -- a
// line can be printed and belong to no list, which is what "unchanged" is. The other three are the
// line, so leaving one out is refused here, by name, rather than at the padEnd that would have hit it.
function shown(policy, mode, outcome, bucket = null) {
    for (const [name, value] of [["policy", policy], ["mode", mode], ["outcome", outcome]]) {
        if (typeof value !== "string" || !value) throw new Error(`a plan entry that is printed needs a ${name}`);
    }
    return { policy, mode, outcome, bucket };
}

// Counted in the summary and never printed: a skill's own files, where the skill is the line and its
// four hundred files are not; the two receipts; the folder made for a link.
const quiet = (bucket = null) => ({ silent: true, bucket });

// A section of the output. Heads the lines that follow it and does nothing to any path.
const heading = phase => ({ phase });

const at = (file, as, act) => {
    if (typeof file !== "string" || !file) throw new Error("a plan entry needs the path it is about");
    if (!as || (!as.silent && !as.outcome)) throw new Error(`${file}: a plan entry needs either shown(...) or quiet(...)`);
    return { file, ...act, ...as };
};

// The path is left exactly as it was found, and the line says so: unchanged, yours, UNREADABLE, or a
// skill whose folder nothing in this run touched.
const noted = (file, as) => at(file, as, {});

// `text` is what the path will hold, a string or a Buffer. `exec` marks it executable as well, which
// is part of the same entry rather than a second one: a hook written 100644 gates nothing and looks
// installed either way.
const written = (file, text, as, { exec = false } = {}) => at(file, as, { write: text, exec });

// A symlink to `to`. `replace` clears whatever is in its way first, which is how a link checked out
// as a regular file -- the failure that leaves an agent seeing no skills at all -- gets undone.
const linked = (file, to, as, { replace = false } = {}) => at(file, as, { link: to, replace });

// The executable bit alone, for a path whose content is somebody else's to keep.
const marked = (file, as) => at(file, as, { exec: true });

// The folder and nothing in it, for a link whose parent has to exist before it can be made.
const folder = (file, as) => at(file, as, { mkdir: true });

// The run's line for an entry, or null for one that prints nothing. One function rather than a
// format string at each consumer, so the widths and the rule for what is printed live with the
// record they are about.
// A column is its word, a space, and then padding out to the width: padding alone lines the columns
// up only while every word is shorter than its column, and "reconcile" filled a nine-wide policy
// column exactly while "yours appended" overran a twelve-wide outcome, so both ran into what came
// after them. A word too long now pushes its column out of line, which is a worse-looking line and
// a readable one. Nothing noticed either way for as long as a run's lines could be read only as the
// stdout of a real install.
const column = (word, width) => `${word} `.padEnd(width);
const describe = e => (e.phase || e.silent ? null : `  ${column(e.policy, 9)}${e.mode}  ${column(e.outcome, 12)}${e.file}`);

// The entry as it turned out, when that is not what it planned. The only case is a symlink the
// platform refused: the edit reports the link is not there, and which outcome word that deserves is
// the run's to say. A copy, and only the reporting changes -- what was asked of the path is what was
// asked, whatever became of it.
const turnedOut = (e, outcome, bucket = null) => ({ ...e, outcome, bucket });

module.exports = { shown, quiet, heading, noted, written, linked, marked, folder, describe, turnedOut };
