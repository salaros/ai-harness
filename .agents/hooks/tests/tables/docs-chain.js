// .agents/hooks/tests/tables/docs-chain.js
// scripts/docs-check.js's decisions: which files are the chain, what counts as a source, what a
// document must derive from, and the one model both the validator and the portal read. Every case
// runs against a repo held in memory, so a document here never touches the disk.
const fs = require("fs");
const path = require("path");
const lib = require("../../lib");
const docsCheck = require("../../../../scripts/docs-check");
const stagedDocs = require("../../../../scripts/check-staged-docs");
const repoView = require("../../../../scripts/repo-view");
const { withRoot } = require("../fixtures");

// Which files are the chain. The edit hook and the pre-commit hook both ask inChain, so one table
// pins what an edit and a commit check.
exports.chainMembership = function chainMembership(t) {
    const rows = [
        ["docs/brd/0001-x.md", true, "a document under docs/"],
        ["docs/README.md", true, "any Markdown under docs/"],
        ["AGENTS.md", true, "the table that defines the stages"],
        ["MEMORY.md", true, "MEMORY.md, whose Requirements line enters the chain"],
        ["INTENT.md", true, "INTENT.md"],
        ["docs/diagram.png", false, "a file under docs/ that is not Markdown"],
        ["README.md", false, "Markdown outside docs/"],
        ["src/docs/x.md", false, "a docs/ folder that is not at the root"],
    ];
    for (const [file, want, why] of rows) {
        t.ok(docsCheck.inChain(file) === want, `inChain: ${why}`, `${file} -> ${!want}`);
    }
    const staged = rows.map(r => r[0]);
    t.ok(JSON.stringify(stagedDocs.chainFiles(staged)) === JSON.stringify(staged.filter(docsCheck.inChain)),
        "the pre-commit hook's staged filter is inChain", stagedDocs.chainFiles(staged).join(" "));
};

// What counts as a source, the one rule "Derived from:", MEMORY.md's Requirements and TODO.md share.
exports.sourceDecisions = function sourceDecisions(t) {
    const REPO = { "INTENT.md": "# INTENT.md\n", ".gitignore": "node_modules/\n", "src/billing.cs": "// there\n", "docs/brief.md": "# Brief\n" };
    const rows = [
        // token, is a source, why
        ["https://example.com/spec", true, "a URL"],
        ["jira:AB-42", true, "an upper-case Jira key"],
        ["jira:MY_PROJ-7", true, "a Jira key with an underscore, which Jira allows"],
        ["jira:ab-42", false, "a lower-case Jira key, which Jira never issues"],
        ["src/billing.cs", true, "a path that exists"],
        ["src/billing.cs:12", true, "path:line, where the file exists"],
        ["src/billing.cs:12-40", true, "path:from-to, where the file exists"],
        ["src/missing.cs:12", false, "path:line whose file does not exist"],
        ["src/", true, "a folder, written with its slash"],
        ["src", false, "a bare word, even one naming a real folder"],
        ["INTENT.md", true, "a file at the root"],
        [".gitignore", true, "a dotfile at the root"],
        [".npmrc", false, "a dotfile that is not there"],
        ["INTENT", false, "a bare word that names no file at the root"],
        ["Node.js", false, "prose with a dot"],
        ["during the review", false, "prose"],
    ];
    withRoot(REPO, root => {
        for (const [token, want, why] of rows) {
            t.ok(docsCheck.isSource(token, root) === want, `isSource: ${why}`, `${token} -> ${!want}`);
        }
    });
};

// A repo as docs-check reads it, held in memory (scripts/repo-view.js): this checkout's AGENTS.md,
// so the real stage table decides, an empty SKILL.md for each skill it names, and `files`
// (repo-relative path -> lines) and nothing else. A case names every file it depends on, a source
// it cites included, and nothing touches the disk.
function chainView(files = {}) {
    const map = { "AGENTS.md": fs.readFileSync(path.join(lib.checkout, "AGENTS.md"), "utf8") };
    for (const s of docsCheck.readChain(repoView.worktree(lib.checkout)).stages)
        for (const skill of s.skills) map[`.agents/skills/${skill}/SKILL.md`] = "";
    for (const [rel, lines] of Object.entries(files)) map[rel] = [].concat(lines).join("\n") + "\n";
    return repoView.fromMap(map);
}

