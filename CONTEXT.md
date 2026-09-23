# AI harness

The harness this repo maintains and installs into other repos: its layout, hooks, skills and agents.

## Language

**Upstream**:
This repo, the one the harness is maintained in and installed from.
_Avoid_: template, source repo, origin

**Target**:
A repo the harness is installed into or updated in, holding the project's own work beside the harness files.
_Avoid_: host repo, destination, consumer

**Harness invariant**:
A fact about a target's harness files that must hold for the harness to work there, such as every skill being linked or every Git hook being executable.
_Avoid_: self check, sanity check

**Decision table**:
What one module decides, pinned as rows of input and expected verdict, in `.agents/hooks/tests/tables/<module>.js` beside the module it reads. A check that can only be made from outside a module -- a real shell, a real install, this checkout itself -- stays in `tests/self-checks.js`.
_Avoid_: unit test, fixture, test suite

**Install plan**:
Everything one install or update will do to a target, path by path, decided before anything is written: what each path gets, its mode, and the outcome the run reports. A dry run prints it, and a real run applies it.
_Avoid_: changeset, diff, manifest

**Install run**:
One install or update, end to end, as a value: whether there was anything to do, the plan, what applying it came to, the two steps that reach outside the process, every line the run said, and the verdict the exit code is taken from. It is given an upstream, a target with the repo-edit to write through, and the options; it returns all of the above and prints none of it. The command line is the one adapter that prints the lines and exits on the verdict.
_Avoid_: session, execution, install process

**Install policy**:
What an install does with one kind of path, named by its row in `scripts/harness-files.tsv`: merge, reconcile, union, import, ignore, keyed, settings, seed, skip, skills or template. Each decides an outcome, summary bucket and content from what the target holds, the base and the run's flags, and the install plan is made of those decisions. All but one decide one path at a time; `skills` decides a whole folder, because a skill merges by name rather than by content and one line of output stands for its several hundred files.
_Avoid_: strategy, mode, rule

**Skill roster**:
What a repo's harness knows about its skills at one moment: every entry under `.agents/skills`, each skill's frontmatter and source, which agents route it, the skills the lock records but the disk lacks, and whether the licence notice is current. Read in one pass and never written; relinking and writing the notice are separate acts.
_Avoid_: skill registry, skill index, skill list

**Repo view**:
A repo as anything reads it, by repo-relative path: whether a path exists, whether it is a file, its text, its bytes, where a symlink points, what a folder holds and what modes Git records. The working tree, Git's index, one commit and a set of files a test names each give one, and it is the only read seam: a check, a hook and an install all ask the same questions. The staged view is what a commit will record: the documentation chain from the index, and everything else from the working tree. Nothing in it writes.
_Avoid_: filesystem, snapshot, tree

**Repo edit**:
A repo as a run changes it, by repo-relative path: the writes, folders, links and modes one install applies, and the relocations, performed by a run against the working tree and by a check against a map. It reports what it did and what it could not do, never what the run should call the result: naming that is the install policy's.
_Avoid_: writer, mutator, filesystem

**Adoption**:
What the harness does with a skill only one agent harness can see: a folder under `.claude/skills` or another harness's folder that the skills folder does not already hold is moved into it and linked back from every harness folder, so every agent reads it. The skill is taken as it stands, folder and all, rather than fetched again from wherever it came from, and a name the skills folder already holds is left alone rather than merged over.
_Avoid_: import, migration, absorb

**Repo root**:
The repo an entry point acts on, which is not always the checkout the file sits in: a hook checks the project its harness was installed into, and a check can be pointed at a throwaway repo. One rule answers for every script and hook: `--root=<dir>`, then the harness's project-dir variable, then the checkout.
_Avoid_: project dir, working directory, cwd

**Hook launcher**:
The command text a harness runs to start a hook: node, asking Git for the repo root, requiring the script under `.agents/hooks/`. It is written once, and the harness invariants hold `.claude/settings.json` to it, so an update that mangles an entry is caught instead of leaving the session unchecked.
_Avoid_: hook config, hook wiring, hook registration

**Hook event**:
What a hook is told, whichever tool sent it: the repo root, the edited paths, the shell command text, and the payload, the raw input the tool sent. `.agents/hooks/lib.js` reads it once from stdin. A payload in no known shape still gives a command -- every string in it -- so a guard reading it fails safe.
_Avoid_: hook input, tool input

**Project memory**:
What a target records about itself that no file in it derives, such as its name, where its requirements live and its runtime. It is kept in `MEMORY.md`.
_Avoid_: project config, settings, metadata

**Product intent**:
What a target's product is for and what its MVP must deliver: the product, its MVP stories and their done-when criteria. Optional, and kept in `INTENT.md` when a target has one, where it owns the name and purpose the project memory would otherwise hold. It never names the stack, tooling or issue tracker.
_Avoid_: vision doc, product brief, roadmap

**Project fact**:
One labelled entry of the project memory, such as Requirements or Issue tracker. A fact is unanswered while its value is empty or nothing but `<placeholders>`. A required fact that is unanswered leaves the target uninitialised. When a target has product intent, Name and Purpose are read from it alone, never from the project memory.
_Avoid_: field, setting, key
