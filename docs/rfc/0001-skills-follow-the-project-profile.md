# RFC-0001: How should a project load only the skills, agents and MCP servers its profile needs?

**Status:** Accepted
**Derived from:** scripts/skills.js and scripts/project-facts.js and .mcp.json and skills-lock.json, and the user's request of 2026-11-09 to make skills part of the scaffold
**Decider:** Yaroslav Zhmayev

## Abstract

Every target exposes all 86 vendored skills, all six agents and both MCP servers to every session, whatever the project is. A C# daemon with no frontend and no issue tracker still loads the React, Vue, Figma, marketing and Atlassian material. The listing has already outgrown its budget: in a Claude Code session on 2026-11-05, about forty of the harness's skills were listed with no description, so they could not be routed to. This RFC compares four ways to make the active set follow the project facts in `MEMORY.md`, and asks which one to build.

## Problem

`.claude/skills` is one link to `.agents/skills`, and every other harness reads `.agents/skills` directly, so the skill roster on disk is the skill roster in context. The model-invocable descriptions total about 28,700 characters. By the fact that should gate them:

| Group | Should load when | Description chars |
| --- | --- | --- |
| Marketing, 12 skills | the project runs a marketing role | 9,200 |
| Frontend and Figma, 9 skills | `Frontend` is not `none` | 3,600 |
| Product management, 9 skills | the project runs a product role | 2,400 |
| .NET, 6 skills | `Language` is C# | 1,100 |

The groups, as measured on 2026-11-09:

- **Marketing:** `ads`, `analytics`, `competitor-profiling`, `content-strategy`, `copywriting`, `emails`, `launch`, `marketing-plan`, `product-marketing`, `sales-enablement`, `seo-audit`, `social`.
- **Frontend and Figma:** `frontend-design`, `tailwind-design-system`, `vercel-react-best-practices`, `vercel-react-view-transitions`, `vue-best-practices`, `figma`, `figma-generate-design`, `figma-implement-design`, `figma-use`.
- **Product management:** `analyze-feature-requests`, `metrics-dashboard`, `north-star-metric`, `opportunity-solution-tree`, `outcome-roadmap`, `pre-mortem`, `product-strategy`, `product-vision`, `roadmap-prioritization`. The chain skills (`pdd`, `brd`, `prd`, `interview-synthesis` and the rest) stay active in every profile.
- **.NET:** `aspnet-core`, `aspnet-minimal-api-openapi`, `dotnet-best-practices`, `dotnet-design-pattern-review`, `ef-core`, `vertical-slice`.

The group lists were added after the critique in round 2, which pointed out they were missing. The frontend count in the table was corrected from 8 to 9 at the same time; the character total did not change.

`MEMORY.md` already records `Unit type`, `Language`, `Runtime / package manager`, `Frontend` and `Issue tracker`, and `project-init` asks for them. Nothing reads those facts to choose what loads. The engineer's route table gates in prose ("when the frontend is Vue"), which saves no context, because the description loads before the route table is read.

The same gap blocks breadth. Supporting more languages and unit types (a NuGet, npm or Composer library, a console utility, a desktop app, a Windows service or Linux daemon) means adding skills for each, and today every addition lands in every target. Doing nothing makes each new stack cost every project, and leaves more skills undescribed as the budget overflows.

## Goals and non-goals

**Goals:**
- G-1: the reference profile below loads at most half of today's model-invocable description characters from the harness.
- G-2: the active set is a function of the project facts and changes when they change.
- G-3: a new language, unit type or role is added by data, not by code.

**Non-goals:**
- Trimming or rewriting the descriptions of vendored skills.
- Deciding which skills a new stack needs (PHP, desktop, daemon). That is per-stack work this RFC enables.
- User-level plugins and skills under the user's home directory. They fill the same budget, but the harness does not own them; C-8 asks only whether an option can reach them.

**Reference profile:** `Unit type` daemon, `Language` C#, `Frontend` none, `Issue tracker` none, roles engineer and devops.

## Criteria

