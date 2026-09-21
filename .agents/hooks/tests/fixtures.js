// .agents/hooks/tests/fixtures.js
// What the suite's checks build their cases out of. One temp-root helper, so a check that needs a
// repo of its own says which files it holds rather than growing a tenth mkdtemp call of its own.
//   withRoot({ "MEMORY.md": "..." }, dir => check(dir))   a throwaway repo, removed afterwards
//   text("# TODO", "", "- [ ] ...")                        lines, newline-terminated
//   installer()                                            the installer module, or null
const fs = require("fs");
const os = require("os");
const path = require("path");

// A temp repo holding `files` (repo-relative path -> content), handed to `use`, and removed after.
function withRoot(files, use) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-table-"));
    try {
        for (const [rel, text] of Object.entries(files)) {
            fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
            fs.writeFileSync(path.join(dir, rel), text);
        }
        return use(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const text = (...lines) => lines.join("\n") + "\n";

// scripts/update-harness.js is the upstream's own and is never installed, so a project that borrowed
// this suite has no installer to test. Required lazily for that reason: at the top it would throw
// before the first check ran, and take the whole suite with it.
const INSTALLER = path.join(__dirname, "..", "..", "..", "scripts", "update-harness.js");
const installer = () => fs.existsSync(INSTALLER) ? require(INSTALLER) : null;

module.exports = { withRoot, text, installer, INSTALLER };
