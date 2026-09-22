#!/usr/bin/env node
// .agents/hooks/chain-skill.js
// Runs before the harness creates a file, and asks for the skill that stage of the chain is written
// with: a PRD with `prd`, an ADR with `domain-modeling`, a new module with `implement` and
// `codebase-design`. AGENTS.md's chain table is where the mapping lives, and this hook reads it
// there rather than keeping a copy, so a project that renames a stage's skill renames it once.
// Only a creation fires it. A file that already exists is being edited, and an edit is work the
// skill has already shaped or work too small to reach for it; asking on every edit would make a
// reminder into a wall, and a hook that fires on everything gets turned off.
// The decision is scripts/chain-skill.js, which reads nothing; this file finds the paths, the
// chain and the transcript, and reports.
// Exit 2 = block, reason on stderr. Exit 0 = allow, with a note when the check could not be made.
// Wire it to the pre-tool-use event of the edit/write tools (.agents/README.md, "Files per AI tool").
const fs = require("fs");
const path = require("path");
const lib = require("./lib");
const docsCheck = require("../../scripts/docs-check");
const repoView = require("../../scripts/repo-view");
const chainSkill = require("../../scripts/chain-skill");

const { root, paths, transcript } = lib.event();

// A file already there is an edit, not a creation.
const creating = paths.filter(p => !fs.existsSync(path.join(root, p)));
if (!creating.length) process.exit(0);

const { stages } = docsCheck.readChain(repoView.worktree(root));
const decision = chainSkill.decide(creating, stages, chainSkill.readTranscript(transcript));
if (!decision) process.exit(0);

process.stderr.write(decision.message + "\n");
process.exit(decision.verdict === "block" ? 2 : 0);
