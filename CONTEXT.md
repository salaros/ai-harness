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