// check() over the documents in `docs` (keyed under docs/) and the other `files`, with a helper that
// filters the problems by document.
function checkDocs(docs, files = {}) {
    const entries = Object.entries(docs).map(([rel, lines]) => [`docs/${rel}`, lines]);
    const { problems } = docsCheck.check(lib.checkout, chainView({ ...Object.fromEntries(entries), ...files }));
    return {
        all: problems.join("\n") || "(none)",
        for: rel => problems.filter(p => p.startsWith(`docs/${rel}:`)),
    };
}

// Every document says where it came from. Where the chain holds nothing earlier that is a source:
// a URL, an existing repo-relative path, or a Jira key. A missing line, a line naming nothing, and
// a path that does not exist are each their own message.
exports.docsCheckDerivedFromShapes = function docsCheckDerivedFromShapes(t) {
    const r = checkDocs({
        "brd/9100-url.md": ["# BRD-9100: Url", "", "**Derived from:** https://example.com/brief"],
        "brd/9101-jira.md": ["# BRD-9101: Jira", "", "**Derived from:** jira:ABC-123"],
        "brd/9102-path.md": ["# BRD-9102: Path", "", "**Derived from:** .scratch/interview.md"],
        "brd/9103-absent.md": ["# BRD-9103: Absent"],
        "brd/9104-words.md": ["# BRD-9104: Words", "", "**Derived from:** the whiteboard"],
        "brd/9105-gone.md": ["# BRD-9105: Gone", "", "**Derived from:** docs/nowhere/missing.md"],
        // A bare file name is a path at the root, which is how INTENT.md is cited.
        "brd/9106-root.md": ["# BRD-9106: Root", "", "**Derived from:** the product intent in INTENT.md"],
        "brd/9107-root-gone.md": ["# BRD-9107: Root gone", "", "**Derived from:** NO-SUCH-INTENT.md"],
        "brd/9108-dotted.md": ["# BRD-9108: Dotted", "", "**Derived from:** a talk about Node.js"],
    }, {
        ".scratch/interview.md": ["# Interview"],
        "INTENT.md": ["# INTENT.md", "", "## Product", "", "**Acme** bills people.", "", "## MVP stories", "", "### Bill", ""],
    });
    for (const ok of ["brd/9100-url.md", "brd/9101-jira.md", "brd/9102-path.md", "brd/9106-root.md"])
        t.ok(r.for(ok).length === 0, `docs-check: ${ok} derives from a valid source`, r.all);
    t.ok(r.for("brd/9107-root-gone.md").some(p => p.includes("NO-SUCH-INTENT.md does not exist")),
        "docs-check: Derived from names a root file that is not there", r.all);
    t.ok(r.for("brd/9108-dotted.md").some(p => p.includes("names no reference") && !p.includes("does not exist")),
        "docs-check: a dotted word in prose is neither a source nor a missing path", r.all);
    t.ok(r.for("brd/9103-absent.md").some(p => p.includes("missing a")), "docs-check: no Derived from line at all", r.all);
    t.ok(r.for("brd/9104-words.md").some(p => p.includes("names no reference")), "docs-check: Derived from names nothing", r.all);
    t.ok(r.for("brd/9105-gone.md").some(p => p.includes("does not exist")), "docs-check: Derived from names a path that is not there", r.all);
};

// A source stands in for an upstream document only while nothing earlier exists. Once it does, the
// line must cite it — except on an ADR, which is cross-cutting and cites in either direction.
exports.docsCheckSourceAndAdrExemption = function docsCheckSourceAndAdrExemption(t) {
    const r = checkDocs({
        "brd/9200-real.md": ["# BRD-9200: Real", "", "**Derived from:** https://example.com/brief"],
        "prd/9200-stale.md": ["# PRD-9200: Stale", "", "**Derived from:** https://example.com/brief"],
        "adr/9200-forced.md": ["# ADR-9200: Forced", "", "**Derived from:** https://example.com/rfc"],
        "spec/9200-design.md": ["# SPEC-9200: Design", "", "**Derived from:** BRD-9200"],
        "adr/9201-late.md": ["# ADR-9201: Late", "", "**Derived from:** SPEC-9200"],
        "prd/9201-decided.md": ["# PRD-9201: Decided", "", "**Derived from:** BRD-9200", "", "Constrained by ADR-9200."],
    });
    t.ok(r.for("prd/9200-stale.md").some(p => p.includes("cite the upstream document instead")),
        "docs-check: source-only line once an upstream document exists", r.all);
    t.ok(r.for("adr/9200-forced.md").length === 0, "docs-check: an ADR may derive from a source at any time", r.all);
    t.ok(r.for("adr/9201-late.md").length === 0, "docs-check: an ADR may cite a later stage", r.all);
    t.ok(r.for("prd/9201-decided.md").length === 0, "docs-check: any document may cite an ADR", r.all);
};

