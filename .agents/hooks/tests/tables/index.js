// .agents/hooks/tests/tables/index.js
// The decision tables, one file per module. A table takes a check's input and the verdict it must
// give and runs in this process against a throwaway root, so a case about another project's settings
// needs no clone. Add a table to the file that carries its module, and a new module's file to this
// folder: the folder is the list, read here rather than written out, so a file cannot be added and
// left unrun. Within a file the same holds one level down -- a check is `exports.name = function
// name(t)`, one statement, so there is no second place to register it and none to forget.
// Alphabetical, which is nobody's preference but is the same on every machine.
const fs = require("fs");
const path = require("path");

const FILES = fs.readdirSync(__dirname).filter(n => n.endsWith(".js") && n !== "index.js").sort();
const byFile = Object.fromEntries(FILES.map(name => [name, Object.values(require(path.join(__dirname, name)))]));
const checks = FILES.flatMap(name => byFile[name]);

module.exports = checks;
module.exports.FILES = FILES;
// The same checks keyed by file, for test.js's --only, which lets a table be named by the module it
// is about as well as by a check's name.
module.exports.byFile = byFile;
