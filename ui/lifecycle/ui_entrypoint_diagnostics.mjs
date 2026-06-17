import { optionalHostWriteFile } from '../sync/ui_sync_adapters.mjs';

export const ENTRYPOINT_ERROR_LOG_PATH = '/data/UserData/schwung/seq8-jserr.log';

/* Diagnostic wrapper for top-level Schwung callbacks. QuickJS swallows
 * uncaught entrypoint exceptions, so this records one line per (where|message)
 * and then lets the callback return normally. */
export function createEntrypointErrorWrapper(S) {
    let jsErrSeen = {};
    let jsErrBuf = '';

    function captureError(where, e) {
        try {
            const msg = (e && e.message) ? e.message : String(e);
            const key = where + '|' + msg;
            if (jsErrSeen[key]) return;
            jsErrSeen[key] = 1;
            const stack = (e && e.stack) ? ('\n' + e.stack) : '';
            jsErrBuf += '[tick=' + (S.tickCount | 0)
                      + ' sv=' + (S.sessionView ? 1 : 0)
                      + ' loop=' + (S.loopHeld ? 1 : 0)
                      + ' lock=' + (S.perfViewLocked ? 1 : 0)
                      + ' susp=' + (S.pendingSuspendSave ? 1 : 0)
                      + '] ' + where + ': ' + msg + stack + '\n\n';
            const writeFile = optionalHostWriteFile();
            if (writeFile) writeFile(ENTRYPOINT_ERROR_LOG_PATH, jsErrBuf);
        } catch (_e) { /* the logger must never throw */ }
    }

    function runEntrypoint(where, fn) {
        try {
            return fn();
        } catch (e) {
            captureError(where, e);
            return undefined;
        }
    }

    return {
        captureError,
        runEntrypoint
    };
}
