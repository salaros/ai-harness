// .agents/hooks/tests/runner.js
// Running a list of checks, which is the one thing test.js used to do inline. A check is somebody's
// code: it can throw, and for as long as the loop was bare that throw ended the process with a stack
// trace in place of a tally, costing every check after it as well as every check before it, whose
// verdicts were never printed. scripts/check-harness.js has wrapped its invariants since it was
// written; this is the same decision in the other runner, and having it in a module is what lets the
// suite hand it a check that throws on purpose.
//
// Nothing here prints or exits. The verdicts go to the `t` the caller passes, so test.js stays the
// command line: it owns the tally, the FAIL lines and the exit code.

// Each check gets the same `t` and the same environment, and a throw becomes that check's failure.
// Named after the function, because "boom could not run" is a verdict and a stack trace is not.
function runChecks(checks, t, env) {
    for (const check of checks) {
        try { check(t, env); }
        catch (e) { t.ok(false, `${check.name || "an unnamed check"} could not run`, e && e.stack ? e.stack : String(e)); }
    }
}

module.exports = { runChecks };