// The Cites column: a TRD is an entry stage, so engineering-driven work may start at one from a
// source however much of the chain exists; an RFC is cross-cutting like an ADR.
exports.docsCheckCitesColumn = function docsCheckCitesColumn(t) {
    const rfc = (n, status, extra = []) => [`# RFC-${n}: Rfc`, "", `**Status:** ${status}`, "**Derived from:** https://example.com/issue", ...extra];
    const r = checkDocs({
        "brd/9500-real.md": ["# BRD-9500: Real", "", "**Derived from:** https://example.com/brief"],
        "prd/9500-product.md": ["# PRD-9500: Product", "", "**Derived from:** BRD-9500", "", "- NFR-1: Search feels instant"],
        "trd/9500-migration.md": ["# TRD-9500: Migration", "", "**Derived from:** https://example.com/eol-notice"],
        "trd/9501-refines.md": ["# TRD-9501: Refines", "", "**Derived from:** PRD-9500", "", "| TR-1 | Performance | p95 < 200 ms | PRD-9500/NFR-1 |"],
        "ears/9500-shall.md": ["# EARS-9500: Shall", "", "**Derived from:** TRD-9501", "", "- REQ-1: The search shall answer in 200 ms (TRD-9501/TR-1)."],
        "rfc/9500-late.md": rfc(9500, "Accepted", ["", "Constrained by SPEC-9500.", "", "### OPT-1: Cache"]),
        "bdd/9500-early.md": ["# BDD-9500: Early", "", "**Derived from:** EARS-9500", "", "Follows RFC-9500/OPT-1."],
        "spec/9500-design.md": ["# SPEC-9500: Design", "", "**Derived from:** RFC-9500"],
    });
    t.ok(r.for("trd/9500-migration.md").length === 0, "docs-check: a TRD may derive from a source alone once a PRD exists", r.all);
    t.ok(r.for("trd/9501-refines.md").length === 0, "docs-check: a TRD refines a PRD's NFR", r.all);
    t.ok(r.for("ears/9500-shall.md").length === 0, "docs-check: EARS cites a TRD item", r.all);
    t.ok(r.for("rfc/9500-late.md").length === 0, "docs-check: an RFC derives from a source and cites a later stage", r.all);
    t.ok(r.for("bdd/9500-early.md").length === 0, "docs-check: an earlier stage may cite an RFC", r.all);
    t.ok(r.for("spec/9500-design.md").length === 0, "docs-check: a SPEC builds on an accepted RFC", r.all);
};

// The Status column: every RFC carries one of the listed values, and a later stage builds only on
// one the table marks in bold. A cross-cutting ADR may cite a rejected RFC; an RFC may cite another.
exports.docsCheckStatusColumn = function docsCheckStatusColumn(t) {
    const rfc = (n, status) => [`# RFC-${n}: Rfc`, "", ...(status ? [`**Status:** ${status}`] : []), "**Derived from:** https://example.com/issue"];
    const r = checkDocs({
        "rfc/9600-open.md": rfc(9600, "Open"),
        "rfc/9601-rejected.md": rfc(9601, "Rejected"),
        "rfc/9602-none.md": rfc(9602, null),
        "rfc/9603-odd.md": rfc(9603, "Pondering"),
        "rfc/9604-old.md": rfc(9604, "Superseded by RFC-9605"),
        "rfc/9605-new.md": [...rfc(9605, "Accepted"), "", "Replaces RFC-9604."],
        "rfc/9606-dated.md": ["# RFC-9606: Rfc", "", "Status quo is a list of options.", "**Status:** Accepted, 2026-09-20", "**Derived from:** https://example.com/issue"],
        "bdd/9600-early.md": ["# BDD-9600: Early", "", "**Derived from:** RFC-9600"],
        "spec/9600-early.md": ["# SPEC-9600: Early", "", "**Derived from:** RFC-9600"],
        "spec/9601-accepted.md": ["# SPEC-9601: Accepted", "", "**Derived from:** RFC-9605"],
        "adr/9600-no.md": ["# ADR-9600: No", "", "**Derived from:** RFC-9601"],
    });
    t.ok(r.for("spec/9600-early.md").some(p => p.includes("which is Open") && p.includes("Accepted")),
        "docs-check: a SPEC may not build on an RFC still open", r.all);
    t.ok(r.for("spec/9601-accepted.md").length === 0, "docs-check: a SPEC builds on an accepted RFC", r.all);
    t.ok(r.for("adr/9600-no.md").length === 0, "docs-check: an ADR may cite a rejected RFC", r.all);
    t.ok(r.for("bdd/9600-early.md").every(p => !p.includes("which is Open")), "docs-check: only a stage after the RFC is held to its status", r.all);
    t.ok(r.for("rfc/9606-dated.md").length === 0, "docs-check: the Status line is the one with a colon, and a date may follow the value", r.all);
    t.ok(r.for("rfc/9602-none.md").some(p => p.includes('"**Status:**" line')), "docs-check: an RFC with no status", r.all);
    t.ok(r.for("rfc/9603-odd.md").some(p => p.includes('"**Status:**" line')), "docs-check: an RFC with a status the table does not list", r.all);
    t.ok(r.for("rfc/9604-old.md").length === 0 && r.for("rfc/9605-new.md").length === 0,
        "docs-check: Superseded by RFC-NNNN is a status, and RFCs cite each other", r.all);
};

