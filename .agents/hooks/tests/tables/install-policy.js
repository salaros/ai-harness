// .agents/hooks/tests/tables/install-policy.js
// scripts/install-policy.js's decisions, one table per policy: how the manifest is read, and what an
// install does with one path, from the facts about it and fakes for everything it would read.
const { installPolicy } = require("../fixtures");

const SKIP = "scripts/install-policy.js is the upstream's own, not installed here";
const never = () => { throw new Error("should not have been consulted"); };

// scripts/harness-files.tsv decides what an install does to each path, and policyFor reads it.
// First match wins, a row ending in / covers everything under it, and an `optional:<flag>` row is
// seeded only when the run asked for that flag. The real table is checked elsewhere; what is pinned
// here is how a table is read, against one written for the purpose.
function manifestPoliciesAreReadInOrder(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`policyFor: ${SKIP}`); return; }
    const rows = [
        { path: "scripts/harness-files.tsv", policy: "skip" },
        { path: "scripts/", policy: "merge" },
        { path: "tools/docs-site/", policy: "optional:astro-docs" },
        { path: "src/", policy: "seed" },
    ];
    const all = () => true;
    const none = () => false;
    const cases = [
        ["scripts/harness-files.tsv", all, "skip", false, "the earlier row wins over the prefix below it"],
        ["scripts/lib.js", all, "merge", false, "a row ending in / covers everything under it"],
        ["src/app.ts", all, "seed", false, "an exact prefix match takes its own policy"],
        ["README.md", all, "merge", false, "a path nobody classified is harness"],
        ["tools/docs-site/astro.config.mjs", all, "seed", true, "an optional part the run asked for is seeded, and says it was asked for"],
        ["tools/docs-site/astro.config.mjs", none, "template", false, "an optional part nobody asked for is not installed"],
    ];
    for (const [file, wants, want, asked, why] of cases) {
        const got = policy.policyFor(rows, file, wants);
        t.ok(got.policy === want && got.asked === asked, `policyFor: ${why}`,
            `${file} -> ${JSON.stringify(got)}, expected ${want}, asked ${asked}`);
    }
    let threw = false;
    try { policy.decide("nonsense", {}); } catch { threw = true; }
    t.ok(threw, "decide: a policy nobody defined is an error, not a silent skip", "");
}

