#!/usr/bin/env node
// scripts/check-commit-msg.js
// Checks a commit message against Conventional Commits, the shape the `git-commit` skill writes.
// The skill generates the message agent-side; this is the gate that holds whatever wrote it, agent
// or human, to the same rule. A hook cannot call a skill, so the rule here is deterministic and
// offline like the other three.
// Git runs this from .githooks/commit-msg, which passes the path of the message file. It reads
// stdin instead when given no path, so the fixture table can drive it.
// A failure names the rule and the line, and exits 1; `git commit --no-verify` skips the hook.
// check(raw, root) is the decision, exported the way check-initialised.js and docs-check.js export
// theirs: it reads nothing but the message and the two files under `root` that say what an issue
// reference looks like here, returns what it found, and prints and exits nothing. The command line
// below is the only part that talks to a terminal, so the suite can put a message in and read the
// verdict out rather than matching substrings of stderr.
// Usage:
//   node scripts/check-commit-msg.js .git/COMMIT_EDITMSG
//   printf 'feat: add a thing\n' | node scripts/check-commit-msg.js
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore", "revert"];
const HEADER = new RegExp(`^(${TYPES.join("|")})(\\([^()\\s][^()]*\\))?(!)?: (.+)$`);
const MAX = 72;
// "fixing bugs" and "implemented some stuff" tell a reader nothing, so a description is at least
// four words, and every commit carries a body saying why. Git's own trailers are metadata rather
// than explanation, so they do not count towards it.
const MIN_WORDS = 4;
const MIN_BODY = 20;
const TRAILER = /^(?:BREAKING[ -]CHANGE:|[A-Za-z][A-Za-z-]*:\s)/;
// Git writes these itself, so holding them to the rule would block a merge or a rebase.
const GENERATED = /^(?:Merge |Revert "|fixup! |squash! |amend! )/;

// Whether the project has decided it has no issue tracker. `project-init` writes
// `Issue tracker: none` into MEMORY.md for a project that plans in docs/, and nagging that repo for
// a key on every commit would be asking for something it has already said it does not have.
function noTracker(root) {
    // HOOK_TEST is the suite running a fixture against this script. What the host project decided
    // about trackers has nothing to do with whether a message parses, and reading it here fails the
    // two warning cases in every repo that records "Issue tracker: none" -- a false alarm the
    // installer's self check then reports as a broken install.
    if (process.env.HOOK_TEST) return false;
    try {
        const m = fs.readFileSync(path.join(root, "MEMORY.md"), "utf8").match(/^\s*-\s*\*\*Issue tracker:\*\*\s*(.*)$/mi);
        return !!m && /^none\b/i.test(m[1].trim());
    } catch { return false; }
}

// What an issue reference looks like here, from the file the skills already read. Trackers differ:
// Jira and Linear cite `AB-42`, GitHub Issues `#42`, Asana a bare number. A project on anything but
// the first sets `Key format:` to a regular expression and gets warned about the right thing; with
// no format set the project key scopes the check, and with no key either, anything Jira-shaped
// counts. A commit with no reference is warned about, never blocked: the point is to encourage the
// habit, and a change can be legitimate before anyone has raised a ticket for it.
function reference(root) {
    let cfg = "";
    try { cfg = fs.readFileSync(path.join(root, "docs/agents/issue-tracker.md"), "utf8"); } catch { /* unconfigured */ }
    const format = cfg.match(/^\*\*Key format:\*\*\s*`([^`]+)`/m);
    // A hand-written regular expression: unusable ones fall through to the key rather than throwing.
    // A configured format has no sample to show, so the advice names the shape instead of an example.
    if (format) { try { return { re: new RegExp(format[1]), format: format[1] }; } catch { /* fall through */ } }
    const k = cfg.match(/^\*\*Project key:\*\*\s*`([^`]+)`/m);
    const key = k && k[1] !== "TODO-PROJECT-KEY" ? k[1] : null;
    return key
        ? { re: new RegExp(`\\b${key}-\\d+\\b`), example: `${key}-123` }
        : { re: /\b[A-Z][A-Z0-9]+-\d+\b/, example: "PROJ-123" };
}

// The whole decision: `raw` is the message as Git wrote it, `root` the repo it is being committed
// to. Returns the rules it broke, the warnings that never block, and the line to print when it
// passed; an accepted message with nothing to say has an empty summary.
function check(raw, root) {
    const warnings = [];

    // The editor's template: comments, and anything past the scissors line, are not the message.
    const lines = raw.split(/\r?\n/);
    const cut = lines.findIndex(l => /^# -+ >8 -+$/.test(l));
    const body = (cut === -1 ? lines : lines.slice(0, cut)).filter(l => !l.startsWith("#"));
    while (body.length && body[body.length - 1].trim() === "") body.pop();

    const header = body[0] || "";
    // An empty message aborts the commit in git itself, and a message git wrote is not the author's.
    if (!header.trim()) return { problems: [], warnings, summary: "" };
    if (GENERATED.test(header)) return { problems: [], warnings, summary: "commit message: generated by git, not checked" };

    const problems = [];
    const m = header.match(HEADER);
    if (!m) {
        problems.push(`the subject is not a conventional commit: "${header}"\n` +
            `  expected <type>(<scope>)?!?: <description>, type one of ${TYPES.join(", ")}\n` +
            `  for example: feat(hooks): check commit messages`);
    } else {
        if (m[4].endsWith(".")) problems.push(`the subject ends with a full stop: "${header}"`);
        const words = m[4].trim().split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w));
        if (words.length < MIN_WORDS) {
            problems.push(`the description is ${words.length} word(s): "${m[4]}"\n` +
                `  say what changed, specifically enough that the subject alone is useful in a log:\n` +
                `  not "fixing bugs" or "implemented some stuff", but "reject a subject with no real description"`);
        }
    }
    if (header.length > MAX) problems.push(`the subject is ${header.length} characters, over the ${MAX} allowed`);
    if (body.length > 1 && body[1].trim() !== "") problems.push(`line 2 must be blank, separating subject from body: "${body[1]}"`);

    // The body must explain the change. Trailers are metadata, not explanation, so a message whose
    // only body is "Refs: AB-42" has none; they are stripped from the end, where Git's convention
    // puts them.
    const rest = body.slice(1);
    const trailers = [];
    while (rest.length && (rest[rest.length - 1].trim() === "" || TRAILER.test(rest[rest.length - 1]))) {
        const line = rest.pop();
        if (TRAILER.test(line)) trailers.unshift(line);
    }
    const prose = rest.join("\n").trim();
    if (prose.length < MIN_BODY) {
        problems.push(`there is no description: the subject explains what, the body explains why\n` +
            `  leave a blank line after the subject, then write at least ${MIN_BODY} characters of it` +
            (prose.length ? ` (found ${prose.length})` : ""));
    }

    // A warning, not a rule: it never reaches the exit code.
    // The key counts only where it means "this commit is that work": the subject, or a trailer. A key
    // named in passing in the body is prose about a ticket, not a reference to one, and a message that
    // merely quotes an example would otherwise read as compliant.
    const { re: issue, example, format } = reference(root);
    if (!noTracker(root) && !issue.test(header) && !trailers.some(t => issue.test(t))) {
        warnings.push(example
            ? `commit message: no issue key (${example}). Add one so the change can be traced to its ticket, ` +
              `in the subject or as a trailing "Refs: ${example}" line.`
            : `commit message: no issue reference matching ${format}. Add one so the change can be traced to its ` +
              `ticket, in the subject or as a trailing "Refs:" line.`);
    }

    return { problems, warnings, summary: `commit message: conventional, ${header.length} character subject` };
}

module.exports = { check, TYPES, MAX, MIN_WORDS, MIN_BODY };

if (require.main === module) {
    // Read the message before changing directory: the path given may be relative to where Git ran.
    const file = process.argv.slice(2).find(a => !a.startsWith("--"));
    const raw = file ? fs.readFileSync(file, "utf8") : lib.stdin();
    const root = lib.chdirRoot();

    const { problems, warnings, summary } = check(raw, root);
    for (const w of warnings) console.error(w);
    if (!problems.length) { if (summary) console.log(summary); process.exit(0); }
    console.error("\ncommit message rejected:\n");
    for (const p of problems) console.error(`- ${p}`);
    console.error(`\nRewrite it, or commit anyway with: git commit --no-verify\n`);
    process.exit(1);
}