// A PDD decides whether a BRD is written at all: a BRD builds only on one that is Go, and, as an
// entry stage, may still start from a source when the need was settled without discovery.
exports.docsCheckDiscovery = function docsCheckDiscovery(t) {
    const pdd = (n, status) => [`# PDD-${n}: Pdd`, "", `**Status:** ${status}`, "**Derived from:** docs/research/interviews/2026-01-01-a.md", "", "- OUT-1: Churn under 5% by June"];
    const r = checkDocs({
        "research/interviews/2026-01-01-a.md": ["# Interview: A", "", "**Kind:** user"],
        "pdd/9700-go.md": pdd(9700, "Go"),
        "pdd/9701-parked.md": pdd(9701, "Parked"),
        "pdd/9702-no.md": pdd(9702, "No-go"),
        "pdd/9704-hyphen.md": pdd(9704, "Go-live pending"),
        "pdd/9703-none.md": ["# PDD-9703: Pdd", "", "**Derived from:** https://example.com/signal"],
        "brd/9700-case.md": ["# BRD-9700: Case", "", "**Derived from:** PDD-9700", "", "- SF-1 (PDD-9700/OUT-1): Churn under 5% by June"],
        "brd/9701-early.md": ["# BRD-9701: Early", "", "**Derived from:** PDD-9701"],
        "brd/9702-dead.md": ["# BRD-9702: Dead", "", "**Derived from:** PDD-9702"],
        "brd/9703-settled.md": ["# BRD-9703: Settled", "", "**Derived from:** https://example.com/contract"],
    });
    t.ok(r.for("pdd/9700-go.md").length === 0, "docs-check: a PDD derives from an interview record", r.all);
    t.ok(r.for("brd/9700-case.md").length === 0, "docs-check: a BRD builds on a PDD that is Go, citing its outcome", r.all);
    t.ok(r.for("brd/9701-early.md").some(p => p.includes("which is Parked") && p.includes("Go")), "docs-check: a BRD may not build on a parked PDD", r.all);
    t.ok(r.for("brd/9702-dead.md").some(p => p.includes("which is No-go")), "docs-check: No-go is a status of its own, not Go", r.all);
    t.ok(r.for("pdd/9704-hyphen.md").some(p => p.includes('"**Status:**" line')), "docs-check: Go-live is not Go", r.all);
    t.ok(r.for("pdd/9703-none.md").some(p => p.includes('"**Status:**" line')), "docs-check: a PDD needs a verdict status", r.all);
    t.ok(r.for("brd/9703-settled.md").length === 0, "docs-check: a BRD is an entry stage, starting from a source while PDDs exist", r.all);
};