- C-1 (must): the reference profile loads at most 14,300 of today's 28,700 model-invocable description characters from the harness.
- C-2 (must): every harness the repo wires (Claude Code, OpenCode, and any harness reading `.agents/skills`) sees the same active set.
- C-3 (must): changing a project fact changes the active set with no network access, either by one command or automatically when `MEMORY.md` changes through a merge.
- C-4 (must): `update-harness.js` still merges cleanly. No vendored file is edited in place, and a project's own skills and its edits to harness files survive an update.
- C-5 (should): adding a language, unit type or role is a row in a decision table, not a change to a script.
- C-6 (should): a skill newly vendored upstream cannot become active in every target silently. A harness invariant fails until the skill is classified.
- C-7 (could): agents and MCP servers are gated by the same mechanism as skills.
- C-8 (could): the mechanism can also switch off user-level plugins for one project.

The interview step was skipped: the problem, the constraint list and the reference profile come from the user's request and the measurements above. The decider may change the criteria before the debate is weighed.

## Options

### OPT-1: Catalog on disk, active set exposed by links

Vendored skills move from `.agents/skills/` to `.agents/catalog/`, which `update-harness.js` writes to under the existing "added, never removed" skills policy. A new decision table, `scripts/profiles.tsv`, has one row per vendored skill, agent and MCP server: name, kind, and a condition over project facts (`always`, `Frontend != none`, `Frontend = React`, `Language = C#`, `Issue tracker = Jira`, `Roles has marketing`). A pure selector, `select(facts, table)`, returns the active set, and `node scripts/profiles.js apply` hands it to three adapters:

- **skills**: `.agents/skills/` becomes per-skill relative links into the catalog for the active set, beside any skill the project wrote there by hand. `.claude/skills` stays one link to `.agents/skills`, so nothing changes for the harnesses. `relinkPlan` already builds per-skill links.
- **agents**: `.agents/agents/` gets the same treatment from a catalog of agents.
- **MCP**: the `atlassian` and `figma` entries in `.mcp.json` and `opencode.json` are written or removed by their rows.

A `stacks.tsv` row triggered by `MEMORY.md` and `scripts/profiles.tsv` runs `apply` after a merge, and `project-init` runs it as its last step. Two new project facts: `Roles` (which agents the repo runs) and a wider `Unit type` (adding `desktop`, `daemon`, and a registry for `library`). Two harness invariants change: every vendored skill needs a profile row, as it needs a licence row; and a routed skill must be in the catalog rather than active, with agents told to skip a route row whose skill is inactive.

| Criterion | Assessment |
| --- | --- |
| C-1 | meets: the reference profile drops marketing, product and frontend, about 15,200 characters, leaving about 13,500 |
| C-2 | meets: every harness reads `.agents/skills` or a link to it |
| C-3 | meets: `apply` is a relink and a JSON edit, offline |
| C-4 | meets: vendored files are untouched; the catalog is a new path in `harness-files.tsv`. Existing targets need a one-time move |
| C-5 | meets: a row in `profiles.tsv`, plus a `stacks.tsv` row for a new stack's scaffold |
| C-6 | meets: the classification invariant |
| C-7 | meets: three adapters at one seam |
| C-8 | partly: a fourth adapter could write `enabledPlugins` into `.claude/settings.json`, Claude Code only |

**Strengths:** one module decides, three adapters apply, and the full catalog stays on disk, so switching profile is instant and offline. It reuses the per-skill link code and the decision-table pattern of `stacks.tsv` and `skill-licences.tsv`.
**Costs and risks:** a breaking layout change for every existing target, which `update-harness.js` must migrate. Symlinks on Windows need Developer Mode or Git's `core.symlinks`, already true of today's links but now multiplied by the active set. The repo still carries every skill on disk.

### OPT-2: Install only the profile's subset

`.agents/skills/` stays the one home, but holds only the active set. The same profile table and selector decide which skills `update-harness.js` and `skills.js install` write. The target's `skills-lock.json` records the subset, and the skills install policy gains a filter: a skill outside the profile is neither added nor updated, and one the profile drops is removed if the project never edited it. MCP servers and agents are filtered at install the same way.

