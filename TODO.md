# TODO

- [ ] `.astro` is format-checked by nobody: prettier needs `prettier-plugin-astro` to parse it, and the harness installs no prettier plugin, so a project wanting it must install the plugin and extend its own row #deferred (scripts/stacks.tsv)
- [ ] `.razor` is format-checked by nobody: prettier has no plugin for it at all, so it would belong on the dotnet row, and whether `dotnet format` formats Razor markup rather than only the `@code` C# was never established #question (scripts/stacks.tsv)