// The two columns are optional in the table's shape: a table written before them keeps ADR's old
// rule, and a value the parser does not know is reported rather than guessed at.
exports.readChainCitesAndStatus = function readChainCitesAndStatus(t) {
    const table = (header, rows) => repoView.fromMap({
        "AGENTS.md": [header, header.replace(/[^|]+/g, " --- "), ...rows].join("\n") + "\n",
    });
    const legacy = docsCheck.readChain(table("| Stage | Answers | Lives in | Skill |",
        ["| BRD | why | `docs/brd/` | |", "| ADR | decisions | `docs/adr/` | |"]));
    const cites = Object.fromEntries(legacy.stages.map(s => [s.stage, s.cites]));
    t.ok(cites.BRD === "backwards" && cites.ADR === "any", "readChain: a table with no Cites column keeps ADR cross-cutting", JSON.stringify(cites));
    const odd = docsCheck.readChain(table("| Stage | Answers | Lives in | Cites | Status | Skill |",
        ["| BRD | why | `docs/brd/` | sideways | | |", "| RFC | how | `docs/rfc/` | any | Draft, Accepted | |"]));
    const said = odd.problems.join("\n");
    t.ok(said.includes('cites "sideways"'), "readChain: an unknown Cites value", said);
    t.ok(said.includes("marks none in bold"), "readChain: statuses with none to build on", said);
};

// MEMORY.md's Requirements takes part in traceability, so it follows the same reference rule.
exports.docsCheckMemoryRequirements = function docsCheckMemoryRequirements(t) {
    const memory = lines => {
        const { problems } = docsCheck.check(lib.checkout, chainView({
            "docs/brd/9300-real.md": ["# BRD-9300: Real", "", "**Derived from:** https://example.com/brief"],
            "MEMORY.md": lines,
        }));
        return problems.filter(p => p.startsWith("MEMORY.md:"));
    };
    const cases = [
        ["none yet", ["# Project", "", "- **Requirements:** none yet"], 0, ""],
        ["a document that exists", ["- **Requirements:** BRD-9300"], 0, ""],
        ["several sources", ["- **Requirements:** https://example.com/a, jira:ABC-1"], 0, ""],
        ["a file at the root, as INTENT.md is cited", ["- **Requirements:** MVP stories in AGENTS.md"], 0, ""],
        ["a document that does not exist", ["- **Requirements:** BRD-9999"], 1, "does not exist"],
        ["prose instead of a reference", ["- **Requirements:** the whiteboard"], 1, "names no reference"],
        // The rule is "Derived from:"'s: one reference on the line, and the rest of the words are the
        // writer's, in whatever language MEMORY.md says this project writes prose in.
        ["prose around a reference", ["- **Requirements:** gathered on a call, written up in BRD-9300"], 0, ""],
        ["prose around a reference, not in English", ["- **Requirements:** требования собраны в BRD-9300"], 0, ""],
        ["no Requirements line", ["# Project", "", "- **Stack:** none yet"], 1, "no Requirements line"],
        // update-harness.js lays down a MEMORY.md of placeholders when it installs the harness into a
        // repo that has none, so a fresh install must pass its own checks. check-initialised.js
        // already blocks every commit until project-init fills them in, and says exactly that.
        ["a placeholder project-init has not filled in", ["- **Requirements:** <requirements>"], 0, ""],
    ];
    for (const [title, lines, want, needle] of cases) {
        const problems = memory(lines);
        const detail = problems.join("\n") || "(none)";
        t.ok(want === 0 ? problems.length === 0 : problems.some(p => p.includes(needle)),
            `docs-check: MEMORY.md Requirements, ${title}`, detail);
    }
};

// docs-check's citation logic, exercised directly rather than through a fixture: a duplicate
// document number, a citation to an item that does not exist in its target, and a citation that
// jumps forward in the chain.
exports.docsCheckCitationEdgeCases = function docsCheckCitationEdgeCases(t) {
    const r = checkDocs({
        "brd/9001-alpha.md": ["# BRD-9001: Alpha"],
        "brd/9001-beta.md": ["# BRD-9001: Beta"],
        "brd/9002-source.md": ["# BRD-9002: Source", "", "- BR-1: Something real"],
        "prd/9002-citer.md": ["# PRD-9002: Citer", "", "**Derived from:** BRD-9002", "", "Refines BRD-9002/BR-2, which does not exist."],
        "brd/9003-support.md": ["# BRD-9003: Support"],
        "ears/9003-late.md": ["# EARS-9003: Late"],
        "prd/9003-early.md": ["# PRD-9003: Early", "", "**Derived from:** BRD-9003", "", "See EARS-9003 for details."],
    });
    const has = needle => r.all.includes(needle);
    const detail = r.all;
    t.ok(has("already used by"), "docs-check: duplicate document number", detail);
    t.ok(has("has no item BR-2"), "docs-check: citation to a missing item", detail);
    t.ok(has("later in the chain"), "docs-check: citation later in the chain", detail);
};