| Criterion | Assessment |
| --- | --- |
| C-1 | meets: same selection as OPT-1 |
| C-2 | meets: the folder every harness reads holds only the active set |
| C-3 | fails: a skill the new profile adds must be fetched from the upstream or by `npx skills`, which needs the network |
| C-4 | partly: "added, never removed" becomes "removed when deselected and untouched", a new rule in the policy every update runs through |
| C-5 | meets: a row in the table |
| C-6 | meets: the same classification invariant |
| C-7 | meets |
| C-8 | partly: as OPT-1 |

**Strengths:** no layout change: the folder every harness reads is the same folder, and a target carries only what it uses. Smaller repos, smaller diffs on update.
**Costs and risks:** the profile becomes an input to every install run, so a fact change and a harness update interact. Removing deselected skills is a destructive policy where today's is additive.

### OPT-3: Keep the tree, hide inactive skills through harness switches

Nothing moves. The same table and selector drive an `apply` step that sets `disable-model-invocation: true` in the frontmatter of each inactive skill, which keeps it callable by name but drops its description from Claude Code's listing, and filters the MCP entries. `apply` runs after every update and every merge, re-flipping what an update restored.

| Criterion | Assessment |
| --- | --- |
| C-1 | meets in Claude Code only |
| C-2 | fails: OpenCode, Codex and Cursor ignore the flag and still list every skill |
| C-3 | meets: an offline edit |
| C-4 | fails: it edits vendored files in place, so every update collides with the flipped lines or restores them until `apply` runs again |
| C-5 | meets |
| C-6 | meets |
| C-7 | partly: MCP yes, agents have no equivalent switch |
| C-8 | partly: as OPT-1 |

**Strengths:** the smallest diff to the layout, and an inactive skill is still one `/name` away when someone wants it anyway.
**Costs and risks:** correct for one harness in an AI-agnostic repo, and a standing merge conflict with the upstream.

### OPT-4: Smallest change: optional bundles at install

Use the `optional:<flag>` install policy that `tools/docs-site/` already has. Marketing, product management and frontend skills become bundles installed only with `--marketing`, `--product` or `--frontend`, and the Atlassian and Figma MCP entries move behind `--jira` and `--figma`. `project-init` prints the flags that match the interview answers. No selector, no new project fact.

| Criterion | Assessment |
| --- | --- |
| C-1 | meets for the reference profile: the three bundles are the 15,200 characters |
| C-2 | meets: the folder holds what was installed |
| C-3 | fails: adding a bundle later is a reinstall with the flag, from the network |
| C-4 | meets: an existing policy, though today it covers one path, not a set of skill folders |
| C-5 | partly: a new bundle is a new flag in the installer and a new row, and the bundles are coarse; a C# project still gets the Python skills, and the reverse |
| C-6 | fails: a new upstream skill outside a bundle is installed everywhere |
| C-7 | partly: MCP yes, agents not |
| C-8 | fails |

**Strengths:** ships in a day on mechanisms that exist, and captures the three biggest groups, which are most of the gain today.
**Costs and risks:** it does not scale to the per-language and per-unit-type skills the user wants next, and the flags live in no project fact, so nothing records why a target has what it has.

## Discussion

Each advocate and the critic ran as a separate sub-agent with read access to the repo. The advocates of a round ran in parallel and did not see each other's positions.

### Round 1: positions

**Advocate for OPT-1:** OPT-1 is the only option that meets all seven must and should criteria. It also builds on code the repo already trusts.

C-1: the reference profile drops marketing, product and frontend, about 15,200 characters, and lands near 13,500, under the 14,300 cap. C-2: no harness changes how it reads skills. `.claude/skills` is still one link to `.agents/skills` (harness-files.tsv: "One link to .agents/skills, not a link per skill"), and every other harness reads `.agents/skills` directly. So whatever `apply` puts there, every harness sees the same set. C-3: switching profile is a relink and a JSON edit against a catalog already on disk, so no network is needed. The trigger is a `stacks.tsv` row, the same pattern that already runs `npm install` when its trigger files change. C-4: `.agents/skills/` keeps its "Added and updated, never removed" policy, just moved to `.agents/catalog/`. Nothing vendored is edited, and no deletion rule is added. C-5 and C-6: one row per skill in `profiles.tsv`, enforced the way `skill-licences.tsv` already is by `orphanMessage`. C-7: agents and MCP servers go through two more adapters at the same seam.

