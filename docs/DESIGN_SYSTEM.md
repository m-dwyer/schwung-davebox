# Overture UI Design System

This document codifies the shared design language for Overture's Move UI. It is
intended to evolve as patterns solidify in code. When behavior and code differ
from this document, either migrate the behavior toward the system or update this
document with the new decision.

## Purpose

Overture should feel like one groovebox, not a stack of dAVEBOx, Schwung, and
Move-specific modes. The design system exists to keep new screens, workflows,
and refactors aligned around one interaction grammar.

The system covers:

- product language;
- OLED layout patterns;
- encoder and jog behavior;
- LED feedback language;
- modal and browser behavior;
- documentation and implementation naming.

## Principles

1. **Stay in the musical flow.** Common performance and shaping actions should
   be reachable from the object they affect: track, clip, step, sound, motion,
   or drum lane.
2. **Beginner first, power later.** The first layer should be easy to scan and
   operate. Power-user depth should preserve the same gestures rather than
   creating unrelated modes.
3. **One grammar, many surfaces.** Parameter editing should feel the same in
   track pages, sound editing, motion, and future module views.
4. **Feedback over density.** The OLED and LEDs should explain current context,
   selected object, touched parameter, and next useful action before showing
   maximum data.
5. **Muscle memory is product value.** Jog, encoders, step buttons, side
   buttons, and modifiers should keep stable meanings within a workflow layer.
6. **Route differences are contextual.** Move-vs-Schwung details should appear
   when loading, editing, troubleshooting, or explaining a route problem, not
   during ordinary sequencing.
7. **Refactors should leave a pattern behind.** When touching a one-off screen,
   extract or align one reusable pattern if doing so reduces future UI drift.

## Product Language

Use these names in user-facing docs, design notes, and new domain language.

| Preferred term | Meaning | Avoid |
| --- | --- | --- |
| **Page** | A top-level, jog-reachable editing surface in Track View. | Bank, tab |
| **Parameter Page** | A Page centered on eight encoder-addressable parameters. | Parameter bank, knob bank |
| **Sound Page** | Overture's route-aware sound editing surface for the active track. | Sound editor screen, Schwung screen |
| **Component** | A sound-chain role such as MIDI FX, Synth, FX 1, or FX 2. | Slot, unless referring to Schwung slot routing |
| **Slot** | A Schwung runtime slot/channel assignment. | Component |
| **Motion** | Overture's automation layer. | AUTO, except where matching legacy UI/code |
| **Browser** | A list picker for modules, presets, files, or options. | Menu, unless it is system/global navigation |

`bank` remains valid as an internal legacy implementation term where existing
code, state, tests, or DSP protocol names already use it. New product-facing
language should say **Page** or **Parameter Page**.

## Experience Layers

Overture features should have a clear home:

- **Perform:** play clips and notes, select tracks, mute/solo, record, use
  variations, and make immediate musical gestures.
- **Shape:** edit steps, pages, sound, motion, note FX, delay, clip behavior,
  and drum-lane behavior.
- **System:** routing, setup health, templates, export, diagnostics, global
  settings, and recovery.

Menus are for System work and deep settings. Perform and Shape actions should
prefer pads, steps, encoders, jog, Shift+Step, or hold-context gestures.

## Parameter Page Pattern

Parameter Pages are the core editing pattern. They should share one model and
rendering grammar wherever possible.

A Parameter Page should define:

- `title`: short page name;
- `context`: track, clip, drum lane, component, or module identity;
- `params`: up to eight visible encoder cells per page;
- `pageIndex` / `pageCount`: pagination when more than eight params exist;
- `touchedParam`: transient focused feedback for the last touched or turned
  encoder;
- `status`: short-lived success, warning, unavailable, or empty-state feedback;
- `altState`: whether alternate functions are available or active.

### OLED Layout

Default Parameter Page layout:

- top row: page title and context;
- middle: 4x2 encoder grid;
- right edge or footer: page position when paginated;
- footer: status, warning, browser hint, or selected target when useful.

Encoder cells should show compact label over compact value. If a value changes
or a knob is touched, prefer a focused parameter view over cramming more text
into the grid.

### Focused Parameter Feedback

When an encoder is touched or turned:

- show the affected parameter name in readable form;
- show the current value prominently;
- show range feedback when the parameter is continuous and a reliable min/max
  exists;
- show honest fallback states such as `No param`, `Unmapped`, `Read only`, or
  `No write`.