// INTENT.md is optional, and when present docs-check holds it to the sections its specification
// requires. Each broken shape gets its own message; a well-formed file and an absent one get none.
exports.docsCheckIntentShape = function docsCheckIntentShape(t) {
    const good = ["# INTENT.md", "", "_Written by hand._", "", "## Product", "", "**Acme Billing** invoices small firms monthly.",
        "", "## Personas", "", "### Dana, bookkeeper", "", "## MVP stories — build these first", "", "### Send an invoice", "",
        "*Done when:*", "- the customer receives a PDF", "", "## Release 2 — reminders", ""];
    const cases = [
        ["a well-formed file", good, ""],
        ["a wrong title", ["# Intent", ...good.slice(1)], "first heading must be"],
        ["no Product section", good.filter(l => l !== "## Product" && !l.startsWith("**Acme")), 'no "## Product" section'],
        ["a Product with no bold name", good.map(l => l.replace("**Acme Billing** ", "Acme Billing ")), "names no product in bold"],
        ["a Product with a name and nothing else", good.map(l => l.replace(" invoices small firms monthly.", "")), "does not say what the product does"],
        ["no MVP stories section", good.map(l => l.replace("## MVP stories — build these first", "## Stories")), 'no "## MVP stories" section'],
    ];
    const problemsFor = lines => docsCheck.check(lib.checkout, chainView(lines ? { "INTENT.md": lines } : {})).problems;
    t.ok(problemsFor(null).length === 0, "docs-check: a project with no INTENT.md is not asked for one", problemsFor(null).join("\n"));
    for (const [title, lines, needle] of cases) {
        const problems = problemsFor(lines);
        const detail = problems.join("\n") || "(none)";
        t.ok(needle ? problems.some(p => p.includes(needle)) : problems.length === 0, `docs-check: INTENT.md, ${title}`, detail);
    }
};

// The stage table in AGENTS.md has one parser, readChain(), and anything that needs the pipeline
// builds on it rather than reading the table again. Pin what it promises those callers: every row
// in table order, document stages carrying the folder their name implies.
// Written out rather than read from AGENTS.md on purpose: a test that asks the parser what the
// table says and then checks the answer against the table proves only that reading twice gives the
// same answer. This is the expectation the parser is held to, so reordering the table without
// meaning to fails here. Reordering it on purpose is an edit to this line as well.
const PIPELINE = ["PDD", "BRD", "PRD", "TRD", "EARS", "BDD", "RFC", "ADR", "SPEC"];

exports.chainIsParsedInPipelineOrder = function chainIsParsedInPipelineOrder(t) {
    const { stages, problems } = docsCheck.readChain(repoView.worktree(lib.checkout));
    const named = stages.map(s => s.stage);
    const detail = named.join(",");
    t.ok(problems.length === 0, "readChain finds no problem in this repo's table", problems.join("\n"));
    const order = PIPELINE.map(s => named.indexOf(s));
    t.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])), "readChain returns the stages in pipeline order", detail);
    t.ok(stages.some(s => !s.folder), "readChain returns the stages that are not documents too", detail);
    const wrong = stages.filter(s => s.folder && s.folder !== s.stage.toLowerCase());
    t.ok(!wrong.length, "every document stage's folder matches its name", wrong.map(s => `${s.stage} -> ${s.lives}`).join(","));
};

