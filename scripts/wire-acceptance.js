#!/usr/bin/env node
// scripts/wire-acceptance.js
// Points the Gherkin runner a stack's scaffold installed at tests/features/, the folder
// scripts/bdd-features.js writes the BDD documents out to, and makes a step without a definition
// fail the run rather than pass as pending (ADR-0008). The project-init skill runs it once the
// developer has run the scaffold, and the acceptance workflow runs it on every row of the stacks
// table that names a runner. The wiring lives here and nowhere else: the table's scaffold cell
// cannot carry a file, and a skill transcribing XML into a csproj by hand had drifted from what runs
// before anything ran it.
// Which runner a project has is the table's `runner` column; the row is found by the stack given,
// or by what the scaffold left at the root when only one runner's marker is there. Every file is
// written when absent and left alone when present, so running this twice changes nothing and a
// project that has moved on keeps its own.
// --prove is the step's "done when", made executable: a feature file holding one step nobody
// defined is written into tests/features/, the runner's own command runs, and the run has to fail
// naming the missing step; the file is removed afterwards. A run that passes means the runner never
// read the folder or lets an undefined step through; a run that fails without naming the step is a
// build error, and the output says which.
// wire(root, row, name) and prove(root, row, name) decide; the command line prints and exits.
// Usage:
//   node scripts/wire-acceptance.js --name=<Name> [--stack=<row>]          wire the runner
//   node scripts/wire-acceptance.js --prove --name=<Name> [--stack=<row>]  run it and expect the failure
//   <Name> is the PascalCase project name the scaffold was given, which names the .NET test project.
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const stacks = require("./stacks");

const FEATURES = "tests/features";
const WRITER = "scripts/bdd-features.js";