It is less new code than it sounds. `relinkPlan` already writes per-skill relative links, fixes absolute Windows junctions, adopts hand-written skills and reports dangling links. `relink` already reports a link the platform refuses instead of crashing. OPT-1 mostly changes the roster those links come from.

What it costs: a one-time layout migration in `update-harness.js`, more symlinks on Windows, and every skill still on disk. Disk is cheap, and context is the budget that has run out.

The other options each fail a must:
- OPT-2 fails C-3, because adding a skill means fetching it again. It also turns an additive install policy into a destructive one, which C-4 cannot fully absorb.
- OPT-3 fails C-2, because only Claude Code honours `disable-model-invocation`. It also fails C-4, because it edits vendored files and conflicts with every upstream update.
- OPT-4 fails C-3 and C-6. It also does not scale to the per-language and per-unit-type stacks the user wants next, and no project fact records which flags a target was installed with.

**Advocate for OPT-2:** OPT-2 keeps the one thing every harness already agrees on: the skill roster is whatever sits in `.agents/skills/`. Nothing moves. There is no catalog, no new layout and no extra links, so existing targets need no migration, and the Windows symlink exposure shrinks where OPT-1's grows. It meets C-1, C-5, C-6 and C-7 with the same table and selector as OPT-1. Its case on C-2 is stronger than OPT-1's: an inactive skill is not on disk at all, so no harness can list it.

C-4 costs less than the RFC suggests. The change goes in one place, `skills()` in `scripts/install-policy.js`. That function already walks the roster by skill name and already exempts skills the project owns (`mine.has(name) && !theirLock.skills[name]`). The filter is one more `continue`, and the lock-union loop at its end skips deselected names. Telling an untouched skill from an edited one is already possible. `update-harness.js` keeps the receipt's base commit and reads each file at that commit through `upstream.at(base)`. A deselected skill whose files still match that version can be removed. An edited one is kept and reported, the same receipt rule that already keeps a deleted skeleton deleted. The project's own skills are never candidates for removal. The rule is destructive, but only to vendored files that Git history and the lock can bring back.

C-3 is its honest weak point, but "fails" overstates it. Dropping a skill works offline; only adding one needs the files. `update-harness.js --from <dir>` already installs from a local upstream checkout, so a kept clone makes adding a skill offline too. Fact changes are also rare, deliberate events.

OPT-1 makes every target go through a breaking migration so it can keep files on disk that nothing loads. OPT-3 fails C-2 and C-4: it edits vendored frontmatter, and only Claude Code honours the flag. OPT-4 cannot express `Language = C#`, fails C-6, and records in no project fact why a target has what it has.

The real cost is that the profile becomes an input to every install. The receipt must record the active set, and changing a fact interacts with running an update.

**Advocate for OPT-3:** OPT-3 is the only option built on a mechanism the harness already trusts. Fourteen vendored skills ship with `disable-model-invocation: true` today. `skills.js` (readRoster) reports them as `/name`, `routing.md` tells agents to ask for such a skill instead of loading it, and `chain-skill.js` already knows the Skill tool refuses one. Under OPT-3 an inactive skill becomes one more of a kind every check understands. When the profile guesses wrong, it is still one `/name` away, with no relink and no download.

The RFC's C-4 verdict misreads the code. The `skills` roster policy in `install-policy.js` never merges: it rewrites any vendored file whose text differs from the upstream. An update therefore never conflicts with a flipped line. It restores the line, and `apply`, run straight after, flips it back, so the net diff is zero. Project edits to vendored skills do not survive an update today either, so OPT-3 removes nothing that C-4 protects. It fails the letter of "no vendored file edited in place" but keeps its intent: updates stay clean and project files survive. The honest cost is noise, because every update reports each hidden skill as updated.

C-1 is met in Claude Code, which is where the overflow was measured. C-2 is the real weakness, but the option says "harness switches", plural. OpenCode hides a skill denied under `permission.skill`, and Codex disables one through `skills.config`, so `apply` can write one switch per harness. A harness with no switch at all still lists everything. C-3 is an offline text edit, and C-5 and C-6 use the shared table. MCP is gated through the keyed `.mcp.json`. Agents are the gap, though they are only six small files.

