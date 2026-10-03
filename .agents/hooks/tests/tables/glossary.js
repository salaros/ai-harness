// .agents/hooks/tests/tables/glossary.js
// scripts/check-glossary.js's decisions: the two formats a GLOSSARY.md entry is written in and the
// one model both give, the shape a glossary is held to, which files are glossaries, and what a repo's
// glossary is while its terms are still moving out of CONTEXT.md.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const lib = require("../../lib");
const glossary = require("../../../../scripts/check-glossary");
const repoView = require("../../../../scripts/repo-view");
const { withRoot, text } = require("../fixtures");

// The same three terms, once as glossarify-md writes them and once as domain-modeling and teach do.
const HEADINGS = text("# Billing glossary", "", "The words billing uses.", "",
    "## Invoice", "<!-- aliases: Invoices, Bill of sale -->", "", "A request for payment sent to a customer after delivery.", "",
    "## Customer", "", "A person or organization that places orders.", "_Avoid_: Client, buyer", "",
    "## Money", "", "### Credit note", "", "A document that cancels all or part of an invoice.");
const BOLD = text("# Billing glossary", "", "The words billing uses.", "", "## Terms", "",
    "**Invoice**:", "A request for payment sent to a customer after delivery.", "<!-- aliases: Invoices, Bill of sale -->", "",
    "**Customer**:", "A person or organization that places orders.", "_Avoid_: Client, buyer", "",
    "### Money", "",
    "**Credit note**: A document that cancels all or part of an invoice.");

const shape = model => JSON.stringify(model.terms.map(t => [t.term, t.aliases, t.avoid, t.definition, t.slug]));

// One model, whichever format the file is in: the terms in file order, each with its aliases, the
// words it avoids and its definition, and a heading that only groups terms left out.
exports.glossaryFormatsGiveOneModel = function glossaryFormatsGiveOneModel(t) {
    const want = JSON.stringify([
        ["Invoice", ["Invoices", "Bill of sale"], [], "A request for payment sent to a customer after delivery.", "invoice"],
        ["Customer", [], ["Client", "buyer"], "A person or organization that places orders.", "customer"],
        ["Credit note", [], [], "A document that cancels all or part of an invoice.", "credit-note"],
    ]);
    const headings = glossary.parse(HEADINGS), bold = glossary.parse(BOLD);
    t.ok(shape(headings) === want, "check-glossary: the heading format gives the terms, aliases, avoided words and definitions", shape(headings));
    t.ok(shape(bold) === want, "check-glossary: the bold format gives the same model", shape(bold));
    t.ok(headings.format === "headings" && bold.format === "bold", "check-glossary: the model says which format the file is in", `${headings.format}, ${bold.format}`);
    t.ok(headings.title === "Billing glossary" && headings.description === "The words billing uses." && bold.description === "The words billing uses.",
        "check-glossary: the title and the prose under it are the glossary's own", `${headings.title} | ${headings.description} | ${bold.description}`);
    t.ok(headings.terms[0].line === 5 && bold.terms[0].line === 7, "check-glossary: a term carries the line it starts on", `${headings.terms[0].line}, ${bold.terms[0].line}`);

    const rows = [
        // text, the names of the first term, why
        [text("# G", "", "**RPE (Rate of Perceived Exertion)**:", "A 1-10 self-rating."), ["RPE (Rate of Perceived Exertion)", "RPE", "Rate of Perceived Exertion"],
            "a term written short and long answers to either half"],
        [text("# G", "", "## Cat", "<!--", "aliases: Cats, \"House cat\"", "uri: https://example.com/cat", "-->", "A small felid."), ["Cat", "Cats", "House cat"],
            "an aliases line among other attributes of a multi-line comment is read"],
        [text("# G", "", "## Cat", "<!-- Aliases: Cats -->", "<!-- a note to self -->", "A small felid."), ["Cat", "Cats"],
            "a comment naming no aliases is a note, and stays out of the definition"],
        [text("# G", "", "## Cat ##", "", "```md", "## Not a term", "**Nor this**:", "```", "A small felid."), ["Cat"],
            "fenced code starts no entry in either format"],
    ];
    for (const [source, names, why] of rows) {
        const model = glossary.parse(source);
        t.ok(model.terms.length === 1 && JSON.stringify(model.terms[0].names) === JSON.stringify(names), `check-glossary: ${why}`, JSON.stringify(model.terms.map(x => x.names)));
    }
    const twice = glossary.parse(text("# G", "", "## Set", "A working set.", "", "## set!", "Another."));
    t.ok(twice.terms.map(x => x.slug).join(",") === "set,set-2", "check-glossary: two terms never share a slug", twice.terms.map(x => x.slug).join(","));
};