// One entry per runner the table names. present(root, name) is the marker the scaffold leaves;
// wire(root, name) writes what the runner needs and returns the files written, the files kept and
// the problems; command(row, name) is the runner's own command, run from the root; unbound matches
// the runner's output for a step with no definition.
const RUNNERS = {
    // Reqnroll on xunit: the acceptance project compiles the shared folder in place through a linked
    // item, keeps the generated code-behind out of that folder (ReqnrollUseIntermediateOutputPathForCodeBehind,
    // Reqnroll 3.3), and reqnroll.json turns a missing step into a failure.
    reqnroll: {
        present: (root, name) => exists(root, project(name)),
        wire(root, name) {
            const dir = project(name);
            const csproj = `${dir}/${name}.Acceptance.csproj`;
            if (!exists(root, csproj)) return { written: [], kept: [], problems: [`${csproj}: not found; run the scaffold first, with the same --name`] };
            const r = { written: [], kept: [], problems: [] };
            // The xunit template's placeholder test, which would report one green test beside the scenarios.
            if (exists(root, `${dir}/UnitTest1.cs`)) { fs.unlinkSync(path.resolve(root, dir, "UnitTest1.cs")); r.written.push(`${dir}/UnitTest1.cs (removed)`); }
            const xml = read(root, csproj);
            if (xml.includes("ReqnrollFeatureFile")) r.kept.push(csproj);
            else if (!/<\/Project>\s*$/.test(xml)) r.problems.push(`${csproj}: no closing </Project> to add the feature-file groups before`);
            else { write(root, csproj, xml.replace(/<\/Project>\s*$/, REQNROLL_GROUPS)); r.written.push(csproj); }
            put(root, `${dir}/reqnroll.json`, REQNROLL_JSON, r);
            return r;
        },
        command: (row, name) => `dotnet test ${project(name)}`,
        unbound: /No matching step definition found/,
    },
    // cucumber-js with cucumber-tsflow through tsx: a config at the root naming the folder, strict so
    // an undefined step fails, decorators on for @binding() classes, and the script that runs the
    // extractor first because Node is there anyway.
    "cucumber-js": {
        present: root => exists(root, "package.json"),
        wire(root) {
            if (!exists(root, "package.json")) return { written: [], kept: [], problems: ["package.json: not found; run the scaffold first"] };
            const r = { written: [], kept: [], problems: [] };
            put(root, "cucumber.cjs", CUCUMBER_CONFIG, r);
            const pkg = JSON.parse(read(root, "package.json"));
            pkg.scripts = pkg.scripts || {};
            if (pkg.scripts["test:acceptance"]) r.kept.push("package.json");
            else { pkg.scripts["test:acceptance"] = ACCEPTANCE_SCRIPT; write(root, "package.json", JSON.stringify(pkg, null, 2) + "\n"); r.written.push("package.json"); }
            // tsc --init writes comments, so the file is text here rather than JSON: the option goes
            // in right after compilerOptions opens.
            if (!exists(root, "tsconfig.json")) r.problems.push("tsconfig.json: not found; run the scaffold first");
            else {
                const ts = read(root, "tsconfig.json");
                if (/"experimentalDecorators"\s*:/.test(ts)) r.kept.push("tsconfig.json");
                else if (!/"compilerOptions"\s*:\s*\{/.test(ts)) r.problems.push("tsconfig.json: no compilerOptions to set experimentalDecorators in");
                else { write(root, "tsconfig.json", ts.replace(/("compilerOptions"\s*:\s*\{)/, `$1\n    "experimentalDecorators": true,`)); r.written.push("tsconfig.json"); }
            }
            return r;
        },
        command: row => `${row.stack} run test:acceptance`,
        unbound: /undefined/i,
    },
    // pytest-bdd: the base dir in pyproject.toml, and one test module binding every feature under it.
    "pytest-bdd": {
        present: root => exists(root, "pyproject.toml"),
        wire(root) {
            if (!exists(root, "pyproject.toml")) return { written: [], kept: [], problems: ["pyproject.toml: not found; run the scaffold first"] };
            const r = { written: [], kept: [], problems: [] };
            const toml = read(root, "pyproject.toml");
            if (/^bdd_features_base_dir\s*=/m.test(toml)) r.kept.push("pyproject.toml");
            else {
                const section = /^\[tool\.pytest\.ini_options\]\s*$/m;
                const out = section.test(toml)
                    ? toml.replace(section, `$&\n${PYTEST_OPTION}`)
                    : `${toml.replace(/\s*$/, "")}\n\n[tool.pytest.ini_options]\n${PYTEST_OPTION}\n`;
                write(root, "pyproject.toml", out); r.written.push("pyproject.toml");
            }
            put(root, "tests/acceptance/test_features.py", PYTEST_MODULE, r);
            return r;
        },
        command: () => "uv run pytest",
        unbound: /StepDefinitionNotFoundError/,
    },
};

const project = name => `tests/${name}.Acceptance`;
const REQNROLL_GROUPS = `  <PropertyGroup>
    <ReqnrollUseIntermediateOutputPathForCodeBehind>true</ReqnrollUseIntermediateOutputPathForCodeBehind>
  </PropertyGroup>

  <ItemGroup>
    <ReqnrollFeatureFile Include="..\\features\\**\\*.feature" Link="Features\\%(RecursiveDir)%(Filename)%(Extension)" />
  </ItemGroup>

</Project>
`;
const REQNROLL_JSON = `{
  "$schema": "https://schemas.reqnroll.net/reqnroll-config-latest.json",
  "runtime": { "missingOrPendingStepsOutcome": "Error" }
}
`;
const CUCUMBER_CONFIG = `module.exports = {
  default: {
    paths: ["${FEATURES}/**/*.feature"],
    requireModule: ["tsx/cjs"],
    require: ["tests/acceptance/**/*.ts"],
    strict: true,
  },
};
`;
const ACCEPTANCE_SCRIPT = `node ${WRITER} && cucumber-js`;
const PYTEST_OPTION = `bdd_features_base_dir = "${FEATURES}"`;
const PYTEST_MODULE = `from pytest_bdd import scenarios

scenarios(".")
`;

// The file --prove writes: one scenario, one step, no definition anywhere. Not a document, so no
// `# SC-n` line, and not written by the extractor, so the extractor leaves it alone.
const PROVE_FILE = `${FEATURES}/wiring-check.feature`;
const PROVE_FEATURE = `Feature: Wiring check

Scenario: A step nobody defined
  Given a step nobody defined
`;

const exists = (root, rel) => fs.existsSync(path.resolve(root, rel));
const read = (root, rel) => fs.readFileSync(path.resolve(root, rel), "utf8");
function write(root, rel, text) {
    const full = path.resolve(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
}
// Written when absent, kept when present.
function put(root, rel, text, r) {
    if (exists(root, rel)) r.kept.push(rel);
    else { write(root, rel, text); r.written.push(rel); }
}

// The row to wire: the stack named, or the row with a runner whose marker the scaffold left and
// whose `needs` file, where the row has one, is there too. Three Node rows share a marker and each
// needs its own lock file, so the lock file tells them apart; the two .NET rows share a runner and
// its wiring, so the first will do. Two runners at one root is a question for the caller.
function rowFor(root, stack, name) {
    const runners = stacks.rows(root).filter(r => r.runner);
    if (stack) {
        const row = runners.find(r => r.stack === stack);
        return row ? { row } : { problem: `no row named ${stack} with a runner in ${stacks.FILE}` };
    }
    const here = runners.filter(r => RUNNERS[r.runner] && RUNNERS[r.runner].present(root, name) && (!r.needs || exists(root, r.needs)));
    const families = [...new Set(here.map(r => r.runner))];
    if (families.length === 1) return { row: here[0] };
    if (!here.length) return { problem: `no scaffold found at ${root}: run the stack's scaffold first, or name the row with --stack=` };
    return { problem: `${here.map(r => r.stack).join(", ")} all apply here; name the row with --stack=` };
}

// The wiring for a row, as what was written, what was already there, and what stopped it.
function wire(root, row, name) {
    const runner = RUNNERS[row.runner];
    if (!runner) return { written: [], kept: [], problems: [`${row.stack}: runner ${row.runner} is not one this script wires (${Object.keys(RUNNERS).join(", ")})`] };
    return runner.wire(root, name);
}

// The runner's own command against one step nobody defined. ok when the run failed naming it.
function prove(root, row, name) {
    const runner = RUNNERS[row.runner];
    if (!runner) return { ok: false, command: null, status: null, output: "", problems: [`${row.stack}: runner ${row.runner} is not one this script knows`] };
    const command = runner.command(row, name);
    write(root, PROVE_FILE, PROVE_FEATURE);
    let status, output;
    try { ({ status, output } = lib.shell(command, { cwd: root })); }
    finally { try { fs.unlinkSync(path.resolve(root, PROVE_FILE)); } catch { /* never written */ } }
    const problems = [];
    if (status === 0) problems.push(`${command}: passed with a step nobody defined, so the runner did not read ${FEATURES}/ or lets an undefined step pass`);
    else if (!runner.unbound.test(output)) problems.push(`${command}: failed, but not on the missing step (nothing matched ${runner.unbound}); read the output`);
    return { ok: !problems.length, command, status, output, problems };
}

module.exports = { RUNNERS, rowFor, wire, prove, FEATURES, PROVE_FILE };

if (require.main === module) {
    const argv = lib.args();
    if (argv.includes("-h") || argv.includes("--help")) {
        console.log("Usage: node scripts/wire-acceptance.js [--prove] --name=<Name> [--stack=<row>]\n" +
            `Points the stack's Gherkin runner at ${FEATURES}/ and makes a step without a definition fail the run.\n` +
            "  --name=<Name>   the PascalCase project name the scaffold was given\n" +
            "  --stack=<row>   the stacks table row, when more than one could apply\n" +
            "  --prove         write one step nobody defined, run the runner, and exit 0 only when it failed on it");
        process.exit(0);
    }
    const value = flag => { const a = argv.find(x => x.startsWith(`${flag}=`)); return a ? a.slice(flag.length + 1) : null; };
    const name = value("--name");
    if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) { console.error("wire-acceptance: --name=<Name> is required, PascalCase, as the scaffold was given it"); process.exit(2); }
    const root = lib.root();
    const found = rowFor(root, value("--stack"), name);
    if (found.problem) { console.error(`wire-acceptance: ${found.problem}`); process.exit(2); }
    if (argv.includes("--prove")) {
        const r = prove(root, found.row, name);
        console.log(`${found.row.stack} (${found.row.runner}): ${r.command}`);
        if (r.ok) { console.log(`${FEATURES}/: read, and a step without a definition fails the run`); process.exit(0); }
        for (const p of r.problems) console.error(p);
        console.error(r.output);
        process.exit(1);
    }
    const r = wire(root, found.row, name);
    for (const f of r.written) console.log(`${f}: written`);
    for (const f of r.kept) console.log(`${f}: kept, already wired`);
    for (const p of r.problems) console.error(p);
    console.log(`${found.row.stack} (${found.row.runner}): ${r.written.length} written, ${r.kept.length} kept` + (r.problems.length ? `, ${r.problems.length} problem(s)` : "") +
        `; run node scripts/wire-acceptance.js --prove --name=${name}${value("--stack") ? ` --stack=${found.row.stack}` : ""} to check it`);
    process.exit(r.problems.length ? 1 : 0);
}
