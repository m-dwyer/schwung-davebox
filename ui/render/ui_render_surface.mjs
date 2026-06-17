/* Render Surface — the OLED drawing primitives plus the shared chrome helpers
 * and render-time param queries that every render module draws through.
 *
 * A render module reads only the subset it needs off the one surface
 * (`deps.print`, `deps.fill_rect`, `deps.drawBankHeading`, ...), so there is a
 * single seam between the host's drawing API and all rendering. Passing a
 * superset bag is safe because modules access by property, never by destructured
 * signature.
 *
 * This replaces the former per-render deps factories and their identity adapters
 * (one `create*RenderDeps()` in the composition root plus one
 * `create*RenderDepsImpl()` in `ui_render_adapters.mjs`, per render module). The
 * surface is assembled once at the composition root and handed wherever a bespoke
 * render bag used to be built. See CONTEXT.md → "Render Surface". */
export function createRenderSurface(deps) {
    return {
        /* host drawing primitives */
        print: deps.print,
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect,
        clear_screen: deps.clear_screen,
        /* shared chrome drawn on top of the primitives */
        drawBankHeading: deps.drawBankHeading,
        drawBankHeadingInverted: deps.drawBankHeadingInverted,
        drawAltArrow: deps.drawAltArrow,
        drawMenuHeader: deps.drawMenuHeader,
        drawMetroIndicator: deps.drawMetroIndicator,
        drawPositionBar: deps.drawPositionBar,
        /* bank / alt-param state queried while rendering */
        altIndicatorActive: deps.altIndicatorActive,
        bankHasAltParams: deps.bankHasAltParams,
        midiNoteName: deps.midiNoteName,
        /* optional host param read (null on stock Schwung) */
        host_module_get_param: deps.host_module_get_param,
    };
}
