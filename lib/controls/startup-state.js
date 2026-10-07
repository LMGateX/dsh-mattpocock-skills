import { array, boolean, ControlsError, freeze, id, invalid, record, revision } from './validation.js';
export function parseStartupDesired(value) {
    const raw = record(value, 'startup desired', ['startupCwdEnabled']);
    return freeze({ startupCwdEnabled: boolean(raw.startupCwdEnabled, 'startupCwdEnabled') });
}
function nullableText(value, where) {
    if (value === null)
        return null;
    if (typeof value !== 'string')
        invalid(where + ' must be a string or null');
    return value;
}
export function parseStartupObservation(value) {
    const raw = record(value, 'startup observation', ['nativeInitialCwdSupported', 'preparation']);
    const prep = record(raw.preparation, 'startup preparation', ['status', 'sdkVersion', 'diagnostic', 'reason']);
    const statuses = ['ready', 'not-prepared', 'incompatible', 'failed', 'uncertain'];
    const status = statuses.find(status => status === prep.status);
    if (!status)
        invalid('unsupported startup preparation status');
    const reason = prep.reason;
    if (Object.hasOwn(prep, 'reason') && ((reason !== 'compatibility-component-disabled' && reason !== 'compatibility-component-forced-enabled') || status !== 'incompatible')) {
        invalid('unsupported startup preparation reason or reason/status combination');
    }
    return freeze({ nativeInitialCwdSupported: raw.nativeInitialCwdSupported === null ? null : boolean(raw.nativeInitialCwdSupported, 'nativeInitialCwdSupported'),
        preparation: { status, sdkVersion: nullableText(prep.sdkVersion, 'sdkVersion'), diagnostic: nullableText(prep.diagnostic, 'diagnostic'),
            ...(reason === 'compatibility-component-disabled' || reason === 'compatibility-component-forced-enabled' ? { reason } : {}) } });
}
/** Strict transport decoder. It validates JSON facts, not a second UI projection. */
export function parseStartupStatus(value) {
    const raw = record(value, 'startup status', ['revision', 'desired', 'boot', 'enabledNow', 'nativeInitialCwdSupported', 'preparation', 'restartNeeded', 'state']);
    const receipt = record(raw.boot, 'startup boot receipt', ['epoch', 'requested']);
    const observation = parseStartupObservation({ nativeInitialCwdSupported: raw.nativeInitialCwdSupported, preparation: raw.preparation });
    const states = ['disabled', 'enabled', 'pending-restart', 'needs-preparation', 'unsupported', 'incompatible', 'failed', 'uncertain'];
    const state = states.find(state => state === raw.state);
    if (!state)
        invalid('unsupported startup state');
    return freeze({ revision: revision(raw.revision, 'startup revision'), desired: parseStartupDesired(raw.desired),
        boot: { epoch: id(receipt.epoch, 'startup epoch'), requested: parseStartupDesired(receipt.requested) },
        enabledNow: raw.enabledNow === null ? null : boolean(raw.enabledNow, 'enabledNow'),
        ...observation, restartNeeded: boolean(raw.restartNeeded, 'restartNeeded'), state });
}
export function emptyStartupDocument() {
    return freeze({ schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: false }, bootReceipts: [] });
}
export function parseStartupDocument(value) {
    try {
        const raw = record(value, 'startup document', ['schemaVersion', 'revision', 'desired', 'bootReceipts']);
        if (raw.schemaVersion !== 1)
            invalid('unsupported startup schemaVersion');
        const bootReceipts = array(raw.bootReceipts, 'bootReceipts').map(value => {
            const receipt = record(value, 'startup boot receipt', ['epoch', 'requested']);
            return { epoch: id(receipt.epoch, 'startup epoch'), requested: parseStartupDesired(receipt.requested) };
        });
        if (new Set(bootReceipts.map(receipt => receipt.epoch)).size !== bootReceipts.length)
            invalid('duplicate startup epoch');
        return freeze({ schemaVersion: 1, revision: revision(raw.revision, 'startup revision'), desired: parseStartupDesired(raw.desired), bootReceipts });
    }
    catch (error) {
        if (error instanceof ControlsError && error.code === 'invalid-input')
            throw new ControlsError('invalid-state', error.message);
        throw error;
    }
}
