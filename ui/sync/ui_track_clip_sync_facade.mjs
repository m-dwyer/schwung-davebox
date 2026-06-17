import { PAD_MODE_DRUM } from '../core/ui_constants.mjs';
import {
    readDrumRepeatRatesFromDsp,
    readTrackArpStepConfigFromDsp,
    readTrackConfigFromDsp,
    refreshDrumLaneBankParamsFromDsp,
    refreshPerClipBankParamsFromDsp,
    resyncDrumTrackImpl
} from './ui_clip_track_sync.mjs';
import {
    syncDrumClipContentImpl,
    syncDrumLaneStepsImpl,
    syncDrumLanesMetaImpl
} from '../drum/ui_drum_clip_sync.mjs';
import {
    refreshSeqNotesIfCurrentImpl,
    restoreUiSidecarImpl,
    syncClipsFromDspImpl,
    syncClipsTargetedImpl,
    syncMuteSoloFromDspImpl
} from './ui_clip_state_sync.mjs';

export function createTrackClipSyncFacade(S, deps) {
    function createDrumClipSyncDeps() {
        return {
            getParam: deps.optionalHostModuleGetParam()
        };
    }

    function syncDrumLaneSteps(track, lane) {
        return syncDrumLaneStepsImpl(S, createDrumClipSyncDeps(), track, lane);
    }

    function syncDrumLanesMeta(track) {
        return syncDrumLanesMetaImpl(S, createDrumClipSyncDeps(), track);
    }

    function syncDrumClipContent(track) {
        return syncDrumClipContentImpl(S, createDrumClipSyncDeps(), track);
    }

    function refreshDrumLaneBankParams(track, lane) {
        return refreshDrumLaneBankParamsFromDsp(S, {
            host_module_get_param: deps.optionalHostModuleGetParamUndefined(),
            TPS_VALUES: deps.TPS_VALUES
        }, track, lane);
    }

    function refreshPerClipBankParams(track) {
        return refreshPerClipBankParamsFromDsp(S, {
            host_module_get_param: deps.optionalHostModuleGetParamUndefined(),
            PAD_MODE_DRUM,
            TPS_VALUES: deps.TPS_VALUES
        }, track);
    }

    function readTarpStepVel(track) {
        return readTrackArpStepConfigFromDsp(S, {
            host_module_get_param: deps.optionalHostModuleGetParamUndefined()
        }, track);
    }

    function readDrumRepeatRates(track) {
        return readDrumRepeatRatesFromDsp(S, {
            host_module_get_param: deps.optionalHostModuleGetParamUndefined()
        }, track);
    }

    function readTrackConfig(track) {
        return readTrackConfigFromDsp(S, {
            host_module_get_param: deps.optionalHostModuleGetParamUndefined()
        }, track);
    }

    function createClipStateSyncDeps() {
        return {
            ...deps.createHostParamAdapters(),
            readFile: deps.optionalHostReadFile(),
            fileExists: deps.optionalHostFileExists(),
            setActiveDrumLane: deps.setActiveDrumLane,
            syncDrumClipContent,
            syncDrumLanesMeta,
            syncDrumLaneSteps,
            clipHasContent: deps.clipHasContent,
            readTrackConfig,
            readBankParams: deps.readBankParams,
            readTarpStepVel,
            readDrumRepeatRates,
            refreshPerClipBankParams,
            refreshDrumLaneBankParams
        };
    }

    function refreshSeqNotesIfCurrent(track, activeClip, absStep) {
        return refreshSeqNotesIfCurrentImpl(S, createClipStateSyncDeps(), track, activeClip, absStep);
    }

    function resyncDrumTrack(track) {
        return resyncDrumTrackImpl(S, createClipStateSyncDeps(), track);
    }

    function restoreUiSidecar(applyDefaultsNow) {
        return restoreUiSidecarImpl(S, createClipStateSyncDeps(), applyDefaultsNow);
    }

    function syncClipsFromDsp() {
        return syncClipsFromDspImpl(S, createClipStateSyncDeps());
    }

    function syncClipsTargeted(infoStr) {
        return syncClipsTargetedImpl(S, createClipStateSyncDeps(), infoStr);
    }

    function syncMuteSoloFromDsp() {
        return syncMuteSoloFromDspImpl(S, createClipStateSyncDeps());
    }

    return {
        createClipStateSyncDeps,
        createDrumClipSyncDeps,
        readDrumRepeatRates,
        readTarpStepVel,
        readTrackConfig,
        refreshSeqNotesIfCurrent,
        refreshDrumLaneBankParams,
        refreshPerClipBankParams,
        resyncDrumTrack,
        restoreUiSidecar,
        syncClipsFromDsp,
        syncClipsTargeted,
        syncDrumClipContent,
        syncDrumLaneSteps,
        syncDrumLanesMeta,
        syncMuteSoloFromDsp
    };
}
