# Figma Motion support in figma-cli — Design

**Date:** 2026-07-02
**Status:** Approved, implementing

## Goal

Let figma-cli author Figma's native Motion animations (launched Config 2026,
Plugin API in Beta since Update 127, 2026-06-23) from the terminal. Cover both
quick single-property effects **and** sophisticated multi-keyframe, multi-track,
multi-node (choreographed / staggered) animations.

## Feasibility (proven)

The Motion API is exposed entirely through `node.*` properties and `figma.motion.*`,
i.e. the same Plugin-API surface figma-cli already drives via CDP `fastEval`. A live
probe against the connected Figma confirmed the API is enabled for this user and a
keyframe write succeeds. Gated behind the `metronome_plugin_api` user flag — not all
users have it, so every command must guard.

## Scope

New, isolated command namespace `figma-cli motion <sub>`. **Additive only:** one new
file `src/commands/motion.js`, one new pure-logic file `src/lib/motion-core.js`, and one
import line in `src/index.js`. No edits to `render`, `figma-client`, or `cli-core`.
No JSX `animate=` prop in v1 (keeps `render` untouched; a JSON spec is a better authoring
surface for complex animation anyway, and a Beta-API change then touches only one file).

## Command set

```
motion add <id> --field <f> --keys "t:v[:ease], ..." [--dur <s>] [--at <s>] [--ease <e>]
motion add <id> --field <f> --from <v> --to <v> [--dur <s>] [--at <s>] [--ease <e>]   # sugar → 2 keys
motion apply <spec.json | inline-json>   # multi-node/track/keyframe spec (power tool)
motion preset <id> <name> [--dur <s>] [--at <s>] [--ease <e>]
motion stagger <id,id,...> (--preset <name> | --field <f> --from <v> --to <v>) [--step <s>] [--dur <s>]
motion style <id> <StyleName> [--timing in|out] [--dur <s>] [--at <s>]
motion styles                            # list figma.motion.figmaAnimationStyles()
motion timeline <id> [--duration <s>]    # read, or set
motion inspect <id>                      # read back tracks / styles / timeline (verification)
motion clear <id> [--field <f>] [--styles]   # remove all tracks, one track, or styles
```

## Animation spec format (`motion apply`)

```json
{
  "duration": 1.2,
  "tracks": [
    { "node": "12:5", "field": "opacity",    "keys": [{"t":0,"v":0}, {"t":0.4,"v":1,"ease":"ease-out"}] },
    { "node": "12:5", "field": "translateY", "keys": [{"t":0,"v":40},{"t":0.5,"v":0,"ease":"gentle"}] },
    { "node": "12:6", "field": "opacity",    "keys": [{"t":0.2,"v":0},{"t":0.6,"v":1,"ease":"ease-out"}] }
  ]
}
```

- `duration` optional; if omitted the timeline is extended to the max keyframe `t`
  across all tracks. Never shortened.
- Each track: `node`, `field` (alias), `keys[]` with `t` (seconds), `v` (value),
  optional per-key `ease`.
- `field: "fill"` / `"stroke"` animate solid paint index 0 by default (`fill:1` for
  another index); `v` is a hex or `{r,g,b,a}`.

## Field aliases → API

Transform (additive, neutral 0 / scale 1): `translateX→TRANSLATION_X`, `translateY→TRANSLATION_Y`,
`translate→TRANSLATION_XY`, `rotate→ROTATION`, `scale→SCALE_XY`, `scaleX→SCALE_X`, `scaleY→SCALE_Y`.
Absolute (replace): `opacity→OPACITY`, `radius→CORNER_RADIUS`, `width→WIDTH`, `height→HEIGHT`,
`strokeWeight→STROKE_WEIGHT`, `gap→STACK_SPACING`, `padTop/padRight/padBottom/padLeft`,
`trimStart→PATH_TRIM_START`, `trimEnd→PATH_TRIM_END`. Color: `fill→fills[i]`, `stroke→strokes[i]`.
Raw API enum names also accepted verbatim (pass-through) for power users.

## Easing aliases → API

`linear→LINEAR`, `ease-out→EASE_OUT`, `ease-in→EASE_IN`, `ease-in-out→EASE_IN_AND_OUT`
(never the invalid `EASE_IN_OUT`), `gentle→GENTLE`, `quick→QUICK`, `hold→HOLD`,
`spring→CUSTOM_SPRING` (default params), `cubic(x1,y1,x2,y2)→CUSTOM_CUBIC_BEZIER`.

## Presets → keyframe tracks

Expand to opacity + transform tracks with subtle defaults (dur ~0.5s, EASE_OUT):
`fade-in`, `fade-up`, `fade-down`, `slide-left`, `slide-right`, `pop` (scale 0.8→1 + fade),
`spin` (rotate -360). `--at` offsets the whole preset on the timeline.

## Node targeting

Motion cannot target a top-level frame (direct page child). If the given id is such a
frame: with exactly one child, descend into it and print a note; with multiple children,
error and list them so the user picks. Non-top-level ids are used as-is. `stagger`/`apply`
take explicit ids (already child-level).

## Beta guard

Every command first checks `typeof figma.motion === 'object'`; if absent, exit with a
clear message ("Motion API not enabled for your Figma account — it's a Config-2026 Beta
feature behind a rollout flag") instead of a raw `"not a supported API"` throw.

## Verification

`motion inspect` reads back tracks/styles/timeline as numbers — same token-cheap,
measure-not-eyeball philosophy as `spec --check`. Real motion preview is a server-side
video export outside the Plugin API and out of scope; note it, don't build it.

## Testing

Pure logic in `src/lib/motion-core.js` (alias maps, `--keys` parser, spec normalizer,
preset builder, stagger expansion) is unit-tested via `node --test`. Plugin-API calls are
integration-tested live against the connected Figma. Regression: existing commands
(`canvas info`, `render`, `var list`) must be unchanged.