Focused feedback should be transient and should return to the page overview
without requiring an exit gesture.

### Input Grammar

Default Parameter Page controls:

- encoders edit the visible parameter cells;
- encoder touch or turn focuses feedback for that parameter;
- jog moves between Pages at the top level;
- jog moves between parameter sub-pages when already inside a paginated detail
  surface;
- jog click enters detail, confirms, or opens the browser only when that action
  is clearly tied to the selected object;
- Back exits transient/detail/browser states before leaving the broader musical
  context.

Shortcut access can exist for power users, but it should land on the same Page
or detail state as discoverable navigation.

## Sound Page Pattern

The Sound Page is the reference implementation for route-aware sound shaping.
It should converge with Parameter Pages rather than remain a separate UI island.

Sound Page responsibilities:

- show the active track and current sound component;
- use Steps 1-4, or an equivalent stable selector, for MIDI FX, Synth, FX 1,
  and FX 2;
- expose the component's mapped parameters through the shared Parameter Page
  grid;
- open browsers for module or preset selection only from an explicit action;
- delegate to Move native co-run or Schwung chain co-run when deep editing is
  required;
- return to the previous musical context cleanly.

The Sound Page should not be promoted into the top-level Page cycle until it can
behave like a native Parameter Page without slowing common sequencing and
performance edits.

## Browser Pattern

Browsers are temporary selection states, not top-level Pages.

A Browser should:

- name the object being selected;
- show the selected row with a clear cursor;
- keep list density low enough to read on the OLED;
- use jog turn for selection and jog click for commit;
- use Back to cancel and return to the invoking Page;
- show empty and unavailable states honestly.

Module, preset, file, and option browsers should share this behavior even when
their data sources differ.

## LED Language

LED meaning should be defined once and reused:

- track identity;
- active track;
- clip content, playing, queued, and empty;
- muted and soloed;
- recording and armed;
- motion present or recording;
- selected sound component;
- co-run active;
- setup warning or route problem.

Prefer fewer unmistakable states over many subtle colors or blink patterns.
Avoid writing the same LED from multiple paths in one tick.

## Implementation Direction

Current code still uses `bank` heavily. Do not churn names mechanically. Migrate
language when touching behavior for product or architectural reasons.

Refactors should preserve the shared type-checking path. `ui/types.d.ts` is the
ambient contract for the runtime `S` state bag and module `deps` shapes, and
`tsconfig.json` enables `allowJs`/`checkJs` for the modules listed in `include`.
When a Parameter Page refactor moves ownership of state, descriptors, or callback
bags, update that shared type surface or add the newly typed module to
`tsconfig.json` deliberately. Do not treat `.mjs` extraction as type-neutral:
the goal is for each small migration to leave the checked contract at least as
accurate as before.

Near-term convergence path:

1. Treat `ui_oled_layout.mjs` as the start of shared OLED primitives.
2. Extract a shared `ParamPage` model/render contract from Sound Page behavior.
3. Migrate one simple existing legacy bank/page to the shared contract.
4. Move repeated browser, status flash, and focused-param behavior into shared
   components when the second consumer appears.
5. Update docs and tests to call user-facing surfaces Pages, while preserving
   legacy `bank` identifiers where they name current code or DSP protocol.

First implementation anchor: `renderGenericParameterPageOverview()` now builds a
preformatted Parameter Page cell model and delegates grid drawing/highlighting
to `renderEncoderValueGrid()`. A thin legacy `renderGenericBankOverview()`
alias remains while older callers migrate. Specialized Parameter Page overviews
use explicit presentation models where they need sparse slots, so physical
encoder positions stay stable when a page has empty cells.

The old `ui/render/ui_bank_render.mjs` compatibility adapter was removed after
an import audit found no in-repo runtime callers. Parameter Page renderers now
live at `ui/render/ui_parameter_page_render.mjs`; legacy function names such as
`renderGenericBankOverview()` remain exported there where they are still useful
for callers that have not migrated to Page-oriented names.

## Open Decisions

- Which existing top-level legacy bank should be the first migrated Parameter
  Page?
- Should the visible OLED label change from AUTO to Motion immediately or only
  after the motion workflow is refactored?
- Should Sound Page become part of the top-level jog cycle, or remain a direct
  shortcut and contextual command?
- What is the minimum LED vocabulary needed for selected sound component and
  component browser states?