// A glossary's verdict: blocked with a problem containing `blocks`, or accepted with a summary
// containing `summary`.
exports.glossaryDecisions = function glossaryDecisions(t) {
    const rows = [
        // glossary, blocks, summary, why
        [HEADINGS, null, "3 term(s), all well formed", "a heading-format glossary with aliases, avoided words and a group passes"],
        [BOLD, null, "3 term(s), all well formed", "a bold-format glossary passes, with a definition on the term's own line"],
        ["", null, "nothing to check", "an empty glossary is not a problem"],
        [text("# Glossary", "", "The project's terms. None settled yet."), null, "0 term(s)", "a title and no terms passes, which is what the skeleton is"],
        [text("## Invoice", "", "A request for payment."), 'must open with a "# <title>" heading', null, "a file of bare entries is rejected"],
        [text("# G", "", "## Invoice", "", "## Customer", "", "A person who orders."), '"Invoice" has no definition', null, "a heading with nothing under it and no terms below it is a term nobody defined"],
        [text("# G", "", "**Invoice**:", "", "**Customer**:", "A person who orders."), '"Invoice" has no definition', null, "a bold term with nothing under it is rejected too"],
        [text("# G", "", "## Invoice", "A request for payment.", "", "## invoice", "A bill."), '"invoice" is already defined on line 3', null, "a term defined twice is rejected, whatever its case"],
        [text("# G", "", "## Invoice", "<!-- aliases: Bill -->", "A request for payment.", "", "## Bill", "A proposed law."), '"Bill" is already defined on line 3', null,
            "a term that is another entry's alias is rejected"],
        [text("# G", "", "**Account (Customer)**:", "Who pays.", "", "**Account (Ledger)**:", "Where it is booked."), null, "2 term(s)",
            "two terms sharing a short half are two terms, since only the names written are compared"],
        [text("# G", "", "## Invoice", "<!-- aliases: -->", "A request for payment."), "an aliases comment that names nothing", null, "an aliases comment with no names is rejected"],
        [text("# G", "", "**Invoice**:", "A request for payment.", "_Avoid_:"), "an _Avoid_ line that names nothing", null, "an _Avoid_ line with no words is rejected"],
        [text("# G", "", "**Invoice**:", "A request for payment.", "<!-- aliases: Bill -->", "_Avoid_: bill"), 'both a name of "Invoice" and a word it avoids', null,
            "a word cannot be an alias and avoided at once"],
        [text("# G", "", "**Customer**:", "Who orders.", "_Avoid_: User", "", "**User**:", "A login."), null, "2 term(s)",
            "a word one entry avoids may be another entry's term: it says do not call a customer a user"],
    ];
    for (const [source, blocks, summary, why] of rows) {
        const r = glossary.check(source, lib.checkout);
        const verdict = blocks ? r.problems.some(p => p.includes(blocks)) : !r.problems.length && r.summary.includes(summary);
        t.ok(verdict, `check-glossary: ${why}`, r.problems.join("\n") || r.summary);
    }
    const named = glossary.check(text("# G", "", "## Invoice"), lib.checkout, "src/Billing/GLOSSARY.md");
    t.ok(glossary.check("", lib.checkout, "src/Billing/GLOSSARY.md").summary.startsWith("src/Billing/GLOSSARY.md:") && named.problems.length === 1,
        "check-glossary: the summary names the file it was given", named.summary);
};