// merge and reconcile, on a text file the target already has. Every branch used to need a git
// checkout, an upstream history and a temp tree to reach even once; the reads are fakes here.
// `held` is what is on disk, `theirs` the upstream's, always LF.
function mergeDecisionCoversEveryOutcome(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`merge decision: ${SKIP}`); return; }
    const OURS = "one\ntwo edited\n";
    const THEIRS = "one\ntwo upstream\n";
    const clean = text => () => ({ text, conflicts: false, failed: false });
    const conflicted = text => () => ({ text, conflicts: true, failed: false });
    const broke = () => ({ text: "", conflicts: false, failed: true });

    const decide = (name, facts, reads) => policy.decide(name,
        { exists: true, theirs: THEIRS, hasBase: true, adopt: false, asked: false, ...facts },
        { held: () => OURS, base: () => null, recoverBase: () => null, merge: never, ...reads });

    const cases = [
        // policy, facts, reads, expected outcome, bucket and write, why
        ["merge", { exists: false }, { held: never }, "written", "written", THEIRS, "a file the target lacks is written"],
        ["merge", {}, { held: () => THEIRS }, "unchanged", null, undefined, "a copy already matching the upstream is left alone"],
        ["merge", { adopt: true }, {}, "adopted", "written", THEIRS, "--adopt takes the upstream's version whatever the base says"],
        ["merge", {}, { held: () => "<<<<<<< yours\nmine\n" }, "STILL OPEN", "conflicted", undefined, "markers an earlier run left are named, not merged over"],
        ["merge", { hasBase: false }, { base: never }, "yours, no base", "kept", undefined, "an install with no base keeps what is there"],
        ["merge", {}, {}, "yours, new here", "kept", undefined, "a file the base did not have is the project's own"],
        ["merge", {}, { base: () => OURS }, "written", "written", THEIRS, "a file nobody edited takes the upstream's version"],
        ["merge", {}, { base: () => "one\n", merge: clean("one\ntwo edited\nthree\n") },
            "merged", "merged", "one\ntwo edited\nthree\n", "an edited file keeps its edits and gains the changes around them"],
        ["merge", {}, { base: () => "one\n", merge: clean(OURS) }, "unchanged", null, undefined,
            "a merge that comes out as what is already there is not churn to report"],
        ["merge", {}, { base: () => "one\n", merge: conflicted("<<<<<<< yours\n") }, "CONFLICT", "conflicted", "<<<<<<< yours\n",
            "a real collision is written with markers and named"],
        ["merge", {}, { base: () => "one\n", merge: broke }, "yours, merge failed", "kept", undefined,
            "a merge git could not run leaves the file alone"],
        // reconcile is the policy for a file the harness cannot work around, so it merges even with
        // no receipt: the nearest upstream version stands in. With nothing to recover, see
        // noBaseDecisionsBringInWhatTheHarnessNeeds.
        ["reconcile", { hasBase: false }, { recoverBase: () => "one\n", merge: clean("merged\n") },
            "merged", "merged", "merged\n", "reconcile recovers a base when the receipt has none"],
        ["merge", { hasBase: false }, { recoverBase: never }, "yours, no base", "kept", undefined, "only reconcile goes looking for a base"],
    ];
    for (const [name, facts, reads, outcome, bucket, write, why] of cases) {
        const got = decide(name, facts, reads);
        t.ok(got.outcome === outcome && got.bucket === bucket && got.write === write, `${name} decision: ${why}`,
            `got ${JSON.stringify(got)}, expected ${outcome}, ${bucket}, ${JSON.stringify(write)}`);
    }

    // Git checks a repo out with the platform's line endings, so a Windows copy holds CRLF where the
    // upstream stores LF. The comparison happens in LF and the result goes back in what the file had.
    const crlf = [
        [{ held: () => "one\r\ntwo edited\r\n", base: () => OURS }, "written", "one\r\ntwo upstream\r\n", "a CRLF copy nobody edited is written back in CRLF"],
        [{ held: () => "one\r\ntwo upstream\r\n", base: never }, "unchanged", undefined, "a CRLF copy matching the upstream does not read as edited"],
        [{ held: () => "one\r\ntwo edited\r\n", base: () => "one\n", merge: clean("one\ntwo edited\nthree\n") },
            "merged", "one\r\ntwo edited\r\nthree\r\n", "a CRLF copy is merged in LF and written back in CRLF"],
        [{ held: () => "one\r\ntwo edited\r\n", base: () => "one\n", merge: clean(OURS) },
            "unchanged", undefined, "a CRLF merge that comes out as what is there is unchanged"],
    ];
    for (const [reads, outcome, write, why] of crlf) {
        const got = decide("merge", {}, reads);
        t.ok(got.outcome === outcome && got.write === write, `merge decision: ${why}`, JSON.stringify(got));
    }
}

// A file with no lines to merge is the upstream's copy or the project's, and the base decides.
function binaryDecisionFollowsTheBase(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`binary decision: ${SKIP}`); return; }
    const bin = (held, theirs, was, adopt = false) => policy.decide("merge",
        { exists: true, theirs: Buffer.from(theirs), hasBase: was !== null, adopt, asked: false },
        { held: () => Buffer.from(held), base: () => (was === null ? null : Buffer.from(was)), recoverBase: never, merge: never });
    const cases = [
        [bin("a", "a", "a"), "unchanged", null, false, "a copy already matching the upstream is left alone"],
        [bin("a", "b", "a"), "written", "written", true, "a copy nobody replaced takes the upstream's"],
        [bin("mine", "b", "a"), "yours, binary", "kept", false, "a copy the project replaced stays replaced"],
        [bin("mine", "b", null), "yours, no base", "kept", false, "with no base a differing copy is the project's"],
        [bin("mine", "b", "a", true), "adopted", "written", true, "--adopt takes the upstream's binary too"],
    ];
    for (const [got, outcome, bucket, writes, why] of cases)
        t.ok(got.outcome === outcome && got.bucket === bucket && Buffer.isBuffer(got.write) === writes,
            `binary decision: ${why}`, `got ${got.outcome} ${got.bucket}, expected ${outcome} ${bucket}`);
}