// readDocs() is the one model of the chain: what check() validates is what the portal renders. Pin
// the part that made two readers a bug rather than a duplication -- the file-name rule. A name the
// rule rejects is a problem and not a document, so a second reader cannot render a file nothing
// checked, which is what happened while the portal carried its own looser rule.
exports.oneModelForValidatorAndPortal = function oneModelForValidatorAndPortal(t) {
    const view = chainView({
        "docs/brd/9401-billing.md": ["# BRD-9401: Billing", "", "**Derived from:** jira:AB-42", "", "- BR-1: Bill monthly."],
        "docs/prd/9401-биллинг.md": ["# PRD-9401: Billing", "", "**Derived from:** BRD-9401"],
    });
    const model = docsCheck.readDocs(lib.checkout, view);
    const { problems } = docsCheck.check(lib.checkout, view);

    const ids = [...model.docs.keys()].join(",");
    const rejected = model.problems.filter(p => p.includes("9401-биллинг"));
    t.ok(model.docs.has("BRD-9401"), "readDocs collects a document the file-name rule accepts", ids);
    t.ok(!model.docs.has("PRD-9401"), "readDocs makes a rejected file name a problem, not a document", ids);
    t.ok(rejected.length === 1, "readDocs reports the rejected file name once", model.problems.join("\n") || "(none)");
    // The same file, refused in the same words by the reader every consumer goes through.
    t.ok(problems.some(p => rejected.includes(p)), "check() reports what the model rejected", problems.join("\n") || "(none)");

    const doc = model.docs.get("BRD-9401");
    t.ok(doc && doc.title === "BRD-9401: Billing" && doc.link === "/brd/9401-billing/" && doc.items.has("BR-1"),
        "readDocs carries what a renderer needs: title, link, items",
        doc && `${doc.title} | ${doc.link} | ${[...doc.items]}`);
    t.ok([...("Refines BRD-9401/BR-1.".matchAll(model.refRe))].length === 1, "the model's refRe matches a citation");
    t.ok(model.itemRe.test("- BR-1: Bill monthly."), "the model's itemRe matches an item");
};

// tools/docs-site is optional: a repo that publishes straight to Jira can delete the folder and owes
// this suite nothing, so the portal's end-to-end smoke runs only when it is installed. It needs no
// Astro install of its own, since chain.mjs only reads.
exports.docsSiteRendersTheChain = function docsSiteRendersTheChain(t) {
    const entry = path.join("tools", "docs-site", "chain.mjs");
    if (!fs.existsSync(entry)) { t.skip("tools/docs-site smoke: the optional portal is not installed"); return; }
    const r = lib.node([entry]);
    t.ok(r.status === 0, "tools/docs-site/chain.mjs runs", r.output);
    if (r.status !== 0) return;
    const order = PIPELINE.map(s => r.output.indexOf(`${s}\t`));
    t.ok(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])),
        "docs-site reads the stages in pipeline order", r.output);
    // The SRS view (SPEC-0002/D-4) is summarised after the stages, so the order above still holds.
    t.ok(r.output.indexOf("srs\t") > order[order.length - 1], "docs-site summarises the SRS view after the stage lines", r.output);
};

// The SRS view (SPEC-0002): one page rendering the PRD, TRD and EARS documents under the IEEE 29148
// outline, in that outline's order rather than the chain's. It lives inside the optional portal and
// is an ES module, loaded here with require(esm), so the cases skip when the portal is gone or the
// runtime cannot load the module.
function portalModule(name) {
    const file = path.join(lib.checkout, "tools", "docs-site", name);
    if (!fs.existsSync(file)) return null;
    try { return require(file); } catch { return null; }
}

const SRS_SECTIONS = ["## 1 Introduction", "## 2 References", "## 3 Requirements", "## 4 Verification", "## 5 Appendices"];
const inOrder = at => at.every((i, n) => i >= 0 && (n === 0 || i > at[n - 1]));

