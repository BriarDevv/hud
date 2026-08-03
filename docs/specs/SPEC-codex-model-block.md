# Codex Model Block Design

**Date:** 2026-08-02  
**Status:** Approved

## Goal

Add the active Codex model as the first, text-only group while preserving the
existing live HUD order and visual restraint:

```text
model gpt-5.6-luna  │  weekly [███████████░] 95%  │  context used [█░░░░░░░░░░░] 11%  │  28.8K in · 230 out
```

## Design

- The model is the first group and has no bar.
- Weekly and context used remain the only bar groups and keep the animated
  six-tone neon aurora.
- Input/output remains the final plain-text group.
- The label is `model ` followed by the current model ID.
- If Codex has not emitted a model yet, render `model --` without changing the
  line shape or adding another field.

## Data source

Codex rollout files contain `turn_context.payload.model`. The companion will
read that field from the bounded tail alongside token-count events. It will
never read auth files, prompt text, response text, or provider credentials.
The native footer adds the supported `model-with-reasoning` item as the first
element of the focused `hud` preset.

## Testing and acceptance

- Parsing a `turn_context` event exposes `model` and preserves the latest value.
- A rendered line begins with `model <value>` and keeps the existing three
  groups after it.
- Missing model data renders `model --`.
- The native preset is exactly:
  `model-with-reasoning`, `weekly-limit`, `context-used`,
  `total-input-tokens`, `total-output-tokens`.
- Existing Claude behavior, other Codex presets, tests, and the animation are
  unchanged.