// A union table merged as a set of rows, never in conflict, with or without a base.
function unionDecisionMergesByRow(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`union decision: ${SKIP}`); return; }
    const T = (...rows) => ["# t", ...rows, ""].join("\n");
    const cases = [
        [T("a\t1", "b\t1"), T("a\t1", "b\t1"), T("a\t2"), T("a\t2", "b\t1"), "a row the upstream dropped stays"],
        [T("a\t1"), T("a\tmine"), T("a\t2"), T("a\tmine"), "a row both changed is the project's"],
        [T("a\t1"), T("a\tmine"), T("a\t1"), T("a\tmine"), "a row only the project changed is the project's"],
        [T("a\t1", "b\t1"), T("a\t1"), T("a\t1", "b\t2"), T("a\t1"), "a row the project deleted stays deleted"],
        [T("a\t1"), T("a\t1", "m\t1"), T("n\t1", "a\t1"), T("n\t1", "a\t1", "m\t1"), "the upstream's order and new rows, then the project's own"],
        [null, T("a\tmine"), T("a\t2", "c\t1"), T("a\tmine", "c\t1"), "with no base the project's copy of a row wins"],
    ];
    for (const [base, ours, theirs, want, why] of cases) {
        const got = policy.decide("union", { exists: true, theirs, hasBase: base !== null, adopt: false, asked: false },
            { held: () => ours, base: () => base, recoverBase: never, merge: never });
        const result = got.write === undefined ? ours : got.write;
        t.ok(result === want && (got.write === undefined) === (got.outcome === "unchanged"), `union decision: ${why}`, JSON.stringify(got));
    }
    // Even an untouched copy goes through the row merge: it may hold a row the upstream dropped.
    const kept = policy.decide("union", { exists: true, theirs: T("a\t2"), hasBase: true, adopt: false, asked: false },
        { held: () => T("a\t2", "b\t1"), base: () => T("a\t1", "b\t1"), recoverBase: never, merge: never });
    t.ok(kept.outcome === "unchanged" && kept.bucket === null && kept.write === undefined,
        "union decision: a table already holding the kept row is unchanged", JSON.stringify(kept));
    const crlf = policy.decide("union", { exists: true, theirs: T("a\t2"), hasBase: true, adopt: false, asked: false },
        { held: () => T("a\t1", "b\t1").replace(/\n/g, "\r\n"), base: () => T("a\t1", "b\t1"), recoverBase: never, merge: never });
    t.ok(crlf.outcome === "merged" && crlf.write === T("a\t2", "b\t1").replace(/\n/g, "\r\n"),
        "union decision: a CRLF table is merged in LF and written back in CRLF", JSON.stringify(crlf));
}

// A first install into a project that already had its own agent files, ignore list or MCP servers:
// no receipt, so nothing to merge against. The project's file is never lost, and the part of the
// upstream's the harness cannot work without comes in beside it.
function noBaseDecisionsBringInWhatTheHarnessNeeds(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`no-base decisions: ${SKIP}`); return; }
    const decide = (name, held, theirs, facts = {}) => policy.decide(name,
        { exists: true, theirs, hasBase: false, adopt: false, asked: false, ...facts },
        { held: () => held, base: never, recoverBase: () => null, merge: never });
    const has = (text, ...parts) => typeof text === "string" && parts.every(p => text.includes(p));

    const agents = decide("reconcile", "# Our agents\n\nUse pnpm.\n\n## Deploy\n\n```sh\n# not a heading\n```\n", "# AI harness\n\nThe map.\n");
    t.ok(agents.outcome === "yours appended" && agents.bucket === "merged" && !!agents.notice,
        "reconcile decision: a hand-written copy with no recoverable base gets the harness's text and keeps its own, with a notice", JSON.stringify(agents));
    t.ok(has(agents.write, "# AI harness\n\nThe map.\n\n", "## This project\n\n### Our agents\n\nUse pnpm.\n\n#### Deploy\n", "# not a heading\n")
        && !/^<{7}/m.test(agents.write), "reconcile decision: the project's headings move under its own, code fences untouched, no markers", agents.write);
    const crlf = decide("reconcile", "# Ours\r\n", "# AI harness\n");
    t.ok(has(crlf.write, "# AI harness\r\n", "### Ours\r\n"), "reconcile decision: the appended file keeps the copy's CRLF", JSON.stringify(crlf.write));

    const ignore = decide("ignore", "node_modules/\n.astro/\n!.env\n", "# harness\nnode_modules/\n.env\n.scratch/\n\n.scratch/\n");
    t.ok(ignore.outcome === "patterns appended" && has(ignore.write, "node_modules/\n.astro/\n!.env\n\n# Added by the ai-harness install")
        && ignore.write.endsWith("\n.scratch/\n") && !ignore.write.includes("\n.env\n") && ignore.write.split(".scratch/").length === 2,
        "ignore decision: the upstream's missing patterns are appended once, the project's lines and negations untouched", JSON.stringify(ignore));
    const covered = decide("ignore", "a\nb\n", "# up\na\n");
    t.ok(covered.outcome === "yours, no base" && covered.write === undefined, "ignore decision: nothing missing leaves the file alone", JSON.stringify(covered));

    const mcpOurs = JSON.stringify({ mcpServers: { figma: { command: "figma-local" }, ours: { url: "x" } } });
    const mcpTheirs = JSON.stringify({ mcpServers: { figma: { type: "http", url: "https://f" }, atlassian: { type: "http", url: "https://a" } } });
    const mcp = decide("keyed", mcpOurs, mcpTheirs);
    const servers = mcp.write ? JSON.parse(mcp.write).mcpServers : {};
    t.ok(mcp.outcome === "merged by key" && Object.keys(servers).join() === "figma,ours,atlassian" && JSON.stringify(servers.figma) === '{"command":"figma-local"}',
        "keyed decision: the upstream's servers are added and the project's own entry wins whole", JSON.stringify(mcp));
    t.ok(decide("keyed", "{ not json", mcpTheirs).outcome === "yours, no base", "keyed decision: a file that is not JSON is left alone", "");
    const based = policy.decide("keyed", { exists: true, theirs: mcpTheirs, hasBase: true, adopt: false, asked: false },
        { held: () => mcpOurs, base: () => mcpOurs, recoverBase: never, merge: never });
    t.ok(based.outcome === "written" && based.write === mcpTheirs, "keyed decision: with a base it is a plain merge", JSON.stringify(based));
}

