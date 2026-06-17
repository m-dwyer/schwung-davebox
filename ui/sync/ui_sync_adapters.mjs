export function optionalHostModuleGetParam() {
    return typeof host_module_get_param === 'function' ? host_module_get_param : null;
}

export function optionalHostModuleGetParamUndefined() {
    return typeof host_module_get_param === 'function' ? host_module_get_param : undefined;
}

export function optionalHostModuleSetParam() {
    return typeof host_module_set_param === 'function' ? host_module_set_param : null;
}

export function optionalHostReadFile() {
    return typeof host_read_file === 'function' ? host_read_file : null;
}

export function optionalHostWriteFile() {
    return typeof host_write_file === 'function' ? host_write_file : null;
}

export function optionalHostFileExists() {
    return typeof host_file_exists === 'function' ? host_file_exists : null;
}

export function hasShadowSetParam() {
    return typeof shadow_set_param === 'function';
}

export function createHostParamAdapters() {
    return {
        getParam: optionalHostModuleGetParam(),
        setParam: optionalHostModuleSetParam()
    };
}

export function createUiFlagAdapters() {
    return {
        clearFlags: typeof shadow_clear_ui_flags === 'function' ? shadow_clear_ui_flags : null,
        getFlagsFn: function () { return globalThis.shadow_get_ui_flags; },
        setFlagsFn: function (fn) { globalThis.shadow_get_ui_flags = fn; }
    };
}
