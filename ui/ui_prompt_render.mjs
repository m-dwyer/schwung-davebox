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