// CLAUDE.md, the file Claude Code reads before anything else: whatever a run does with the rest of
// it, it comes out importing AGENTS.md. A project that wrote its own before it had the harness has no
// base; one that dropped the line since has a receipt and a clean merge, and both end up with it.
function importDecisionAlwaysLeavesTheAgentsLine(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`import decision: ${SKIP}`); return; }
    const theirs = "@AGENTS.md\n";
    const decide = (held, facts = {}, reads = {}) => policy.decide("import",
        { exists: true, theirs, hasBase: false, adopt: false, asked: false, ...facts },
        { held: () => held, base: never, recoverBase: () => null, merge: never, ...reads });

    const own = decide("# Project rules\n\nBe brief.\n");
    t.ok(own.outcome === "import added" && own.write === "@AGENTS.md\n\n# Project rules\n\nBe brief.\n",
        "import decision: a CLAUDE.md that does not import AGENTS.md gains the line on top", JSON.stringify(own));
    const already = decide("Read this.\n@AGENTS.md\n");
    t.ok(already.outcome === "yours, no base" && already.write === undefined,
        "import decision: one that already imports it is left alone", JSON.stringify(already));
    const crlf = decide("# Ours\r\n");
    t.ok(crlf.write === "@AGENTS.md\r\n\r\n# Ours\r\n", "import decision: the line is written in the endings the file has", JSON.stringify(crlf.write));

    // A receipt and a file the project has rewritten since: the merge keeps its text, and the line
    // still goes back on. Dropping it is how a repo ends up with the harness installed and unread.
    const dropped = decide("# Repo notes\n", { hasBase: true },
        { base: () => theirs, merge: () => ({ text: "# Repo notes\n", conflicts: false, failed: false }) });
    t.ok(dropped.outcome === "import added" && dropped.write === "@AGENTS.md\n\n# Repo notes\n",
        "import decision: a file whose line was dropped after an earlier install gets it back", JSON.stringify(dropped));
    const open = decide("<<<<<<< yours\na\n", { hasBase: true }, { base: () => theirs });
    t.ok(open.outcome === "STILL OPEN" && open.write === undefined,
        "import decision: a file left with conflict markers is reported, not added to", JSON.stringify(open));
}

