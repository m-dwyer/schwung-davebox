export function handleUiCcMessage(deps, d1, d2) {
    deps.onJog(d1, d2);
    deps.onButtons(d1, d2);
    deps.onTransport(d1, d2);
    deps.onSide(d1, d2);
    deps.onStepEdit(d1, d2);
    deps.onKnobs(d1, d2);
}
