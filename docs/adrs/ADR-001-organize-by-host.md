# ADR-001: Organize sources by host

Status: accepted (2026-08-02)

## Context

The repository began as a single Claude Code statusline (`hud.mjs` at the
root). Adding Codex support introduced two more renderers, and both landed in
the root alongside the project-level files, while their design documents grew
a second tree under `docs/superpowers/` parallel to the documented
`docs/specs/` convention. A committed `.codex/config.toml` implied a
repo-local configuration that Codex never reads.

Nothing about that arrangement was load-bearing, but it made the next
integration worse than the last: each new host would add more root entries,
and there was no rule saying where anything belonged.

The question is what this repository is organized *around*. It is not one
statusline that grows deeper — it is a family of statuslines, one per agent
host, that grows wider. Each host owns its own input format (Claude pipes JSON
on stdin; Codex writes rollout files and owns its footer), its own
constraints, and its own install path. They share almost no code.

## Decision

Organize by host. Every integration owns a folder, and the same shape repeats:

```
src/<host>/       renderers and helpers
test/<host>/      tests mirroring src/<host>/
test/fixtures/    sample payloads, prefixed by host
docs/guides/<host>.md
```

The repo root is reserved for project-level files: README, license, community
health, agent context files, and package metadata. Local tool configuration is
never committed; installers write to the host's own config home.

Because a convention only documented is a convention eventually violated, CI
enforces the parts that can be checked mechanically: the `structure` job fails
on unexpected root entries and on committed local tool state.

## Consequences

Adding a host is additive — a new folder in three places, no reshuffling of
anything that exists. The cost is indirection: entry points now sit two levels
down, so `settings.json` and any documented command references a longer path,
and moving `src/claude/statusline.mjs` again would break every user's
configured statusline.

Shared code has no home yet. Bar rendering and percentage formatting are
duplicated between the Claude and Codex renderers. That duplication is
deliberate for now — the two renderers have different output contracts (one
line that must never wrap, versus a fixed-width animated line), and extracting
a shared module before a third host exists would be guessing at the
abstraction. When a third host arrives, `src/shared/` is the place for it.
