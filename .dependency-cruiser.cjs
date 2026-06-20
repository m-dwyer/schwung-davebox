/**
 * dependency-cruiser config — encodes ADR-0001 (deep modules by runtime concept)
 * and the CONTEXT.md layering as machine-checked ratchets.
 *
 * Severity convention (the ratchet): `error` rules hold TODAY and must never
 * regress — CI fails on them. `warn` rules are known debt with a finite, listed
 * count; the boy-scout job is to drive each warn count DOWN, then promote the
 * rule to `error` so it can't come back. Never silence a warn by loosening it;
 * fix the import.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'No import cycles. Cycles couple modules into an un-reasoned-about blob ' +
        'and break the deep-module boundaries ADR-0001 relies on.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment:
        'Imports must resolve — EXCEPT the on-device Schwung host path ' +
        '(/data/UserData/schwung/shared/*), which only exists on the Move and is ' +
        'remapped for tests in vitest.config.ts. Those are intentionally external.',
      from: {},
      to: { couldNotResolve: true, pathNot: '^/data/UserData/' },
    },
    {
      name: 'no-import-composition-root',
      severity: 'error',
      comment:
        'ui/ui.js is the imperative-shell composition root. It wires modules ' +
        'together and owns the host entrypoints; nothing may import IT. Depend on ' +
        'a concept module, or receive what you need as a dep.',
      from: { pathNot: 'ui/ui\\.js$' },
      to: { path: 'ui/ui\\.js$' },
    },
    {
      name: 'render-stays-presentational',
      severity: 'error',
      comment:
        'render/ draws through the one Render Surface and may read core/ only. It ' +
        'must NOT import workflow folders (input/view/perform/menu/drum/bank/sync/' +
        'persist/tick/corun/lifecycle) — presentation pulls no behaviour. (Green today.)',
      from: { path: '^ui/render/' },
      to: {
        path: '^ui/(input|view|perform|menu|drum|bank|sync|persist|tick|corun|lifecycle)/',
      },
    },
    {
      name: 'core-is-leaf',
      severity: 'error',
      comment:
        'core/ (state, constants, scene, routes) is a LEAF — concept folders depend ' +
        'on it, never the reverse. Promoted warn->error once the two back-edges were ' +
        'removed (SCALE_INTERVALS + drumVelZoneToVelocity moved pad->core; effectiveClip ' +
        'moved render->core/ui_state). A core/ import of any concept folder now fails CI.',
      from: { path: '^ui/core/' },
      to: {
        path: '^ui/(input|view|perform|menu|drum|bank|sync|render|persist|tick|corun|lifecycle|pad|midi)/',
      },
    },

    // --- Known debt: drive the count to 0, then promote to `error`. ---
    {
      name: 'host-globals-only-in-shell',
      severity: 'warn',
      comment:
        'Schwung host modules (/data/UserData/schwung/shared/*) should be imported ' +
        'only by the imperative shell (ui.js) and passed inward as deps. ~11 modules ' +
        'currently import them directly; drive that down, then make error.',
      from: { pathNot: 'ui/ui\\.js$' },
      to: { path: '^/data/UserData/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
