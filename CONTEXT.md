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

**Project memory**:
What a target records about itself that no file in it derives, such as its name, where its requirements live and its runtime. It is kept in `MEMORY.md`.
_Avoid_: project config, settings, metadata

**Product intent**:
What a target's product is for and what its MVP must deliver: the product, its MVP stories and their done-when criteria. Optional, and kept in `INTENT.md` when a target has one, where it owns the name and purpose the project memory would otherwise hold. It never names the stack, tooling or issue tracker.
_Avoid_: vision doc, product brief, roadmap

**Project fact**:
One labelled entry of the project memory, such as Requirements or Issue tracker. A fact is unanswered while its value is empty or nothing but `<placeholders>`. A required fact that is unanswered leaves the target uninitialised. When a target has product intent, Name and Purpose are read from it alone, never from the project memory.
_Avoid_: field, setting, key
