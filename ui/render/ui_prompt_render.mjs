export function renderSceneBakePickerPrompt(deps) {
    deps.clear_screen();
    deps.print(4, 8,  'BAKE SCENE',         1);
    deps.print(4, 22, 'Tap row or scene step', 1);
    deps.print(4, 34, 'to pick destination',  1);
    deps.print(4, 50, 'Any other btn cancels', 1);
}

export function renderMergePlacementPrompt(deps) {
    deps.clear_screen();
    deps.print(4, 8,  'PLACE MERGED CLIPS',  1);
    deps.print(4, 22, 'Tap row or scene step', 1);
    deps.print(4, 34, 'to pick destination',  1);
    deps.print(4, 50, 'Capture cancels',      1);
}

export function renderCompressLimitNotice(deps) {
    deps.print(4, 10, '[CLIP       ]', 1);
    deps.print(4, 22, 'Beat Stretch', 1);
    deps.print(4, 34, 'COMPRESS LIMIT', 1);
}

export function renderNoNoteFlashNotice(deps) {
    deps.print(4, 22, 'NO NOTE', 1);
    deps.print(4, 34, 'Play a pad first', 1);
}

export function renderShiftStepHelp(deps) {
    deps.fill_rect(0, 0, 128, 9, 1);
    deps.print(4, 1, 'SHIFT SHORTCUTS', 0);
    deps.print(4, 12, 'S2 Global  S3 Edit', 1);
    deps.print(4, 22, 'S5 Tap     S6 Metro', 1);
    deps.print(4, 32, 'S7 Swing   S9 Scale', 1);
    deps.print(4, 42, 'S10 VelIn  S15 x2', 1);
    deps.print(4, 52, 'S16 Quant  S8 Mode', 1);
}
