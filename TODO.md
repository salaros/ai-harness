# TODO

- [ ] The yarn scaffold declares the prettier plugin with `npm pkg set`, so that row alone still needs npm on the path: yarn 1, which its `yarn init -y` is written for, has no command that writes a package.json key. Everything else in the row is yarn's own, as its `yarn prettier --check` format cell always was #deferred (scripts/stacks.tsv)
- [ ] `design-doc` still describes itself as writing TRDs and RFCs, so a harness picking skills by description may send those requests to it; it is vendored, so its description cannot be narrowed in place, and `.agents/routing.md` names `trd` and `rfc` instead until upstream changes it or the skill is replaced #deferred (.agents/skills/design-doc/SKILL.md:3)
- [ ] An SRS for a client who asks for one is to be a generated view in `tools/docs-site`, rendering the PRD, TRD and EARS documents in IEEE 29148 order, not a stage of the chain #deferred (tools/docs-site/chain.mjs)
