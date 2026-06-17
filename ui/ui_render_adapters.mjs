export function createBankRenderDepsImpl(deps) {
    return {
        print: deps.print,
        fill_rect: deps.fill_rect,
        drawBankHeading: deps.drawBankHeading,
        drawBankHeadingInverted: deps.drawBankHeadingInverted,
        drawAltArrow: deps.drawAltArrow,
        altIndicatorActive: deps.altIndicatorActive,
        bankHasAltParams: deps.bankHasAltParams,
        midiNoteName: deps.midiNoteName
    };
}

export function createBankChromeRenderDepsImpl(deps) {
    return {
        print: deps.print,
        fill_rect: deps.fill_rect,
        altIndicatorActive: deps.altIndicatorActive,
        bankHasAltParams: deps.bankHasAltParams
    };
}

export function createMetroIndicatorRenderDepsImpl(deps) {
    return {
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect
    };
}

export function createSplashRenderDepsImpl(deps) {
    return {
        clear_screen: deps.clear_screen,
        fill_rect: deps.fill_rect
    };
}

export function createTrackIdleRenderDepsImpl(deps) {
    return {
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect,
        drawBankHeading: deps.drawBankHeading,
        drawBankHeadingInverted: deps.drawBankHeadingInverted,
        drawMetroIndicator: deps.drawMetroIndicator,
        drawPositionBar: deps.drawPositionBar,
    };
}

export function createSessionIdleRenderDepsImpl(deps) {
    return {
        print: deps.print,
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect,
        drawMetroIndicator: deps.drawMetroIndicator
    };
}

export function createSessionOverviewRenderDepsImpl(deps) {
    return {
        fill_rect: deps.fill_rect
    };
}

export function createPerfModeRenderDepsImpl(deps) {
    return {
        clear_screen: deps.clear_screen,
        print: deps.print,
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect
    };
}

export function createMotionIdleRenderDepsImpl(deps) {
    return {
        print: deps.print,
        fill_rect: deps.fill_rect,
        drawBankHeadingInverted: deps.drawBankHeadingInverted,
        host_module_get_param: deps.host_module_get_param
    };
}

export function createPopupRenderDepsImpl(deps) {
    return {
        print: deps.print,
        fill_rect: deps.fill_rect
    };
}

export function createPromptRenderDepsImpl(deps) {
    return {
        clear_screen: deps.clear_screen,
        fill_rect: deps.fill_rect,
        print: deps.print
    };
}

export function createModalRenderDepsImpl(deps) {
    return {
        clear_screen: deps.clear_screen,
        fill_rect: deps.fill_rect,
        print: deps.print,
        drawMenuHeader: deps.drawMenuHeader
    };
}

export function createLoopRenderDepsImpl(deps) {
    return {
        print: deps.print,
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect
    };
}

export function createStepEditRenderDepsImpl(deps) {
    return {
        print: deps.print,
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect
    };
}

export function createCcStepEditRenderDepsImpl(deps) {
    return {
        print: deps.print,
        pixelPrint: deps.pixelPrint,
        fill_rect: deps.fill_rect,
        host_module_get_param: deps.host_module_get_param
    };
}

export function createStepIntervalRenderDepsImpl(deps) {
    return {
        print: deps.print,
        fill_rect: deps.fill_rect,
        drawBankHeading: deps.drawBankHeading
    };
}
