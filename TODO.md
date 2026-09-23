# TODO

- [ ] `.astro` is format-checked by nobody: prettier needs `prettier-plugin-astro` to parse it, and the harness installs no prettier plugin, so a project wanting it must install the plugin and extend its own row #deferred (scripts/stacks.tsv)
- [ ] `.razor` is format-checked by nobody: prettier has no plugin for it at all, so it would belong on the dotnet row, and whether `dotnet format` formats Razor markup rather than only the `@code` C# was never established #question (scripts/stacks.tsv)
- [ ] An adopted skill that no `skills-lock.json` records is attributed as written for this repo, so `THIRD-PARTY-NOTICES.md` leaves out a skill that was in fact copied from somewhere; only a skill a project hand-copied rather than vendoring with `npx skills` is affected, since that tool writes the lock entry adoption reads #deferred (scripts/skills.js:197)
- [ ] The 22 Sep architecture review's remaining candidates are reachable from nothing: its Status says the other six are found again through this file's `#deferred` line, and that line was deleted on the claim that all seven had landed, which the review itself contradicts #deferred (.scratch/reviews/architecture-2026-09-22.md)