The others fall short. OPT-1 forces a layout migration on every target and multiplies Windows symlinks. OPT-2 and OPT-4 both fail C-3, because turning a skill on needs the network. OPT-2 also turns an additive policy into a destructive one, and OPT-4 fails C-6 as well.

**Advocate for OPT-4:** OPT-4 is the only option that meets C-1, C-2 and C-4 without a new module, a new project fact or a layout migration. C-1: the marketing, product and frontend groups come to 15,200 characters, which leaves the reference profile at about 13,500. C-2: harnesses read whatever `.agents/skills` holds, and with OPT-4 it holds only what was installed. C-4: `harness-files.tsv` already resolves `optional:<flag>`, and `policyFor` turns an unrequested part into `template`, which means "never installed". A deselected bundle stays out on every update, and nothing vendored is edited in place.

The RFC overstates one cost. A new bundle needs no installer code. `update-harness.js` builds its accepted flags from the manifest (`unknownArgs(args, optionalParts(rows))`), so a bundle is just rows in the TSV, and C-5 is met for roles. One fix is needed. Today `policyFor` maps a requested optional part to `seed`, so bundled skills would never update. Mapping it to the row's underlying `skills` policy instead is a one-line change, and `decideRoster` handles the rest unchanged.

The costs are real. C-3 fails because adding a bundle later means rerunning the installer, which fetches the upstream (removing one is just deleting folders, offline, and it stays removed). C-6 fails, C-8 fails, and the bundles are coarse.

Compare OPT-2. It fails the same must, C-3, and on top of that makes the additive skills policy destructive and makes every install depend on the profile. OPT-4 has the same weakness at a fraction of the risk, so it dominates OPT-2. OPT-3 fails two musts: C-2, in a repo whose whole point is being AI-agnostic, and C-4, because it creates standing conflicts with the upstream. OPT-1 meets every criterion. But it forces a breaking move on every existing target and adds per-skill symlinks, which Windows clones like this one only get with Developer Mode or `core.symlinks`. It also adds two new facts before any per-language skill exists to gate.

So ship OPT-4 now for most of the gain. Its bundle rows are exactly the first rows OPT-1's `profiles.tsv` would need, so none of it is wasted if OPT-1 follows.

### Round 2: critique

**Critic:** OPT-1. Its weakest claim is that `relinkPlan` already builds per-skill links. It builds links from harness folders into `.agents/skills`, skips `.agents` itself (skills.js:271) and hardcodes that folder as the link target (261), so links from the catalog into `.agents/skills` are new code. The migration is also understated. Every existing target holds 86 real folders under `.agents/skills/`, and each must be deleted and replaced by a link. That is the same destructive "untouched or edited" rule this advocate holds against OPT-2, applied to every skill at once. The Windows risk is mispriced too. Today a refused link hides skills from Claude Code only, because OpenCode reads real folders. Under OPT-1, a clone without `core.symlinks` checks every link out as a text file, and no harness sees any skill. The risk nobody priced: `skills.js install` restores every locked skill into `.agents/skills` with `npx skills`, which turns the whole catalog back on unless the lock moves too.

OPT-2. Its weakest claim is that telling an untouched skill from an edited one "is already possible". The skills roster receives only `exists`, `theirs` and `held` (update-harness.js:510-514), with no base, so base reads must be plumbed in across hundreds of files. The rule also contradicts today's policy. install-policy.js:381-385 overwrites an edited vendored skill while it is selected, yet OPT-2 would keep that same edit once the skill is deselected. The "kept clone" escape from C-3 concedes OPT-1's catalog, just kept outside the repo. Unpriced: when a fact change and an update arrive in the same merge, the result depends on which one runs first.