// Which files are glossaries. The edit hook and the pre-commit hook both ask isGlossary, so one table
// pins what an edit and a commit check.
exports.glossaryMembership = function glossaryMembership(t) {
    const rows = [
        ["GLOSSARY.md", true, "the root's"],
        ["src/Ordering/GLOSSARY.md", true, "a service's, beside its CONTEXT.md"],
        [".scratch/learn/sql/GLOSSARY.md", true, "a teaching workspace's"],
        ["CONTEXT.md", false, "CONTEXT.md, which is read for the terms it still holds but held to nothing"],
        ["docs/glossary.md", false, "a file of another name"],
        [".agents/skills/teach/GLOSSARY.md", false, "a file a skill ships"],
        ["tools/docs-site/node_modules/pkg/GLOSSARY.md", false, "a file a dependency ships"],
        ["MY-GLOSSARY.md", false, "a name that only ends the same way"],
    ];
    for (const [file, want, why] of rows) {
        t.ok(glossary.isGlossary(file) === want, `isGlossary: ${why}`, `${file} -> ${!want}`);
    }
};

// A repo's glossary: GLOSSARY.md, and the terms CONTEXT.md still holds under "## Language" from
// before the split, so nothing goes missing while they move.
exports.glossaryOfARepo = function glossaryOfARepo(t) {
    const context = text("# Billing", "", "What billing is.", "", "## Language", "",
        "**Invoice**:", "The old definition.", "", "**Refund**:", "Money sent back.", "", "## Relationships", "", "**Ordering**: not a term");
    const names = g => g && g.terms.map(x => `${x.term}@${x.file}`).join(",");
    const rows = [
        // files, the terms and where each came from, still in CONTEXT.md, why
        [{}, null, 0, "a repo with neither file has no glossary"],
        [{ "GLOSSARY.md": HEADINGS }, "Invoice@GLOSSARY.md,Customer@GLOSSARY.md,Credit note@GLOSSARY.md", 0, "GLOSSARY.md alone is the glossary"],
        [{ "CONTEXT.md": context }, "Invoice@CONTEXT.md,Refund@CONTEXT.md", 2, "a repo that has not split yet keeps its terms under CONTEXT.md's Language heading"],
        [{ "GLOSSARY.md": HEADINGS, "CONTEXT.md": context }, "Invoice@GLOSSARY.md,Customer@GLOSSARY.md,Credit note@GLOSSARY.md,Refund@CONTEXT.md", 1,
            "with both, GLOSSARY.md's definition wins and CONTEXT.md adds the terms not moved yet"],
        [{ "GLOSSARY.md": HEADINGS, "CONTEXT.md": text("# Billing", "", "## Language", "", "**Bill of sale**:", "The old name.") },
            "Invoice@GLOSSARY.md,Customer@GLOSSARY.md,Credit note@GLOSSARY.md", 0, "a CONTEXT.md term GLOSSARY.md already answers to by an alias has moved"],
        [{ "GLOSSARY.md": "# Glossary\n", "CONTEXT.md": "# Billing\n\nWhat billing is.\n" }, "", 0, "a skeleton beside a CONTEXT.md with no terms is an empty glossary"],
    ];
    for (const [files, want, legacy, why] of rows) {
        const g = glossary.read(repoView.fromMap(files));
        t.ok(want === null ? g === null : names(g) === want && g.legacy === legacy, `check-glossary: ${why}`, g ? `${names(g)} (${g.legacy} in CONTEXT.md)` : "null");
    }
    const service = glossary.read(repoView.fromMap({ "src/Billing/GLOSSARY.md": HEADINGS }), "src/Billing");
    t.ok(service && service.file === "src/Billing/GLOSSARY.md" && service.terms.length === 3, "check-glossary: a context's folder is read the same way", service && service.file);
};

