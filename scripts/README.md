## Scripts

Automation scripts for working with this repository. They are run by
developers and CI, not by the application itself, and are never shipped as
part of the product.

### What belongs here

- **Setup** — bootstrap a fresh clone (install dependencies, git hooks,
  local configuration).
- **Build and release** — compile, package, version, publish.
- **Maintenance** — clean caches, regenerate code or docs, migrate data.
- **CI helpers** — steps invoked from pipeline definitions, kept here so
  they can also be run locally.

### Conventions

- One task per script, named after what it does (`githooks-init.js`,
  `build.js`, `release.js`); Node, so they run the same on every OS.
- Scripts are safe to run from any working directory — every script and hook
  asks `lib.root()` which repo it is about, and gets one answer: `--root=<dir>`
  when given, then the harness's project-dir variable
  (`CLAUDE_PROJECT_DIR` and its Cursor and Gemini equivalents), then the
  checkout the file sits in (`lib.args()` is the arguments without the flag).
  The suite uses the flag to run a script against a temporary repo, and a
  script that calls another passes its own root along.
- A script run as a command may `chdir` there (`lib.chdirRoot()`). A script
  another script requires takes the root as its first argument and resolves
  against it (`lib.root()` at the entry point, `path.resolve(root, …)`
  inside), because `chdir` moves the working directory for the caller too.
  `docs-check.js` does both: it chdirs nothing, and its command line resolves
  the root itself.
- Every script starts with a short comment describing what it does and how
  to call it; scripts that take arguments print usage when run with `-h`.
- Node, so scripts run the same on Linux, macOS and Windows without a shell
  adapter. The files in `.githooks/` are the exception, since Git runs a hook
  through its own bundled shell, so each is two lines that find the repo root
  and hand over to `githook.js <hook>`. Nothing else belongs in them: a
  decision made in the shell is one no test can reach, and the suite asserts
  the shape.
- A script is a thin shell around its decisions. Parsing, merging,
  formatting and the summary it prints go in a pure module the suite tests;
  the script only reads, writes and reports, for the same reason the hooks
  above hold no logic.
- What two scripts share lives in one module here instead of a copy in each,
  so the callers cannot drift: a threshold, a list, or a whole step, the way
  `lib.js` holds root resolution and argument parsing for every script. When
  several scripts do one job for different sources, a runner owns the common
  steps and each script brings only its source and its rules.
- Scripts must be idempotent where possible — running them twice should not
  break anything.
  