OPT-3. On mechanism the advocate is right and the RFC is wrong. The skills policy never merges: it rewrites any file whose LF text differs, so a flipped line produces no conflict. Project edits to vendored skills do not survive an update today either, which means no option meets C-4's "edits survive", not only OPT-3. But a zero net diff needs `apply` after every update, and each flip leaves the `computedHash` in `skills-lock.json` stale. I count 13 skills that ship with `disable-model-invocation: true`, not 14. The OpenCode `permission.skill` and Codex `skills.config` switches cannot be checked from this repo. `opencode.json` holds only `mcp`, and nothing writes Codex config, so they mean two new config writers. Cursor and any other reader of `.agents/skills` has no switch at all, so C-2 still fails. Unpriced: re-enabling a skill must tell the 13 that ship user-only apart from those `apply` hid. Otherwise a profile change quietly makes `project-init` model-invocable.

OPT-4. "A bundle needs no installer code" is true only for the flags. A manifest row has one policy column, so there is no "underlying skills policy" to map a requested part to. Paths under `optional:` never reach `decideRoster` (update-harness.js:465). The roster also unions the whole upstream lock (install-policy.js:391-393), so `skills.js install` restores bundles nobody asked for. The receipt does not record flags (update-harness.js:518). A later update run without `--marketing` therefore treats an installed bundle as `template`: never updated again and never removed. Because `template` removes nothing, existing targets save zero characters. The option quietly ignores G-2: no fact records the flags.

The 15,200 saving. I measured 28,601 characters across 73 model-invocable skills. Dropping the three groups leaves about 13,400 against the 14,300 cap, so the headroom is roughly 900 characters. The RFC never lists which skills each group contains, so this cannot be checked. If `interview-synthesis` (382 characters) is among the dropped ones, the reference profile still needs it, because the "Working the chain" row in routing.md routes to it and engineer and devops both read that row. Keeping it spends about 40% of the headroom, and one more skill of that size breaks C-1. C-1 also counts only the harness. The overflow was measured in a session where user-level plugins share the same budget, so meeting C-1 may not bring the missing descriptions back.

### Round 3: rebuttals

**Advocate for OPT-1:** Two of the critic's points are fair. `relinkPlan` hardcodes `.agents/skills` as the link target (skills.js:261) and skips `.agents` (271), so links from the catalog are new code. They do reuse `pointsAt` and the per-link refusal reporting. `skills.js install` restores into `.agents/skills` (line 17), so the lock and the install must move to the catalog, a cost the RFC left out. The Windows risk is also wider: OpenCode now loses skills too, not only Claude Code. Yet `.claude/skills` is already one link (harness-files.tsv:56), so such clones are already broken for Claude Code.

The migration is not OPT-2's destructive rule. Moving 86 folders deletes nothing, just like the adoption `move` entries `relinkPlan` already plans (294). And the critic showed that updates already overwrite edits, so there are no edits to lose.

The thin headroom is real. It comes from the selection, which OPT-2 and OPT-4 share, not from OPT-1. Keeping `interview-synthesis` costs one table row, and C-1 still holds.

**Advocate for OPT-2:** I concede three points. The skills roster gets no base today (update-harness.js:510-514). Keeping an edit on deselection would contradict lines 381-385, which overwrite that same edit while the skill is selected. And a kept clone is OPT-1's catalog kept outside the repo, so C-3 is "partly" at best.

The fix is cheaper than the critique says. Use one rule: since vendored edits never survive an update anyway, a deselected skill is removed whatever its state. That makes the policy consistent and needs no base reads at all. If keeping edits is ever wanted, the base reader already exists for single paths (line 481) and evaluates lazily per file, so passing it to the roster is one line.

Ordering is not a real risk if the selector reads `MEMORY.md` from the working tree during the same `decideRoster` pass, because then the fact change and the update are one run.

The thin headroom applies to every option equally. With per-skill rows, OPT-2 can keep `interview-synthesis` and still stay under the cap.

**Advocate for OPT-3:** I concede three points. Thirteen skills ship user-only, not fourteen. The OpenCode and Codex switches mean two new config writers, and Cursor has no switch, so C-2 still fails. A re-enable must also tell the thirteen that ship user-only apart from the skills `apply` hid. It can do that by restoring the upstream's own frontmatter value, which the update already reads, rather than by deleting the flag.

The stale `computedHash` breaks nothing here. No script in this repo reads it; only `skills-lock.json` contains it. It matters only if `npx skills` checks it.