// .claude/settings.json, merged by key on every run: the harness's hook launchers are the upstream's,
// everything else the project's.
function settingsDecisionReplacesOnlyTheHarnessHooks(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`settings decision: ${SKIP}`); return; }
    const hook = command => ({ type: "command", command });
    const OLD = "node .agents/hooks/old-guard.js";
    const NEW = "node -e \"require(x+'/.agents/hooks/guard-command.js')\"";
    const theirs = JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [hook(NEW)] }] } }, null, 2) + "\n";
    const decide = (ours, facts = {}) => policy.decide("settings",
        { exists: true, theirs, hasBase: true, adopt: false, asked: false, ...facts },
        { held: () => ours, base: never, recoverBase: never, merge: never });

    const ours = JSON.stringify({
        permissions: { allow: ["Bash(npm test)"] },
        hooks: {
            PreToolUse: [{ matcher: "Bash", hooks: [hook(`bash -c 'x=1; node /repo/.agents/hooks/old-guard.js'`), hook("./lint.sh")] }],
            Stop: [{ hooks: [hook(OLD.replace("old-guard", "stop"))] }],
        },
    });
    const got = decide(ours);
    const merged = got.write ? JSON.parse(got.write) : {};
    const commands = event => ((merged.hooks || {})[event] || []).flatMap(g => g.hooks.map(h => h.command));
    t.ok(got.outcome === "merged by key" && got.bucket === "merged", "settings decision: a project's settings are merged by key", JSON.stringify(got));
    t.ok(JSON.stringify(commands("PreToolUse")) === JSON.stringify(["./lint.sh", NEW]),
        "settings decision: an old harness launcher is replaced by the upstream's, the project's own hook kept", JSON.stringify(merged.hooks));
    t.ok(!("Stop" in merged.hooks) && JSON.stringify(merged.permissions) === '{"allow":["Bash(npm test)"]}',
        "settings decision: an event left with no hooks goes, and the project's permissions stay", JSON.stringify(merged));
    t.ok(decide(ours, { hasBase: false }).outcome === "merged by key", "settings decision: merged by key without a receipt too", "");

    const settled = decide(got.write);
    t.ok(settled.outcome === "unchanged" && settled.write === undefined, "settings decision: a second run over the merged file changes nothing", JSON.stringify(settled));
    const plain = decide(JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [hook(OLD)] }] } }));
    t.ok(plain.write === theirs, "settings decision: settings that come out equal to the upstream's take its text and layout", JSON.stringify(plain.write));
    const crlf = decide(ours.replace(/,/g, ",\r\n"));
    t.ok(crlf.outcome === "merged by key" && crlf.write.includes("\r\n") && !/[^\r]\n/.test(crlf.write), "settings decision: a CRLF file is written back in CRLF", JSON.stringify(crlf.write));
    t.ok(decide("{ nope").outcome === "yours, not JSON", "settings decision: settings that are not JSON are left for someone to read", "");
    t.ok(decide("<<<<<<< yours\n{}\n").outcome === "STILL OPEN", "settings decision: markers an earlier run left are named first", "");
}

// seed, skeleton, skip and template: the policies that never merge. What the project deleted stays
// deleted, unless the run asked for an optional part by name.
function layDownDecisionsKeepWhatIsThere(t) {
    const policy = installPolicy();
    if (!policy) { t.skip(`lay-down decisions: ${SKIP}`); return; }
    const shipped = yes => ({ shippedBefore: () => yes });
    const cases = [
        // policy, facts, reads, expected outcome, bucket, write, why
        ["seed", { exists: true }, { shippedBefore: never }, "yours", "kept", undefined, "an existing seed file is the project's"],
        ["seed", { exists: false }, shipped(false), "created", "seeded", "new\n", "a seed file new to this run is created"],
        ["seed", { exists: false }, shipped(true), "deleted here", null, undefined, "a seed file shipped before and now missing stays deleted"],
        ["seed", { exists: false, asked: true }, { shippedBefore: never }, "created", "seeded", "new\n", "an optional part asked for is seeded whatever an earlier run left out"],
        ["skeleton", { exists: true }, { shippedBefore: never }, "yours", null, undefined, "an existing skeleton is left alone"],
        ["skeleton", { exists: false }, shipped(false), "created", "seeded", "new\n", "a skeleton the receipt does not know is laid down"],
        ["skeleton", { exists: false }, shipped(true), "deleted here", null, undefined, "a skeleton the receipt knew and the project deleted stays deleted"],
        ["skip", { exists: true }, {}, "yours", "skipped", undefined, "a skipped file the target has is left alone"],
        ["skip", { exists: false }, {}, "absent", null, undefined, "a skipped file the target lacks is named, not written"],
        ["template", { exists: true }, {}, "template", "template", undefined, "the upstream's own files are never installed"],
    ];
    for (const [name, facts, reads, outcome, bucket, write, why] of cases) {
        const got = policy.decide(name, { theirs: "new\n", hasBase: true, adopt: false, asked: false, ...facts }, reads);
        t.ok(got.outcome === outcome && got.bucket === bucket && got.write === write, `${name} decision: ${why}`, JSON.stringify(got));
    }
    t.ok(policy.decide("template", {}).silent === true, "template decision: counted in the summary, never printed as a line", "");
}

module.exports = [
    manifestPoliciesAreReadInOrder,
    mergeDecisionCoversEveryOutcome,
    binaryDecisionFollowsTheBase,
    unionDecisionMergesByRow,
    noBaseDecisionsBringInWhatTheHarnessNeeds,
    importDecisionAlwaysLeavesTheAgentsLine,
    settingsDecisionReplacesOnlyTheHarnessHooks,
    layDownDecisionsKeepWhatIsThere,
];
