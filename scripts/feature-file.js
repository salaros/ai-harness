// scripts/feature-file.js
// What one BDD document yields as a feature file, and why it yields none. A document of the BDD
// stage is written to run (ADR-0008): its ```gherkin blocks, in order, make one .feature file for
// the stack's Gherkin runner, and the document stays the record. extract(text, file) returns the
// file's content, the scenario ids it holds, and the problems that stop it being written:
//   no gherkin block; more or fewer than one `Feature:` line across the blocks; a scenario (Scenario,
//   Scenario Outline, Scenario Template, Example) without a `# SC-n` line directly above it, above
//   its tags and at the start of the line, which is what makes SC-n an item docs-check counts and a
//   SPEC cites as BDD-NNNN/SC-n; two scenarios sharing an id; a `# language:` line naming a dialect
//   other than en, since the keywords are English and the prose language goes in the step text.
// Every problem names the file, so a caller prints or collects it as it is. A `# language: en` line
// is kept first, because Gherkin reads it only there. Two callers share the rule so that what the
// pre-commit hook refuses is exactly what would not run: scripts/docs-check.js reports the problems
// for every BDD document of the chain, and scripts/bdd-features.js writes the files.
// Not a command: nothing here reads the disk, prints or exits.

// The script that writes the files, named in each one's header so that a stale file can be told
// from a hand-written one in the same folder.
const WRITER = "scripts/bdd-features.js";
const MARK = `by ${WRITER}`;

// A fenced block opens on three or more backticks or tildes, optionally indented up to three spaces,
// with the language right after; it closes on the same character, at least as many of them, and
// nothing else. That is CommonMark's rule, and it is why a ```gherkin line inside a ```md example is
// not a block of its own.
const OPEN_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)/;
const closeRe = mark => new RegExp(`^ {0,3}${mark[0] === "\`" ? "\`" : "~"}{${mark.length},}[ \\t]*$`);
const FEATURE_RE = /^\s*Feature:/;
const SCENARIO_RE = /^\s*(?:Scenario Outline|Scenario Template|Scenario|Example):/;
const TAG_RE = /^\s*@/;
// docs-check's item rule, for a line that is a Markdown heading or a Gherkin comment alike: `# SC-1`
// at the start of the line, so the id is one a later document can cite.
const SC_RE = /^# (SC-\d+)\b/;
const LANGUAGE_RE = /^\s*#\s*language:\s*(\S*)/i;

// The gherkin blocks of a Markdown document, each as its lines, in document order. A block never
// closed runs to the end of the document, as CommonMark reads it.
function blocks(lines) {
    const out = [];
    let close = null, gherkin = false, current = [];
    for (const line of lines) {
        if (!close) {
            const m = line.match(OPEN_RE);
            if (!m) continue;
            close = closeRe(m[1]); gherkin = m[2].toLowerCase() === "gherkin"; current = [];
            continue;
        }
        if (close.test(line)) { if (gherkin) out.push(current); close = null; continue; }
        current.push(line);
    }
    if (close && gherkin) out.push(current);
    return out;
}

const trimBlank = lines => {
    const out = lines.slice();
    while (out.length && !out[0].trim()) out.shift();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    return out;
};

// One document's feature file, or the reasons there is none. `file` is the document's repo-relative
// path, named in every problem and in the header of the file written.
function extract(text, file) {
    const problems = [];
    const say = msg => problems.push(`${file}: ${msg}`);
    const found = blocks(text.split(/\r?\n/)).map(trimBlank).filter(b => b.length);
    if (!found.length) { say("has no ```gherkin block; a BDD document's scenarios are Gherkin in one (ADR-0008)"); return { feature: null, ids: [], problems }; }
    const body = found.flatMap((b, i) => i ? ["", ...b] : b);

    const language = body.findIndex(l => LANGUAGE_RE.test(l));
    if (language >= 0) {
        const dialect = body[language].match(LANGUAGE_RE)[1];
        if (dialect.toLowerCase() !== "en") say(`"${body[language].trim()}" names a Gherkin dialect; the keywords are English (Feature:, Scenario:, Given, When, Then) and the prose language goes in the titles and step text`);
    }

    const features = body.filter(l => FEATURE_RE.test(l)).length;
    if (features !== 1) say(`holds ${features} \`Feature:\` lines across its gherkin blocks; a feature file is one Feature`);

    const seen = new Map();
    body.forEach((line, i) => {
        if (!SCENARIO_RE.test(line)) return;
        let j = i - 1;
        while (j >= 0 && TAG_RE.test(body[j])) j--;
        const m = j >= 0 ? body[j].match(SC_RE) : null;
        const name = line.trim();
        if (!m) { say(`"${name}" has no \`# SC-n\` line directly above it (above its tags, at the start of the line)`); return; }
        if (seen.has(m[1])) say(`${m[1]} names both "${seen.get(m[1])}" and "${name}"`);
        else seen.set(m[1], name);
    });
    if (problems.length) return { feature: null, ids: [...seen.keys()], problems };

    const header = [`# Generated from ${file} ${MARK}. Do not edit: change the document and run it again.`, ""];
    const lines = language < 0 ? [...header, ...body]
        : [body[language], ...header, ...trimBlank([...body.slice(0, language), ...body.slice(language + 1)])];
    return { feature: lines.join("\n") + "\n", ids: [...seen.keys()], problems };
}

module.exports = { extract, MARK, WRITER };