The 900-character headroom actually favours OPT-3. `routing.md` already treats a row that names a user-only skill as "ask the user for `/name`". A hidden `interview-synthesis` therefore stays reachable through the "Working the chain" row and costs no description characters. OPT-1, OPT-2 and OPT-4 must either keep it active, spending 40% of the headroom, or lose it. User-level plugins strain the budget under every option equally.

**Advocate for OPT-4:** The critic is right about the mechanism, and I take back "a one-line change". A manifest row has only one policy column. Optional paths never reach `decideRoster` (update-harness.js:465). The roster merges the whole upstream lock into the project's (install-policy.js:391-393). The receipt does not record flags (update-harness.js:518). So a bundle installed once would never be updated again on later runs, and `skills.js install` would bring deselected skills back. Repairing that takes three changes: record the flags in the receipt, filter the roster by flag, and filter the lock by flag. That turns OPT-4 into OPT-2 without the removal rule, which is no longer a day's work.

Two points I contest. G-2 was not ignored quietly: the RFC's own table already says "no new project fact". The thin headroom on the 15,200 saving is not specific to OPT-4 either. OPT-1 and OPT-2 drop the same three groups, so they share the same 900-character margin. What still stands for OPT-4 is that it is the least destructive way to meet C-1, C-2 and C-4. What fails is the claim that it is cheap.

## Open questions

- Q-1: Does C-4 need rewording? The skills install policy overwrites a vendored skill the project edited (install-policy.js:381-385), so "a project's edits survive an update" holds for harness files but not for vendored skills under any option. The RFC's C-4 verdict on OPT-3, that it "conflicts" with every update, was wrong for the same reason: the update rewrites the flipped line instead of conflicting. The decider settles the wording.
- Q-2: Should the success measure include user-level plugins? C-1 counts only the harness, and the overflow was observed in a session where user-level plugins share the same listing budget. Meeting C-1 may not bring every missing description back. The decider settles whether C-8 moves up to a must.
- Q-3: Under OPT-1, a Windows clone without Developer Mode or `core.symlinks` checks every per-skill link out as a text file, and no harness sees any skill. Is a copy fallback needed there? A test on such a clone settles it.
- Q-4: The `interview-synthesis` concern does not apply: the skill was never in the product group (see the group lists under Problem). The remaining point is the OPT-3 rebuttal's: a gated skill that a route row still names could stay reachable by `/name` at no description cost. That suggests a hybrid of OPT-1's catalog with OPT-3's user-only flag for such skills, which no advocate argued. The decider settles whether it is worth a revision of this RFC.
- Q-5: Do OpenCode's `permission.skill` and Codex's `skills.config` hide a skill from the listing as the OPT-3 advocate says, and does `npx skills` check `computedHash`? Neither can be verified from this repo; each tool's documentation settles it.

## Resolution

Accepted OPT-1 on 2026-11-09, as written, by Yaroslav Zhmayev: vendored skills move to a catalog on disk, and `scripts/profiles.tsv` with one selector decides which skills, agents and MCP servers each target exposes. The hybrid raised in Q-4 was offered and not taken.

What it gives up:
- **A breaking layout change.** Every existing target must move its vendored skills from `.agents/skills/` to the catalog, and the lock and `skills.js install` move with them.
- **Windows clones without symlink support.** Such a clone loses every skill in every harness, where today only Claude Code loses them (Q-3).
- **Disk.** Every target keeps every vendored skill, active or not.
- **Reach by name.** An inactive skill cannot be called by `/name` until its profile row turns it on.

Q-1, Q-2 and Q-5 were not answered at resolution. Q-3 and Q-5 belong to the SPEC; Q-1 and Q-2 stay with the decider and are filed in `TODO.md`.

**Follow-ups:**
- An ADR recording the catalog layout and the profile table as the way a target chooses its skills, agents and MCP servers, written with `grill-with-docs` and citing RFC-0001/OPT-1. It also records `Roles` and the wider `Unit type` as project facts.
- A SPEC for the design, written with `spec` and citing RFC-0001: the `profiles.tsv` grammar, the selector, the three adapters, the migration in `update-harness.js`, the moved lock and install, the two harness invariants, and the answers to Q-3 and Q-5.