exports.srsViewRendersTheOutline = function srsViewRendersTheOutline(t) {
    const portal = portalModule("chain.mjs"), srs = portalModule("srs.mjs");
    if (!portal || !srs) { t.skip("srs view: the optional portal is not installed, or the runtime cannot load an ES module"); return; }
    const chain = portal.collect(chainView({
        "docs/brd/9402-billing.md": ["# BRD-9402: Billing", "", "**Derived from:** jira:AB-42", "", "- BR-1: Bill monthly."],
        "docs/prd/9402-billing.md": ["# PRD-9402: Billing product", "", "**Derived from:** BRD-9402", "", "## Users", "", "- FR-1: A monthly invoice, refining BRD-9402/BR-1."],
        "docs/trd/9402-billing.md": ["# TRD-9402: Billing limits", "", "**Derived from:** PRD-9402", "", "## Requirements", "", "- TR-1: p95 under 200 ms."],
        "docs/ears/9402-billing.md": ["# EARS-9402: Billing", "", "**Derived from:** PRD-9402, TRD-9402", "", "- REQ-1: When the month ends, the system shall invoice PRD-9402/FR-1."],
        "docs/bdd/9402-billing.md": ["# BDD-9402: Billing", "", "**Derived from:** EARS-9402"],
    }));
    t.ok(!chain.notes.length, "the SRS fixture is a chain docs-check accepts", chain.notes.join("\n"));
    const page = srs.srs(chain);

    // D-1: the five sections, in the outline's order.
    const at = SRS_SECTIONS.map(h => page.indexOf(`\n${h}\n`));
    t.ok(inOrder(at), "the SRS page has the outline's five sections in order", page);

    // D-1 and D-2: the documents sit where the outline puts them, PRD then EARS then TRD, each under
    // an H3 that links to its own page.
    const titles = ["### [PRD-9402: Billing product](/prd/9402-billing/)", "### [EARS-9402: Billing](/ears/9402-billing/)", "### [TRD-9402: Billing limits](/trd/9402-billing/)"]
        .map(h => page.indexOf(h));
    t.ok(inOrder(titles), "the SRS renders the PRD, then the EARS, then the TRD, each titled with a link to its page", page);
    t.ok(titles[0] > at[0] && titles[0] < at[1], "the PRD sits under Introduction", page);
    t.ok(titles[1] > at[2] && titles[2] < at[3], "the EARS and the TRD sit under Requirements", page);

    // D-2: rendered as on the document's page, minus the anchors and with the headings pushed down.
    t.ok(page.includes("[PRD-9402/FR-1](/prd/9402-billing/#FR-1)"), "a citation on the SRS links where it links on the document's page", page);
    t.ok(!page.includes("<span id="), "the SRS carries no item anchors", page);
    t.ok(page.includes("\n#### Users\n") && !page.includes("\n## Users\n"), "a document's headings are pushed down two levels under the outline", page);

    // D-1: References lists what was rendered, Verification lists the BDD documents by link.
    const refs = page.slice(at[1], at[2]), verification = page.slice(at[3], at[4]);
    t.ok(["[PRD-9402: Billing product](/prd/9402-billing/)", "[EARS-9402: Billing](/ears/9402-billing/)", "[TRD-9402: Billing limits](/trd/9402-billing/)"].every(l => refs.includes(l)),
        "References lists every document the SRS renders", refs);
    t.ok(verification.includes("[BDD-9402: Billing](/bdd/9402-billing/)"), "Verification lists the BDD documents by link", verification);
};

exports.srsViewOfAnEmptyRepo = function srsViewOfAnEmptyRepo(t) {
    const portal = portalModule("chain.mjs"), srs = portalModule("srs.mjs");
    if (!portal || !srs) { t.skip("srs view: the optional portal is not installed, or the runtime cannot load an ES module"); return; }
    const page = srs.srs(portal.collect(chainView()));
    t.ok(inOrder(SRS_SECTIONS.map(h => page.indexOf(`\n${h}\n`))), "an empty repo still renders the five sections", page);
    // D-3: an empty section says so in the overview's voice and names the skill that writes the stage.
    for (const skill of ["prd", "feature-forge", "trd"]) {
        t.ok(new RegExp("none yet[^\\n]*`" + skill + "`").test(page), `an empty section names the ${skill} skill`, page);
    }
};

// markdownFor() gained options for the SRS view, and its two existing callers pass none: pin what
// no options renders, so the document pages stay as they were.
exports.markdownForWithoutOptionsIsUnchanged = function markdownForWithoutOptionsIsUnchanged(t) {
    const portal = portalModule("chain.mjs");
    if (!portal) { t.skip("markdownFor: the optional portal is not installed, or the runtime cannot load an ES module"); return; }
    const chain = portal.collect(chainView({
        "docs/brd/9403-billing.md": ["# BRD-9403: Billing", "", "**Derived from:** jira:AB-42", "", "## Needs", "", "- BR-1: Bill monthly."],
        "docs/prd/9403-billing.md": ["# PRD-9403: Billing product", "", "**Derived from:** BRD-9403", "", "- FR-1: Refines BRD-9403/BR-1."],
    }));
    const page = portal.markdownFor(chain.byId.get("PRD-9403"), chain);
    t.ok(page === '**Derived from:** [BRD-9403](/brd/9403-billing/)\n\n- <span id="FR-1"></span>FR-1: Refines [BRD-9403/BR-1](/brd/9403-billing/#BR-1).',
        "markdownFor without options drops the H1, links the citations and anchors the items as before", page);
    const demoted = portal.markdownFor(chain.byId.get("BRD-9403"), chain, { anchors: false, demote: 2 });
    t.ok(demoted.includes("\n#### Needs\n") && !demoted.includes("<span id="), "markdownFor with options pushes headings down and writes no anchors", demoted);
};
