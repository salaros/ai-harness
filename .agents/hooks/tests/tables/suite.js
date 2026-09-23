// .agents/hooks/tests/tables/suite.js
// The suite runner's own decisions: what a check that throws costs, and what the tally says
// afterwards. The runner is .agents/hooks/tests/runner.js, which test.js is the command line for.
const runner = require("../runner");

// A check is somebody's code and can throw -- a Windows path an assertion never expected, a fixture
// that moved. For as long as the loop was bare, that throw ended the process: no tally, no other
// check, and a stack trace naming a temporary directory in place of a verdict. It cost a whole run
// twice on the day this was written. scripts/check-harness.js has wrapped its invariants this way
// all along; this is the same decision, made in the other runner.
exports.oneThrowCostsOneCheck = function oneThrowCostsOneCheck(t) {
    const seen = [];
    const inner = {
        ok: (condition, title, detail) => seen.push({ condition, title, detail }),
        skip: why => seen.push({ skip: why }),
    };
    const checks = [
        function first(x) { x.ok(true, "first ran"); },
        function boom() { throw new Error("a path nobody expected"); },
        function third(x) { x.ok(true, "third ran"); },
    ];
    runner.runChecks(checks, inner);
    t.ok(seen.length === 3, "runner: a check that throws does not stop the ones after it", JSON.stringify(seen.map(s => s.title || s.skip)));
    t.ok(seen[0].title === "first ran" && seen[2].title === "third ran", "runner: the checks either side of it both ran", "");
    const bad = seen[1];
    t.ok(bad.condition === false, "runner: the throw is a failure, not a skip and not a pass", JSON.stringify(bad));
    // Named, because a stack trace is not a verdict and the tally is what a reader sees first.
    t.ok(bad.title === "boom could not run", "runner: the failure names the check that threw", String(bad.title));
    t.ok(String(bad.detail).includes("a path nobody expected"), "runner: what was thrown is what is reported", String(bad.detail));
};

// The environment the case rows need is handed on, so a check that spawns a script gets the same one
// the runner was given rather than reaching for process.env itself.
exports.everyCheckIsHandedTheEnvironment = function everyCheckIsHandedTheEnvironment(t) {
    const got = [];
    runner.runChecks([function one(x, env) { got.push(env); x.ok(true, "one"); }], { ok: () => {}, skip: () => {} }, { HOOK_TEST: "1" });
    t.ok(got.length === 1 && got[0] && got[0].HOOK_TEST === "1", "runner: a check is handed the environment the run was given", JSON.stringify(got));
};