// The command's inputs: the root's GLOSSARY.md by default, stdin only with "-", and a given path that
// is not there is an error.
exports.glossaryCommandInput = function glossaryCommandInput(t) {
    const script = path.join(lib.checkout, "scripts", "check-glossary.js");
    withRoot({ "GLOSSARY.md": text("## Invoice", "", "A request for payment."), "src/Billing/GLOSSARY.md": BOLD }, root => {
        const flag = `${lib.ROOT_FLAG}${root}`;
        const plain = lib.node([script, flag], { cwd: root });
        t.ok(plain.status === 1 && plain.output.includes('must open with a "# <title>" heading'),
            "check-glossary: with no argument it checks the root's GLOSSARY.md, not stdin", plain.output);
        const given = lib.node([script, "src/Billing/GLOSSARY.md", flag], { cwd: root });
        t.ok(given.status === 0 && given.output.includes("src/Billing/GLOSSARY.md: 3 term(s)"), "check-glossary: a path given is the glossary checked", given.output);
        const piped = lib.node([script, "-", flag], { cwd: root, input: HEADINGS });
        t.ok(piped.status === 0 && piped.output.includes("3 term(s)"), 'check-glossary: "-" reads stdin', piped.output);
        const typo = lib.node([script, "GLOSARY.md", flag], { cwd: root });
        t.ok(typo.status === 2 && typo.output.includes("no such file"), "check-glossary: a path given that is not there fails", typo.output);
    });
    withRoot({}, root => {
        const none = lib.node([script, `${lib.ROOT_FLAG}${root}`], { cwd: root });
        t.ok(none.status === 0 && none.output.includes("nothing to check"), "check-glossary: a repo with no GLOSSARY.md has nothing to check", none.output);
    });
};

// The pre-commit hook judges a glossary by the blob the commit records, wherever in the repo it is:
// a real repo whose index and working tree disagree, each way round.
exports.stagedGlossaryDecisions = function stagedGlossaryDecisions(t) {
    const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    const hook = path.join(lib.checkout, "scripts", "githook.js");
    const bad = text("# Billing glossary", "", "## Invoice");
    withRoot({ ".skip-project-init": "", "src/Billing/GLOSSARY.md": bad }, dir => {
        if (git(dir, "init", "-q").status !== 0) { t.skip("staged glossary: git is not available"); return; }
        const file = path.join(dir, "src", "Billing", "GLOSSARY.md");
        const commit = () => lib.node([hook, "pre-commit", `${lib.ROOT_FLAG}${dir}`], { cwd: dir });

        // Broken in the index, fixed on disk: the commit would record the break.
        git(dir, "add", "src");
        fs.writeFileSync(file, HEADINGS);
        const blocked = commit();
        t.ok(blocked.status === 1 && blocked.output.includes('"Invoice" has no definition'),
            "staged glossary: a break staged and fixed on disk blocks the commit", blocked.output);

        // Fixed in the index, broken on disk: the commit records the good blob.
        git(dir, "add", "src");
        fs.writeFileSync(file, bad);
        const passed = commit();
        t.ok(passed.status === 0 && passed.output.includes("src/Billing/GLOSSARY.md: 3 term(s), all well formed"),
            "staged glossary: a break saved but not staged does not block, and the summary names the file", passed.output);

        // A glossary the commit deletes has nothing to say.
        git(dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--no-verify", "-m", "glossary");
        git(dir, "rm", "-q", "--cached", "src/Billing/GLOSSARY.md");
        const removed = commit();
        t.ok(removed.status === 0 && !removed.output.includes("GLOSSARY.md"), "staged glossary: a glossary the commit deletes is not checked", removed.output);
    });
};
