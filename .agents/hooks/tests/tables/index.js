// .agents/hooks/tests/tables/index.js
// The decision tables, one file per module, run in this order by test.js. A table takes a check's
// input and the verdict it must give and runs in this process against a throwaway root, so a case
// about another project's settings needs no clone. Add a table to the file that carries its module,
// and a new module's file here; everyCheckIsRegistered reads this folder, so a function left out of
// a file's exported array is caught.
module.exports = [
    ...require("./repo"),
    ...require("./project"),
    ...require("./docs-chain"), ...require("./chain-skill"),
    ...require("./harness"), ...require("./hook-event"),
    ...require("./install-policy"), ...require("./installer"),
    ...require("./commit-message"),
    ...require("./todo"),
    ...require("./stacks"), ...require("./format"),
];
