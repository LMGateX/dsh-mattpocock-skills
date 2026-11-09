window.__ModuleLoader__.load({id:"@lmgatex/dsh-mattpocock-skills",factory:function(require){
"use strict";const modules={"src/client-notification-sound-data.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_NOTIFICATION_SOUNDS = void 0;
/** Unmodified Freesound CC0 MP3 preview bytes, embedded for the closed browser bundle.
 * Source/license/hash and measured signal details: assets/notification-sounds/SOURCE.json.
 * Do not replace these author samples with synthesized approximations. */
exports.LOCAL_NOTIFICATION_SOUNDS = {
    "toast": {
        "base64": "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",
        "calibrationGain": 0.9363325323920169
    },
    "modal": {
        "base64": "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rGyBsp0qSOkm1LrXsgS4C1k6ikpSuz1EOIMQ0Zk2WyX75FCb////2uLmBKxkSSRtq1Kvjyy3+lESfZwsoYiMpjMt5M8uY0tLbpAaZ5pTDtyOZwU+zzvH/40L+xnga+gCd2AIQIUg5+QQNtJSIwq2ZBVKHqvK3f0f6D4ZFwycaUPHH2/8ov//r88szGm276szK7r/yoEV//zf//////+prt8pSJaPZWX/WrBE9cgHagT/tQL5//OUZAIQof1XL0VLrxEDvs5eAkoy3BAwRAV7/UPoTEpmKRYHsusTamQF0SbHTQvPnQ/E6WS+Ylw2K47CrZlLOgG4AGFwTlSU5G7aEpC3qTf/+r+QkpYenGoy0/RKt/yEKD//cq3/84m////ucWUVQGCYhOP46iwlj44jGxNOoltqcTUN47kg2tmuM8s91pGooyhVzw7//UoDa3RMAkYJW/oj/s4CMtrmzFoucUKOwIDO/r+gv//5fo////q0e6M7PXuidf/N//kA///f////6gx/2L//////ER7flQB3WKzBGziX//iMT0lyw3J1OYwQ//OEZBQN2ellfyjor47DHs5eAcoqXlbUBcLs6sp4lP9ACIFQLzBorGLvZzxC/r//+/o0fLmsc3tpZ0O/54j//5V3//r////zEUVgSEhlP+DQRSz7DhJH1N6VP/G06JpUvKClCgNACFBUXPsh4HT/WA3njIARMBWmJw0jHA2xWVq+JdA9//zP/6dr/f///xtz////+v/+ga///////85xQn8UMnyC/+q9kIBhAUU8gkiACP/U6hUgfYrUSy1zjzlq//OERBUKyd1VHyong5Vi+rJeW06yA2WPIG16ZtVWpIC+AtU1H+2pwWf5f//1+KLljT7epq35//U0RDv/5UUf/6P////6QmLfjY055rf//83zdGQIg2NA3mwDCKNKOf//AVD+4xME0nsMRqSKxG/Xaw5jRb0azM2qddIBJAkbX+mru/oR//+X0aRciWIPs8+m6Mn/lQ9//1PCU7/+Y/////0FLeEhUYXb/7VYiQJXaIUMgWf3S+s0WXrDAc8/KZr8//OEZBQNod1LGwHzHw9a+p46Ao445lp6QwBax1ntEtQ9SpMTVJxaQFaCCJ86tXumX8poj8r03//9fUtM0NSoeTu7prTWpSv/8dAhMi//1lweW//oIf////UWU/3U6mpqUpG3/qr291apwUYPO+gBS/QACOHVtgOmaLq/U86oYEzfQ3V0cifX/fQsY3qn//q3YVNOtMpT5+q/7Hh7f/0BFv//////6wqd///9KgJZrBBCjCnr/mRhkV8+rTZn2W1p//OEZBQNPd1TLwXtPw+DAqpeAU44r6qD79iNWTsSbGYysi/Hz24NWIpHc2d8/pH+hnUU28rNv//X8zc2PmCNv+rU/+onBuv/+gLIeLXf/yo3////+wOAbkFdkTKp1J6l2/+Xf9fUkVmT/yoH/9AIzB4EGxEdhQHvkeIeq6hAi/R9+GBEF5inmv7ZRx4t9v///UsYqo6f///MEP/+q///////9hUXb///1QJ98yxCzi7r/qHO6LCRMK3EmU9HwnEb//OEZBcNVY1VLx3qPxAK/rpeOktC6669vUn6zHmxv9e3/v+UwBbXK8C2K6prmk6/Ekkt//r8qew+QkMPc+RlESVmFrf9Rgn/1gPDpi//nHf/6zKXs59CouBcAjCAakNZaIV/9X7w879IAs1pZyAaTF/5bcNXRRUWgcyqwQ2xuaumj/QVqCQMGmychjHfscd////7bf///84U//8lv//////6DBIjv//+VQLdtjBEnylZ/mlUoI6Di/TrnFA7I5iv//N0ZBcMMQFRLwXqPxGS/ppaUM/CEUWdYlOXTS/fSXljT//O6D0k0VcyttCpBtnaFiV/Klv//kmqAoC0ThcCKJhgOiuOyRDixg/JDBiTEX/Iwof4SX+s7//hw7o///kwFHIkggBUf6NQqLDPMJxNPG5bOMLFlH4EIf7VVUo088GBVHq2RbfWVb////qXLOAJDjtKx8tSof/jb//Cc1v/5j/////kWQKJ//OERAIKHX9RLh0nPxVzvrJeUFWmoxDE11w/wt1BLFHNlXMG896g/9FqfLK22XfzuyjwUNtFOvGd5urDpfx3//6N1BwZNA0iYhgrIk2GhQuOmSbjT/Uwi//8iQ///////0YHygS3KJhyjFTX/VuFpbmpp1I7XFVmddCHtQjAuFkfHzltdjFZCACsZziBf///LBO4mc3js3/5F//U4///T///9bmoXEkTQ6SoeaklNRzUdk////9kF5MqAltwQhL///OERAYKzXs7HDXqdhVjAno6blUg6T5UG+k1E7UXfMn0+MK48XuPbOpIdPV7AZgBWTbe81x/6HZU6X6FRpb//OHERCUKclKEIhjyNTx4eUW7sa23+whwChi//uLtP/VDv////QfABayQQBk/9srJRNqZk041pWqgsJsao0mW5PvY0NLbrL5F8QaTz3Sl8+k1i3lH//9Wo8fhYYgHaKy7mrqhyt/zwbS7//YQohnt/8m/////PCUTf///JQHdayxH//OERAUKuX9LLjRH0xWjAp5eaxqSDWw/10VDHAbQ/1oifmaxUbcv3rDumZMii1J/mIgwQIwQ/npo7poKNMxLSc/cTcRKX//X4sc4IBkHYi3tKmcn/EUBxb/+EAit//Q3////zYUYCXWRQNw5KB/5w9mIZCjme3Fran2v7vvcHftDHF2ututZwFmFkanmZNXdLqH1vJJSv//bytnKBcpzFmUedaldlf6aJmf//m5cb/+p/////jGLpq////oVAk2t//OEZAMKiYFPLwWKNxV6+p5ealXDMEbeZoH+S2BakiZw5j4rosZZOaTwXC44xAln16iYLZo/Hp7H2efyx/45//6lkmoPXGgX8iOITJipfRqm/5xMAcp3/5jf/////10ZFQUBTkhyAKLrCxXFwaB/j70REGhuZqND8YyFaR3yQUuq7L+tQVoU6ymZrWZGqNS1WNCQbx/GQpv/9b61D+6jQgows1OC0YdvEpJTZ/81v/55n//////0zwYCir2qAFzs//OURAMKwX83HAFzLBlrCopeE9R/goDvhojEkr+VHZidmZKnMtQAoDDTh/nWKtFzqJeA1yFLJqTWi3csWMCZJy3MSW//9D0CPNVEoVzY1Ukm7rUnotUr/uLWW//1lcm2//r/////c6oCSyxQRE0ygf4Z+UnTbr7VOYxfVVvFF6SDBemBEY1hyvSCit//4oHCJohrW/q/l24bZGOlif0f//0bqVPc4dKokxJ9Wqp03/QnC8//QYAfCnHSrP/xkcNX//++vOmCsPwAAmmkasUAOWQsUt4sP+/DZkRRKqMTzMjxfwSZxXt41fVq/+viUqRG//OERCIKxYFHLinndxgS/oZeO9q3CCD1qI7JurWvbuOfQCqf/9TloaKyYnGoqHxwePJOjqyohyOQ/7En//KoQf/+av////okswDckigZRqlA/1fNDjlq1WyejvUDrq0/ZBYjaNJkl3Fba2+P+xibDjQliextRvbS0T8/6kv//t1pn5vWtFkUu13f/6CAOo87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",
        "calibrationGain": 1.1427772514289667
    },
    "popup": {
        "base64": "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",
        "calibrationGain": 0.6999694199268901
    },
    "bubble": {
        "base64": "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",
        "calibrationGain": 0.5864024482883345
    }
};

},
"src/client-notification-sounds.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.localNotificationSoundFactory = localNotificationSoundFactory;
const client_notification_sound_data_js_1 = require("./client-notification-sound-data.js");
/** One browser port owns unlock state and serializes samples across mounted sessions.
 * No network, timers, DOM, or AudioContext construction at module evaluation. */
function localNotificationSoundFactory(Audio) {
    let unlocked = false;
    let activeStop;
    return (choice = 'toast', gesture = false) => {
        activeStop?.();
        const context = new Audio();
        const nodes = new Set();
        let stopped = false, started = false;
        const stop = () => {
            if (stopped)
                return;
            stopped = true;
            for (const { source, gain } of nodes) {
                source.onended = null;
                try {
                    source.stop();
                }
                catch { /* already ended */ }
                source.disconnect();
                gain.disconnect();
            }
            nodes.clear();
            if (activeStop === stop)
                activeStop = undefined;
            void context.close().catch(() => { });
        };
        activeStop = stop;
        return { state: () => context.state, stop,
            start: async (seconds, volume) => {
                if (started || stopped)
                    return;
                started = true;
                try {
                    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60 || !Number.isFinite(volume) || volume < 0 || volume > 100)
                        throw new Error('无效声音预算或音量');
                    if (volume === 0) {
                        stop();
                        return;
                    }
                    if (!gesture && !unlocked)
                        throw new Error('请显式试听以解锁声音');
                    // resume() must be invoked synchronously in the explicit gesture, before decoding.
                    if (gesture && context.state === 'suspended')
                        await context.resume();
                    if (stopped)
                        return;
                    if (context.state !== 'running')
                        throw new Error('声音被浏览器挂起，请显式试听');
                    if (gesture)
                        unlocked = true;
                    const sample = client_notification_sound_data_js_1.LOCAL_NOTIFICATION_SOUNDS[choice];
                    if (!sample)
                        throw new Error('未知铃声');
                    const bytes = Uint8Array.from(atob(sample.base64), char => char.charCodeAt(0));
                    const buffer = await context.decodeAudioData(bytes.buffer);
                    // Stops during resume/decode are terminal, including scope loss and a newer preview.
                    if (stopped)
                        return;
                    if (context.state !== 'running' || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 2)
                        throw new Error('声音解码或浏览器状态无效');
                    const begin = context.currentTime, end = begin + seconds;
                    const level = volume / 100 * sample.calibrationGain;
                    // Fixed half-second silence between motifs. No loop/time-stretch/overlap.
                    for (let at = begin, count = 0; at < end && count < 128; at += buffer.duration + 0.5, count++) {
                        const until = Math.min(at + buffer.duration, end);
                        if (until - at < 0.03)
                            break;
                        const source = context.createBufferSource(), gain = context.createGain();
                        const node = { source, gain };
                        nodes.add(node);
                        source.buffer = buffer;
                        source.connect(gain);
                        gain.connect(context.destination);
                        gain.gain.setValueAtTime(0, at);
                        gain.gain.linearRampToValueAtTime(level, at + 0.008);
                        gain.gain.setValueAtTime(level, Math.max(at + 0.008, until - 0.02));
                        gain.gain.linearRampToValueAtTime(0, until);
                        source.onended = () => { source.disconnect(); gain.disconnect(); nodes.delete(node); if (!nodes.size)
                            stop(); };
                        source.start(at);
                        source.stop(until);
                    }
                    if (!nodes.size)
                        stop();
                }
                catch (error) {
                    stop();
                    throw error;
                }
            },
        };
    };
}

},
"src/client-notifications.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MountedNotificationDelivery = exports.BrowserNotificationCenter = exports.DecisionEpisodeTracker = exports.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES = exports.NOTIFICATION_LEDGER_LIMIT = exports.NOTIFICATION_LEDGER_KEY = exports.NOTIFICATION_PREFS_KEY = void 0;
exports.parseBrowserNotificationPreferences = parseBrowserNotificationPreferences;
exports.notificationScope = notificationScope;
exports.createBrowserNotificationPorts = createBrowserNotificationPorts;
exports.BrowserNotificationPreferencesPanel = BrowserNotificationPreferencesPanel;
exports.DecisionNotifications = DecisionNotifications;
const react_1 = require("react");
const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
const client_notification_sounds_js_1 = require("./client-notification-sounds.js");
/** Browser-only private module. No imports of Host/runtime and no work at module load. */
exports.NOTIFICATION_PREFS_KEY = '@lmgatex/mattpocock:browser-notifications:v1';
exports.NOTIFICATION_LEDGER_KEY = '@lmgatex/mattpocock:notification-attempts:v1';
const LOCK_NAME = '@lmgatex/mattpocock:notification-claim:v1';
exports.NOTIFICATION_LEDGER_LIMIT = 256;
const LEDGER_TTL = 24 * 60 * 60 * 1000;
exports.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES = Object.freeze({ sound: false, soundChoice: 'toast', soundSeconds: 5, volume: 50, toast: true, toastSeconds: 8, desktop: false });
function integer(value, min, max) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }
function parseBrowserNotificationPreferences(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('提醒设置格式无效');
    const p = raw;
    if (Object.keys(p).some(key => !['sound', 'soundChoice', 'soundSeconds', 'volume', 'toast', 'toastSeconds', 'desktop'].includes(key)) || ('soundChoice' in p && !['toast', 'modal', 'popup', 'bubble'].includes(p.soundChoice)) || typeof p.sound !== 'boolean' || typeof p.toast !== 'boolean' || typeof p.desktop !== 'boolean' || !integer(p.soundSeconds, 1, 60) || !integer(p.volume, 0, 100) || !integer(p.toastSeconds, 0, 60))
        throw new Error('声长须为 1–60 秒，音量 0–100，页面通知时长 0–60 秒（整数）');
    return Object.freeze({ sound: p.sound, soundChoice: (p.soundChoice ?? 'toast'), soundSeconds: p.soundSeconds, volume: p.volume, toast: p.toast, toastSeconds: p.toastSeconds, desktop: p.desktop });
}
const pendingUser = (value) => value.pending === true && value.addressee?.kind === 'user';
const rowKey = (row) => JSON.stringify([row.workflowId, row.decisionId]);
const notificationIdentity = (view) => JSON.stringify([view.caller.kind, view.caller.principalId, view.caller.sessionId, view.instance.instrumentInstanceId, view.instance.ownerSessionId, view.instance.controlWorkspaceId]);
/** Actual authenticated caller/instance only; neither policy display nor business text is identity. */
function notificationScope(view) {
    const r = view.records, i = view.instance, c = view.caller;
    if (!r || !Array.isArray(r.decisions) || !Array.isArray(r.changes) || !r.scope || (r.scope.kind !== 'coordinator' && (r.scope.kind !== 'assigned' || !Array.isArray(r.scope.ticketIds))) || !view.policyGrants || !integer(view.policyGrants.revision, 0, Number.MAX_SAFE_INTEGER))
        return null;
    if (!i || !r.instance || !c || (c.kind === 'user' ? c.sessionId !== null : c.kind !== 'agent' || c.sessionId !== view.sessionId) || !c.principalId || !i.instrumentInstanceId || !i.ownerSessionId || !i.controlWorkspaceId || r.instance.instrumentInstanceId !== i.instrumentInstanceId || r.instance.ownerSessionId !== i.ownerSessionId || r.instance.controlWorkspaceId !== i.controlWorkspaceId || !integer(r.revision, 0, Number.MAX_SAFE_INTEGER))
        return null;
    return JSON.stringify([view.sessionId, c.kind, c.principalId, c.sessionId, i.instrumentInstanceId, i.ownerSessionId, i.controlWorkspaceId,
        r.scope.kind === 'coordinator' ? ['coordinator'] : ['assigned', r.scope.workflowId, [...r.scope.ticketIds].sort()],
        view.policyGrants.revision]);
}
/** Fold from the last confirmed source DOCUMENT revision, never businessRevision or current row revision.
 * Unknown does not become an empty set. Rebaseline when continuity cannot be established. */
class DecisionEpisodeTracker {
    scope = null;
    revision = 0;
    rows = new Map();
    current = false;
    isCurrent(episode) { const row = this.rows.get(rowKey(episode)); return this.current && episode.scope === this.scope && row?.pending === true && row.entry === episode.entryRevision; }
    update(view) {
        const scope = view && notificationScope(view), r = view?.records;
        if (!scope || !r || !r.decisions.every(row => row && typeof row.workflowId === 'string' && typeof row.decisionId === 'string' && row.value && integer(row.revision, 0, r.revision) && Array.isArray(row.history) && row.history.every(change => change && change.value && integer(change.revision, 0, row.revision))) || new Set(r.decisions.map(rowKey)).size !== r.decisions.length) {
            this.current = false;
            return { episodes: [], pendingCount: null, diagnostic: '读取或授权未知；未当作零项，暂停提醒' };
        }
        const pendingCount = r.decisions.filter(row => pendingUser(row.value)).length;
        const baseline = (diagnostic) => {
            this.scope = scope;
            this.revision = r.revision;
            this.current = true;
            this.rows = new Map(r.decisions.map(row => [rowKey(row), { pending: pendingUser(row.value), version: row.revision, entry: null }]));
            return { episodes: [], pendingCount, diagnostic };
        };
        if (this.scope !== scope)
            return baseline(this.scope === null ? '初见积压 ' + pendingCount + ' 项；仅建立基线，不逐条补响' : 'Session、实例或授权范围已变化；重新建立基线，不补响旧事项');
        if (r.revision < this.revision)
            return baseline('源修订回退；连续性未知，重新建立基线');
        if (r.historyCoverage?.purged && r.historyCoverage.checkpointRevision > this.revision)
            return baseline('历史已清理且 checkpoint 跨过观察基线；无法证明阶段连续，重新建立基线');
        // Assigned snapshots filter EVERY historical version by authorization. A gap in the
        // document event sequence could hide an unauthorized transition, not just an idle tick.
        if (r.scope.kind === 'assigned' && r.revision > this.revision) {
            const revisions = new Set(r.changes.filter(e => e.revision > this.revision).map(e => e.revision));
            if (revisions.size !== r.revision - this.revision)
                return baseline('授权历史可能缺版本；无法证明连续，重新建立基线');
        }
        const episodes = [], next = new Map();
        let incomplete = false;
        for (const row of r.decisions) {
            const key = rowKey(row), old = this.rows.get(key), changes = row.history.filter(change => change.revision > this.revision).sort((a, b) => a.revision - b.revision);
            // A newly visible assigned row is NOT proof of creation; its first true may
            // be a ticket-scope update to a previously unauthorized pending decision.
            let pending = old?.pending ?? (r.scope.kind === 'coordinator' && !row.history.some(change => change.revision <= this.revision) ? false : null);
            let entry = old?.entry ?? null;
            const anchor = row.history.find(change => change.revision === old?.version);
            const valid = row.revision <= this.revision ? !!old && old.version === row.revision :
                changes.length > 0 && changes[changes.length - 1].revision === row.revision && (!old || !!anchor && pendingUser(anchor.value) === old.pending || !!r.historyCoverage && r.historyCoverage.checkpointRevision <= this.revision);
            if (!valid) {
                incomplete = true;
                next.set(key, { pending: pendingUser(row.value), version: row.revision, entry: null });
                continue;
            }
            for (const change of changes) {
                const p = pendingUser(change.value);
                if (pending === null && p)
                    incomplete = true;
                if (p && pending === false)
                    entry = change.revision;
                if (!p)
                    entry = null;
                pending = p;
            }
            if (pending !== pendingUser(row.value)) {
                incomplete = true;
                entry = null;
            }
            next.set(key, { pending: pendingUser(row.value), version: row.revision, entry });
            if (pendingUser(row.value) && entry !== null && entry > this.revision)
                episodes.push({ id: JSON.stringify([notificationIdentity(view), row.workflowId, row.decisionId, entry]), scope, workflowId: row.workflowId, decisionId: row.decisionId, entryRevision: entry, pendingCount });
        }
        this.rows = next;
        this.revision = r.revision;
        this.current = true;
        return { episodes, pendingCount, diagnostic: incomplete ? '部分事项历史不足；仅对可证明的新阶段提醒，其余重新建立基线' : '仅覆盖已挂载会话；当前授权历史已核验，后台可能节流' };
    }
}
exports.DecisionEpisodeTracker = DecisionEpisodeTracker;
/** Called lazily on mounting, not during module evaluation. No permission prompts here. */
function createBrowserNotificationPorts() {
    const w = typeof window === 'undefined' ? undefined : window;
    let storage;
    try {
        storage = w?.localStorage;
    }
    catch { /* denied storage is diagnosed below */ }
    const notification = w?.Notification, audio = w?.AudioContext;
    const locks = w?.navigator?.locks;
    return {
        ...(storage ? { storage } : {}),
        ...(locks ? { withLock: async (name, operation) => await locks.request(name, operation) } : {}),
        ...(w && typeof w.addEventListener === 'function' && typeof w.removeEventListener === 'function' ? { onStorage: (listener) => { const handler = (event) => { if (event.key === exports.NOTIFICATION_PREFS_KEY || event.key === null)
                listener(); }; w.addEventListener('storage', handler); return () => w.removeEventListener('storage', handler); } } : {}),
        capabilities: () => ({ secure: w?.isSecureContext === true, audio: !!audio, desktop: notification ? notification.permission : 'unsupported', hidden: w?.document?.visibilityState === 'hidden' }),
        ...(audio ? { createSound: (0, client_notification_sounds_js_1.localNotificationSoundFactory)(audio) } : {}),
        ...(notification ? { requestDesktopPermission: () => notification.requestPermission(), showDesktop: (title, body, onClick) => { const notice = new notification(title, { body }); notice.onclick = onClick; return { close: () => { notice.onclick = null; notice.close(); } }; } } : {}),
        now: () => Date.now(), later: (callback, ms) => setTimeout(callback, ms), cancel: handle => clearTimeout(handle),
    };
}
/** Shared preferences/BOUNDED attempt ledger only. It owns no Session observers or polling. */
class BrowserNotificationCenter {
    ports;
    state;
    listeners = new Set();
    stopStorage;
    memory = [];
    soundStops = new Set();
    registerSoundStop(stop) { this.soundStops.add(stop); return () => { this.soundStops.delete(stop); }; }
    stopAllSounds() { for (const stop of this.soundStops)
        stop(); this.report('已停止本浏览器当前铃声；未改变业务或已读状态'); }
    constructor(ports) {
        this.ports = ports;
        this.state = { preferences: exports.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES, storage: '仅本浏览器同源环境；不跨设备同步', delivery: '开关不是送达证明', coordination: ports.withLock && ports.storage ? 'Web Locks + 有界本地去重；仅协调尝试，不承诺送达 exactly-once' : '跨标签 best-effort：缺少 Web Locks 或持久存储，可能重复', capabilities: ports.capabilities() };
        this.load();
    }
    getSnapshot = () => this.state;
    subscribe = (listener) => {
        this.listeners.add(listener);
        if (this.listeners.size === 1)
            this.stopStorage = this.ports.onStorage?.(() => this.load());
        return () => { this.listeners.delete(listener); if (!this.listeners.size) {
            this.stopStorage?.();
            this.stopStorage = undefined;
        } };
    };
    patch(patch) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners)
        listener(); }
    report(delivery) { this.patch({ delivery, capabilities: this.ports.capabilities() }); }
    load() {
        try {
            if (!this.ports.storage)
                throw new Error('不可用');
            const raw = this.ports.storage.getItem(exports.NOTIFICATION_PREFS_KEY);
            this.patch({ preferences: raw === null ? exports.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES : parseBrowserNotificationPreferences(JSON.parse(raw)), storage: '设置仅保存在本浏览器同源环境；不跨设备同步' });
        }
        catch {
            this.patch({ preferences: exports.DEFAULT_BROWSER_NOTIFICATION_PREFERENCES, storage: '存储损坏或不可用；使用非持久安全初值，尚未保存' });
        }
    }
    save(raw) {
        const preferences = parseBrowserNotificationPreferences(raw);
        try {
            if (!this.ports.storage)
                throw new Error('不可用');
            this.ports.storage.setItem(exports.NOTIFICATION_PREFS_KEY, JSON.stringify(preferences));
            this.patch({ preferences, storage: '已保存到本浏览器同源环境（不跨设备同步）' });
            return true;
        }
        catch {
            this.patch({ preferences, storage: '保存失败；当前设置仅内存生效，刷新可能丢失', coordination: '持久存储不可用；跨标签 best-effort，可能重复' });
            return false;
        }
    }
    /** Call ONLY in the explicit permission button handler; mount/save/delivery never call it. */
    async requestDesktopPermission() {
        if (!this.ports.capabilities().secure || !this.ports.requestDesktopPermission) {
            this.report('桌面通知不可用：需安全环境与浏览器支持');
            return;
        }
        try {
            const permission = await this.ports.requestDesktopPermission();
            this.report('桌面通知权限：' + permission + '；权限不代表已送达');
        }
        catch {
            this.report('桌面通知权限请求失败或被拒绝');
        }
    }
    async claim(id, current) {
        const operation = async () => {
            if (!current())
                return false;
            const now = this.ports.now(), fresh = (rows) => rows.filter(row => row.at <= now && now - row.at < LEDGER_TTL).slice(-exports.NOTIFICATION_LEDGER_LIMIT);
            this.memory = fresh(this.memory);
            let persisted = [];
            try {
                if (!this.ports.storage)
                    throw new Error('storage unavailable');
                const raw = this.ports.storage.getItem(exports.NOTIFICATION_LEDGER_KEY);
                if (raw !== null) {
                    const parsed = JSON.parse(raw);
                    if (!Array.isArray(parsed) || parsed.length > exports.NOTIFICATION_LEDGER_LIMIT || !parsed.every(row => row && typeof row.id === 'string' && row.id.length <= 4096 && integer(row.at, 0, Number.MAX_SAFE_INTEGER)))
                        throw new Error('invalid attempt ledger');
                    persisted = fresh(parsed);
                }
            }
            catch {
                this.patch({ coordination: '去重存储损坏或不可用；仅内存 best-effort，跨标签可能重复' });
            }
            if (this.memory.some(row => row.id === id) || persisted.some(row => row.id === id))
                return false;
            const entry = { id, at: now };
            this.memory = [...this.memory, entry].slice(-exports.NOTIFICATION_LEDGER_LIMIT);
            try {
                if (!this.ports.storage || id.length > 4096)
                    throw new Error('storage unavailable');
                this.ports.storage.setItem(exports.NOTIFICATION_LEDGER_KEY, JSON.stringify([...persisted, entry].slice(-exports.NOTIFICATION_LEDGER_LIMIT)));
            }
            catch {
                this.patch({ coordination: '去重保存失败；仅内存 best-effort，跨标签可能重复' });
            }
            return true;
        };
        if (this.ports.withLock) {
            try {
                return await this.ports.withLock(LOCK_NAME, operation);
            }
            catch {
                this.patch({ coordination: 'Web Locks 失败；退化为 best-effort，跨标签可能重复' });
            }
        }
        return operation();
    }
}
exports.BrowserNotificationCenter = BrowserNotificationCenter;
let browserCenter;
function defaultCenter() { return browserCenter ??= new BrowserNotificationCenter(createBrowserNotificationPorts()); }
/** One mounted owner of transient audio/OS notices. Nothing writes business/read/hidden state. */
class MountedNotificationDelivery {
    center;
    sound;
    soundTimer;
    desktops = new Map();
    soundCurrent;
    disposed = false;
    constructor(center) {
        this.center = center;
    }
    releaseSoundStop;
    isActive() { return !this.disposed; }
    mount() { this.disposed = false; this.releaseSoundStop ??= this.center.registerSoundStop(this.stopSound); }
    reconcile() {
        if (this.soundCurrent && !this.soundCurrent())
            this.stopSound();
        for (const [notice, current] of this.desktops)
            if (!current()) {
                notice.close();
                this.desktops.delete(notice);
            }
    }
    applyPreferences() { const p = this.center.getSnapshot().preferences; if (!p.sound)
        this.stopSound(); if (!p.desktop)
        this.closeDesktops(); }
    stopSound = () => { if (this.soundTimer !== undefined)
        this.center.ports.cancel(this.soundTimer); this.soundTimer = undefined; this.sound?.stop(); this.sound = undefined; this.soundCurrent = undefined; };
    closeDesktops() { for (const notice of this.desktops.keys())
        notice.close(); this.desktops.clear(); }
    clear() { this.stopSound(); this.closeDesktops(); }
    preview(preferences = this.center.getSnapshot().preferences, gesture = true) {
        this.stopSound();
        if (this.disposed)
            return;
        this.releaseSoundStop ??= this.center.registerSoundStop(this.stopSound);
        const ports = this.center.ports;
        if (!ports.createSound) {
            this.center.report('声音不可用：浏览器不支持 AudioContext');
            return;
        }
        try {
            const sound = ports.createSound(preferences.soundChoice, gesture);
            this.sound = sound;
            this.soundTimer = ports.later(() => this.stopSound(), preferences.soundSeconds * 1000);
            const playing = sound.start(preferences.soundSeconds, preferences.volume);
            this.center.report(preferences.volume === 0 ? '音量为 0；本次静音，不解锁或播放声音' : sound.state() === 'running' ? '声音已启动；浏览器/操作系统 静音仍可能阻止听见' : '声音被挂起或自动播放受限；请显式试听，后台也可能节流');
            void playing.then(() => { if (this.sound === sound && !this.disposed)
                this.center.report(preferences.volume === 0 ? '音量为 0；本次静音，不解锁或播放声音' : sound.state() === 'running' ? '声音已启动；不代表用户已听见' : '声音仍被挂起或不可用'); }, () => { if (this.sound === sound) {
                this.stopSound();
                this.center.report('声音启动失败或自动播放被拒绝');
            } });
        }
        catch {
            this.stopSound();
            this.center.report('声音启动失败或浏览器拒绝');
        }
    }
    async deliver(episode, current, onOpen) {
        const valid = () => !this.disposed && current();
        const p = this.center.getSnapshot().preferences;
        if (!valid() || !p.sound && !p.toast && !p.desktop || !await this.center.claim(episode.id, valid) || !valid())
            return false;
        const preferences = this.center.getSnapshot().preferences;
        if (preferences.sound) {
            this.preview(preferences, false);
            this.soundCurrent = valid;
        }
        if (preferences.desktop) {
            const ports = this.center.ports, capabilities = ports.capabilities();
            if (!capabilities.secure || capabilities.desktop !== 'granted' || !ports.showDesktop)
                this.center.report('桌面通知未发送：需显式授权、安全环境与浏览器支持');
            else
                try {
                    const notice = ports.showDesktop('DSH 待你裁决', '检测时授权会话有 ' + episode.pendingCount + ' 项待用户裁决。请回到页面查看。', () => { if (valid())
                        onOpen(); });
                    this.desktops.set(notice, valid);
                    // Bound browser handles even when the OS retains the visible notification longer.
                    if (this.desktops.size > 8) {
                        const first = this.desktops.keys().next().value;
                        first.close();
                        this.desktops.delete(first);
                    }
                    this.center.report('已尝试桌面通知；实际呈现/时长由浏览器和 OS 控制');
                }
                catch {
                    this.center.report('桌面通知构造失败；未确认送达');
                }
        }
        return preferences.toast;
    }
    dispose() { if (this.disposed)
        return; this.disposed = true; this.releaseSoundStop?.(); this.releaseSoundStop = undefined; this.clear(); }
}
exports.MountedNotificationDelivery = MountedNotificationDelivery;
function BrowserNotificationPreferencesPanel(props = {}) {
    const center = (0, react_1.useMemo)(() => props.center ?? defaultCenter(), [props.center]);
    const saved = (0, react_1.useSyncExternalStore)(center.subscribe, center.getSnapshot, center.getSnapshot);
    const [draft, setDraft] = (0, react_1.useState)(saved.preferences);
    const [message, setMessage] = (0, react_1.useState)('个人提醒独立保存，不修改协作策略或所有者通知配置');
    const preview = (0, react_1.useMemo)(() => new MountedNotificationDelivery(center), [center]);
    (0, react_1.useEffect)(() => { preview.mount(); return () => preview.dispose(); }, [preview]);
    const accent = 'var(--dsw-alias-state-business-primary, #4176e6)';
    const accentText = 'color-mix(in srgb, ' + accent + ' 85%, var(--dsw-alias-label-primary, CanvasText))';
    const description = { margin: 0, color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: 1.6 };
    const channel = { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, margin: 0, padding: '16px 20px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-1)' };
    const legend = { padding: '0 6px', fontSize: 15, fontWeight: 650, color: accentText };
    const actions = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 };
    const number = (key, label, min, max) => (0, react_1.createElement)('label', { style: { display: 'grid', gap: 6, width: '16rem', maxWidth: '100%', minWidth: 0, fontSize: 13 } }, label, (0, react_1.createElement)(dsh_client_ui_primitives_1.Input, { 'aria-label': label, type: 'number', min, max, step: 1, value: Number.isNaN(draft[key]) ? '' : draft[key], onChange: (event) => setDraft({ ...draft, [key]: event.target.value === '' ? NaN : Number(event.target.value) }) }));
    const caps = saved.capabilities;
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved.preferences);
    const draftColor = 'color-mix(in srgb, var(--dsw-alias-state-warn-label, #dd8629) 65%, var(--dsw-alias-label-primary, CanvasText))';
    // A later edit supersedes old success feedback, but never hides an error.
    const feedback = dirty && (message === '本浏览器提醒已独立保存' || message === '已恢复当前本浏览器设置') ? '提醒草稿尚未保存' : message;
    return (0, react_1.createElement)('section', { 'aria-label': '本浏览器提醒', style: { display: 'grid', gap: 16, minWidth: 0, color: 'var(--dsw-alias-label-primary)', overflowWrap: 'anywhere' } }, (0, react_1.createElement)('header', { style: { display: 'grid', gap: 8 } }, (0, react_1.createElement)('h3', { style: { margin: 0, paddingLeft: 10, borderLeft: '3px solid ' + accent, color: accentText, fontSize: 18, fontWeight: 650 } }, '本浏览器提醒'), (0, react_1.createElement)('p', { style: description }, '仅当前同源浏览器环境保存，不承诺账号隔离、跨设备同步。只覆盖宿主仍挂载的会话（包括保留挂载的后台标签）；未打开、取消挂载或关闭网页不覆盖。与所有显示位置开关无关。')), (0, react_1.createElement)('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'start', gap: 16, minWidth: 0 } }, (0, react_1.createElement)('fieldset', { style: channel }, (0, react_1.createElement)('legend', { style: legend }, '声音提醒'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Checkbox, { label: '声音通知', checked: draft.sound, onChange: sound => setDraft({ ...draft, sound }) }), (0, react_1.createElement)('p', { style: description }, '本地 CC0 作者音频；时长是含静音间隔的提醒预算，不拉伸或叠音。请显式试听解锁声音，浏览器/OS 仍可能静音或节流。'), (0, react_1.createElement)('label', { style: { display: 'grid', gap: 6, maxWidth: '100%', fontSize: 13 } }, '铃声选择', (0, react_1.createElement)('select', { 'aria-label': '铃声选择', value: draft.soundChoice, style: { maxWidth: '100%', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: 8 }, onChange: (event) => { preview.stopSound(); setDraft({ ...draft, soundChoice: event.target.value }); } }, ...[['toast', '三音上行 · Toast（默认）'], ['modal', '五度双音 · Modal'], ['popup', '上滑音 · Pop-up'], ['bubble', '八度上滑 · Bubble']].map(([key, label]) => (0, react_1.createElement)('option', { key, value: key }, label)))), (0, react_1.createElement)('div', { style: { ...actions, alignItems: 'flex-start', gap: 16 } }, (0, react_1.createElement)('div', { style: { display: 'grid', gap: 8, minWidth: 0, maxWidth: '100%' } }, number('soundSeconds', '铃声持续秒数', 1, 60), (0, react_1.createElement)('div', { style: actions }, ...[3, 5, 10, 30].map(soundSeconds => (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { key: soundSeconds, type: 'button', variant: 'outline', size: 'sm', onClick: () => setDraft({ ...draft, soundSeconds }) }, soundSeconds + ' 秒')))), number('volume', '音量百分比', 0, 100)), (0, react_1.createElement)('p', { role: 'status', 'aria-label': '声音状态', style: description }, saved.delivery), (0, react_1.createElement)('div', { style: actions }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'outline', onClick: () => { try {
            preview.preview(parseBrowserNotificationPreferences(draft));
        }
        catch (error) {
            setMessage(String(error));
        } } }, '试听'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'ghost', onClick: () => center.stopAllSounds() }, '停止当前铃声'))), (0, react_1.createElement)('fieldset', { style: channel }, (0, react_1.createElement)('legend', { style: legend }, '页面内提醒'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Checkbox, { label: '页面内通知', checked: draft.toast, onChange: toast => setDraft({ ...draft, toast }) }), (0, react_1.createElement)('p', { style: description }, '页面内显示非模态提醒，不抢焦点；0 秒表示手动关闭。'), number('toastSeconds', '页面通知关闭秒数（0 为手动）', 0, 60)), (0, react_1.createElement)('fieldset', { style: channel }, (0, react_1.createElement)('legend', { style: legend }, '桌面提醒'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Checkbox, { label: '桌面通知', checked: draft.desktop, onChange: desktop => setDraft({ ...draft, desktop }) }), (0, react_1.createElement)('p', { style: description }, '需显式请求浏览器权限；开启开关不代表已获权限或通知已送达。'), (0, react_1.createElement)('div', { style: actions }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'outline', onClick: () => { void center.requestDesktopPermission(); } }, '请求桌面通知权限')))), (0, react_1.createElement)('footer', { style: { display: 'grid', gap: 8, paddingTop: 16, borderTop: '1px solid var(--dsw-alias-border-l2)' } }, (0, react_1.createElement)('p', { style: description }, '个人提醒独立保存，仅影响本浏览器，不修改协作策略或所有者通知配置。'), (0, react_1.createElement)('div', { style: actions }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'primary', onClick: () => { try {
            const persisted = center.save(draft);
            setMessage(persisted ? '本浏览器提醒已独立保存' : '保存失败；仅本页内存生效');
        }
        catch (error) {
            setMessage(String(error));
        } } }, '保存本浏览器提醒'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'outline', onClick: () => { setDraft(saved.preferences); setMessage('已恢复当前本浏览器设置'); } }, '恢复当前提醒设置')), (0, react_1.createElement)('p', { role: 'status', style: { ...description, color: dirty ? draftColor : 'var(--dsw-alias-label-primary)' } }, dirty ? (0, react_1.createElement)('strong', null, '有未保存的提醒更改 · ') : null, feedback), (0, react_1.createElement)('p', { role: 'status', style: description }, saved.storage)), (0, react_1.createElement)('details', { style: { fontSize: 13, lineHeight: 1.6 } }, (0, react_1.createElement)('summary', { style: { cursor: 'pointer', color: 'var(--dsw-alias-label-secondary)' } }, '提醒能力与限制'), (0, react_1.createElement)('div', { style: { display: 'grid', gap: 12, minWidth: 0, paddingTop: 12 } }, (0, react_1.createElement)('div', { style: actions }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'outline', size: 'sm', onClick: () => center.report(saved.delivery) }, '重新检查提醒能力')), (0, react_1.createElement)('p', { style: description }, '上次检查：安全环境：' + caps.secure + '；AudioContext：' + caps.audio + '；桌面权限：' + caps.desktop + '；后台：' + caps.hidden + '（隐藏页面/OS 可能节流）'), (0, react_1.createElement)('p', { style: description }, saved.delivery), (0, react_1.createElement)('p', { style: description }, saved.coordination), (0, react_1.createElement)('p', { style: description }, '桌面通知只发送泛化标题与数量，不含裁决正文；时长由浏览器/操作系统控制。不提供关闭浏览器后的后台推送。'), (0, react_1.createElement)('p', { style: description }, '有界去重保存最近 256 个尝试身份，最长 24 小时，不存业务正文；过期、清存储、崩溃或能力降级都不承诺 exactly-once。'))));
}
/** Mount in an independent strict Session utility seat; never under display-policy gates. */
function DecisionNotifications(props) {
    // A keyed child makes a Session/observer replacement a hard lifetime boundary.
    return (0, react_1.createElement)(MountedDecisionNotifications, { ...props, key: props.sessionId });
}
function MountedDecisionNotifications(props) {
    const center = (0, react_1.useMemo)(() => props.center ?? defaultCenter(), [props.center]);
    const observation = (0, react_1.useSyncExternalStore)(props.observer.subscribe, props.observer.getSnapshot, props.observer.getSnapshot);
    const settings = (0, react_1.useSyncExternalStore)(center.subscribe, center.getSnapshot, center.getSnapshot);
    const tracker = (0, react_1.useMemo)(() => new DecisionEpisodeTracker(), [props.observer, props.sessionId]);
    const delivery = (0, react_1.useMemo)(() => new MountedNotificationDelivery(center), [center, props.observer, props.sessionId]);
    const timers = (0, react_1.useMemo)(() => new Map(), [delivery]);
    const [toasts, setToasts] = (0, react_1.useState)([]);
    const [diagnostic, setDiagnostic] = (0, react_1.useState)('读取中；提醒仅覆盖已挂载会话');
    (0, react_1.useEffect)(() => props.observer.retain(), [props.observer]);
    (0, react_1.useEffect)(() => { delivery.mount(); return () => { delivery.dispose(); for (const timer of timers.values())
        center.ports.cancel(timer.handle); timers.clear(); }; }, [delivery, timers, center]);
    (0, react_1.useEffect)(() => { delivery.applyPreferences(); }, [delivery, settings.preferences]);
    const ready = observation.status === 'ready' && props.observer.sessionId === props.sessionId && observation.value.sessionId === props.sessionId ? observation.value : null;
    const scope = ready && notificationScope(ready);
    const current = (episode) => {
        const latest = props.observer.getSnapshot();
        return latest.status === 'ready' && latest.value.sessionId === props.sessionId && notificationScope(latest.value) === episode.scope && tracker.isCurrent(episode) && latest.value.records?.decisions.some(row => row && row.value && rowKey(row) === rowKey(episode) && pendingUser(row.value)) === true;
    };
    const dismiss = (id) => { const timer = timers.get(id); if (timer !== undefined)
        center.ports.cancel(timer.handle); timers.delete(id); setToasts(rows => rows.filter(row => row.id !== id)); };
    (0, react_1.useEffect)(() => {
        const update = tracker.update(ready);
        setDiagnostic(update.diagnostic);
        // Reading failure/revocation and scope changes stop all old transient effects.
        delivery.reconcile();
        setToasts(rows => rows.filter(current));
        for (const [id, timer] of timers) {
            if (!current(timer.episode)) {
                center.ports.cancel(timer.handle);
                timers.delete(id);
            }
        }
        for (const episode of update.episodes)
            void delivery.deliver(episode, () => current(episode), () => props.onOpenDecision(episode.workflowId, episode.decisionId)).then(show => {
                if (!show || !delivery.isActive() || !current(episode))
                    return;
                setToasts(rows => [...rows.filter(row => row.id !== episode.id), episode].slice(-3));
                const seconds = center.getSnapshot().preferences.toastSeconds;
                if (seconds > 0) {
                    timers.set(episode.id, { episode, handle: center.ports.later(() => dismiss(episode.id), seconds * 1000) });
                    while (timers.size > 3) {
                        const oldest = timers.keys().next().value;
                        center.ports.cancel(timers.get(oldest).handle);
                        timers.delete(oldest);
                    }
                }
            });
    }, [observation, props.observer, tracker, delivery]);
    (0, react_1.useEffect)(() => { if (!settings.preferences.toast) {
        setToasts([]);
        for (const timer of timers.values())
            center.ports.cancel(timer.handle);
        timers.clear();
    } }, [settings.preferences.toast, center, timers]);
    return (0, react_1.createElement)('div', { 'aria-label': '待用户裁决提醒', style: { minWidth: 0 } }, (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '提醒状态'), (0, react_1.createElement)('p', { role: 'status' }, diagnostic), (0, react_1.createElement)('p', null, settings.delivery), (0, react_1.createElement)('p', null, settings.coordination)), scope && settings.preferences.toast ? toasts.filter(row => row.scope === scope && current(row)).map(episode => (0, react_1.createElement)('div', { key: episode.id, role: 'status', 'aria-label': '新待用户裁决', style: { overflowWrap: 'anywhere', maxWidth: '28rem' } }, (0, react_1.createElement)('span', null, '新待你裁决事项（检测时 ' + episode.pendingCount + ' 项）'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', onClick: () => { if (current(episode))
            props.onOpenDecision(episode.workflowId, episode.decisionId); } }, '打开裁决详情'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', onClick: () => dismiss(episode.id) }, '关闭提醒'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', onClick: delivery.stopSound }, '停止铃声'))) : null);
}

},
"src/client-subagents.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubagentNavigation = createSubagentNavigation;
exports.NativeSubagentTree = NativeSubagentTree;
const react_1 = require("react");
function identity(view) {
    return JSON.stringify([view.sessionId, view.instance, view.caller, view.policyGrants.revision, view.records?.scope, view.windows?.scope,
        view.policy.display.inputSummary, view.policy.extensionEnabled, view.policy.workspaceEnabled, view.health]);
}
function allowed(view) {
    return view.policy.display.inputSummary && view.caller.kind === 'user' && view.records?.scope.kind !== 'assigned' && view.windows?.scope.kind !== 'assigned'
        && !view.health.some(row => row.scope === 'native-executions' && row.status !== 'current');
}
/** Only serialize a real public subagentAddress result, never synthesize routing from the owner. */
function createSubagentNavigation(host, sessionId, observe) {
    const resource = (id, parent) => {
        if (typeof host.sessions?.subagentAddress !== 'function' || typeof host.sidebarRight?.openResource !== 'function')
            return null;
        const address = host.sessions.subagentAddress(id);
        if (!address || address.childSessionId !== id || address.parentSessionId !== parent || !['one-shot', 'continuable', 'unknown'].includes(String(address.mode)))
            return null;
        return 'dsh-resource://subagentchat/session/' + encodeURIComponent(id) + '?' + new URLSearchParams({ parent, mode: String(address.mode) });
    };
    return {
        available: (id, parent) => { try {
            return resource(id, parent) !== null;
        }
        catch {
            return false;
        } },
        open: (id, parent, expected) => {
            const observer = observe(), current = observer.getSnapshot();
            if (host.sidebarRight?.mounted?.getSnapshot() !== sessionId || observer.sessionId !== sessionId || current.status !== 'ready'
                || current.value.sessionId !== sessionId || observer.getDisplay()?.inputSummary === false || !allowed(current.value) || identity(current.value) !== identity(expected))
                return false;
            try {
                const view = current.value;
                const forest = topology(view, (view.nativeExecutions ?? []).filter(row => row.activity === 'running'), host.sessions?.list?.getSnapshot());
                if (forest.nodes.get(id)?.parent !== parent)
                    return false;
                const address = resource(id, parent);
                if (address === null)
                    return false;
                host.sidebarRight.openResource(address, { preferNewPane: true });
                return true;
            }
            catch {
                return false;
            }
        },
    };
}
function title(id, row) {
    for (const value of [row?.title, row?.displayTitle, row?.projectionValues?.subagent?.label])
        if (value?.trim() && value !== id)
            return value;
    return id.length > 16 ? id.slice(0, 12) + '…' : id;
}
/** Read-only bounded observation. Host catalog subscriptions do not retain sessions or dispatch work. */
function NativeSubagentTree(props) {
    return props.useSessions ? (0, react_1.createElement)(CatalogSubagents, { ...props, useSessions: props.useSessions }) : (0, react_1.createElement)(SubagentRows, { ...props, catalog: undefined });
}
function CatalogSubagents(props) {
    const catalog = props.useSessions(value => value);
    return (0, react_1.createElement)(SubagentRows, { ...props, catalog });
}
/** Only running observations seed the tree. Catalog ancestors supply structure, never usage. */
function topology(view, rows, catalog) {
    const facts = new Map();
    const conflicts = new Set();
    for (const row of view.nativeExecutions ?? []) {
        if (facts.has(row.sessionId) && facts.get(row.sessionId).parentSessionId !== row.parentSessionId)
            conflicts.add(row.sessionId);
        facts.set(row.sessionId, row);
    }
    const nodes = new Map(), unknown = [];
    for (const row of rows) {
        const path = [], seen = new Set();
        let id = row.sessionId, valid = true;
        while (id !== view.instance.ownerSessionId) {
            const fact = facts.get(id), listed = catalog?.byId[id];
            const parent = fact?.parentSessionId ?? listed?.parentId;
            if (!parent || seen.has(id) || seen.size >= 128 || conflicts.has(id) || (fact && listed?.parentId && fact.parentSessionId !== listed.parentId)) {
                valid = false;
                break;
            }
            seen.add(id);
            path.push({ id, parent, row: fact });
            id = parent;
        }
        if (valid)
            for (const node of path)
                nodes.set(node.id, node);
        else
            unknown.push({ id: row.sessionId, parent: row.parentSessionId, row });
    }
    return { nodes, unknown };
}
const nativeTextButtonStyle = { background: 'none', border: 0, padding: 0, font: 'inherit', textAlign: 'left', textUnderlineOffset: '2px', overflowWrap: 'anywhere' };
function SubagentRows(props) {
    const [message, setMessage] = (0, react_1.useState)(null);
    const scope = identity(props.view);
    const [folds, setFolds] = (0, react_1.useState)(() => ({ scope, ids: new Set() }));
    const collapsed = folds.scope === scope ? folds.ids : new Set();
    const forest = topology(props.view, props.rows, props.catalog);
    const childrenByParent = new Map();
    for (const node of forest.nodes.values()) {
        const siblings = childrenByParent.get(node.parent) ?? [];
        siblings.push(node);
        childrenByParent.set(node.parent, siblings);
    }
    const render = (node, unknown = false) => {
        const label = title(node.id, props.catalog?.byId[node.id]);
        const enabled = !unknown && props.subagentNavigation?.available(node.id, node.parent) === true;
        const children = childrenByParent.get(node.id) ?? [];
        const folded = collapsed.has(node.id);
        return (0, react_1.createElement)('article', { key: node.id, style: { minWidth: 0, overflowWrap: 'anywhere' } }, (0, react_1.createElement)('button', { type: 'button', disabled: !enabled, style: { ...nativeTextButtonStyle, color: enabled ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)', fontWeight: 600, cursor: enabled ? 'pointer' : 'default', textDecoration: enabled ? 'underline' : undefined },
            onClick: () => { if (!props.subagentNavigation?.open(node.id, node.parent, props.view))
                setMessage('原生侧栏暂不可用：会话、显示权限或地址已变化。'); } }, label), children.length === 0 ? null : (0, react_1.createElement)('button', { type: 'button', style: { ...nativeTextButtonStyle, color: 'var(--dsw-alias-label-secondary)', marginInlineStart: '12px', cursor: 'pointer' }, 'aria-expanded': !folded, 'aria-label': (folded ? '展开 ' : '折叠 ') + label + ' 的子代理',
            onClick: () => { const ids = new Set(collapsed); if (folded)
                ids.delete(node.id);
            else
                ids.add(node.id); setFolds({ scope, ids }); } }, folded ? '展开子代理' : '折叠子代理'), (0, react_1.createElement)('p', null, node.row?.activity === 'running' ? '在跑 · 来源：native-observed · ' + node.row.observed : '结构节点（不计入在跑）'), !enabled ? (0, react_1.createElement)('p', { role: 'status' }, unknown ? '父链未知、冲突或循环；不猜测归属，不打开错误会话。' : '宿主缺少可用原生子代理导航能力或真实地址；保留 ID 供核对。') : null, (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '技术详情'), node.row === undefined ? null : (0, react_1.createElement)('p', null, props.describeRow(node.row)), (0, react_1.createElement)('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(node.row ?? { sessionId: node.id, parentSessionId: node.parent, source: 'host-catalog' }, null, 2))), folded || children.length === 0 ? null : (0, react_1.createElement)('div', { style: { marginInlineStart: '12px', borderInlineStart: '1px solid var(--dsw-alias-border-default, currentColor)', paddingInlineStart: '8px' } }, children.map(child => render(child))));
    };
    return (0, react_1.createElement)('div', null, [...forest.nodes.values()].filter(node => node.parent === props.view.instance.ownerSessionId).map(node => render(node)), forest.unknown.length === 0 ? null : (0, react_1.createElement)('section', { 'aria-label': '父链未知的子代理' }, (0, react_1.createElement)('h4', null, '父链未知'), forest.unknown.map(node => render(node, true))), message === null ? null : (0, react_1.createElement)('p', { role: 'status' }, message));
}

},
"src/client.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.PolicyObserver = exports.SummaryScheduler = exports.SummaryObserver = exports.SessionObserverCache = exports.SessionObserver = exports.UNSUPPORTED_SEATS = exports.OWN_TOOL_NAMES = exports.ROW_KEY = exports.TAB_ID = exports.TAB_KIND = exports.PACKAGE_NAME = void 0;
exports.decodeSession = decodeSession;
exports.setPolicyLeaf = setPolicyLeaf;
exports.savePolicyDraft = savePolicyDraft;
exports.policyDraftImpact = policyDraftImpact;
exports.nativeStopText = nativeStopText;
exports.nativeExecutionText = nativeExecutionText;
exports.windowSummary = windowSummary;
exports.WindowProjection = WindowProjection;
exports.resourceSummary = resourceSummary;
exports.ResourceProjection = ResourceProjection;
exports.compactInstrumentSummary = compactInstrumentSummary;
exports.HeaderEntry = HeaderEntry;
exports.ObservedHeaderEntry = ObservedHeaderEntry;
exports.InputSummary = InputSummary;
exports.DecisionNotificationSeat = DecisionNotificationSeat;
exports.DecisionNotificationReader = DecisionNotificationReader;
exports.ObservedInputSummary = ObservedInputSummary;
exports.decisionAnswerCommand = decisionAnswerCommand;
exports.Details = Details;
exports.bindingSummary = bindingSummary;
exports.WorktreeBindingsPanel = WorktreeBindingsPanel;
exports.observationSummary = observationSummary;
exports.WorktreeObservationsPanel = WorktreeObservationsPanel;
exports.WorktreeObservationEditor = WorktreeObservationEditor;
exports.WorktreeBindingEditor = WorktreeBindingEditor;
exports.HistoryPanel = HistoryPanel;
exports.sessionListRequested = sessionListRequested;
exports.WorkspaceBadge = WorkspaceBadge;
exports.decodeWorkspaces = decodeWorkspaces;
exports.settingsSessionChoices = settingsSessionChoices;
exports.SettingsInspection = SettingsInspection;
exports.ObservedSettingsInspection = ObservedSettingsInspection;
exports.SupervisionSettingsPanel = SupervisionSettingsPanel;
exports.SupervisionHistory = SupervisionHistory;
exports.SettingsPage = SettingsPage;
exports.sourceAction = sourceAction;
exports.sourceTarget = sourceTarget;
exports.sourceView = sourceView;
exports.sourceRecord = sourceRecord;
exports.SourceCard = SourceCard;
exports.apply = apply;
exports.grantPolicyFromSnapshot = grantPolicyFromSnapshot;
const react_1 = require("react");
const dsh_client_ui_primitives_1 = require("@deepseek-ai/dsh-client-ui-primitives");
const client_subagents_js_1 = require("./client-subagents.js");
const client_notifications_js_1 = require("./client-notifications.js");
const policy_js_1 = require("./controls/policy.js");
const supervision_config_js_1 = require("./controls/supervision-config.js");
const supervision_audit_js_1 = require("./controls/supervision-audit.js");
const remote_contract_js_1 = require("./controls/remote-contract.js");
exports.PACKAGE_NAME = '@lmgatex/dsh-mattpocock-skills';
exports.TAB_KIND = 'mattpocock-collaboration';
exports.TAB_ID = exports.PACKAGE_NAME + ':collaboration';
exports.ROW_KEY = exports.PACKAGE_NAME + '#dsh-mattpocock-skills';
exports.OWN_TOOL_NAMES = ['mattpocock_record', 'mattpocock_window', 'mattpocock_resource', 'mattpocock_controls', 'mattpocock_assign', 'mattpocock_history', 'mattpocock_worktree', 'mattpocock_delegate', 'mattpocock_audit'];
exports.UNSUPPORTED_SEATS = Object.freeze([
    { key: 'secondary-header', reason: 'No additive full-width secondary session header slot.' },
    { key: 'persistent-session-list-badge', reason: 'Native leading decoration is idle-only; hover detail is hover-only.' },
    { key: 'background-tab-open', reason: 'Native openTab selects and expands; no background/no-focus option.' },
]);
function object(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected a record from the Host');
    return value;
}
function nonempty(value) { if (typeof value !== 'string' || !value.trim())
    throw new Error('Host identity is unavailable'); return value; }
function remoteValue(result) { if (!result.ok)
    throw result.error; return result.value; }
function errorText(error) { return error instanceof Error ? error.message : String(error); }
/** Additional UI boundary check: an arriving result must belong to the requested Session. */
function decodeSession(value, sessionId) {
    const parsed = (0, remote_contract_js_1.parseHostJson)(value);
    const raw = object(parsed);
    if (raw.sessionId !== sessionId)
        throw new Error('Session snapshot belongs to a different caller Session');
    const caller = object(raw.caller);
    nonempty(caller.principalId);
    if ((caller.kind !== 'user' && caller.kind !== 'agent') || (caller.kind === 'user' ? caller.sessionId !== null : caller.sessionId !== sessionId))
        throw new Error('Host caller identity is inconsistent');
    (0, remote_contract_js_1.parsePolicyGrants)(raw.policyGrants);
    const instance = object(raw.instance);
    nonempty(instance.instrumentInstanceId);
    nonempty(instance.ownerSessionId);
    nonempty(instance.controlWorkspaceId);
    const policy = object(raw.policy);
    if (policy.controlWorkspaceId !== instance.controlWorkspaceId)
        throw new Error('Policy and instance workspace disagree');
    const display = object(policy.display);
    object(policy.features);
    const capacities = object(policy.windows);
    for (const key of policy_js_1.DISPLAY_NAMES)
        if (typeof display[key] !== 'boolean')
            throw new Error('Display policy is unavailable');
    for (const key of ['ticketWindowSize', 'runningSubagentLimit']) {
        const value = capacities[key];
        if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1))
            throw new Error('Window capacity is unavailable');
    }
    for (const key of ['records', 'windows']) {
        if (raw[key] === null)
            continue;
        const child = object(raw[key]);
        const bound = object(child.instance);
        if (bound.instrumentInstanceId !== instance.instrumentInstanceId || bound.ownerSessionId !== instance.ownerSessionId)
            throw new Error('Instrument snapshot belongs to a different instance');
    }
    if (!Array.isArray(raw.resources) || !Array.isArray(raw.capabilities) || !Array.isArray(raw.health))
        throw new Error('Host snapshot sections are unavailable');
    return parsed;
}
/** Document visibility is a polling hint, not a claim about row viewport visibility. */
function documentHidden() { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; }
/** Per-Session, mounted-only observation. It never creates an instance or wakes a model. */
class SessionObserver {
    sessionId;
    read;
    intervalMs;
    state = { status: 'unknown', value: null, error: null };
    listeners = new Set();
    holds = 0;
    generation = 0;
    timer;
    closed = false;
    controller;
    lastPolicy = null;
    getDisplay = () => this.lastPolicy?.display;
    constructor(sessionId, read, intervalMs = 5000) {
        this.sessionId = sessionId;
        this.read = read;
        this.intervalMs = intervalMs;
    }
    getSnapshot = () => this.state;
    subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    retain = () => {
        if (this.closed)
            throw new Error('Session observer has been disposed');
        if (this.holds++ === 0) {
            this.publish({ status: 'unknown', value: null, error: null });
            void this.refresh();
        }
        let released = false;
        return () => { if (released || this.closed)
            return; released = true; if (--this.holds === 0) {
            this.generation++;
            this.controller?.abort();
            this.clearTimer();
            this.state = { status: 'unknown', value: null, error: null };
        } };
    };
    refresh = async () => {
        if (this.closed || this.holds === 0)
            return;
        this.clearTimer();
        const generation = ++this.generation;
        this.controller?.abort();
        const request = new AbortController();
        this.controller = request;
        try {
            const value = decodeSession(remoteValue(await this.read(this.sessionId, request.signal)), this.sessionId);
            if (generation !== this.generation || this.closed || this.holds === 0)
                return;
            this.lastPolicy = value.policy;
            this.publish({ status: 'ready', value, error: null });
        }
        catch (error) {
            if (generation !== this.generation || this.closed || this.holds === 0)
                return;
            this.publish({ status: 'unknown', value: null, error: errorText(error) });
        }
        finally {
            if (generation === this.generation && !this.closed && this.holds > 0 && this.intervalMs > 0) {
                // A hidden tab has no visible badge to keep current; backing off avoids N full snapshot
                // reads per interval for every row while the user is elsewhere.
                const delay = documentHidden() ? Math.max(this.intervalMs * 4, 30_000) : this.intervalMs;
                this.timer = setTimeout(() => { void this.refresh(); }, delay);
            }
        }
    };
    dispose() { this.closed = true; this.generation++; this.controller?.abort(); this.holds = 0; this.clearTimer(); this.state = { status: 'unknown', value: null, error: 'Observer disposed' }; this.listeners.clear(); }
    clearTimer() { if (this.timer !== undefined)
        clearTimeout(this.timer); this.timer = undefined; }
    publish(state) { this.state = state; for (const listener of this.listeners)
        listener(); }
}
exports.SessionObserver = SessionObserver;
const SESSION_UNKNOWN = Object.freeze({ status: 'unknown', value: null, error: null });
// Only registry-created lazy handles may share a lifetime. Weak keys neither retain
// Sessions nor add a second handle cache; each handle still reacquires the live entry.
const observationDomains = new WeakMap();
/** Faces carry lazy handles, never bare evictable observers. A render-to-effect gap and
 * even a previously evicted native face can reacquire the single current Session entry.
 * TTL is checked on registry activity; the last full holder already clears its snapshot.
 * Only transient UI metadata is evicted, never durable records or model consumption. */
class SessionObserverCache {
    read;
    intervalMs;
    idleTtlMs;
    maxIdle;
    entries = new Map();
    closed = false;
    constructor(read, intervalMs = 5000, idleTtlMs = 60_000, maxIdle = 64) {
        this.read = read;
        this.intervalMs = intervalMs;
        this.idleTtlMs = idleTtlMs;
        this.maxIdle = maxIdle;
    }
    get size() { return this.entries.size; }
    observe(sessionId) {
        nonempty(sessionId);
        const acquire = (action) => {
            if (this.closed)
                throw new Error('Session observer cache has been disposed');
            this.prune();
            let entry = this.entries.get(sessionId);
            if (entry === undefined) {
                entry = { observer: new SessionObserver(sessionId, this.read, this.intervalMs), active: 0, idleSince: Date.now() };
                this.entries.set(sessionId, entry);
            }
            entry.active++;
            const cleanup = action(entry.observer), held = entry;
            let released = false;
            return () => { if (released)
                return; released = true; cleanup(); if (--held.active === 0)
                held.idleSince = Date.now(); this.prune(); };
        };
        const handle = { sessionId,
            getSnapshot: () => this.entries.get(sessionId)?.observer.getSnapshot() ?? SESSION_UNKNOWN,
            getDisplay: () => this.entries.get(sessionId)?.observer.getDisplay(),
            subscribe: listener => acquire(observer => observer.subscribe(listener)), retain: () => acquire(observer => observer.retain()),
            refresh: async () => { await this.entries.get(sessionId)?.observer.refresh(); },
        };
        observationDomains.set(handle, this);
        return handle;
    }
    refreshAll() { for (const entry of this.entries.values())
        if (entry.active > 0)
            void entry.observer.refresh(); }
    dispose() { this.closed = true; for (const entry of this.entries.values())
        entry.observer.dispose(); this.entries.clear(); }
    prune() {
        const idle = [...this.entries].filter(([, entry]) => entry.active === 0).sort((a, b) => a[1].idleSince - b[1].idleSince);
        for (let i = 0; i < idle.length; i++) {
            const [id, entry] = idle[i];
            if (Date.now() - entry.idleSince >= this.idleTtlMs || idle.length - i > this.maxIdle) {
                entry.observer.dispose();
                this.entries.delete(id);
            }
        }
    }
}
exports.SessionObserverCache = SessionObserverCache;
const SUMMARY_UNKNOWN = Object.freeze({ status: 'unknown', value: null, error: null });
function boundedSummaryBytes(value) {
    const text = JSON.stringify(value);
    if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > remote_contract_js_1.SUMMARY_RESPONSE_LIMIT)
        throw new Error('Summary batch exceeds its byte budget');
}
/** A lightweight handle, not a second per-Session timer. Old handles route back through the
 * shared registry after idle eviction, so a native injected face cannot retain a dead observer. */
class SummaryObserver {
    sessionId;
    scheduler;
    constructor(sessionId, scheduler) {
        this.sessionId = sessionId;
        this.scheduler = scheduler;
        observationDomains.set(this, scheduler);
    }
    getSnapshot = () => this.scheduler.snapshot(this.sessionId);
    getDisplay = () => this.scheduler.display(this.sessionId);
    getConfigurationRevision = () => this.scheduler.configurationRevision(this.sessionId);
    subscribe = (listener) => this.scheduler.subscribe(this.sessionId, listener);
    retain = () => this.scheduler.retain(this.sessionId);
    refresh = () => this.scheduler.refresh(this.sessionId);
}
exports.SummaryObserver = SummaryObserver;
/** One scheduler per mounted plugin namespace: 32 identities per batch, two requests in flight,
 * one timer, and no host Session activation. Only mounted holders become query work. */
class SummaryScheduler {
    read;
    intervalMs;
    idleTtlMs;
    maxIdle;
    entries = new Map();
    flights = new Set();
    sequence = 0;
    timer;
    closed = false;
    hidden = documentHidden();
    onVisibility = () => {
        const hidden = documentHidden(), restored = this.hidden && !hidden;
        this.hidden = hidden;
        if (restored)
            this.refresh();
        else if (hidden) {
            for (const entry of this.entries.values())
                if (entry.holds > 0 && entry.flight === undefined)
                    entry.due = Math.max(entry.due, Date.now() + 30_000);
            this.arm();
        }
    };
    constructor(read, intervalMs = 5000, idleTtlMs = 60_000, maxIdle = 64) {
        this.read = read;
        this.intervalMs = intervalMs;
        this.idleTtlMs = idleTtlMs;
        this.maxIdle = maxIdle;
        if (typeof document !== 'undefined')
            document.addEventListener('visibilitychange', this.onVisibility);
    }
    get size() { return this.entries.size; }
    observe(sessionId) { nonempty(sessionId); return this.entries.get(sessionId)?.handle ?? new SummaryObserver(sessionId, this); }
    snapshot(sessionId) { return this.entries.get(sessionId)?.state ?? SUMMARY_UNKNOWN; }
    display(sessionId) { return this.entries.get(sessionId)?.display; }
    configurationRevision(sessionId) { return this.entries.get(sessionId)?.policyRevision; }
    subscribe(sessionId, listener) {
        const entry = this.entry(sessionId);
        entry.listeners.add(listener);
        return () => { entry.listeners.delete(listener); this.prune(); };
    }
    retain(sessionId) {
        if (this.closed)
            throw new Error('Summary scheduler has been disposed');
        const entry = this.entry(sessionId);
        if (entry.holds++ === 0) {
            entry.lifetime++;
            entry.generation++;
            entry.due = Date.now();
            this.publish(entry, SUMMARY_UNKNOWN);
            this.arm();
        }
        let released = false;
        return () => {
            if (released || this.closed)
                return;
            released = true;
            if (--entry.holds === 0) {
                entry.generation++;
                entry.state = SUMMARY_UNKNOWN;
                entry.version = undefined;
                entry.failures = 0;
                entry.idleSince = Date.now();
                const flight = entry.flight;
                if (flight !== undefined && !flight.members.some(member => this.current(member, flight)))
                    flight.controller.abort();
                this.prune();
                this.arm();
            }
        };
    }
    refresh(sessionId) {
        if (this.closed)
            return;
        for (const entry of this.entries.values())
            if (entry.holds > 0 && (sessionId === undefined || entry.sessionId === sessionId)) {
                entry.generation++;
                entry.due = Date.now();
            }
        for (const flight of this.flights)
            if (!flight.members.some(member => this.current(member, flight)))
                flight.controller.abort();
        this.arm();
    }
    dispose() {
        this.closed = true;
        this.clearTimer();
        if (typeof document !== 'undefined')
            document.removeEventListener('visibilitychange', this.onVisibility);
        for (const flight of this.flights)
            flight.controller.abort();
        for (const entry of this.entries.values()) {
            entry.generation++;
            entry.state = SUMMARY_UNKNOWN;
            entry.listeners.clear();
            entry.holds = 0;
        }
        this.entries.clear();
    }
    entry(sessionId) {
        let entry = this.entries.get(sessionId);
        if (entry === undefined) {
            this.prune();
            entry = { sessionId, handle: new SummaryObserver(sessionId, this), listeners: new Set(), state: SUMMARY_UNKNOWN, display: undefined, policyRevision: undefined, version: undefined,
                holds: 0, lifetime: 0, generation: 0, failures: 0, served: 0, due: Infinity, idleSince: Date.now(), flight: undefined };
            this.entries.set(sessionId, entry);
        }
        return entry;
    }
    prune() {
        const idle = [...this.entries.values()].filter(entry => entry.holds === 0 && entry.listeners.size === 0 && entry.flight === undefined).sort((a, b) => a.idleSince - b.idleSince);
        for (let i = 0; i < idle.length; i++) {
            const entry = idle[i];
            if (Date.now() - entry.idleSince >= this.idleTtlMs || idle.length - i > this.maxIdle)
                this.entries.delete(entry.sessionId);
        }
    }
    clearTimer() { if (this.timer !== undefined)
        clearTimeout(this.timer); this.timer = undefined; }
    arm() {
        this.clearTimer();
        if (this.closed)
            return;
        const dates = [...this.flights].filter(flight => !flight.expired).map(flight => flight.deadline);
        if (this.flights.size < 2)
            for (const entry of this.entries.values())
                if (entry.holds > 0 && entry.flight === undefined)
                    dates.push(entry.due);
        const next = Math.min(...dates);
        if (Number.isFinite(next))
            this.timer = setTimeout(() => this.pump(), Math.max(0, next - Date.now()));
    }
    pump() {
        this.clearTimer();
        if (this.closed)
            return;
        for (const flight of this.flights)
            if (!flight.expired && flight.deadline <= Date.now()) {
                flight.expired = true;
                flight.controller.abort();
                for (const member of flight.members)
                    if (this.attached(member, flight))
                        this.fail(member.entry, new Error('Summary read timed out'));
            }
        while (this.flights.size < 2) {
            const entries = [...this.entries.values()].filter(entry => entry.holds > 0 && entry.flight === undefined && entry.due <= Date.now()).sort((a, b) => a.due - b.due || a.served - b.served).slice(0, remote_contract_js_1.SUMMARY_BATCH_LIMIT);
            if (entries.length === 0)
                break;
            const flight = { controller: new AbortController(), members: entries.map(entry => ({ entry, lifetime: entry.lifetime, generation: entry.generation, version: entry.version })), deadline: Date.now() + 10_000, expired: false };
            for (const entry of entries) {
                entry.flight = flight;
                entry.due = Infinity;
                entry.served = ++this.sequence;
            }
            this.flights.add(flight);
            void this.run(flight);
        }
        this.prune();
        this.arm();
    }
    attached(member, flight) {
        return !this.closed && this.entries.get(member.entry.sessionId) === member.entry && member.entry.holds > 0 && member.entry.lifetime === member.lifetime && member.entry.flight === flight;
    }
    current(member, flight) {
        return this.attached(member, flight) && member.entry.generation === member.generation;
    }
    delay(entry) { return Math.max(documentHidden() ? 30_000 : 0, entry.failures === 0 ? this.intervalMs : Math.min(60_000, this.intervalMs * 2 ** Math.min(entry.failures - 1, 10))); }
    fail(entry, error) { entry.failures++; entry.version = undefined; entry.due = Date.now() + this.delay(entry); this.publish(entry, { status: 'unknown', value: null, error: errorText(error) }); }
    publish(entry, state) { entry.state = state; for (const listener of entry.listeners)
        listener(); }
    async run(flight) {
        try {
            const request = (0, remote_contract_js_1.parseSessionSummaryRequest)({ sessions: flight.members.map(member => ({ sessionId: member.entry.sessionId, ...(member.version === undefined ? {} : { version: member.version }) })) });
            boundedSummaryBytes(request);
            const value = remoteValue(await this.read(request, flight.controller.signal));
            if (this.closed || flight.expired)
                return;
            boundedSummaryBytes(value);
            const batch = (0, remote_contract_js_1.parseSessionSummaryBatch)(value), expected = new Set(flight.members.map(member => member.entry.sessionId));
            if (batch.rows.length !== expected.size || batch.rows.some(row => !expected.has(row.sessionId)))
                throw new Error('Summary batch does not match requested Sessions');
            for (const member of flight.members) {
                if (!this.current(member, flight))
                    continue;
                const row = batch.rows.find(row => row.sessionId === member.entry.sessionId), entry = member.entry;
                if (row.status === 'unavailable') {
                    this.fail(entry, row.reason);
                    continue;
                }
                if (row.status === 'unchanged') {
                    if (member.version !== row.version || entry.version !== row.version || entry.state.status !== 'ready') {
                        this.fail(entry, new Error('Unchanged summary has no matching current base'));
                        continue;
                    }
                }
                else {
                    entry.version = row.version;
                    entry.display = row.summary.policy.display;
                    entry.policyRevision = row.summary.policy.configurationRevision;
                    this.publish(entry, { status: 'ready', value: row.summary, error: null });
                }
                entry.failures = 0;
                entry.due = Date.now() + this.delay(entry);
            }
        }
        catch (error) {
            const cancelled = flight.controller.signal.aborted && typeof error === 'object' && error !== null
                && (('code' in error && error.code === 'gateway/cancelled') || ('name' in error && error.name === 'AbortError'));
            // Real failures invalidate attached holders even after supersession; intentional
            // cancellation and an already-published timeout must not become another UI error.
            if (!flight.expired && !cancelled)
                for (const member of flight.members)
                    if (this.attached(member, flight))
                        this.fail(member.entry, error);
        }
        finally {
            this.flights.delete(flight);
            for (const member of flight.members)
                if (member.entry.flight === flight)
                    member.entry.flight = undefined;
            this.prune();
            this.arm();
        }
    }
}
exports.SummaryScheduler = SummaryScheduler;
/** Changes a draft only. undefined deletes a leaf and restores inheritance. */
function setPolicyLeaf(intent, workspaceId, field, value) {
    const [group, key] = field.split('.');
    if (group === undefined || key === undefined)
        throw new Error('Invalid policy field');
    const current = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId] ?? {};
    const patch = object(structuredClone(current));
    const leaf = { ...(patch[group] === undefined ? {} : object(patch[group])) };
    if (value === undefined)
        delete leaf[key];
    else
        leaf[key] = value;
    if (Object.keys(leaf).length)
        patch[group] = leaf;
    else
        delete patch[group];
    const overrides = { ...intent.workspaceOverrides };
    if (workspaceId !== null) {
        if (Object.keys(patch).length)
            Object.defineProperty(overrides, workspaceId, { value: patch, enumerable: true, configurable: true });
        else
            delete overrides[workspaceId];
    }
    return (0, policy_js_1.parsePolicyIntent)({ extensionEnabled: intent.extensionEnabled, defaults: workspaceId === null ? patch : intent.defaults, workspaceOverrides: overrides });
}
function ownLeaf(intent, workspaceId, field) {
    const [group, key] = field.split('.');
    const patch = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId] ?? {};
    if (group === undefined || key === undefined)
        return undefined;
    const row = object(patch)[group];
    return row === undefined ? undefined : object(row)[key];
}
async function savePolicyDraft(remote, draft, expectedRevision) {
    return (0, policy_js_1.parsePolicySnapshot)(remoteValue(await remote.savePolicy((0, policy_js_1.parsePolicyIntent)(draft), expectedRevision)));
}
/** Policy-only impact snapshot: never an invented execution or convergence receipt. */
function policyDraftImpact(saved, draft, workspaceId, verified) {
    const scope = workspaceId ?? 'global-preview';
    const old = (0, policy_js_1.resolvePolicy)({ ...saved, workspaceOverrides: workspaceId === null ? {} : saved.workspaceOverrides }, scope, verified);
    const next = (0, policy_js_1.resolvePolicy)({ ...draft, revision: saved.revision, workspaceOverrides: workspaceId === null ? {} : draft.workspaceOverrides }, scope, verified);
    const changes = [];
    const add = (field, before, after) => { if (JSON.stringify(before) !== JSON.stringify(after))
        changes.push({ field, before, after }); };
    add('extensionEnabled', old.extensionEnabled, next.extensionEnabled);
    for (const feature of policy_js_1.FEATURE_NAMES)
        add(feature + '.enabled', { value: old.features[feature], source: old.sources[(feature + '.enabled')] }, { value: next.features[feature], source: next.sources[(feature + '.enabled')] });
    for (const key of ['ticketWindowSize', 'runningSubagentLimit'])
        add('windows.' + key, { value: old.windows[key], source: old.sources[('windows.' + key)] }, { value: next.windows[key], source: next.sources[('windows.' + key)] });
    add('pendingDecisions.interactionMode', { value: old.pendingDecisions.interactionMode, source: old.sources['pendingDecisions.interactionMode'] }, { value: next.pendingDecisions.interactionMode, source: next.sources['pendingDecisions.interactionMode'] });
    for (const key of policy_js_1.DISPLAY_NAMES)
        add('display.' + key, { value: old.display[key], source: old.sources[('display.' + key)] }, { value: next.display[key], source: next.sources[('display.' + key)] });
    return { readRevision: saved.revision, scope: workspaceId ?? 'global-defaults', changes, executionEffects: 'Intent only. Existing obligations/executions remain; inspect the authorized Session snapshot for actual usage/convergence.' };
}
function intentOf(snapshot) { return (0, policy_js_1.parsePolicyIntent)({ extensionEnabled: snapshot.extensionEnabled, defaults: snapshot.defaults, workspaceOverrides: snapshot.workspaceOverrides }); }
/** Preserve mounted lifetimes across injection closures, never across registries or Sessions.
 * The incoming port is evaluated every render, so a replacement callback is not frozen. */
function useStableObservation(incoming) {
    const domain = observationDomains.get(incoming) ?? incoming;
    const [held, setHeld] = (0, react_1.useState)(() => ({ domain, observer: incoming, key: 0 }));
    if (held.domain !== domain || held.observer.sessionId !== incoming.sessionId) {
        const next = { domain, observer: incoming, key: held.key + 1 };
        setHeld(next);
        return next;
    }
    return held;
}
function useObservation(incoming) {
    const { observer } = useStableObservation(incoming);
    (0, react_1.useEffect)(() => observer.retain(), [observer]);
    return (0, react_1.useSyncExternalStore)(observer.subscribe, observer.getSnapshot, observer.getSnapshot);
}
const panelStyle = { boxSizing: 'border-box', padding: '16px', height: '100%', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'auto', minHeight: 0, overflowWrap: 'anywhere', textAlign: 'left' };
function diagnostic(message) { return (0, react_1.createElement)('p', { role: 'status' }, message); }
function pretty(value) { return (0, react_1.createElement)('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(value, null, 2)); }
/** Structural capability check: older hosts keep reading without an InputActions dependency. */
function decisionInputActions(value) {
    if (value === null || typeof value !== 'object')
        return null;
    const actions = value;
    return typeof actions.captureInsertion === 'function' && typeof actions.insertText === 'function' ? actions : null;
}
function decisionTemplateAccess(props, view, display, extra = () => true) {
    const identity = decisionReadingIdentity(view);
    return { actions: decisionInputActions(props.inputActions), current: row => {
            const latest = props.observer.getSnapshot();
            if (!extra() || latest.status !== 'ready' || props.sessionId !== props.observer.sessionId || latest.value.sessionId !== props.sessionId
                || display !== null && (!latest.value.policy.display[display] || props.observer.getDisplay()?.[display] === false) || decisionReadingIdentity(latest.value) !== identity)
                return false;
            const current = inputRecords(latest.value)?.decisions.find(item => decisionRecordKey(item) === decisionRecordKey(row));
            return current !== undefined && current.revision === row.revision && isPendingUserDecision(current);
        } };
}
function useSummaryObservation(incoming, active = true) {
    const { observer } = useStableObservation(incoming);
    (0, react_1.useEffect)(() => active ? observer.retain() : undefined, [observer, active]);
    return (0, react_1.useSyncExternalStore)(observer.subscribe, observer.getSnapshot, observer.getSnapshot);
}
function countText(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '未知'; }
function capacityText(value) { return value === null ? '未配置' : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : '未知'; }
/** T is explicit bookkeeping; S tracking is not proof that all runtime work is known. */
/** State the published outcome; 'unobservable' reads as unobservable, never as a cause. */
function nativeStopText(row) {
    const where = row.sessionId + (row.turn === null ? '' : ' 第' + row.turn + '回合');
    const outcome = row.outcome === 'unobservable'
        ? '结局不可观测（无可读 turn/end' + (row.evidence !== null && row.evidence.seq !== null ? '；最后观测 seq ' + row.evidence.seq : '') + '）'
        : row.outcome === 'error' ? '回合失败' + (row.diagnostic === null ? '' : '（' + row.diagnostic + '）')
            : row.outcome === 'interrupted' ? '回合从未正常结束（崩溃或强制停止）'
                : row.outcome === 'aborted' ? '回合被取消' + (row.cancelCause === null ? '（取消原因不可观测）' : '（原因 ' + row.cancelCause + '）')
                    : '结局 ' + row.outcome;
    const lane = row.lane !== null && row.lane.workflowId !== null ? '（lane ' + row.lane.workflowId + (row.lane.localTicketId === null ? '' : '/' + row.lane.localTicketId) + '）' : '';
    return where + '：' + outcome + lane;
}
/** One native execution row; observed/inferred labels never become completion proof. */
function nativeExecutionText(row) {
    const outcome = row.outcome === null ? '' : ' · 结局 ' + row.outcome;
    // The header is a recorded source value. It does not prove the effective initial directory.
    const headerCwd = row.headerCwd === null ? '' : ' · header cwd（来源值，不证明实际初始目录）' + row.headerCwd;
    const lane = row.lane === null ? '' : ' · lane（inferred）' + String(row.lane.workflowId ?? '无工作流')
        + (row.lane.ticketIds.length === 0 ? '' : '/' + row.lane.ticketIds.join(','));
    return row.sessionId + ' · ' + row.state + outcome + ' · 活动 ' + row.activity + headerCwd + lane;
}
function hasKnownNativeRunningTotal(windows) {
    return windows.S.countKnown === true && windows.capability === 'cooperative';
}
function windowSummary(windows, health = []) {
    if (windows === null || health.some(row => row.scope === 'windows' && row.status === 'unknown'))
        return ['T 未知', 'S 未知'];
    const signed = (value) => typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '未知';
    const reference = (usage) => '/' + capacityText(usage.capacity) + ' · 超出 ' + countText(usage.overage) + ' · 差额 ' + signed(usage.gap);
    const T = 'T ' + countText(windows.T.used) + reference(windows.T);
    // Depth is a structural fact of the native count, so it rides with the number it decomposes;
    // a source that cannot measure depth prints nothing rather than a fabricated 0.
    const depthText = (usage) => {
        const depth = usage.depth;
        if (depth === null || depth === undefined)
            return '';
        return '（直接 ' + countText(depth.direct) + ' · 更深 ' + countText(depth.deeper)
            + (depth.unknown === 0 ? '' : ' · 深度未知 ' + countText(depth.unknown)) + '）';
    };
    const knownS = hasKnownNativeRunningTotal(windows);
    const S = knownS ? 'S ' + countText(windows.S.used) + depthText(windows.S) + reference(windows.S)
        : 'S 在跑 ' + countText(windows.S.used) + depthText(windows.S) + reference(windows.S) + '（下界） · 总数未知';
    return [T, S];
}
function WindowProjection(props) {
    const failed = props.view.health.find(row => row.scope === 'windows' && row.status === 'unknown');
    const windows = props.view.windows;
    if (failed || windows === null)
        return diagnostic('窗口观测未知：' + (failed?.reason ?? '未返回 T/S；不是 0 或默认容量'));
    const stops = props.view.nativeStops ?? [];
    const executions = props.view.nativeExecutions ?? [];
    const executionHealth = props.view.health.find(row => row.scope === 'native-executions');
    return (0, react_1.createElement)('section', { 'aria-label': '窗口观测' }, diagnostic('T/S 是参考值，不是硬名额；超出或统计未知不拒绝派发，也不要求额外审批。'), (0, react_1.createElement)('div', { key: decisionReadingIdentity(props.view), 'aria-label': 'T 占位明细' }, (0, react_1.createElement)('h4', null, 'T 占位明细'), inputTicketDetails(props.view)), diagnostic('S 是宿主的实时运行状态（当前 Agent.status 为 running 的后代子代理；idle 常驻子代理不算在跑）；countKnown 为 false 时它是明示下界（总数未知），available 只是参考余量，不是全机可派发数量。S.depth 按到本会话的边距分解：direct（1 级）、deeper（2 级及更深）、unknown（父链不可测量），三者恒等于 S.used；depth.levels 给出各层精确计数，depth 为 null 表示来源无法测量深度。宿主的活动子代理名额按 continuable 血缘共用一个池，孙代与直接子代消耗同一个名额。'), ...(props.view.nativeCount?.reestablished === true ? [diagnostic('S 计数已由新 runtime 依据实时事实重建（前一个 ' + String(props.view.nativeCount.previousRuntimeId) + '），不是未归因的消失。')] : []), ...(stops.length > 0 ? [diagnostic('原生子代理结局待处理：' + stops.map(row => nativeStopText(row)).join('；') + '。每项对应一个子代理回合的宿主公开结局或明示不可观测；子代理重新运行或其结束回执到达后清除。')] : []), ...(executionHealth?.status === 'unknown' ? [diagnostic('原生执行事实未知：' + (executionHealth.reason ?? '宿主未返回该类别'))] : []), ...(executionHealth?.status === 'restricted' ? [diagnostic('原生执行事实受限：' + (executionHealth.reason ?? '仅协调者可读取'))] : []), ...(executions.length > 0 ? [(0, react_1.createElement)('div', { 'aria-label': '原生执行事实' }, diagnostic('原生执行事实 ' + executions.length + ' 行（native-observed；lane=inferred；header cwd 是来源值，不证明实际初始目录；不是任务完成证明）'), executions.map(row => diagnostic(nativeExecutionText(row))))] : []), diagnostic(windowSummary(windows, props.view.health).join(' · ')), pretty(windows));
}
/** Aggregate read health controls the count; per-resource physical inspection never erases metadata. */
function resourceSummary(view) {
    const failedRoot = view.health.find(row => row.scope === 'resources' && row.status === 'unknown');
    if (failedRoot !== undefined)
        return { label: '资源未知 · 程序读取提醒', count: null, reason: failedRoot.reason ?? 'Resource domain read is unavailable' };
    const reminders = view.resources.filter(resource => ['cleanup-failed', 'quarantined', 'retire-requested'].includes(resource.status)).length;
    return { label: '资源 ' + view.resources.length + (reminders > 0 ? ' · 提醒 ' + reminders : ''), count: view.resources.length, reason: null };
}
function ResourceProjection(props) {
    const summary = resourceSummary(props.view);
    if (summary.count === null)
        return (0, react_1.createElement)('section', { 'aria-label': '资源读取未知' }, diagnostic('资源未知：' + summary.reason), props.view.resources.length > 0 ? (0, react_1.createElement)('div', null, diagnostic('仅展示已返回元数据；整体资源数量未知。'), pretty(props.view.resources)) : null);
    return (0, react_1.createElement)('section', { 'aria-label': '资源授权投影' }, diagnostic(summary.label), pretty(props.view.resources));
}
function compactInstrumentSummary(view) {
    const records = inputRecords(view);
    const statuses = records?.summary.statusCounts.flatMap(axis => axis.statuses.map(status => ({
        key: axis.workflowId + '/' + axis.axisKey + '/' + status.statusKey,
        priority: status.summaryPriority ?? Number.MAX_SAFE_INTEGER,
        text: axis.workflowId + '/' + axis.label + ':' + status.label + ' ' + countText(status.count) + ' (' + axis.counting + ')',
    }))).sort((a, b) => a.priority - b.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) ?? [];
    const custom = statuses.slice(0, 2).map(row => row.text).join(' · ');
    const ticket = '任务引用 ' + taskReferenceCount(records) + ' · 旧票 ' + (records === null ? '未知' : countText(records.summary.totalTickets)) + '（业务报告）' + (custom ? ' · ' + custom : '') + (statuses.length > 2 ? ' · 更多 ' + (statuses.length - 2) : '');
    const [T = 'T 未知', S = 'S 未知'] = windowSummary(view.windows, view.health);
    const resource = resourceSummary(view);
    const parts = ['待用户裁决 ' + (records === null ? '未知' : countText(records.summary.pendingUserDecisionCount)), ticket, T, S,
        bindingSummary(view), observationSummary(view), resource.label];
    const detail = '实例 ' + view.instance.instrumentInstanceId + ' · ' + (records?.summary.countingScope ?? '统计未知') + ' · ' + parts.join(' · ') + (needsRecordCheck(inputRecords(view)) ? ' · 记录核对' : '')
        + (statuses.length ? ' · 完整状态：' + statuses.map(row => row.text).join(' · ') : '') + (resource.reason === null ? '' : ' · 资源读取原因：' + resource.reason);
    return { parts, detail };
}
function HeaderEntry(props) {
    const observation = useSummaryObservation(props.summary);
    if (props.summary.getDisplay()?.header === false)
        return null;
    if (observation.status !== 'ready')
        return (0, react_1.createElement)('span', { title: observation.error ?? '尚无已确认的状态摘要', role: 'status', style: { display: 'inline-block', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '协作 · 状态未知');
    return (0, react_1.createElement)(HeaderSnapshot, props);
}
function HeaderSnapshot(props) {
    const { observer, key } = useStableObservation(props.observe());
    return (0, react_1.createElement)(ObservedHeaderEntry, { ...props, observer, key });
}
function ObservedHeaderEntry(props) {
    const observation = useObservation(props.observer);
    if (props.observer.getDisplay()?.header === false)
        return null;
    if (observation.status === 'unknown')
        return (0, react_1.createElement)('span', { title: observation.error ?? '尚无已确认的状态快照', role: 'status', style: { display: 'inline-block', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '协作 · 状态未知');
    const view = observation.value;
    if (!view.policy.display.header)
        return null;
    const summary = compactInstrumentSummary(view);
    const style = { display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: 'min(36vw, 320px)', minWidth: 0, overflow: 'hidden', fontSize: '11px' };
    const content = [(0, react_1.createElement)('span', { key: 'identity', style: { flexShrink: 0 } }, '协作'), ...summary.parts.map((part, index) => (0, react_1.createElement)('span', { key: index, style: { minWidth: 0, maxWidth: index === 1 ? '220px' : '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, part)), needsRecordCheck(inputRecords(view)) ? (0, react_1.createElement)('span', { key: 'record-check', style: { color: 'var(--dsw-alias-label-secondary, #61666b)', fontWeight: 400, flexShrink: 0 } }, '记录核对') : null];
    return view.policy.display.rightPanel ? (0, react_1.createElement)('button', { type: 'button', onClick: props.openDetails, title: summary.detail, 'aria-label': summary.detail, style }, ...content)
        : (0, react_1.createElement)('span', { title: summary.detail + ' · 右侧详情入口已关闭', 'aria-label': summary.detail, style }, ...content);
}
function countingScopeText(scope) {
    return { instance: '当前实例统计', assignment: '当前分配范围统计' }[scope] ?? '统计范围未知';
}
const INPUT_SUMMARY_WORKFLOW_LIMIT = 2;
/** Order the compact summary by real activity, not by the order workflows first appeared.
 * The revision is a program fact; a newer ticket can lift an older long-lived workflow. */
function inputSummaryWorkflows(records) {
    const axesByWorkflow = new Map();
    for (const axis of records.summary.statusCounts) {
        const axes = axesByWorkflow.get(axis.workflowId);
        if (axes === undefined)
            axesByWorkflow.set(axis.workflowId, [axis]);
        else
            axes.push(axis);
    }
    const workflowRows = Array.isArray(records.workflows) ? records.workflows : [];
    const ticketRows = Array.isArray(records.tickets) ? records.tickets : [];
    const ticketInventoryKnown = Array.isArray(records.tickets);
    const workflowById = new Map(workflowRows.map(row => [row.workflowId, row]));
    const ticketsByWorkflow = new Map();
    for (const ticket of ticketRows) {
        const rows = ticketsByWorkflow.get(ticket.workflowId);
        if (rows === undefined)
            ticketsByWorkflow.set(ticket.workflowId, [ticket]);
        else
            rows.push(ticket);
    }
    const references = taskReferenceRows(records);
    const referencesByWorkflow = new Map();
    for (const reference of references ?? []) {
        if (!axesByWorkflow.has(reference.workflowId))
            axesByWorkflow.set(reference.workflowId, []);
        const rows = referencesByWorkflow.get(reference.workflowId);
        if (rows === undefined)
            referencesByWorkflow.set(reference.workflowId, [reference]);
        else
            rows.push(reference);
    }
    return [...axesByWorkflow].map(([workflowId, axes], order) => {
        const scopedReferences = referencesByWorkflow.get(workflowId) ?? [];
        const scopedTickets = ticketsByWorkflow.get(workflowId) ?? [];
        const revisions = [...scopedTickets, ...scopedReferences].map(row => row.revision);
        const workflow = workflowById.get(workflowId);
        if (workflow !== undefined)
            revisions.push(workflow.revision);
        const lastActivity = revisions.reduce((latest, revision) => revision > latest ? revision : latest, 0);
        return { workflowId, axes, lastActivity, ticketCount: ticketInventoryKnown ? scopedTickets.length : null, referenceCount: references === null ? null : scopedReferences.length, order };
    }).sort((left, right) => right.lastActivity - left.lastActivity || left.order - right.order);
}
function workflowSummaryLine(workflowId, axis) {
    const statuses = axis.statuses.filter(status => status.count !== 0);
    return (0, react_1.createElement)('div', { key: workflowId + ':' + axis.axisKey }, workflowId + ' / ' + axis.label + '（' + (axis.counting === 'exclusive' ? '互斥统计' : '可重叠统计') + '） · ' + (statuses.length === 0 ? '当前无非零状态计数' : statuses.map(status => status.label + ' ' + countText(status.count)).join(' · ')));
}
function InputSummary(props) {
    const { observer: summary, key } = useStableObservation(props.summary);
    const observation = useSummaryObservation(summary);
    const current = observation.status === 'ready' && observation.value.sessionId === props.sessionId && summary.sessionId === props.sessionId ? observation.value : null;
    // Keep only permission/identity metadata, never an old summary or its counts.
    const [permit, setPermit] = (0, react_1.useState)(() => ({ sessionId: props.sessionId, summary, identity: null }));
    const identity = current?.policy.display.inputSummary ? summaryReadingIdentity(current) : null;
    const same = permit.sessionId === props.sessionId && permit.summary === summary;
    const allowed = current !== null ? identity : same && summary.getDisplay()?.inputSummary !== false ? permit.identity : null;
    if (!same || current !== null && permit.identity !== identity)
        setPermit({ sessionId: props.sessionId, summary, identity });
    if (allowed === null)
        return null;
    return (0, react_1.createElement)(InputSnapshot, { ...props, summary, key: key + ':' + allowed, summaryAvailable: current !== null, summaryIdentity: allowed });
}
function InputSnapshot(props) {
    const { observer, key } = useStableObservation(props.observe());
    return (0, react_1.createElement)(ObservedInputSummary, { ...props, observer, key });
}
const INPUT_DISCLOSURES = {
    T: { entrance: '查看 T 票窗口', region: 'T 票窗口详情', color: 'var(--dsw-alias-state-business-primary, #2563eb)' },
    S: { entrance: '查看 S 在跑子代理', region: 'S 在跑详情', color: 'var(--dsw-alias-state-done-primary, #7460c8)' },
    pending: { entrance: '查看待你裁决事项', region: '待你裁决详情', color: 'var(--dsw-alias-state-error-primary, #dc4444)' },
    awaiting: { entrance: '查看记录核对', region: '记录核对详情', color: 'var(--dsw-alias-label-secondary, #61666b)' },
};
const inputSummaryStyle = { boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))', maxWidth: 'var(--dsh-composer-card-max-width, 952px)', marginInline: 'auto', padding: '8px 12px', minWidth: 0, overflowWrap: 'anywhere', gap: '4px', lineHeight: 1.5 };
const inputTextButtonStyle = { background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' };
let nextInputDisclosureId = 0;
function signedCountText(value) { return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '未知'; }
function inputReadFailure(view, scope) {
    const row = view.health.find(row => row.scope === scope && (row.status === 'unknown' || row.status === 'restricted'));
    return row === undefined ? null : (row.status === 'restricted' ? '受限：' : '未知：') + (row.reason ?? '未返回可读数据');
}
function inputRecords(view) { return inputReadFailure(view, 'records') === null ? view.records : null; }
function inputWindows(view) { return inputReadFailure(view, 'windows') === null ? view.windows : null; }
/** Strict decision membership: pending-user and business awaiting are independent flags. */
function isPendingUserDecision(row) { return row.value.pending === true && row.value.addressee?.kind === 'user'; }
function isAwaitingImplementation(row) { return row.value.awaitingImplementation === true; }
function isNonUserPending(row) { return row.value.pending === true && row.value.addressee?.kind !== 'user'; }
function needsRecordCheck(records) {
    if (records === null || !Array.isArray(records.decisions))
        return true;
    const s = records.summary;
    return s.awaitingImplementationCount !== 0 || records.decisions.some(row => isAwaitingImplementation(row) || isNonUserPending(row))
        || typeof s.pendingDecisionCount !== 'number' || typeof s.pendingUserDecisionCount !== 'number' || s.pendingDecisionCount !== s.pendingUserDecisionCount;
}
function decisionRecordKey(row) { return row.workflowId + '\u0000' + row.decisionId; }
/** Duplicate projection rows never become a second editor or a second queue item. */
function uniqueDecisionRecords(rows) {
    const seen = new Set();
    const result = [];
    for (const row of rows) {
        const key = decisionRecordKey(row);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(row);
    }
    return result;
}
function decisionAddresseeText(row) {
    const addressee = row.value.addressee;
    if (addressee === undefined)
        return '缺省（未指定）';
    return addressee.kind + (addressee.principalId ? ' · ' + addressee.principalId : '') + (addressee.label ? ' · ' + addressee.label : '');
}
/** The authorized summary count stays authoritative; a disagreement is diagnosed, never recomputed. */
function decisionSummaryMismatch(label, summary, listLength) {
    if (typeof summary !== 'number' || !Number.isSafeInteger(summary) || summary < 0 || summary === listLength)
        return null;
    return diagnostic(label + '摘要计数 ' + summary + ' 与当前可显示列表 ' + listLength + ' 条不一致；不从列表重算计数，请刷新后核实授权快照。');
}
function technicalDetails(value) { return (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '技术详情'), pretty(value)); }
function workflowIdentity(records, workflowId) {
    const workflow = records?.workflows?.find(row => row.workflowId === workflowId);
    return workflow === undefined ? workflowId : workflow.value.title + '（' + workflowId + '）';
}
/** Capability absence is an old endpoint, never evidence of zero references. */
function taskReferenceRows(records) {
    return records?.capabilities?.taskReferences === true && Array.isArray(records.taskReferences) ? records.taskReferences : null;
}
function taskReferenceCount(records) {
    return records?.capabilities?.taskReferences === true ? countText(records.summary.totalTaskReferences) : '未知';
}
function TaskReferenceItem(props) {
    const row = props.row, value = row.value;
    const source = value.source;
    const provenance = 'provenance' in row ? row.provenance : row.history?.find(change => change.revision === row.revision);
    return (0, react_1.createElement)('details', { style: { borderTop: decisionBorder, padding: '8px 0', minWidth: 0, overflowWrap: 'anywhere' } }, (0, react_1.createElement)('summary', { style: { cursor: 'pointer', whiteSpace: 'normal', lineHeight: 1.6 } }, value.label ?? row.workflowId + '/' + row.localTicketId), (0, react_1.createElement)('div', { style: { paddingInlineStart: '12px', minWidth: 0 } }, (0, react_1.createElement)('p', { style: decisionBodyStyle }, '本地引用：' + row.workflowId + '/' + row.localTicketId + ' · 修订 ' + row.revision), (0, react_1.createElement)('p', { style: decisionBodyStyle }, '来源：作者报告（authored），未核验；未观察源状态。'), (0, react_1.createElement)('p', { style: decisionBodyStyle }, source.kind === 'external' ? '外部任务：' + source.instance + ' / ' + source.project + ' / ' + source.taskId
        : source.kind === 'repository' ? '仓内任务：' + source.repositoryAnchor + ' / ' + source.relativePath + (source.anchor ? ' # ' + source.anchor : '') : '未核验来源（unverified）'), (0, react_1.createElement)('p', { style: decisionBodyStyle }, '导航位置（仅文本）：' + value.locator), provenance === undefined ? (0, react_1.createElement)('p', null, '当前版本作者与报告时间未知') : (0, react_1.createElement)('p', { style: decisionBodyStyle }, '报告作者：' + provenance.author.kind + ' / ' + provenance.author.principalId + ' · ', decisionTime('本地报告时间', provenance.recordedAt, '报告时间未知')), (0, react_1.createElement)(DecisionTechnicalDetails, { label: '引用技术详情与历史（不证明来源时效）', value: row })));
}
function TaskReferences(props) {
    const records = inputRecords(props.view), rows = taskReferenceRows(records);
    return (0, react_1.createElement)('section', { 'aria-label': '任务引用', style: { minWidth: 0, overflowWrap: 'anywhere' } }, (0, react_1.createElement)('h4', null, '任务引用 ' + taskReferenceCount(records) + ' · 旧票 ' + (records === null ? '未知' : countText(records.summary.totalTickets)) + '（业务报告）'), rows === null ? diagnostic('任务引用读取能力未知或不支持（旧端可能缺少能力标记）；不是 0，不创建替代业务票。')
        : (0, react_1.createElement)('div', null, diagnostic(countingScopeText(records.summary.countingScope) + '；仅本地引用，不是外部任务总数或完成率。'), rows.length === 0 ? diagnostic('本次授权投影没有任务引用。') : rows.map(row => (0, react_1.createElement)(TaskReferenceItem, { key: JSON.stringify([row.workflowId, row.localTicketId]), row }))));
}
function ticketIdentity(records, workflowId, ticketId) {
    const reference = taskReferenceRows(records)?.find(row => row.workflowId === workflowId && row.localTicketId === ticketId);
    const ticket = records?.tickets?.find(row => row.workflowId === workflowId && row.localTicketId === ticketId);
    return workflowId + '/' + ticketId + (reference !== undefined ? ' · 任务引用 · ' + (reference.value.label ?? reference.value.locator) : ticket === undefined ? '' : ' · 旧票报告 · ' + ticket.value.title);
}
function ticketStatusText(records, ticket) {
    const workflow = records.workflows.find(row => row.workflowId === ticket.workflowId);
    return Object.entries(ticket.value.statuses).map(([axisKey, keys]) => {
        const axis = workflow?.value.axes.find(row => row.axisKey === axisKey);
        return (axis?.label ?? axisKey) + '：' + (keys.length === 0 ? '未报告' : keys.map(key => axis?.statuses.find(row => row.statusKey === key)?.label ?? key).join('、'));
    }).join(' · ') || '未报告状态';
}
function inputTicketDetails(view) {
    const windows = inputWindows(view), records = inputRecords(view);
    if (windows === null)
        return diagnostic('票窗口未知：' + (inputReadFailure(view, 'windows') ?? '未返回窗口；不是空清单或 0'));
    const held = Array.isArray(windows.tickets) ? windows.tickets.filter(row => row.held === true) : null;
    return (0, react_1.createElement)('div', { style: { minWidth: 0, overflowWrap: 'anywhere' } }, diagnostic('实例总占用 T ' + countText(windows.T.used) + ' / 参考 ' + capacityText(windows.T.capacity) + '；仅作规模提示，不是硬名额。'), diagnostic(windows.scope?.kind === 'assigned' ? '当前可见 scope：分配范围，明细只是子集，不能从子集重算实例总数。' : windows.scope?.kind === 'coordinator' ? '当前可见 scope：协调者实例范围。' : '当前可见 scope 未知，不从明细重算实例总数。'), records === null ? diagnostic('票账本未知：' + (inputReadFailure(view, 'records') ?? '未返回账本') + '；保留显式占位身份。') : null, taskReferenceRows(records) === null ? diagnostic('任务引用读取能力未知或不支持；未解析 handle 不视为业务票或空清单。') : null, held === null ? diagnostic('占位明细未知：未返回占位记录。') : (0, react_1.createElement)('div', null, diagnostic('本次可展示 held=true 占位 ' + held.length + ' 条。'), held.map(row => {
        const reference = taskReferenceRows(records)?.find(reference => reference.workflowId === row.workflowId && reference.localTicketId === row.localTicketId);
        const ticket = records?.tickets?.find(ticket => ticket.workflowId === row.workflowId && ticket.localTicketId === row.localTicketId);
        return (0, react_1.createElement)('article', { key: row.workflowId + ':' + row.localTicketId }, (0, react_1.createElement)('p', { style: { margin: '8px 0 4px' } }, (0, react_1.createElement)('strong', null, (reference?.value.source.kind === 'external' ? reference.value.source.taskId : '本地 handle：' + row.localTicketId)
            + (reference?.value.label ? ' · ' + reference.value.label : ticket === undefined ? '' : ' · ' + ticket.value.title))), (0, react_1.createElement)('p', { style: { color: decisionSecondary, fontSize: '12px' } }, '工作流：' + workflowIdentity(records, row.workflowId) + ' · held=true 占位 · ' + ticketIdentity(records, row.workflowId, row.localTicketId)), reference === undefined ? (0, react_1.createElement)('p', null, ticket === undefined || records === null ? '票标题/状态未在当前授权账本返回。' : ticketStatusText(records, ticket)) : (0, react_1.createElement)(TaskReferenceItem, { row: reference }), technicalDetails(row));
    })), records === null ? null : (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '全部状态定义与计数（含零值）'), records.summary.statusCounts.map(axis => (0, react_1.createElement)('div', { key: axis.workflowId + ':' + axis.axisKey }, (0, react_1.createElement)('p', null, axis.workflowId + ' / ' + axis.label + '（' + axis.counting + '） · 未报告 ' + countText(axis.unreported)), axis.statuses.map(status => (0, react_1.createElement)('p', { key: status.statusKey }, status.label + ' [' + status.statusKey + '] ' + countText(status.count) + (status.meaning ? ' · ' + status.meaning : '')))))));
}
const decisionBorder = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22))';
const decisionSecondary = 'var(--dsw-alias-label-secondary, #61666b)';
const decisionBodyStyle = { margin: '8px 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
function DecisionTechnicalDetails(props) {
    const [open, setOpen] = (0, react_1.useState)(false);
    return (0, react_1.createElement)('details', { onToggle: (event) => { if (event.target === event.currentTarget)
            setOpen(event.currentTarget.open); }, style: { borderTop: decisionBorder, padding: '8px 0', minWidth: 0 } }, (0, react_1.createElement)('summary', { style: { cursor: 'pointer' } }, props.label ?? '技术详情'), open ? pretty(props.value) : null);
}
function decisionLongText(label, text) {
    return text ? (0, react_1.createElement)('details', { style: { borderTop: decisionBorder, padding: '8px 0' } }, (0, react_1.createElement)('summary', { style: { cursor: 'pointer' } }, label), (0, react_1.createElement)('p', { style: decisionBodyStyle }, text)) : null;
}
function decisionTime(label, value, unknown) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || !Number.isFinite(new Date(value).getTime()))
        return (0, react_1.createElement)('span', null, unknown);
    return (0, react_1.createElement)('span', null, label + ' ', (0, react_1.createElement)('time', { dateTime: new Date(value).toISOString() }, new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'longOffset',
    }).format(value)));
}
/** Template placeholders are one line; authored reading text remains untouched. */
function templateLine(value) { return value.replace(/\r\n|[\n\r\u0085\u2028\u2029]/g, ' '); }
function DecisionOptions(props) {
    const { decision: row, access } = props, value = row.value;
    const [message, setMessage] = (0, react_1.useState)(null);
    const options = value.options ?? [], recommendation = value.recommendation?.trim();
    const matches = recommendation ? options.filter(option => option.key === recommendation || option.label === recommendation) : [];
    const recommended = matches.length === 1 ? matches[0] : undefined;
    const ordered = recommended === undefined ? options : [recommended, ...options.filter(option => option !== recommended)];
    const available = access?.actions !== null && access?.actions !== undefined && isPendingUserDecision(row);
    const insert = (label) => {
        if (!access?.actions || !access.current(row)) {
            setMessage('未插入：会话、显示许可或事项已变更，请重新读取。');
            return;
        }
        try {
            const span = access.actions.captureInsertion();
            if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || !Number.isSafeInteger(span.draftRev) || span.start < 0 || span.end < 0 || span.draftRev < 0) {
                setMessage('未插入：无法确认当前输入位置，请重新读取。');
                return;
            }
            if (span.start !== span.end) {
                setMessage('未插入：请取消输入框中的非空选区后重试，不会覆盖已有选择。');
                return;
            }
            if (!access.current(row)) {
                setMessage('未插入：会话或事项已变更，请重新读取。');
                return;
            }
            const text = '关于待裁决项: ”' + templateLine(value.question) + '”\n' + (label === null ? '我认为：' : '我认可 “' + templateLine(label) + '”');
            setMessage(access.actions.insertText(text, span) === true ? '仅插入输入框，尚未发送或记录裁决。' : '未插入：草稿已变更或输入框已锁定，请重试。');
        }
        catch (error) {
            setMessage('未插入：' + errorText(error));
        }
    };
    return (0, react_1.createElement)('div', { 'aria-label': '裁决文字模板' }, ordered.map(option => (0, react_1.createElement)('p', { key: option.key, 'data-decision-option': option.key, style: { ...decisionBodyStyle,
            padding: option === recommended ? '8px' : '4px 0', border: option === recommended ? '1px solid var(--dsw-alias-state-done-primary, #7460c8)' : undefined,
            color: option === recommended ? 'var(--dsw-alias-state-done-primary, #7460c8)' : 'var(--dsw-alias-state-business-primary, #2563eb)' } }, access === undefined ? (option === recommended ? '推荐 · ' : '') + option.key + '：' + option.label : (0, react_1.createElement)('button', { type: 'button', 'aria-label': '插入选项：' + option.label, disabled: !available, onClick: () => insert(option.label),
        style: { ...inputTextButtonStyle, textAlign: 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '100%' } }, (option === recommended ? '推荐 · ' : '') + option.key + '：' + option.label))), access === undefined ? null : (0, react_1.createElement)('button', { type: 'button', 'aria-label': '我有自己的看法……', disabled: !available, onClick: () => insert(null), style: inputTextButtonStyle }, '我有自己的看法……'), available ? null : (0, react_1.createElement)('p', { style: { color: decisionSecondary, fontSize: '12px' } }, '文字模板不可用：宿主缺少公开输入 API 或此事项已不属于待你裁决；仍可阅读并在原聊天中答复。'), message === null ? null : diagnostic(message));
}
/** Semantic details supports multi-line previews and native keyboard/touch disclosure without truncating the full question. */
function DecisionReadingItem(props) {
    const row = props.decision, value = row.value;
    const source = row.history?.find(change => change.revision === row.revision);
    const workflow = props.records.workflows?.find(item => item.workflowId === row.workflowId)?.value.title ?? row.workflowId;
    const preview = Array.from(value.question).slice(0, 96).join('') + (Array.from(value.question).length > 96 ? '…' : '');
    return (0, react_1.createElement)('details', { 'data-decision-item': decisionRecordKey(row), onToggle: (event) => { if (event.target === event.currentTarget)
            props.onOpen?.(event.currentTarget.open); }, style: { borderTop: decisionBorder, padding: '10px 0', minWidth: 0, color: 'var(--dsw-alias-label-primary, CanvasText)', overflowWrap: 'anywhere' } }, (0, react_1.createElement)('summary', { style: { cursor: 'pointer', lineHeight: 1.6 } }, (0, react_1.createElement)('span', { style: { fontWeight: 600 } }, preview), (0, react_1.createElement)('span', { style: { display: 'block', color: decisionSecondary, fontSize: '12px' } }, workflow + ' · ' + value.status + ' · ', decisionTime('首次登记', row.registration?.recordedAt, '创建时间未知'), ' · ', decisionTime('业务更新', row.updatedAt, '业务更新时间未知'), props.updated ? ' · 已更新 / 已解决：此事项已不在原分类' : null)), (0, react_1.createElement)('div', { style: { padding: '4px 0 0 12px', lineHeight: 1.65, minWidth: 0 } }, (0, react_1.createElement)('p', { style: { ...decisionBodyStyle, fontWeight: 600 } }, value.question), (0, react_1.createElement)(DecisionOptions, { key: row.revision, decision: row, access: props.template }), value.recommendation ? (0, react_1.createElement)('p', { style: decisionBodyStyle }, '建议：' + value.recommendation) : null, value.impact ? (0, react_1.createElement)('p', { style: decisionBodyStyle }, '影响：' + value.impact) : null, value.ticketIds?.length ? (0, react_1.createElement)('p', { style: decisionBodyStyle }, '关联任务（引用 / 旧票报告）：' + value.ticketIds.map(id => ticketIdentity(props.records, row.workflowId, id)).join('；')) : null, decisionLongText('背景', value.context), decisionLongText('已记录结果', value.result), (0, react_1.createElement)('details', { style: { borderTop: decisionBorder, padding: '8px 0' } }, (0, react_1.createElement)('summary', null, '标识与来源'), (0, react_1.createElement)('p', { style: decisionBodyStyle }, '工作流：' + row.workflowId + ' · 事项：' + row.decisionId + ' · 裁决者：' + decisionAddresseeText(row)), source === undefined ? (0, react_1.createElement)('p', null, '当前版本来源未知') : (0, react_1.createElement)('p', { style: decisionBodyStyle }, '来源（authored）：' + source.author.kind + ' / ' + source.author.principalId + ' · 修订 ' + source.revision + (source.references.length ? ' · 引用：' + source.references.join('；') : ''))), (0, react_1.createElement)(DecisionTechnicalDetails, { value: row }), props.edit ? (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { variant: 'ghost', onClick: props.edit, size: 'sm', style: { marginTop: '8px', maxWidth: '100%', height: 'auto', whiteSpace: 'normal', overflowWrap: 'anywhere', textAlign: 'left' } }, '阅读 / 编辑：' + preview) : null));
}
/** Mount with an authorization identity key. Open items retain their original region on classification changes. */
function DecisionQueues(props) {
    const records = inputRecords(props.view);
    const [opened, setOpened] = (0, react_1.useState)({ pending: [], check: [], other: [] });
    if (records === null || !Array.isArray(records.decisions))
        return diagnostic('裁决账本未知：未返回授权事项列表，不作空清单或 0。');
    const all = uniqueDecisionRecords(records.decisions);
    const matches = { pending: isPendingUserDecision, check: (row) => isAwaitingImplementation(row) || isNonUserPending(row), other: (row) => !isPendingUserDecision(row) && !isAwaitingImplementation(row) && !isNonUserPending(row) };
    const rows = (group) => all.filter(row => matches[group](row) || opened[group].includes(decisionRecordKey(row)));
    const items = (group) => rows(group).map(row => (0, react_1.createElement)('article', { key: decisionRecordKey(row), 'data-decision-key': props.view.sessionId + ':' + row.workflowId + ':' + row.decisionId }, (0, react_1.createElement)(DecisionReadingItem, { decision: row, records, template: props.template, updated: !matches[group](row), edit: props.edit === undefined ? undefined : () => props.edit(row),
        onOpen: (open) => setOpened(current => { const key = decisionRecordKey(row), keys = current[group]; return { ...current, [group]: open ? [...new Set([...keys, key])] : keys.filter(item => item !== key) }; }) })));
    return (0, react_1.createElement)('div', { style: { minWidth: 0, textAlign: 'left' } }, (0, react_1.createElement)('section', { 'aria-label': '待你裁决' }, (0, react_1.createElement)('h4', { style: { fontSize: '14px', margin: '12px 0 6px' } }, '待你裁决 ' + countText(records.summary.pendingUserDecisionCount)), decisionSummaryMismatch('待你裁决', records.summary.pendingUserDecisionCount, all.filter(isPendingUserDecision).length), rows('pending').length ? items('pending') : (0, react_1.createElement)('p', { style: { fontSize: '12px', color: decisionSecondary } }, '本次授权账本未返回待你裁决事项；不从空明细重算摘要计数。')), (0, react_1.createElement)('section', { 'aria-label': '记录核对' }, (0, react_1.createElement)('h4', { style: { fontSize: '14px', margin: '12px 0 6px' } }, '记录核对'), recordCheckFacts(records), items('check')), (0, react_1.createElement)('details', { 'aria-label': '其他裁决记录' }, (0, react_1.createElement)('summary', { style: { fontSize: '13px', color: decisionSecondary, cursor: 'pointer' } }, '其他裁决记录（不是待你裁决） · ' + all.filter(matches.other).length + ' 条'), items('other')));
}
function decisionReadingIdentity(view) {
    return JSON.stringify([summaryReadingIdentity(view), view.policyGrants.revision, view.records?.scope, inputRecords(view) !== null]);
}
function recordCheckFacts(records) {
    const rows = Array.isArray(records.decisions) ? uniqueDecisionRecords(records.decisions) : null;
    return (0, react_1.createElement)('div', { style: { fontSize: '12px', color: decisionSecondary, lineHeight: 1.6 } }, (0, react_1.createElement)('p', { style: { margin: '6px 0' } }, '原待落实标记 ' + countText(records.summary.awaitingImplementationCount) + '，不等于未完成任务；保留原始兼容标记，需按任务依据核对。'), (0, react_1.createElement)('p', { style: { margin: '6px 0' } }, '非用户 pending 记录：' + (rows === null ? '未知' : rows.filter(isNonUserPending).length) + '（当前授权列表）；与原待落实标记可重叠，不能相加。'), rows === null ? diagnostic('核对清单未知：未返回授权事项列表，不作空清单或 0。') : decisionSummaryMismatch('原待落实标记', records.summary.awaitingImplementationCount, rows.filter(isAwaitingImplementation).length));
}
function inputDecisionDetails(view, category, openedKeys, template) {
    const records = inputRecords(view);
    if (records === null || !Array.isArray(records.decisions))
        return diagnostic('裁决账本未知：' + (inputReadFailure(view, 'records') ?? '未返回可读事项'));
    // Keep deliberately opened identities; bodies always come from the current authorized projection.
    const decisions = openedKeys.flatMap(key => { const row = records.decisions.find(row => decisionRecordKey(row) === key); return row === undefined ? [] : [row]; });
    return (0, react_1.createElement)('div', null, (0, react_1.createElement)('p', { style: { color: decisionSecondary, margin: '6px 0', fontSize: '12px' } }, countingScopeText(records.summary.countingScope) + '；只读查看，不标记已读或解决事项。可在原聊天中回答。'), decisions.length === 0 ? diagnostic('本次授权账本未返回此类事项；不从空明细重算摘要计数。') : null, category === 'awaiting' ? recordCheckFacts(records) : decisionSummaryMismatch('待你裁决', records.summary.pendingUserDecisionCount, uniqueDecisionRecords(records.decisions).filter(isPendingUserDecision).length), decisions.map(decision => (0, react_1.createElement)(DecisionReadingItem, { key: decisionRecordKey(decision), decision, records, template,
        updated: category === 'pending' ? !isPendingUserDecision(decision) : !(isAwaitingImplementation(decision) || isNonUserPending(decision)) })));
}
function summaryReadingIdentity(view) {
    const i = view.instance, c = view.caller;
    return JSON.stringify([view.sessionId, i.instrumentInstanceId, i.ownerSessionId, i.controlWorkspaceId, c.kind, c.principalId, c.sessionId]);
}
function notificationReadingIdentity(view) {
    const c = view.caller, i = view.instance;
    return JSON.stringify([view.sessionId, c.kind, c.principalId, c.sessionId, i?.instrumentInstanceId, i?.ownerSessionId, i?.controlWorkspaceId, view.policyGrants?.revision]);
}
function createNotificationReading() {
    let value = { sessionId: null, scope: null, key: null, identity: null };
    const listeners = new Set();
    return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        select: (view, key) => {
            const scope = view !== null && key !== null ? (0, client_notifications_js_1.notificationScope)(view) : null;
            const next = view !== null && scope !== null ? { sessionId: view.sessionId, scope, key, identity: notificationReadingIdentity(view) } : { sessionId: null, scope: null, key: null, identity: null };
            if (value.sessionId === next.sessionId && value.scope === next.scope && value.key === next.key && value.identity === next.identity)
                return;
            value = next;
            for (const listener of listeners)
                listener();
        } };
}
/** Independent native header lifetime; no policy display gate or automatic navigation. */
function DecisionNotificationSeat(props) {
    const { observer, key } = useStableObservation(props.observer);
    return (0, react_1.createElement)(client_notifications_js_1.DecisionNotifications, { key, sessionId: props.sessionId, observer, onOpenDecision: (workflowId, decisionId) => {
            const latest = observer.getSnapshot();
            if (latest.status !== 'ready' || observer.sessionId !== props.sessionId || latest.value.sessionId !== props.sessionId || inputRecords(latest.value) === null)
                return;
            const scope = (0, client_notifications_js_1.notificationScope)(latest.value), row = latest.value.records?.decisions.find(row => row.workflowId === workflowId && row.decisionId === decisionId);
            if (scope !== null && row !== undefined && isPendingUserDecision(row))
                props.reading.select(latest.value, decisionRecordKey(row));
        } });
}
/** Reuse the native input dock, not a custom overlay or a second composer. */
function DecisionNotificationReader(props) {
    const observation = useObservation(props.observer), store = props.reading;
    const selection = (0, react_1.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
    const view = observation.status === 'ready' ? observation.value : null;
    const scope = view === null ? null : (0, client_notifications_js_1.notificationScope)(view);
    const identityMatches = props.observer.sessionId === props.sessionId && (view === null || (view.sessionId === props.sessionId && notificationReadingIdentity(view) === selection.identity));
    const unknown = view === null || scope === null || inputRecords(view) === null;
    const present = view?.records?.decisions.some(row => decisionRecordKey(row) === selection.key) === true;
    const valid = selection.sessionId === props.sessionId && selection.key !== null && identityMatches && (scope === null || scope === selection.scope) && (unknown || present);
    (0, react_1.useEffect)(() => { if (selection.sessionId === props.sessionId && !valid && selection.key !== null)
        store.select(null, null); }, [store, valid, selection, props.sessionId]);
    (0, react_1.useEffect)(() => () => { if (store.getSnapshot().sessionId === props.sessionId)
        store.select(null, null); }, [store, props.sessionId]);
    if (!valid)
        return null;
    return (0, react_1.createElement)('section', { 'aria-label': '通知裁决阅读', style: { boxSizing: 'border-box', width: 'calc(100% - 2 * var(--dsh-composer-side-clearance, 16px))', maxWidth: 'var(--dsh-composer-card-max-width, 952px)', marginInline: 'auto', padding: '8px 12px', maxHeight: '50vh', overflow: 'auto', overflowWrap: 'anywhere' } }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', onClick: () => store.select(null, null) }, '关闭通知阅读'), unknown || view === null ? diagnostic('裁决读取未知；暂停显示正文，待相同授权范围恢复后继续阅读。') : inputDecisionDetails(view, 'pending', [selection.key], decisionTemplateAccess(props, view, null, () => store.getSnapshot() === selection && (0, client_notifications_js_1.notificationScope)(view) === selection.scope)));
}
function inputRunningDetails(view, props) {
    const windows = inputWindows(view);
    const failure = inputReadFailure(view, 'native-executions');
    const assigned = inputRecords(view)?.scope?.kind === 'assigned' || windows?.scope?.kind === 'assigned' || view.caller.kind === 'agent';
    // Neither a persisted state nor execution leases prove live activity. This is a bounded observation, never a roster.
    const rows = failure !== null || assigned || !Array.isArray(view.nativeExecutions) ? null : view.nativeExecutions.filter(row => row.activity === 'running');
    return (0, react_1.createElement)('div', null, windows === null ? diagnostic('宿主在跑数未知：' + (inputReadFailure(view, 'windows') ?? '未返回窗口'))
        : diagnostic('宿主在跑数：' + countText(windows.S.used) + (hasKnownNativeRunningTotal(windows) ? '' : '（已知下界；总数未知）') + (windows.S.countReason ? ' · ' + windows.S.countReason : '')), diagnostic('本次可观测在跑明细：' + (rows === null ? '未知/受限' : rows.length + ' 条') + '；最近原生观测快照默认最多 64 行，明细可能不完整，即使条数相等也不代表完整在跑名册。租约仅作审计，不是实时名册。'), rows === null ? diagnostic('原生明细' + (failure ?? (assigned ? '受限：仅 owner 协调者可读取，不展示 sibling。' : '未知：未返回 nativeExecutions。')))
        : rows.length === 0 ? diagnostic('本次未返回 activity=running 的可观测记录，不代表没有在跑子代理。')
            : (0, react_1.createElement)(client_subagents_js_1.NativeSubagentTree, { ...props, view, rows, describeRow: nativeExecutionText }), windows?.S.depth == null ? diagnostic('深度结构未知/不可测量。') : (0, react_1.createElement)('div', null, diagnostic('深度结构：直接 ' + countText(windows.S.depth.direct) + ' · 更深 ' + countText(windows.S.depth.deeper) + ' · 深度未知 ' + countText(windows.S.depth.unknown)), Object.entries(windows.S.depth.levels).map(([level, count]) => (0, react_1.createElement)('p', { key: level }, '距离 ' + level + '：' + countText(count)))));
}
function ObservedInputSummary(props) {
    const { observer, key } = useStableObservation(props.observer);
    const observation = useObservation(observer);
    const view = observation.status === 'ready' && props.sessionId === observer.sessionId && observation.value.sessionId === props.sessionId
        && (props.summaryIdentity === undefined || summaryReadingIdentity(observation.value) === props.summaryIdentity) ? observation.value : null;
    const shown = view !== null && view.policy.display.inputSummary && observer.getDisplay()?.inputSummary !== false;
    const [permit, setPermit] = (0, react_1.useState)(() => ({ observer, sessionId: props.sessionId, allowed: false }));
    const same = permit.observer === observer && permit.sessionId === props.sessionId;
    const allowed = view !== null ? shown : same && permit.allowed && observer.getDisplay()?.inputSummary !== false;
    if (!same || view !== null && permit.allowed !== shown)
        setPermit({ observer, sessionId: props.sessionId, allowed: shown });
    // Render-time fencing prevents even one stale frame on a new Session/instance or an unreadable/gated view.
    // No effect focuses anything, and the same identity keeps both the button DOM and the user's selection on refresh.
    const identity = JSON.stringify([key, props.sessionId, observer.sessionId, shown, view === null ? null : summaryReadingIdentity(view), view?.policyGrants.revision, view?.records?.scope, view?.policy.extensionEnabled, view?.policy.workspaceEnabled,
        view !== null && inputRecords(view) !== null, view !== null && inputWindows(view) !== null, view === null ? null : inputReadFailure(view, 'native-executions')]);
    const [selection, setSelection] = (0, react_1.useState)(() => ({ identity, category: null, decisionKeys: [] }));
    const [regionPrefix] = (0, react_1.useState)(() => 'mattpocock-input-details-' + ++nextInputDisclosureId);
    const records = view === null ? null : inputRecords(view);
    const pending = records?.summary.pendingUserDecisionCount;
    const selected = selection.identity === identity && shown ? selection.category : null;
    if (selection.identity !== identity)
        setSelection({ identity, category: null, decisionKeys: [] });
    const close = () => setSelection({ identity, category: null, decisionKeys: [] });
    if (!allowed)
        return null;
    if (view === null || props.summaryAvailable === false)
        return (0, react_1.createElement)('section', { 'aria-label': '协作进度摘要', style: inputSummaryStyle }, diagnostic('协作状态暂不可用，正在恢复；不显示旧正文或计数。'));
    const inactive = view.policy.extensionEnabled === false ? '全局总闸已关闭' : view.policy.workspaceEnabled === false ? '本工作区总闸已关闭' : null;
    const workflows = records === null ? [] : inputSummaryWorkflows(records);
    // Collapsing without an enabled details entrance would make the omitted rows unreachable.
    const visible = view.policy.display.rightPanel ? workflows.slice(0, INPUT_SUMMARY_WORKFLOW_LIMIT) : workflows;
    const hidden = view.policy.display.rightPanel ? workflows.slice(INPUT_SUMMARY_WORKFLOW_LIMIT) : [];
    const select = (category) => setSelection({ identity, category, decisionKeys: uniqueDecisionRecords(records?.decisions ?? []).filter(row => category === 'pending' ? isPendingUserDecision(row) : category === 'awaiting' && (isAwaitingImplementation(row) || isNonUserPending(row))).map(decisionRecordKey) });
    const entrance = (category, text) => (0, react_1.createElement)('button', {
        key: category, type: 'button', 'aria-label': INPUT_DISCLOSURES[category].entrance, 'aria-expanded': selected === category,
        'aria-controls': regionPrefix, style: { ...inputTextButtonStyle, color: INPUT_DISCLOSURES[category].color },
        onClick: () => selected === category ? close() : select(category),
    }, text);
    const windows = inputWindows(view);
    const windowEntrance = (category) => {
        const usage = windows?.[category];
        const depth = category === 'S' ? windows?.S.depth : null;
        const unknownTotal = category === 'S' && windows !== null && !(hasKnownNativeRunningTotal(windows));
        return (0, react_1.createElement)('span', { key: category, style: { color: 'inherit' } }, entrance(category, category + ' ' + (usage === undefined ? '未知' : countText(usage.used) + '/' + capacityText(usage.capacity))), unknownTotal ? '（下界；总数未知）' : null, depth == null ? null : '（直接 ' + countText(depth.direct) + ' · 更深 ' + countText(depth.deeper) + (depth.unknown === 0 ? '' : ' · 深度未知 ' + countText(depth.unknown)) + '）', usage === undefined ? null : (0, react_1.createElement)('span', { style: { color: 'inherit' } }, usage.overage === 0 ? null : (0, react_1.createElement)('span', { style: { color: 'var(--dsw-alias-state-warn-label, #b7791f)' } }, ' · 超出 ' + countText(usage.overage)), (0, react_1.createElement)('span', { style: { color: 'inherit', fontWeight: 'normal' } }, ' · 差额 ' + signedCountText(usage.gap))));
    };
    return (0, react_1.createElement)('section', { 'aria-label': '协作进度摘要', style: inputSummaryStyle }, (0, react_1.createElement)('div', { 'aria-label': '常驻协作提醒', style: { flexShrink: 0, width: '100%' } }, inactive === null ? null : diagnostic('协作管理未生效：' + inactive + '，下列数字仅为已保存记录，不会随工作更新（非实时更新）。'), records === null ? diagnostic('任务引用与旧票报告未知') : (0, react_1.createElement)('span', null, '任务引用 ' + taskReferenceCount(records) + ' · 旧票 ' + countText(records.summary.totalTickets) + '（业务报告） · ' + countingScopeText(records.summary.countingScope)), (0, react_1.createElement)('div', { style: { display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '4px 12px' } }, entrance('pending', '裁决 · 待你裁决 ' + countText(pending)), windowEntrance('T'), windowEntrance('S'))), (0, react_1.createElement)('div', { 'aria-label': '工作流进度', style: { maxHeight: '96px', overflowY: 'auto', width: '100%', minHeight: 0 } }, ...visible.flatMap(workflow => workflow.referenceCount !== null && workflow.referenceCount > 0
        ? [(0, react_1.createElement)('div', { key: workflow.workflowId + ':references' }, workflow.workflowId + ' · 任务引用 ' + workflow.referenceCount + ' · 旧票 ' + countText(workflow.ticketCount) + '（业务报告）'), ...workflow.axes.map(axis => workflowSummaryLine(workflow.workflowId, axis))]
        : workflow.ticketCount === 0
            ? [(0, react_1.createElement)('div', { key: workflow.workflowId + ':no-tickets' }, workflow.workflowId + ' / ' + workflow.axes.map(axis => axis.label).join(' / ') + ' · 暂无票')]
            : workflow.axes.map(axis => workflowSummaryLine(workflow.workflowId, axis))), hidden.length === 0 ? null : (0, react_1.createElement)('button', { key: 'workflow-rest', type: 'button', onClick: props.openDetails,
        'aria-label': '查看其余 ' + hidden.length + ' 个工作流的完整详情', style: inputTextButtonStyle }, '其余 ' + hidden.length + ' 个工作流 · 查看详情')), (0, react_1.createElement)('section', {
        id: regionPrefix, role: 'region', 'aria-label': selected === null ? undefined : INPUT_DISCLOSURES[selected].region,
        hidden: selected === null, style: { width: '100%', minWidth: 0, maxHeight: 'min(320px, 35vh)', overflowY: 'auto', textAlign: 'left' },
    }, selected === null ? null : (0, react_1.createElement)('div', null, (0, react_1.createElement)('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: decisionBorder, padding: '4px 0' } }, (0, react_1.createElement)('nav', { 'aria-label': '协作详情导航', style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } }, ['pending', 'T', 'S'].map(category => {
        const active = selected === category || category === 'pending' && selected === 'awaiting';
        const label = category === 'pending' ? '裁决' : category;
        return (0, react_1.createElement)('button', { key: category, type: 'button', 'aria-label': '切换到' + label, 'aria-pressed': active,
            style: { ...inputTextButtonStyle, color: INPUT_DISCLOSURES[category].color, fontWeight: active ? 700 : 400 }, onClick: () => select(category) }, (active ? '✓ ' : '') + label);
    })), (selected === 'pending' || selected === 'awaiting') && needsRecordCheck(records) ? entrance('awaiting', '记录核对') : null, (0, react_1.createElement)('span', { style: { flex: 1 } }), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { variant: 'ghost', 'aria-label': '关闭详情', onClick: close }, '关闭详情')), selected === 'T' ? inputTicketDetails(view) : selected === 'S' ? inputRunningDetails(view, { ...props, observer }) : inputDecisionDetails(view, selected, selection.decisionKeys, decisionTemplateAccess({ ...props, observer }, view, 'inputSummary', () => {
        const summary = props.summary?.getSnapshot();
        return summary === undefined || summary.status === 'ready' && summary.value.policy.display.inputSummary && summaryReadingIdentity(summary.value) === summaryReadingIdentity(view);
    })))));
}
/** Explicit user answer; the Host RPC derives the real author, never the command. */
function decisionAnswerCommand(records, decision, answer, status, pending, awaitingImplementation, operationId) {
    if (!answer.trim() || !status.trim())
        throw new Error('Answer and user-selected status are required');
    return { operationId, expectedRevision: records.businessRevision, workflowId: decision.workflowId,
        action: 'put-decision', decisionId: decision.decisionId,
        value: { question: decision.value.question, status, result: answer, pending, awaitingImplementation } };
}
function decisionSourceTranscription(decision) {
    return decision.history?.filter(change => change.references.length > 0).map(change => '修订 ' + change.revision + ' · 原作者 ' + change.author.kind + ' / ' + change.author.principalId + '\n' + change.references.join('\n')).join('\n\n') ?? '';
}
// Mirrors the unchanged DecisionValue text wire bound; no source or context is truncated to fit it.
const DECISION_CONTEXT_TEXT_LIMIT = 65536;
function decisionCloseoutContext(decision, note, sources) {
    return [decision.value.context ?? '', '【核账处置（authored 声明，不是用户答复或完成证明）】\n' + note.trim(),
        sources.trim() ? '【本次 authored 转录：所选必要旧来源；不认证引用内容】\n' + sources.trim() : '本次未转录旧来源；不代表历史不存在，未知来源未补造。'].filter(Boolean).join('\n\n');
}
function decisionCloseoutContextError(context) {
    if (context.length <= DECISION_CONTEXT_TEXT_LIMIT)
        return null;
    return '超过现有背景字段 ' + DECISION_CONTEXT_TEXT_LIMIT + ' 字符上限，不能提交。请精简核账说明或仅保留必要旧来源转录；不会自动截断原背景或来源。若原背景本身无法容纳追加内容，请先通过原有授权编辑流程整理背景并保留必要指针，再显式重新读取。';
}
function decisionCloseoutCommand(records, decision, note, references, sources, changes, operationId) {
    if (!note.trim())
        throw new Error('请填写核账说明与任务去向；这不是用户答复或完成证明。');
    const context = decisionCloseoutContext(decision, note, sources);
    const contextError = decisionCloseoutContextError(context);
    if (contextError !== null)
        throw new Error(contextError);
    return { operationId, expectedRevision: records.businessRevision, workflowId: decision.workflowId, action: 'put-decision', decisionId: decision.decisionId,
        references: [...new Set(references.split(/\r?\n/).map(value => value.trim()).filter(Boolean))],
        value: { question: decision.value.question, status: changes.status.trim() || decision.value.status, context,
            ...(changes.pending === 'keep' ? {} : { pending: changes.pending === 'true' }),
            ...(changes.awaiting === 'keep' ? {} : { awaitingImplementation: changes.awaiting === 'true' }) } };
}
function DecisionEditor(props) {
    const [base, setBase] = (0, react_1.useState)({ records: props.records, decision: props.decision });
    const [answer, setAnswer] = (0, react_1.useState)('');
    const [intent, setIntent] = (0, react_1.useState)('answer');
    const [closeoutNote, setCloseoutNote] = (0, react_1.useState)('');
    const [closeoutReferences, setCloseoutReferences] = (0, react_1.useState)('');
    const [closeoutSources, setCloseoutSources] = (0, react_1.useState)(() => decisionSourceTranscription(props.decision));
    const [closeoutStatus, setCloseoutStatus] = (0, react_1.useState)('');
    const [closeoutPending, setCloseoutPending] = (0, react_1.useState)('keep');
    const [closeoutAwaiting, setCloseoutAwaiting] = (0, react_1.useState)('keep');
    const [status, setStatus] = (0, react_1.useState)(props.decision.value.status);
    const [pending, setPending] = (0, react_1.useState)(props.decision.value.pending ?? false);
    const [awaiting, setAwaiting] = (0, react_1.useState)(props.decision.value.awaitingImplementation ?? false);
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    const closeoutContext = decisionCloseoutContext(base.decision, closeoutNote, closeoutSources);
    const closeoutContextError = decisionCloseoutContextError(closeoutContext);
    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const command = intent === 'closeout' ? decisionCloseoutCommand(base.records, base.decision, closeoutNote, closeoutReferences, closeoutSources, { status: closeoutStatus, pending: closeoutPending, awaiting: closeoutAwaiting }, crypto.randomUUID())
                : decisionAnswerCommand(base.records, base.decision, answer, status, pending, awaiting, crypto.randomUUID());
            remoteValue(await props.remote.applyInstrument(props.sessionId, command));
            setMessage(intent === 'closeout' ? '已登记核账处置（作者声明）；未替代用户答复或证明任务完成。' : '已记录你的裁决；待落实标记按你的明确选择保存。');
            await props.refresh();
        }
        catch (error) {
            setMessage(errorText(error));
        }
        finally {
            setBusy(false);
        }
    };
    const flagChoice = (label, value, setValue) => (0, react_1.createElement)('label', { style: { display: 'block', margin: '8px 0' } }, label, (0, react_1.createElement)('select', { 'aria-label': label, value, disabled: busy, onChange: (event) => setValue(event.target.value) }, (0, react_1.createElement)('option', { value: 'keep' }, '保持原值（本次不修改）'), (0, react_1.createElement)('option', { value: 'true' }, '明确设为 true'), (0, react_1.createElement)('option', { value: 'false' }, '明确设为 false')));
    return (0, react_1.createElement)('article', { style: { borderBottom: '1px solid currentColor', padding: '12px 0' } }, (0, react_1.createElement)('h4', null, props.decision.value.question), (0, react_1.createElement)('p', null, props.decision.workflowId + ' · ' + props.decision.value.status + (props.decision.value.pending ? ' · 未解决' : '') + (props.decision.value.awaitingImplementation ? ' · 原待落实标记' : '')), decisionLongText('背景', props.decision.value.context), props.decision.value.recommendation ? (0, react_1.createElement)('p', null, '建议：' + props.decision.value.recommendation) : null, props.decision.value.impact ? (0, react_1.createElement)('p', null, '影响：' + props.decision.value.impact) : null, (0, react_1.createElement)('label', { style: { display: 'block', margin: '10px 0' } }, '保存意图', (0, react_1.createElement)('select', { 'aria-label': '保存意图', value: intent, disabled: busy, onChange: (event) => { setIntent(event.target.value); setMessage(null); } }, (0, react_1.createElement)('option', { value: 'answer' }, '记录用户答复'), (0, react_1.createElement)('option', { value: 'closeout' }, '登记核账处置'))), intent === 'answer' ? props.decision.value.options?.map(option => (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { key: option.key, type: 'button', disabled: busy, onClick: () => setAnswer(option.label) }, option.label)) : null, decisionLongText('已记录结果', props.decision.value.result), intent === 'closeout' ? (0, react_1.createElement)('fieldset', { style: { border: decisionBorder, padding: '10px', minWidth: 0 } }, (0, react_1.createElement)('legend', null, '登记核账处置'), (0, react_1.createElement)('p', { style: { color: decisionSecondary, fontSize: '12px', lineHeight: 1.6 } }, '在原背景后追加作者声明与任务去向，不改原用户答复；必要旧来源须由你在下方明确保留，所选内容以 authored 转录写入持久背景，不认证引用内容。这不是完成证明，不自动清除标记。'), (0, react_1.createElement)('label', { style: { display: 'block' } }, '核账说明与任务去向', (0, react_1.createElement)('textarea', { 'aria-label': '核账说明与任务去向', value: closeoutNote, disabled: busy, style: { width: '100%', boxSizing: 'border-box' }, onChange: (event) => setCloseoutNote(event.target.value) })), (0, react_1.createElement)('label', { style: { display: 'block', margin: '8px 0' } }, '必要旧来源转录（authored，可编辑）', (0, react_1.createElement)('textarea', { 'aria-label': '必要旧来源转录（authored，可编辑）', rows: 5, value: closeoutSources, disabled: busy, style: { width: '100%', boxSizing: 'border-box' }, onChange: (event) => setCloseoutSources(event.target.value) })), (0, react_1.createElement)('p', { style: { color: decisionSecondary, fontSize: '12px', lineHeight: 1.6 } }, '预填当前授权可见引用，可删减为本次必要来源并编辑；请连同原修订与原作者保留。不会静默截断或替你判断哪些来源可以丢弃。本次来源引用是另一个字段，不代替持久背景中的必要旧来源。'), (0, react_1.createElement)('label', { style: { display: 'block' } }, '本次来源引用（每行一条）', (0, react_1.createElement)('textarea', { 'aria-label': '本次来源引用（每行一条）', value: closeoutReferences, disabled: busy, style: { width: '100%', boxSizing: 'border-box' }, onChange: (event) => setCloseoutReferences(event.target.value) })), (0, react_1.createElement)('label', { style: { display: 'block', margin: '8px 0' } }, '核账状态（留空保留原状态）', (0, react_1.createElement)(dsh_client_ui_primitives_1.Input, { 'aria-label': '核账状态（留空保留原状态）', value: closeoutStatus, disabled: busy, placeholder: base.decision.value.status, onChange: (event) => setCloseoutStatus(event.target.value) })), flagChoice('核账 pending', closeoutPending, setCloseoutPending), flagChoice('核账原待落实标记', closeoutAwaiting, setCloseoutAwaiting), (0, react_1.createElement)('p', { 'aria-label': '核账背景长度', role: closeoutContextError === null ? undefined : 'status', style: { color: closeoutContextError === null ? decisionSecondary : 'var(--dsw-alias-state-error-primary, #dc4444)', fontSize: '12px', lineHeight: 1.6 } }, '拼接后背景 ' + closeoutContext.length + ' / ' + DECISION_CONTEXT_TEXT_LIMIT + ' 字符；原背景 ' + (base.decision.value.context?.length ?? 0) + ' 字符原样保留。' + (closeoutContextError ?? '')), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { disabled: busy || !closeoutNote.trim() || closeoutContextError !== null, onClick: () => { void save(); } }, '登记核账处置'))
        : (0, react_1.createElement)('div', null, (0, react_1.createElement)('label', null, '你的裁决', (0, react_1.createElement)('textarea', { 'aria-label': '用户答复', value: answer, disabled: busy, onChange: (event) => setAnswer(event.target.value) })), (0, react_1.createElement)('label', null, '保存状态（任务自定义）', (0, react_1.createElement)('input', { value: status, disabled: busy, onChange: (event) => setStatus(event.target.value) })), (0, react_1.createElement)('label', null, (0, react_1.createElement)('input', { type: 'checkbox', checked: pending, disabled: busy, onChange: (event) => setPending(event.target.checked) }), '仍 pending'), (0, react_1.createElement)('label', null, (0, react_1.createElement)('input', { type: 'checkbox', checked: awaiting, disabled: busy, onChange: (event) => setAwaiting(event.target.checked) }), '保留原待落实标记（不代表已经用户裁决）'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { disabled: busy || !answer.trim() || !status.trim(), onClick: () => { void save(); } }, '按明确选择记录裁决')), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { setBase({ records: props.records, decision: props.decision }); setAnswer(''); setIntent('answer'); setCloseoutNote(''); setCloseoutReferences(''); setCloseoutSources(decisionSourceTranscription(props.decision)); setCloseoutStatus(''); setCloseoutPending('keep'); setCloseoutAwaiting('keep'); setStatus(props.decision.value.status); setPending(props.decision.value.pending ?? false); setAwaiting(props.decision.value.awaitingImplementation ?? false); setMessage(null); } }, '重新读取事项（丢弃草稿）'), diagnostic('草稿业务修订 ' + base.records.businessRevision + '；背景刷新不会升级保存修订。'), message === null ? null : diagnostic(message), (0, react_1.createElement)(DecisionTechnicalDetails, { label: '来源历史（不是当前状态）', value: props.decision.history }));
}
function Details(props) {
    const observation = useObservation(props.observer);
    const tab = props.useTabInfo();
    const current = observation.status === 'ready' && observation.value.sessionId === props.sessionId && props.observer.sessionId === props.sessionId ? observation.value : null;
    const readIdentity = JSON.stringify([props.sessionId, props.observer.sessionId, current === null ? null : summaryReadingIdentity(current), current?.policyGrants.revision, current?.records?.scope,
        current?.policy.display.rightPanel, current !== null && inputRecords(current) !== null]);
    const [reading, setReading] = (0, react_1.useState)({ identity: readIdentity, key: null });
    if (reading.identity !== readIdentity)
        setReading({ identity: readIdentity, key: null });
    if (props.observer.sessionId !== props.sessionId)
        return diagnostic('会话选择与观察归属不一致；状态未知。');
    if (observation.status === 'unknown')
        return (0, react_1.createElement)('section', { style: panelStyle }, diagnostic('当前状态未知：' + (observation.error ?? '读取中')), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '重新读取'));
    const view = observation.value;
    if (!view.policy.display.rightPanel)
        return (0, react_1.createElement)('section', { style: panelStyle }, diagnostic('右侧显示已关闭；账本和模型消费不受影响。'));
    const records = inputRecords(view);
    const decisions = records === null || !Array.isArray(records.decisions) ? [] : uniqueDecisionRecords(records.decisions);
    const selectedDecision = reading.identity === readIdentity ? decisions.find(row => decisionRecordKey(row) === reading.key) : undefined;
    if (reading.identity === readIdentity && reading.key !== null && selectedDecision === undefined)
        setReading({ identity: readIdentity, key: null });
    // The editor is mounted at one stable location, never moved between queue parents.
    // Current authorized rows supply the body; scope/identity/read failures unmount all draft content.
    const reader = selectedDecision === undefined || records === null ? null : (0, react_1.createElement)('section', { key: 'decision-reader', 'aria-label': '裁决阅读与编辑' }, (0, react_1.createElement)('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } }, (0, react_1.createElement)('h4', { style: { fontSize: '14px', margin: 0 } }, '裁决阅读与编辑'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { variant: 'ghost', size: 'sm', onClick: () => setReading({ identity: readIdentity, key: null }) }, '关闭阅读')), diagnostic('当前分类：' + (isPendingUserDecision(selectedDecision) ? '待你裁决' : isAwaitingImplementation(selectedDecision) || isNonUserPending(selectedDecision) ? '记录核对（已更新）' : '其他 / 已解决（已更新）') + '；分类变化不关闭阅读。'), (0, react_1.createElement)(DecisionEditor, { key: readIdentity + ':' + decisionRecordKey(selectedDecision), decision: selectedDecision, records, sessionId: props.sessionId, remote: props.remote, refresh: props.observer.refresh }));
    return (0, react_1.createElement)('section', { style: panelStyle, 'aria-label': '协作详情' }, (0, react_1.createElement)('h3', null, '协作 · ' + view.instance.ownerSessionId), diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · Session ' + props.sessionId + (tab.tab.visible ? '' : ' · 非前台')), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '刷新已提交投影'), (0, react_1.createElement)(TaskReferences, { key: readIdentity + ':references', view }), (0, react_1.createElement)('h4', null, '旧票业务报告'), records === null ? diagnostic('票/事项账本未知或不可用') : (0, react_1.createElement)('div', null, diagnostic('统计范围：' + records.summary.countingScope + ' · 业务修订 ' + records.businessRevision), records.workflows.map(workflow => (0, react_1.createElement)('section', { key: workflow.workflowId }, (0, react_1.createElement)('h4', null, workflow.value.title), workflow.value.axes.map(axis => (0, react_1.createElement)('div', { key: axis.axisKey }, (0, react_1.createElement)('p', null, axis.label + ' · ' + axis.counting), axis.statuses.map(status => (0, react_1.createElement)('span', { key: status.statusKey, title: status.meaning ?? undefined }, status.label + ' ')))), records.tickets.filter(ticket => ticket.workflowId === workflow.workflowId).map(ticket => (0, react_1.createElement)('article', { key: ticket.localTicketId }, (0, react_1.createElement)('strong', null, ticket.value.title), pretty(ticket.value))))), (0, react_1.createElement)(DecisionQueues, { key: readIdentity, view, template: decisionTemplateAccess(props, view, 'rightPanel'), edit: (decision) => setReading({ identity: readIdentity, key: decisionRecordKey(decision) }) })), reader, (0, react_1.createElement)('h4', null, '双窗口（实例范围，观测）'), (0, react_1.createElement)(WindowProjection, { view }), (0, react_1.createElement)(WorktreeBindingsPanel, { key: props.sessionId + ':bindings', view, remote: props.remote, refresh: props.observer.refresh }), (0, react_1.createElement)(WorktreeObservationsPanel, { key: props.sessionId + ':observations', view, remote: props.remote, refresh: props.observer.refresh }), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '旧资源记录（仅只读，不提供创建/实际退役入口）'), ResourceProjection({ view })), (0, react_1.createElement)('h4', null, '能力与健康（观测标签）'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health }), (0, react_1.createElement)(HistoryPanel, { key: props.sessionId + ':history', sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }), (0, react_1.createElement)(SupervisionHistory, { remote: props.remote, sessionId: props.sessionId }), (0, react_1.createElement)(PolicyDelegation, { key: props.sessionId + ':policy-grants', view, remote: props.remote, refresh: props.observer.refresh }), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '有效策略及来源'), pretty(view.policy)));
}
function bindingRows(view) {
    const failure = view.health.find(row => ['worktree-bindings', 'worktrees'].includes(row.scope) && row.status === 'unknown');
    if (failure !== undefined || view.worktreeBindings === undefined)
        return null;
    if (!Array.isArray(view.worktreeBindings))
        throw new Error('工作树绑定列表未知');
    return view.worktreeBindings.map(value => {
        const row = object(value);
        nonempty(row.bindingId);
        safeCount(row.revision);
        const binding = object(row.value);
        const business = object(binding.business);
        if (!['active', 'discarded', 'cleaned'].includes(String(business.state)))
            throw new Error('工作树业务状态未知');
        if (!['intent', 'program', 'agent'].includes(String(row.source)))
            throw new Error('工作树来源未知');
        nonempty(binding.parentSessionId);
        nonempty(binding.plannedChildSessionId);
        nonempty(binding.requestedCwd);
        if (binding.actualChildSessionId !== null)
            nonempty(binding.actualChildSessionId);
        if (binding.actualCwd !== null)
            nonempty(binding.actualCwd);
        if (!['unknown', 'accepted', 'rejected'].includes(String(binding.acceptance)) || !['pending', 'confirmed', 'failed', 'cancelled', 'accepted-unknown'].includes(String(binding.outcome)))
            throw new Error('原生绑定观测状态未知');
        if (Object.hasOwn(row, 'history'))
            throw new Error('当前工作树投影不能夹带完整历史');
        return value;
    }).filter(row => row.value.business.state !== 'cleaned');
}
function bindingSummary(view) {
    try {
        const rows = bindingRows(view);
        if (rows === null)
            return '工作树绑定未知';
        const reminders = rows.filter(row => row.value.business.state === 'discarded').length;
        return '工作树绑定 ' + rows.length + (reminders ? ' · 待处置 ' + reminders : '');
    }
    catch {
        return '工作树绑定未知';
    }
}
function WorktreeBindingsPanel(props) {
    let rows;
    try {
        rows = bindingRows(props.view);
    }
    catch (error) {
        return diagnostic('工作树绑定未知：' + errorText(error));
    }
    const reason = props.view.health.find(row => ['worktree-bindings', 'worktrees'].includes(row.scope) && row.status === 'unknown')?.reason;
    return (0, react_1.createElement)('section', { 'aria-label': '工作树绑定仪器' }, (0, react_1.createElement)('h4', null, '工作树绑定（当前注入视图）'), diagnostic('这里只登记业务状态，不创建、合并或删除工作树/分支，不证明已执行 Git。已清理树退出当前视图，历史需主动查询。'), rows === null ? diagnostic('工作树绑定数量未知：' + (reason ?? '宿主未返回绑定投影')) : (0, react_1.createElement)('div', null, diagnostic('当前绑定 ' + rows.length + '（不是完整历史或执行总数）'), rows.map(row => (0, react_1.createElement)(WorktreeBindingEditor, { key: props.view.sessionId + ':' + row.bindingId, sessionId: props.view.sessionId, row, remote: props.remote, refresh: props.refresh })), rows.some(row => row.value.business.state === 'discarded') ? diagnostic('废弃但未清理的工作树仍待处置，不自动隐藏或删除。') : null));
}
function observationRows(view) {
    const failure = view.health.find(row => row.scope === 'worktree-observations' && row.status === 'unknown');
    if (failure !== undefined || view.worktreeObservations === undefined)
        return null;
    if (!Array.isArray(view.worktreeObservations))
        throw new Error('工作树观测列表未知');
    return view.worktreeObservations.map(value => {
        const row = object(value);
        nonempty(row.observationId);
        safeCount(row.revision);
        const observed = object(row.value);
        nonempty(observed.creatorSessionId);
        nonempty(observed.path);
        nonempty(observed.branch);
        nonempty(observed.baseCommit);
        nonempty(observed.repositoryRoot);
        if (!['running', 'idle', 'gone'].includes(String(row.creatorActivity)))
            throw new Error('创建者活动性未知');
        if (!['program', 'replay', 'agent'].includes(String(row.source)))
            throw new Error('工作树观测来源未知');
        const check = object(observed.check);
        if (!['unverified', 'verified', 'failed', 'absent'].includes(String(check.state)))
            throw new Error('工作树核验状态未知');
        const business = object(observed.business);
        if (!['open', 'cleaned'].includes(String(business.state)))
            throw new Error('工作树观测业务状态未知');
        if (!Array.isArray(row.nativeChildren))
            throw new Error('工作树观测的原生子会话关联未知');
        for (const child of row.nativeChildren) {
            const linked = object(child);
            nonempty(linked.sessionId);
            if (Object.hasOwn(linked, 'initialCwd'))
                throw new Error('原生子会话关联不再接受初始 cwd 字段');
            if (linked.headerCwd !== null && (typeof linked.headerCwd !== 'string' || !linked.headerCwd.trim()))
                throw new Error('原生子会话 header cwd 未知');
            if (linked.relation !== 'created-tree' || linked.source !== 'observed')
                throw new Error('原生子会话关联来源未知');
        }
        if (row.lane !== null && row.lane !== undefined) {
            const lane = object(row.lane);
            if (lane.source !== 'inferred')
                throw new Error('工作树观测 lane 来源未知');
        }
        if (Object.hasOwn(row, 'history'))
            throw new Error('当前工作树观测不能夹带完整历史');
        return value;
    }).filter(row => row.value.business.state !== 'cleaned');
}
function observationSummary(view) {
    try {
        const rows = observationRows(view);
        return rows === null ? '原生建树未知' : '原生建树 ' + rows.length;
    }
    catch {
        return '原生建树未知';
    }
}
function WorktreeObservationsPanel(props) {
    let rows;
    try {
        rows = observationRows(props.view);
    }
    catch (error) {
        return diagnostic('工作树观测未知：' + errorText(error));
    }
    const reason = props.view.health.find(row => row.scope === 'worktree-observations' && row.status === 'unknown')?.reason;
    const linked = rows?.reduce((total, row) => total + row.nativeChildren.length, 0) ?? 0;
    return (0, react_1.createElement)('section', { 'aria-label': '工作树观测仪器' }, (0, react_1.createElement)('h4', null, '原生建树观测（create_worktree）'), diagnostic('只登记经 DSH 工具管线成功执行的原生 create_worktree；创建者活动性是读取时的宿主事实，树是否存在以受权 Git 核验为准。不记录、不推测目录被谁使用，也不创建或删除任何树。'), rows === null ? diagnostic('工作树观测数量未知：' + (reason ?? '宿主未返回观测投影')) : (0, react_1.createElement)('div', null, diagnostic('当前观测 ' + rows.length + (linked === 0 ? '' : ' · 原生子会话关联 ' + linked + ' 条（created-tree；observed）') + '（已登记清理的行退出当前视图，记录与历史保留）'), rows.map(row => (0, react_1.createElement)(WorktreeObservationEditor, { key: props.view.sessionId + ':' + row.observationId, sessionId: props.view.sessionId, row, remote: props.remote, refresh: props.refresh }))));
}
function WorktreeObservationEditor(props) {
    const [base, setBase] = (0, react_1.useState)(props.row);
    const [state, setState] = (0, react_1.useState)(props.row.value.business.state);
    const [notes, setNotes] = (0, react_1.useState)(props.row.value.business.notes ?? '');
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    const [lifetime] = (0, react_1.useState)(() => ({ active: false, generation: 0, sessionId: props.sessionId, observationId: props.row.observationId }));
    (0, react_1.useEffect)(() => {
        lifetime.active = true;
        lifetime.sessionId = props.sessionId;
        lifetime.observationId = props.row.observationId;
        lifetime.generation++;
        setBase(props.row);
        setState(props.row.value.business.state);
        setNotes(props.row.value.business.notes ?? '');
        setBusy(false);
        setMessage(null);
        return () => { lifetime.active = false; lifetime.generation++; };
    }, [props.sessionId, props.row.observationId, props.remote, lifetime]);
    const save = async () => {
        if (!lifetime.active || lifetime.sessionId !== props.sessionId || lifetime.observationId !== props.row.observationId)
            return;
        const generation = ++lifetime.generation;
        setBusy(true);
        setMessage(null);
        try {
            const request = (0, remote_contract_js_1.parseHostJson)({ action: 'update-observation', command: { operationId: crypto.randomUUID(), observationId: base.observationId, expectedRevision: base.revision, state, notes } });
            const response = object((0, remote_contract_js_1.parseHostJson)(remoteValue(await props.remote.worktreeAction(props.sessionId, request))));
            if (!lifetime.active || generation !== lifetime.generation)
                return;
            if (response.observationId !== base.observationId)
                throw new Error('工作树观测更新回执归属不一致');
            safeCount(response.revision);
            const saved = object(object(response.value).business);
            if (saved.state !== state || (saved.notes ?? '') !== notes)
                throw new Error('工作树观测业务回执缺失或与登记不一致');
            setMessage('已保存作者登记；未执行 Git，程序核验事实不变。');
            await props.refresh();
        }
        catch (error) {
            if (lifetime.active && generation === lifetime.generation)
                setMessage('登记结果未知/冲突：' + errorText(error));
        }
        finally {
            if (lifetime.active && generation === lifetime.generation)
                setBusy(false);
        }
    };
    if (lifetime.sessionId !== props.sessionId || lifetime.observationId !== props.row.observationId)
        return diagnostic('工作树观测归属变化；登记草稿未知，等待重新读取。');
    const check = props.row.value.check;
    return (0, react_1.createElement)('article', { 'aria-label': '工作树观测 ' + props.row.observationId }, (0, react_1.createElement)('strong', null, props.row.value.branch + ' · ' + check.state), diagnostic('目录 ' + props.row.value.path + ' · 仓库 ' + props.row.value.repositoryRoot), diagnostic('创建者 ' + props.row.value.creatorSessionId + '（当前 ' + props.row.creatorActivity + '） · 观测来源 ' + props.row.source + ' · 调用 ' + props.row.value.callId), diagnostic('核验时间 ' + (check.checkedAt ?? '尚未核验') + ' · Git 身份 ' + (check.facts === null ? '未知（未留下已证事实）' : check.facts.gitCommonDir + ' · ' + (check.facts.branchRef ?? '无本地分支') + ' @ ' + (check.facts.branchOid ?? '未知'))), check.diagnostic === null ? null : diagnostic('核验失败原因（未知即未知）：' + check.diagnostic), props.row.lane === null ? diagnostic('票信息未知：该创建者没有可核对的 lane 绑定。') : diagnostic('lane（inferred）' + (props.row.lane.workflowId ?? '无工作流') + ' · 票 ' + (props.row.lane.ticketIds.join(', ') || '无') + (props.row.lane.task === null ? '' : ' · ' + props.row.lane.task)), (0, react_1.createElement)('div', { 'aria-label': '原生子会话关联' }, diagnostic('原生子会话关联（created-tree；observed；只证明创建，不是强绑定，也不表示目录正在被使用）'), props.row.nativeChildren.length === 0 ? diagnostic('没有可观测的 created-tree 创建者关联；空关联不等于没人使用该目录。')
        : props.row.nativeChildren.map(child => diagnostic(child.sessionId + ' · 创建此树（created-tree） · header cwd '
            + (child.headerCwd === null ? '未知' : child.headerCwd + '（来源值，不证明实际初始目录）')))), (0, react_1.createElement)('label', null, '业务状态 ', (0, react_1.createElement)('select', { disabled: busy, value: state, onChange: (event) => { const next = event.target.value; if (next === 'open' || next === 'cleaned')
            setState(next); } }, (0, react_1.createElement)('option', { value: 'open' }, '未处理'), (0, react_1.createElement)('option', { value: 'cleaned' }, '登记已处理'))), (0, react_1.createElement)('label', null, '业务说明 ', (0, react_1.createElement)('textarea', { disabled: busy, value: notes, onChange: (event) => setNotes(event.target.value) })), diagnostic('草稿观测修订 ' + base.revision + '；背景刷新不会升级保存修订。已处理只是作者登记，不是此界面执行 Git 的回执。'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { void save(); } }, '保存作者登记（不执行 Git）'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { setBase(props.row); setState(props.row.value.business.state); setNotes(props.row.value.business.notes ?? ''); setMessage(null); } }, '重新读取观测（丢弃草稿）'), message === null ? null : diagnostic(message));
}
function WorktreeBindingEditor(props) {
    const [base, setBase] = (0, react_1.useState)(props.row);
    const [state, setState] = (0, react_1.useState)(props.row.value.business.state);
    const [notes, setNotes] = (0, react_1.useState)(props.row.value.business.notes ?? '');
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    const [lifetime] = (0, react_1.useState)(() => ({ active: false, generation: 0, sessionId: props.sessionId, bindingId: props.row.bindingId }));
    (0, react_1.useEffect)(() => {
        lifetime.active = true;
        lifetime.sessionId = props.sessionId;
        lifetime.bindingId = props.row.bindingId;
        lifetime.generation++;
        setBase(props.row);
        setState(props.row.value.business.state);
        setNotes(props.row.value.business.notes ?? '');
        setBusy(false);
        setMessage(null);
        return () => { lifetime.active = false; lifetime.generation++; };
    }, [props.sessionId, props.row.bindingId, props.remote, lifetime]);
    const save = async () => {
        if (!lifetime.active || lifetime.sessionId !== props.sessionId || lifetime.bindingId !== props.row.bindingId)
            return;
        const generation = ++lifetime.generation;
        setBusy(true);
        setMessage(null);
        try {
            const request = (0, remote_contract_js_1.parseHostJson)({ action: 'update', command: { operationId: crypto.randomUUID(), bindingId: base.bindingId, expectedRevision: base.revision, state, notes } });
            const response = object((0, remote_contract_js_1.parseHostJson)(remoteValue(await props.remote.worktreeAction(props.sessionId, request))));
            if (!lifetime.active || generation !== lifetime.generation)
                return;
            if (response.bindingId !== base.bindingId)
                throw new Error('工作树更新回执归属不一致');
            safeCount(response.revision);
            const saved = object(object(response.value).business);
            if (saved.state !== state || (saved.notes ?? '') !== notes)
                throw new Error('工作树业务回执缺失或与登记不一致');
            setMessage('已保存业务登记；未执行 Git 或物理删除，事实观测与业务登记分别标来源。');
            await props.refresh();
        }
        catch (error) {
            if (lifetime.active && generation === lifetime.generation)
                setMessage('登记结果未知/冲突：' + errorText(error));
        }
        finally {
            if (lifetime.active && generation === lifetime.generation)
                setBusy(false);
        }
    };
    if (lifetime.sessionId !== props.sessionId || lifetime.bindingId !== props.row.bindingId)
        return diagnostic('工作树归属变化；登记草稿未知，等待重新读取。');
    return (0, react_1.createElement)('article', { 'aria-label': '工作树绑定 ' + props.row.bindingId }, (0, react_1.createElement)('strong', null, props.row.bindingId + ' · ' + props.row.value.business.state), diagnostic('计划子会话 ' + props.row.value.plannedChildSessionId + ' · 实际子会话 ' + (props.row.value.actualChildSessionId ?? '未知') + ' · 实际目录 ' + (props.row.value.actualCwd ?? '未知')), diagnostic('原生接收观测 ' + props.row.value.acceptance + ' / ' + props.row.value.outcome + '（程序字段） · 当前登记来源 ' + props.row.source + ' · 当前登记时间 ' + props.row.recordedAt), pretty({ requestedCwd: props.row.value.requestedCwd, task: props.row.value.task ?? null, author: props.row.author, diagnostic: props.row.value.diagnostic }), props.row.value.business.state === 'discarded' ? diagnostic('废弃但未清理：待处置提醒仍保留。') : null, (0, react_1.createElement)('label', null, '业务状态 ', (0, react_1.createElement)('select', { disabled: busy, value: state, onChange: (event) => { const next = event.target.value; if (next === 'active' || next === 'discarded' || next === 'cleaned')
            setState(next); } }, (0, react_1.createElement)('option', { value: 'active' }, '使用中'), (0, react_1.createElement)('option', { value: 'discarded' }, '废弃但未清理'), (0, react_1.createElement)('option', { value: 'cleaned' }, '登记已清理'))), (0, react_1.createElement)('label', null, '业务说明 ', (0, react_1.createElement)('textarea', { disabled: busy, value: notes, onChange: (event) => setNotes(event.target.value) })), diagnostic('草稿绑定修订 ' + base.revision + '；背景刷新不会升级保存修订。已清理是业务登记，不是此界面执行 Git 的回执。'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { void save(); } }, '保存业务登记（不执行 Git）'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { setBase(props.row); setState(props.row.value.business.state); setNotes(props.row.value.business.notes ?? ''); setMessage(null); } }, '重新读取绑定（丢弃草稿）'), message === null ? null : diagnostic(message));
}
function knownRevision(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function sourceCleanupPlan(row, page, instanceId) {
    const domain = row.sourceDomain === 'worktree-bindings' && row.kind === 'worktree' ? 'worktrees'
        : row.sourceDomain === 'instruments' && ['workflow', 'ticket', 'decision'].includes(row.kind) ? 'records'
            : row.sourceDomain === 'windows' && ['ticket-window', 'execution', 'runtime-knowledge'].includes(row.kind) ? 'windows' : null;
    if (domain === null)
        return null;
    let selector;
    try {
        if (domain === 'worktrees')
            selector = { bindingIds: [row.recordId] };
        else if (domain === 'records' && row.kind === 'workflow')
            selector = { targets: [{ kind: 'workflow', workflowId: row.recordId }] };
        else if (row.kind === 'runtime-knowledge') {
            if (row.recordId !== instanceId)
                throw new Error('knowledge belongs to another instance');
            selector = { targets: [{ kind: 'knowledge' }] };
        }
        else {
            const pair = JSON.parse(row.recordId);
            if (!Array.isArray(pair) || pair.length !== 2)
                throw new Error('source identity must be a pair');
            const first = nonempty(pair[0]);
            if (row.kind === 'execution') {
                const generation = knownRevision(pair[1]);
                if (generation === null || generation < 1)
                    throw new Error('execution generation is unknown');
                selector = { targets: [{ kind: 'execution', executionId: first }] };
            }
            else {
                const second = nonempty(pair[1]);
                selector = { targets: [row.kind === 'decision' ? { kind: 'decision', workflowId: first, decisionId: second } : { kind: 'ticket', workflowId: first, localTicketId: second }] };
            }
        }
    }
    catch {
        return { domain, request: null, reason: '源对象选择器未知或不一致，删除不可用；不猜测工作流/票/执行身份。' };
    }
    const expectedRevision = page.sourceRevisions[domain];
    const throughRevision = knownRevision(row.version);
    if (expectedRevision === null || throughRevision === null)
        return { domain, request: null, reason: '源修订或本版本未知，源旧历史删除不可用；请重新查询，不补零。' };
    if (throughRevision > expectedRevision)
        return { domain, request: null, reason: '本版本超出已读取源修订，删除不可用；请重新查询。' };
    return { domain, request: { expectedRevision, throughRevision, ...object(selector) }, reason: '源修订 ' + expectedRevision + ' · 截至版本 ' + throughRevision + '；仅此对象的源旧历史，保留最新/当前记录。' };
}
function safeCount(value) { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Host count is unavailable'); return value; }
function sameInstance(value, expected) {
    const bound = object(value);
    for (const key of ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId'])
        if (bound[key] !== expected[key])
            throw new Error('历史查询属于不同实例');
}
function historySummary(value) {
    const row = object(value);
    nonempty(row.historyId);
    nonempty(row.kind);
    nonempty(row.recordId);
    safeCount(row.sequence);
    if (typeof row.purged !== 'boolean')
        throw new Error('历史保留状态未知');
    if (Object.hasOwn(row, 'snapshot'))
        throw new Error('历史摘要不应夹带详情正文');
    return row;
}
function historyPage(value, expected) {
    const raw = object((0, remote_contract_js_1.parseHostJson)(value));
    sameInstance(raw.instance, expected);
    safeCount(raw.revision);
    if (typeof raw.notRecorded !== 'boolean')
        throw new Error('历史记录覆盖状态未知');
    if (!Array.isArray(raw.rows))
        throw new Error('历史摘要页未知');
    const rows = raw.rows.map(historySummary);
    const total = safeCount(raw.total);
    const cut = safeCount(raw.cut);
    const coverage = (0, remote_contract_js_1.parseHostJson)(raw.coverage);
    const covered = object(coverage);
    if (typeof covered.purged !== 'boolean' || typeof covered.notRecorded !== 'boolean' || !Array.isArray(covered.sources))
        throw new Error('历史覆盖范围未知');
    const nextCursor = (0, remote_contract_js_1.parseHostJson)(raw.nextCursor);
    if (nextCursor !== null) {
        const cursor = object(nextCursor);
        sameInstance(cursor, expected);
        if (safeCount(cursor.cut) !== cut)
            throw new Error('历史游标截点不一致');
        safeCount(cursor.after);
    }
    const sourceData = raw.sourceRevisions !== null && typeof raw.sourceRevisions === 'object' && !Array.isArray(raw.sourceRevisions) ? object(raw.sourceRevisions) : {};
    const sourceRevisions = { records: knownRevision(sourceData.records), windows: knownRevision(sourceData.windows), worktrees: knownRevision(sourceData.worktrees) };
    return { rows, total, cut, nextCursor, coverage, sourceRevisions };
}
/** Effects only fence lifetime; all history reads are initiated by explicit clicks. */
function HistoryPanel(props) {
    const [kind, setKind] = (0, react_1.useState)('');
    const [recordId, setRecordId] = (0, react_1.useState)('');
    const [page, setPage] = (0, react_1.useState)(null);
    const [details, setDetails] = (0, react_1.useState)({});
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    const [lifetime] = (0, react_1.useState)(() => ({ generation: 0, active: false, sessionId: props.sessionId, instanceId: props.instance.instrumentInstanceId, controller: undefined }));
    (0, react_1.useEffect)(() => {
        lifetime.active = true;
        lifetime.sessionId = props.sessionId;
        lifetime.instanceId = props.instance.instrumentInstanceId;
        lifetime.generation++;
        setPage(null);
        setDetails({});
        setBusy(false);
        setMessage(null);
        return () => { lifetime.active = false; lifetime.generation++; lifetime.controller?.abort(); };
    }, [props.sessionId, props.remote, props.instance.instrumentInstanceId, lifetime]);
    const run = async (request, receive) => {
        if (!lifetime.active || lifetime.sessionId !== props.sessionId || lifetime.instanceId !== props.instance.instrumentInstanceId)
            return;
        const generation = ++lifetime.generation;
        lifetime.controller?.abort();
        const controller = new AbortController();
        lifetime.controller = controller;
        setBusy(true);
        setMessage(null);
        try {
            const value = (0, remote_contract_js_1.parseHostJson)(remoteValue(await props.remote.historyAction(props.sessionId, (0, remote_contract_js_1.parseHostJson)(request), controller.signal)));
            if (lifetime.active && generation === lifetime.generation)
                receive(value);
        }
        catch (error) {
            if (lifetime.active && generation === lifetime.generation) {
                const action = object(request);
                const operation = action.action === 'purge-source' ? ' · 操作 ' + String(object(action.request).operationId) : '';
                setPage(null);
                setDetails({});
                setMessage('历史状态未知：' + errorText(error) + operation);
            }
        }
        finally {
            if (lifetime.active && generation === lifetime.generation)
                setBusy(false);
        }
    };
    const query = (cursor) => {
        setPage(null);
        setDetails({});
        void run({ action: 'query', query: { ...(kind.trim() ? { kind: kind.trim() } : {}), ...(recordId.trim() ? { recordId: recordId.trim() } : {}), limit: 20, ...(cursor === undefined ? {} : { cursor }) } }, value => setPage(historyPage(value, props.instance)));
    };
    const expand = (row) => {
        void run({ action: 'detail', historyIds: [row.historyId] }, value => {
            const detail = object(value);
            safeCount(detail.revision);
            const coverage = object(detail.coverage);
            if (typeof coverage.purged !== 'boolean' || typeof coverage.notRecorded !== 'boolean' || !Array.isArray(coverage.sources) || typeof detail.notRecorded !== 'boolean')
                throw new Error('历史详情覆盖范围未知');
            if (!Array.isArray(detail.rows) || !Array.isArray(detail.missingHistoryIds))
                throw new Error('历史详情未知');
            for (const item of detail.rows) {
                const found = object(item);
                if (found.historyId !== row.historyId || !Object.hasOwn(found, 'snapshot'))
                    throw new Error('历史详情身份不一致');
            }
            setDetails(previous => ({ ...previous, [row.historyId]: value }));
        });
    };
    const mutate = (request) => {
        void run(request, value => {
            safeCount(object(value).revision);
            setPage(null);
            setDetails({});
            setMessage('已提交历史副本/注入操作；未执行 Git 删除或磁盘清理，未声称删除源事件或原生会话。可重新查询核对结果。');
            void props.refresh();
        });
    };
    const sourceControls = (row, page) => {
        const plan = sourceCleanupPlan(row, page, props.instance.instrumentInstanceId);
        if (plan === null)
            return null;
        const purgeSource = () => {
            if (plan.request === null)
                return;
            void run({ action: 'purge-source', domain: plan.domain, request: { ...object(plan.request), operationId: crypto.randomUUID() } }, value => {
                const receipt = object(value);
                if (receipt.phase === 'partial')
                    throw new Error('源清理部分完成/状态未知：' + (receipt.derivedHistoryDeleted === true ? '衍生副本已处理；' : '衍生副本状态未知；') + '源旧历史删除未完成或不确定。' + String(receipt.error ?? ''));
                if (receipt.receiptRecording === 'failed-or-uncertain')
                    throw new Error('源清理回执记录失败或不确定，不能声称全部成功。' + String(receipt.error ?? ''));
                if (receipt.scope !== 'selected-source-history-only' || receipt.domain !== plan.domain || receipt.sourceRecordsDeleted !== true || receipt.derivedHistoryDeleted !== true || receipt.nativeConversationDeleted !== false || typeof receipt.replayed !== 'boolean')
                    throw new Error('源清理回执不完整或归属不一致');
                safeCount(receipt.appliedRevision ?? receipt.revision);
                setPage(null);
                setDetails({});
                setMessage('已删除所选对象的源旧历史及关联衍生副本；保留当前/最新记录。未删除原生会话，未执行 Git 或磁盘清理。' + (receipt.replayed ? '（原操作回执重放）' : ''));
                void props.refresh();
            });
        };
        return (0, react_1.createElement)('div', { 'aria-label': '源旧历史操作 ' + row.historyId }, diagnostic(plan.reason), (0, react_1.createElement)('button', { type: 'button', disabled: busy || plan.request === null, onClick: purgeSource }, '删除此对象截至本版本的源旧历史（保当前）'));
    };
    const changeFilter = (set, value) => { lifetime.generation++; lifetime.controller?.abort(); set(value); setPage(null); setDetails({}); setBusy(false); setMessage(null); };
    if (lifetime.sessionId !== props.sessionId || lifetime.instanceId !== props.instance.instrumentInstanceId)
        return diagnostic('所选会话 历史状态未知；等待重新选择查询。');
    return (0, react_1.createElement)('section', { 'aria-label': '主动历史查询' }, (0, react_1.createElement)('h4', null, '会话历史（按需查询）'), diagnostic('主动查询历史不等于自动注入；摘要页不包含正文，详情按行展开。已清理工作树仍可查。'), diagnostic('永久删除此条历史副本不可恢复，不等于 Git 删除、工作树磁盘清理，也不声称删除源事件或原生会话历史；仅提供单条显式操作。'), diagnostic('源旧历史删除是独立操作：仅删除所选对象截至本版本的源旧载荷与关联副本，保留最新/当前；不删除原生会话、Git 或磁盘，不自动清理或设置默认保留期限。源修订未知不可用。'), (0, react_1.createElement)('label', null, '类别（留空全部） ', (0, react_1.createElement)('input', { 'aria-label': '历史类别', value: kind, onChange: (event) => changeFilter(setKind, event.target.value) })), (0, react_1.createElement)('label', null, '记录 ID（留空全部） ', (0, react_1.createElement)('input', { 'aria-label': '历史记录 ID', value: recordId, onChange: (event) => changeFilter(setRecordId, event.target.value) })), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => query() }, '查询历史'), message === null ? null : diagnostic(message), page === null ? diagnostic(busy ? '历史读取中…' : '历史尚未查询或状态未知；不是 0 条。') : (0, react_1.createElement)('div', null, diagnostic('匹配总数 ' + page.total + ' · 截点 ' + page.cut + ' · 本页摘要 ' + page.rows.length), diagnostic('覆盖是观测标签，不保证所有原生历史已记录。recorded-history 是已记录历史；snapshot-only 只是快照。purged 表示有已删除副本，notRecorded 表示未记录或缺失。'), pretty(page.coverage), page.rows.map(row => (0, react_1.createElement)('article', { key: row.historyId, 'aria-label': '历史行 ' + row.historyId }, (0, react_1.createElement)('strong', null, row.kind + ' · ' + row.recordId + ' · ' + row.historyId + ' · 序号 ' + row.sequence), pretty(row), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { if (details[row.historyId] !== undefined)
            setDetails(previous => { const next = { ...previous }; delete next[row.historyId]; return next; });
        else
            expand(row); } }, details[row.historyId] === undefined ? '展开详情' : '收起详情'), details[row.historyId] === undefined ? null : pretty(details[row.historyId]), row.kind === 'worktree' || row.kind === 'worktrees' ? diagnostic('工作树当前注入由已清理状态决定；废弃但未清理仍提示待处置。') : (0, react_1.createElement)('div', null, (0, react_1.createElement)('button', { type: 'button', disabled: busy || row.purged, onClick: () => mutate({ action: 'set-context', kind: row.kind, recordId: row.recordId, included: false }) }, '退出当前注入（保留历史）'), (0, react_1.createElement)('button', { type: 'button', disabled: busy || row.purged, onClick: () => mutate({ action: 'set-context', kind: row.kind, recordId: row.recordId, included: true }) }, '纳入当前注入')), (0, react_1.createElement)('button', { type: 'button', disabled: busy || row.purged, onClick: () => mutate({ action: 'purge', historyIds: [row.historyId], archivedOnly: false }) }, '永久删除此条历史副本'), sourceControls(row, page))), (0, react_1.createElement)('button', { type: 'button', disabled: busy || page.nextCursor === null, onClick: () => { if (page.nextCursor !== null)
            query(page.nextCursor); } }, '下一页')));
}
function sessionListRequested(policy) {
    return policy !== null && (policy.defaults.display?.sessionList === true || Object.values(policy.workspaceOverrides).some(patch => patch.display?.sessionList === true));
}
class PolicyObserver {
    read;
    value = null;
    generation = 0;
    closed = false;
    pending;
    timer;
    hidden = documentHidden();
    listeners = new Set();
    onVisibility = () => {
        const hidden = documentHidden(), restored = this.hidden && !hidden;
        this.hidden = hidden;
        if (restored) {
            this.clearTimer();
            void this.refresh();
        }
        else if (hidden)
            this.arm();
    };
    constructor(read) {
        this.read = read;
        if (typeof document !== 'undefined')
            document.addEventListener('visibilitychange', this.onVisibility);
    }
    getSnapshot = () => this.value;
    subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    refresh() {
        if (this.closed)
            return Promise.resolve();
        if (this.pending !== undefined)
            return this.pending;
        const generation = ++this.generation;
        this.pending = (async () => {
            try {
                const value = (0, policy_js_1.parsePolicySnapshot)(remoteValue(await this.read()));
                if (this.closed || generation !== this.generation)
                    return;
                this.value = value;
            }
            catch {
                if (this.closed || generation !== this.generation)
                    return;
                this.value = null;
            }
            for (const listener of this.listeners)
                listener();
        })().finally(() => { this.pending = undefined; this.arm(); });
        return this.pending;
    }
    clearTimer() { if (this.timer !== undefined)
        clearTimeout(this.timer); this.timer = undefined; }
    arm() { this.clearTimer(); if (!this.closed)
        this.timer = setTimeout(() => { void this.refresh(); }, documentHidden() ? 60_000 : 30_000); }
    dispose() { this.closed = true; this.generation++; this.clearTimer(); if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', this.onVisibility); this.listeners.clear(); }
}
exports.PolicyObserver = PolicyObserver;
function WorkspaceBadge(props) {
    const policy = (0, react_1.useSyncExternalStore)(props.visibility.subscribe, props.visibility.getSnapshot, props.visibility.getSnapshot);
    if (!sessionListRequested(policy))
        return null;
    return (0, react_1.createElement)(BadgeContent, { observer: props.observeSummary(props.sessionId), policyRevision: policy.revision });
}
function BadgeContent(props) {
    const observation = (0, react_1.useSyncExternalStore)(props.observer.subscribe, props.observer.getSnapshot, props.observer.getSnapshot);
    const active = props.observer.getDisplay()?.sessionList !== false || props.observer.getConfigurationRevision() !== props.policyRevision;
    (0, react_1.useEffect)(() => active ? props.observer.retain() : undefined, [props.observer, active]);
    if (observation.status !== 'ready')
        return props.observer.getDisplay()?.sessionList ? (0, react_1.createElement)('span', { title: observation.error ?? '协作提醒未知' }, '?') : null;
    if (!observation.value.policy.display.sessionList)
        return null;
    const count = observation.value.records?.summary.pendingUserDecisionCount;
    return count === undefined ? (0, react_1.createElement)('span', { title: '协作提醒未知' }, '?') : count === 0 ? null : (0, react_1.createElement)('span', { title: '待用户裁决 ' + count, 'aria-label': '待用户裁决 ' + count, style: { display: 'inline-block', maxWidth: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, String(count));
}
function decodeWorkspaces(value) {
    if (!Array.isArray(value))
        throw new Error('Host workspace list is unavailable');
    return value.map(value => {
        const row = object(value);
        if (row.sessionIds !== undefined && !Array.isArray(row.sessionIds))
            throw new Error('Host Session navigation is unavailable');
        return { workspaceId: nonempty(row.id), label: nonempty(row.title), verified: row.status === 'ok',
            sessionIds: row.sessionIds === undefined ? null : [...new Set(row.sessionIds.map(nonempty))] };
    });
}
/** Navigation only. Listed ids grant neither ACL rights nor an owner-instance association. */
function settingsSessionChoices(workspaces, workspaceId) {
    const rows = workspaceId === null ? workspaces : workspaces.filter(row => row.workspaceId === workspaceId);
    const ids = [...new Set(rows.flatMap(row => row.sessionIds ?? []))].sort();
    return { ids, unknown: rows.length === 0 || rows.some(row => row.sessionIds === null) };
}
/** Explicit selected-session read projection on the settings page, independent of sidebar placement. */
function SettingsInspection(props) {
    if (props.observer.sessionId !== props.sessionId)
        return diagnostic('会话选择与观察归属不一致；状态未知。');
    return (0, react_1.createElement)(ObservedSettingsInspection, props);
}
function ObservedSettingsInspection(props) {
    const observation = useObservation(props.observer);
    if (props.observer.sessionId !== props.sessionId || (observation.status === 'ready' && observation.value.sessionId !== props.sessionId))
        return diagnostic('会话选择与观察归属不一致；状态未知。');
    if (observation.status !== 'ready')
        return (0, react_1.createElement)('section', { 'aria-label': '设置页会话仪器', style: { maxHeight: '50vh', overflow: 'auto' } }, diagnostic(props.sessionId + ' · 仪器状态未知：' + (observation.error ?? '读取中')), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '重新读取所选会话'));
    const view = observation.value;
    return (0, react_1.createElement)('section', { 'aria-label': '设置页会话仪器', style: { maxHeight: '50vh', overflow: 'auto' } }, (0, react_1.createElement)('h4', null, '所选会话 ' + props.sessionId + ' · 当前投影与显式登记'), diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · 主会话 ' + view.instance.ownerSessionId + ' · 真实调用者 ' + view.caller.kind + ':' + view.caller.principalId), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '刷新所选会话'), (0, react_1.createElement)('h4', null, '任务引用、旧票报告与裁决记录'), (0, react_1.createElement)(TaskReferences, { key: decisionReadingIdentity(view) + ':references', view }), (0, react_1.createElement)('section', { 'aria-label': '设置页裁决记录' }, (0, react_1.createElement)(DecisionQueues, { key: decisionReadingIdentity(view), view })), (0, react_1.createElement)(DecisionTechnicalDetails, { key: decisionReadingIdentity(view) + ':raw', label: '票与事项账本技术数据', value: inputRecords(view) }), (0, react_1.createElement)('h4', null, '独立 T/S（观测）'), (0, react_1.createElement)(WindowProjection, { view }), props.remote ? (0, react_1.createElement)(WorktreeBindingsPanel, { key: props.sessionId + ':bindings', view, remote: props.remote, refresh: props.observer.refresh }) : null, (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '旧资源记录（仅只读）'), ResourceProjection({ view })), props.remote ? (0, react_1.createElement)(HistoryPanel, { key: props.sessionId + ':history', sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }) : null, (0, react_1.createElement)('h4', null, '能力、健康观测与有效策略'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health, policy: view.policy }));
}
// Settings-only composition: public primitives keep their native control/focus styling.
const settingsBorder = '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22))';
const settingsSecondary = 'var(--dsw-alias-label-secondary, #61666b)';
const settingsAccent = 'color-mix(in srgb, var(--dsw-alias-state-business-primary, #4176e6) 85%, var(--dsw-alias-label-primary, CanvasText))';
const settingsWarning = 'color-mix(in srgb, var(--dsw-alias-state-warn-label, #dd8629) 65%, var(--dsw-alias-label-primary, CanvasText))';
const settingsCard = { border: 0, borderTop: settingsBorder, padding: '20px 0', minWidth: 0, overflowWrap: 'anywhere' };
const settingsGroup = { border: settingsBorder, borderRadius: '12px', padding: '16px 20px', margin: 0, minWidth: 0, background: 'var(--dsw-alias-bg-base, Canvas)' };
const settingsLegend = { padding: '0 8px', fontSize: '15px', fontWeight: 650 };
const settingsHint = { color: settingsSecondary, fontSize: '13px', lineHeight: 1.6, margin: '8px 0 12px' };
const settingsGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '20px', minWidth: 0, alignItems: 'start' };
const settingsActions = { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' };
const settingsField = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', padding: '12px 0', margin: 0, minWidth: 0, borderBottom: settingsBorder };
const settingsSelect = { font: 'inherit', color: 'var(--dsw-alias-label-primary, CanvasText)', background: 'var(--dsw-alias-bg-base, Canvas)', border: settingsBorder, borderRadius: '8px', minHeight: '36px', padding: '6px 28px 6px 10px', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' };
function settingsHeading(title, detail) {
    return (0, react_1.createElement)('header', { style: { marginBottom: '20px', borderLeft: '3px solid ' + settingsAccent, paddingLeft: '12px' } }, (0, react_1.createElement)('h3', { style: { margin: 0, fontSize: '18px', fontWeight: 650 } }, title), (0, react_1.createElement)('p', { style: { ...settingsHint, margin: '4px 0 0' } }, detail));
}
function settingsState(text, tone = 'muted') {
    return (0, react_1.createElement)('span', { style: { fontWeight: 600, color: tone === 'warning' ? settingsWarning : tone === 'accent' ? settingsAccent : settingsSecondary } }, text);
}
const FEATURE_LABELS = { binding: '工作树绑定', lifecycle: '子代理生命周期观测', windows: '任务与子代理参考窗口', ticketProgress: '任务票进度', pendingDecisions: '待裁决事项' };
const DISPLAY_LABELS = { header: '会话标题栏', inputSummary: '输入区摘要', rightPanel: '右侧协作面板', sessionList: '会话列表提醒', timeline: '工具记录标注' };
const CAPACITY_LABELS = { ticketWindowSize: '任务票参考上限（T）', runningSubagentLimit: '运行中子代理参考上限（S）' };
const SOURCE_LABELS = { workspace: '工作区覆盖', global: '全局默认', 'safe-initial': '安全初始值' };
const POLICY_FIELD_LABELS = {
    extensionEnabled: '协作管理总闸（全局）', 'workspace.enabled': '本工作区总闸', 'skills.enabled': '本工作区技能分发', 'binding.enabled': FEATURE_LABELS.binding, 'lifecycle.enabled': FEATURE_LABELS.lifecycle,
    'windows.enabled': FEATURE_LABELS.windows, 'ticketProgress.enabled': FEATURE_LABELS.ticketProgress, 'pendingDecisions.enabled': FEATURE_LABELS.pendingDecisions, 'pendingDecisions.interactionMode': '裁决交互偏好',
    'windows.ticketWindowSize': CAPACITY_LABELS.ticketWindowSize, 'windows.runningSubagentLimit': CAPACITY_LABELS.runningSubagentLimit,
    'display.header': DISPLAY_LABELS.header, 'display.inputSummary': DISPLAY_LABELS.inputSummary, 'display.rightPanel': DISPLAY_LABELS.rightPanel,
    'display.sessionList': DISPLAY_LABELS.sessionList, 'display.timeline': DISPLAY_LABELS.timeline,
};
function policyFeatureText(value) {
    const state = { configured: '已配置（仅意图）', disabled: '未启用', unsupported: '条件不满足' }[value.status];
    const reasons = { 'extension-disabled': '全局总闸已关闭', 'workspace-disabled': '本工作区总闸已关闭', 'feature-disabled': '此功能已关闭', 'workspace-unverified': '工作区未核验', 'window-capacity-unset': '参考上限未配置' };
    return state + (value.reason === null ? '' : ' · ' + reasons[value.reason]);
}
function policyImpactText(value) {
    if (typeof value === 'boolean')
        return value ? '启用' : '禁用';
    if (value === null)
        return '未配置';
    if (typeof value === 'number')
        return String(value);
    if (value === 'native-question')
        return '原生提问优先';
    if (value === 'async-decision')
        return '异步裁决优先';
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const row = value;
        const label = row.value !== null && typeof row.value === 'object' ? policyFeatureText(row.value) : policyImpactText(row.value);
        return label + '（' + (SOURCE_LABELS[row.source] ?? '未知来源') + '）';
    }
    return '未知（详见原始诊断）';
}
function unsupportedSeatsDetails() {
    return (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '显示限制（宿主暂未提供对应接口）'), (0, react_1.createElement)('ul', null, (0, react_1.createElement)('li', null, '独立的第二行会话标题：宿主没有可追加的全宽标题栏位置。'), (0, react_1.createElement)('li', null, '会话列表常驻徽标：当前装饰只在空闲时显示，详情只在鼠标悬停时显示。'), (0, react_1.createElement)('li', null, '后台打开协作面板：宿主打开标签页时会选中并展开，暂不支持不切换焦点的后台打开。')), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '原始接口诊断'), pretty(exports.UNSUPPORTED_SEATS)));
}
const SUPERVISION_ROUTE_LABELS = { inherit: '继承主路由', explicit: '显式 provider / model' };
const SUPERVISION_START_LABELS = { 'ticket-held': '开始处理票后', 'first-support-surge': '首次支撑写入激增' };
const SUPERVISION_DELIVERY_LABELS = { card: '仅卡片', 'card+agent-check': '卡片 + agent 检查句' };
const SUPERVISION_SUSPICION_LABELS = { auto: '自动', off: '关闭程序嫌疑（定期审计仍运行）' };
function supervisionNumber(value) { return typeof value === 'number' ? value : undefined; }
function SupervisionSettingsPanel(props) {
    const [saved, setSaved] = (0, react_1.useState)(null);
    const [draft, setDraft] = (0, react_1.useState)(null);
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    const [reload, setReload] = (0, react_1.useState)(0);
    (0, react_1.useEffect)(() => {
        let active = true;
        setMessage(null);
        void Promise.resolve().then(() => props.remote.readSupervisionConfig()).then(result => {
            const snapshot = (0, supervision_config_js_1.parseSupervisionConfigSnapshot)(remoteValue(result));
            if (!active)
                return;
            setSaved(snapshot);
            setDraft((0, supervision_config_js_1.supervisionIntentOf)(snapshot));
        }).catch(error => { if (active)
            setMessage('交付监督配置不可用：' + errorText(error)); });
        return () => { active = false; };
    }, [props.remote, reload]);
    if (saved === null || draft === null)
        return (0, react_1.createElement)('section', { 'aria-label': '交付监督配置', style: settingsCard }, settingsHeading('交付监督', '进阶设置 · 独立于协作策略保存'), diagnostic('读取交付监督配置…'), message === null ? null : diagnostic(message), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取监督配置'));
    const scope = props.workspace === null ? '全局默认' : '本工作区覆盖';
    const inheritLabel = props.workspace === null ? '未设置（安全初始值）' : '继承全局';
    const effective = (0, supervision_config_js_1.resolveSupervisionSettings)(draft, props.workspace ?? 'global-preview');
    const own = (field) => (0, supervision_config_js_1.ownSupervisionLeaf)(draft, props.workspace, field);
    const update = (field, value) => {
        try {
            setDraft((0, supervision_config_js_1.setSupervisionLeaf)(draft, props.workspace, field, value));
            setMessage(null);
        }
        catch (error) {
            setMessage('配置值无效：' + errorText(error));
        }
    };
    const dirty = JSON.stringify(draft) !== JSON.stringify((0, supervision_config_js_1.supervisionIntentOf)(saved));
    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const snapshot = (0, supervision_config_js_1.parseSupervisionConfigSnapshot)(remoteValue(await props.remote.saveSupervisionConfig(draft, saved.revision)));
            setSaved(snapshot);
            setDraft((0, supervision_config_js_1.supervisionIntentOf)(snapshot));
            setMessage('已保存监督配置（修订 ' + snapshot.revision + '）。运行时将按两级总闸、监督开关、活动与预算条件读取此配置；保存不代表必定启动模型调用。');
        }
        catch (error) {
            setMessage('保存结果未确认：' + errorText(error) + '。请重新读取并核对，草稿未作为成功回执。');
        }
        finally {
            setBusy(false);
        }
    };
    const boolField = (field, label, value) => {
        const raw = own(field);
        return (0, react_1.createElement)('label', { key: field, style: { ...settingsField, justifyContent: 'space-between' } }, (0, react_1.createElement)('span', { style: { flex: '1 1 180px' } }, label), (0, react_1.createElement)('select', { style: settingsSelect, 'aria-label': label, value: raw === undefined ? 'inherit' : raw === true ? 'on' : 'off', disabled: busy,
            onChange: (event) => update(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') }, (0, react_1.createElement)('option', { value: 'inherit' }, inheritLabel), (0, react_1.createElement)('option', { value: 'on' }, '启用'), (0, react_1.createElement)('option', { value: 'off' }, '禁用')), (0, react_1.createElement)('small', { style: { flexBasis: '100%' } }, '有效值：' + (value ? '启用' : '禁用')));
    };
    const numberField = (field, label, value, minimum, maximum, step = 1) => {
        const raw = supervisionNumber(own(field));
        return (0, react_1.createElement)('label', { key: field, style: settingsField }, (0, react_1.createElement)('span', null, label), (0, react_1.createElement)(dsh_client_ui_primitives_1.Input, { 'aria-label': label, type: 'number', min: minimum, max: maximum, step, value: raw === undefined ? '' : String(raw), disabled: busy,
            placeholder: inheritLabel + '：' + value, style: { width: '130px', maxWidth: '100%' },
            onChange: (event) => {
                const text = event.target.value;
                if (text === '') {
                    update(field, undefined);
                    return;
                }
                const number = Number(text);
                if (Number.isFinite(number) && number >= minimum && number <= maximum)
                    update(field, number);
            } }), (0, react_1.createElement)('small', { style: { flexBasis: '100%' } }, '有效值：' + value));
    };
    const textField = (field, label, value, placeholder = '') => {
        const raw = own(field);
        return (0, react_1.createElement)('label', { key: field, style: settingsField }, (0, react_1.createElement)('span', null, label), (0, react_1.createElement)(dsh_client_ui_primitives_1.Input, { 'aria-label': label, type: 'text', value: typeof raw === 'string' ? raw : '', disabled: busy, placeholder: inheritLabel + '：' + (value || placeholder || '空'), style: { width: '100%', maxWidth: '360px' },
            onChange: (event) => update(field, event.target.value === '' ? undefined : event.target.value) }), (0, react_1.createElement)('small', { style: { flexBasis: '100%' } }, '有效值：' + (value || '空')));
    };
    const selectField = (field, label, value, options) => {
        const raw = own(field);
        return (0, react_1.createElement)('label', { key: field, style: settingsField }, (0, react_1.createElement)('span', null, label), (0, react_1.createElement)('select', { style: settingsSelect, 'aria-label': label, value: typeof raw === 'string' ? raw : '__unset__', disabled: busy,
            onChange: (event) => update(field, event.target.value === '__unset__' ? undefined : event.target.value) }, (0, react_1.createElement)('option', { value: '__unset__' }, inheritLabel), ...options.map(([option, text]) => (0, react_1.createElement)('option', { key: option, value: option }, text))), (0, react_1.createElement)('small', { style: { flexBasis: '100%' } }, '有效值：' + (options.find(([option]) => option === value)?.[1] ?? value)));
    };
    const listField = (field, label, values, hint) => {
        const raw = own(field);
        const text = Array.isArray(raw) ? raw.join('\n') : '';
        return (0, react_1.createElement)('label', { key: field, style: settingsField }, (0, react_1.createElement)('span', null, label), (0, react_1.createElement)('textarea', { 'aria-label': label, value: text, disabled: busy, rows: 3, placeholder: inheritLabel + '：' + (values.length === 0 ? '空' : values.join(', ')), style: { width: '100%', minHeight: '64px', boxSizing: 'border-box' },
            onChange: (event) => {
                const rows = event.target.value.split(/[\n,]/u).map(row => row.trim()).filter(row => row.length > 0);
                update(field, rows.length === 0 ? undefined : rows);
            } }), (0, react_1.createElement)('small', { style: { flexBasis: '100%' } }, hint + ' 有效值：' + (values.length === 0 ? '空' : values.join(', '))));
    };
    const route = effective.reviewer.routeMode;
    const softBudget = own('softBudgetHours');
    return (0, react_1.createElement)('section', { 'aria-label': '交付监督配置', style: settingsCard }, settingsHeading('交付监督', '进阶设置 · 独立于协作策略保存'), (0, react_1.createElement)('p', null, '当前编辑范围：' + scope + '。监督配置由宿主运行时读取；定期/嫌疑审计与 LLM reviewer 受两级总闸、监督开关、活动和预算等条件约束，保存不代表必定启动模型调用。'), (0, react_1.createElement)('div', { style: settingsGrid }, (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '开关与模型路由'), (0, react_1.createElement)('p', null, '父代理与子代理共用这条轻量 reviewer 路由；周期性审计和嫌疑审计共用。继承主路由时，owner 不活跃即审计不可用（失败关闭），不回退到旧路由。'), boolField('enabled', '请求启用交付监督', effective.enabled), selectField('reviewer.routeMode', '模型路由', route, [['inherit', SUPERVISION_ROUTE_LABELS.inherit], ['explicit', SUPERVISION_ROUTE_LABELS.explicit]]), textField('reviewer.provider', '显式 provider', effective.reviewer.provider), textField('reviewer.model', '显式 model', effective.reviewer.model), textField('reviewer.reasoningEffort', 'reasoning effort（可选）', effective.reviewer.reasoningEffort), numberField('reviewer.maxTokens', '单次输出上限', effective.reviewer.maxTokens, 256, 8192, 1), numberField('reviewer.timeoutMs', '超时（毫秒）', effective.reviewer.timeoutMs, 5000, 120000, 1000), numberField('reviewer.toolRounds', '只读工具轮数', effective.reviewer.toolRounds, 0, 2, 1), route === 'explicit' ? diagnostic('显式路由会把审计所需的路径/摘要发送给指定的 provider，可能不同于主模型；请确认这是你要的隐私边界。') : null, route === 'explicit' && (effective.reviewer.provider.length === 0 || effective.reviewer.model.length === 0) ? diagnostic('显式路由还缺 provider/model；保存会被拒绝，不会静默回退。') : null), (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '定期审计'), (0, react_1.createElement)('p', null, '定期审计是底线；程序嫌疑只提前/加深。无新活动时跳过模型调用。'), numberField('scheduledIntervalMinutes', '间隔（分钟）', effective.scheduledIntervalMinutes, 15, 240, 5), numberField('scheduledMaxPerHour', '每小时最多调用', effective.scheduledMaxPerHour, 1, 4, 1), numberField('scheduledMaxPerDay', '每日最多调用', effective.scheduledMaxPerDay, 1, 24, 1), numberField('scheduledDailyTokenBudget', '每日 token 预算', effective.scheduledDailyTokenBudget, 1000, 1000000, 1000), numberField('rollingSummaryHours', '滚动摘要回看（小时）', effective.rollingSummaryHours, 1, 72, 1), numberField('scheduledSummaryTopLanes', 'owner 摘要活跃 lane 上限', effective.scheduledSummaryTopLanes, 1, 20, 1)), (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '嫌疑与停滞巡检'), (0, react_1.createElement)('p', null, '程序信号只决定是否更深地看；研究/评审票可使用票级 off，定期审计仍按条件运行。'), selectField('suspicionStartMode', '开始方式', effective.suspicionStartMode, [['ticket-held', SUPERVISION_START_LABELS['ticket-held']], ['first-support-surge', SUPERVISION_START_LABELS['first-support-surge']]]), selectField('suspicionMode', '程序嫌疑模式', effective.suspicionMode, [['auto', SUPERVISION_SUSPICION_LABELS.auto], ['off', SUPERVISION_SUSPICION_LABELS.off]]), numberField('checkIntervalMinutes', '检查间隔（分钟）', effective.checkIntervalMinutes, 5, 60, 1), numberField('noProgressChecks', '连续无进展检查数（K）', effective.noProgressChecks, 2, 12, 1), numberField('fastWindowMinutes', '快周期窗口（分钟）', effective.fastWindowMinutes, 15, 180, 5), numberField('supportWriteThreshold', '支撑写入阈值', effective.supportWriteThreshold, 1, 100, 1), numberField('supportReadBackThreshold', '支撑回读比例', effective.supportReadBackThreshold, 0, 1, 0.05), numberField('cooldownMinutes', '冷却（分钟）', effective.cooldownMinutes, 15, 360, 5), numberField('maxAuditsPer6h', '每 6 小时最多审计', effective.maxAuditsPer6h, 1, 12, 1), numberField('backoffFactor', '退避倍数', effective.backoffFactor, 1, 4, 1), boolField('lazyCheck', '懒检查（不后台唤醒）', effective.lazyCheck), boolField('dryRun', 'dry-run（只记录不投递）', effective.dryRun), numberField('episodeRetentionDays', '审计 episode 保留天数', effective.episodeRetentionDays, 1, 365, 1), numberField('episodeMaxEntries', '每 owner episode 上限', effective.episodeMaxEntries, 100, 10000, 100)), (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '投递与预算'), (0, react_1.createElement)('p', null, 'info 只写日志；concern 默认只出卡片；alert 还需 noProductGap 与 supportFiles 门槛才自动注入 agent。'), selectField('delivery.concern', 'concern 档', effective.delivery.concern, [['card', SUPERVISION_DELIVERY_LABELS.card], ['card+agent-check', SUPERVISION_DELIVERY_LABELS['card+agent-check']]]), selectField('delivery.alert', 'alert 档', effective.delivery.alert, [['card', SUPERVISION_DELIVERY_LABELS.card], ['card+agent-check', SUPERVISION_DELIVERY_LABELS['card+agent-check']]]), numberField('delivery.alertMinNoProductHours', 'alert：无产品写入小时', effective.delivery.alertMinNoProductHours, 1, 24, 1), numberField('delivery.alertMinSupportFiles', 'alert：支撑文件数', effective.delivery.alertMinSupportFiles, 1, 100, 1), (0, react_1.createElement)('label', { style: settingsField }, (0, react_1.createElement)('span', null, '软预算（小时）'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Input, { 'aria-label': '软预算（小时）', type: 'number', min: 1, max: 720, value: typeof softBudget === 'number' ? String(softBudget) : '', disabled: busy, placeholder: inheritLabel + '：' + (effective.softBudgetHours === null ? '关闭' : effective.softBudgetHours), style: { width: '120px' },
        onChange: (event) => {
            const text = event.target.value;
            if (text === '') {
                update('softBudgetHours', undefined);
                return;
            }
            const number = Number(text);
            if (Number.isFinite(number) && number >= 1 && number <= 720)
                update('softBudgetHours', number);
        } }), (0, react_1.createElement)('label', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Input, { type: 'checkbox', checked: softBudget === null, disabled: busy, onChange: (event) => update('softBudgetHours', event.target.checked ? null : undefined) }), '关闭'), (0, react_1.createElement)('small', { style: { flexBasis: '100%' } }, '有效值：' + (effective.softBudgetHours === null ? '关闭（仅人工提醒）' : effective.softBudgetHours + ' 小时')))), (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '交付路径'), (0, react_1.createElement)('p', null, '产品/支撑根用于区分交付写入与支撑写入；空表示未配置。这里只保存，不改变任何文件或票。'), listField('deliverableRoots', '产品根（每行/逗号一项）', effective.deliverableRoots, '留空继承。'), listField('supportRoots', '支撑根（每行/逗号一项）', effective.supportRoots, '留空继承。'), listField('excludeGlobs', '排除 glob（每行/逗号一项）', effective.excludeGlobs, '留空继承。'))), (0, react_1.createElement)('div', { style: settingsActions }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'primary', disabled: busy || !dirty, onClick: () => { void save(); } }, busy ? '正在保存…' : '保存监督配置'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', disabled: busy || !dirty, onClick: () => { setDraft((0, supervision_config_js_1.supervisionIntentOf)(saved)); setMessage(null); } }, '放弃未保存更改'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', disabled: busy, onClick: () => setReload(value => value + 1) }, '重新读取监督配置')), (0, react_1.createElement)('p', null, '配置修订 ' + saved.revision + ' · ' + (dirty ? '有未保存更改' : '与已保存配置一致') + '。保存只写独立 supervision 配置，不写入协作 PolicySnapshot。'), message === null ? null : diagnostic(message), (0, react_1.createElement)('details', { style: { marginTop: '12px' } }, (0, react_1.createElement)('summary', null, '技术详情（有效监督配置）'), pretty(effective)));
}
function SupervisionHistory(props) {
    const [document, setDocument] = (0, react_1.useState)(null);
    const [message, setMessage] = (0, react_1.useState)(null);
    const [reload, setReload] = (0, react_1.useState)(0);
    (0, react_1.useEffect)(() => {
        let active = true;
        setMessage(null);
        setDocument(null);
        if (props.sessionId === null)
            return () => { active = false; };
        void Promise.resolve().then(() => props.remote.readSupervision(props.sessionId)).then(result => {
            const value = remoteValue(result);
            if (!active)
                return;
            setDocument(value === null ? { episodes: [] } : (0, supervision_audit_js_1.parseSupervisionDocument)(value));
        }).catch(error => { if (active)
            setMessage('监督记录不可用：' + errorText(error)); });
        return () => { active = false; };
    }, [props.remote, props.sessionId, reload]);
    return (0, react_1.createElement)('section', { 'aria-label': '交付监督记录', style: settingsCard }, (0, react_1.createElement)('h3', { style: { marginTop: 0 } }, '交付监督记录'), (0, react_1.createElement)('p', null, '只读当前会话 owner 的持久化审计 episode；没有推送卡片，也不修改任何票、T/S 或工作树。'), props.sessionId === null ? diagnostic('先选择一个会话查看监督记录。') : message !== null ? diagnostic(message) : document === null ? diagnostic('读取监督记录…') : document.episodes.length === 0 ? diagnostic('当前没有已记录的审计 episode（可能未启用、仍是 dry-run 或尚未到点）。') :
        (0, react_1.createElement)('ul', { style: { display: 'grid', gap: '8px', paddingLeft: '18px' } }, document.episodes.slice().reverse().map(episode => (0, react_1.createElement)('li', { key: episode.episodeId }, (0, react_1.createElement)('strong', null, episode.trigger + ' · ' + episode.severity + ' · ' + episode.verdict + ' · ' + episode.delivery + ' · ' + new Date(episode.at).toISOString() + (episode.ticketId === null ? '' : ' · ' + episode.ticketId) + (episode.research ? ' · 研究/评审标记' : '')), (0, react_1.createElement)('div', null, '观察：' + episode.observed), (0, react_1.createElement)('div', null, '可能的问题：' + episode.possibleIssue)))), props.sessionId === null ? null : (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取监督记录'));
}
function SettingsPage(props) {
    const [saved, setSaved] = (0, react_1.useState)(null);
    const [draft, setDraft] = (0, react_1.useState)(null);
    const [workspaces, setWorkspaces] = (0, react_1.useState)([]);
    const [workspace, setWorkspace] = (0, react_1.useState)(null);
    const [inspection, setInspection] = (0, react_1.useState)(null);
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    const [reload, setReload] = (0, react_1.useState)(0);
    (0, react_1.useEffect)(() => {
        let active = true;
        void Promise.all([props.remote.readPolicy(), props.remote.listWorkspaces()]).then(([policy, list]) => {
            const snapshot = (0, policy_js_1.parsePolicySnapshot)(remoteValue(policy));
            const rows = decodeWorkspaces(remoteValue(list));
            if (!active)
                return;
            setSaved(snapshot);
            setDraft(intentOf(snapshot));
            setWorkspaces(rows);
            setWorkspace(rows[0]?.workspaceId ?? null);
            setInspection(null);
            setMessage(null);
        }).catch(error => { if (active)
            setMessage('协作配置不可用：' + errorText(error)); });
        return () => { active = false; };
    }, [props.remote, reload]);
    if (props.view === 'summary')
        return (0, react_1.createElement)('span', null, '协作管理、交付监督与会话仪器；配置分别保存。');
    const pageStyle = { display: 'grid', gap: '28px', minWidth: 0, width: '100%', maxWidth: '1040px', margin: '0 auto', color: 'var(--dsw-alias-label-primary, CanvasText)', fontSize: '14px', lineHeight: 1.6, overflowWrap: 'anywhere' };
    if (saved === null || draft === null)
        return (0, react_1.createElement)('section', { 'aria-label': '插件配置', style: pageStyle }, (0, react_1.createElement)('details', { key: 'supervision-settings', 'aria-label': '进阶交付监督', style: settingsCard }, (0, react_1.createElement)('summary', { tabIndex: 0, style: { cursor: 'pointer', fontSize: '16px', fontWeight: 600 } }, '进阶交付监督（独立保存）'), (0, react_1.createElement)(SupervisionSettingsPanel, { remote: props.remote, workspace: null })), (0, react_1.createElement)('section', { 'aria-label': '工作区协作管理', style: settingsCard }, (0, react_1.createElement)('h3', null, '协作管理'), diagnostic(message ?? '读取已保存的协作配置…'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取协作配置')));
    const selected = workspaces.find(row => row.workspaceId === workspace);
    const sessionChoices = settingsSessionChoices(workspaces, workspace);
    const selectedInspection = inspection !== null && sessionChoices.ids.includes(inspection) ? inspection : null;
    const preview = (0, policy_js_1.resolvePolicy)({ ...draft, workspaceOverrides: workspace === null ? {} : draft.workspaceOverrides, revision: saved.revision }, workspace ?? 'global-preview', workspace === null || selected?.verified === true);
    const impact = policyDraftImpact(saved, draft, workspace, workspace === null || selected?.verified === true);
    const change = (field, value) => {
        try {
            setDraft(setPolicyLeaf(draft, workspace, field, value));
            setMessage(null);
        }
        catch (error) {
            setMessage('配置值无效：' + errorText(error));
        }
    };
    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const snapshot = await savePolicyDraft(props.remote, draft, saved.revision);
            setSaved(snapshot);
            setDraft(intentOf(snapshot));
            props.refreshAll();
            setMessage('已保存并应用配置（修订 ' + snapshot.revision + '）；协作管理' + (snapshot.extensionEnabled ? '已启用' : '已关闭') + '，无需额外启用按钮。功能可用性仍以宿主能力与会话观测为准。' + (snapshot.extensionEnabled ? '' : '协作管理总闸（全局）仍为关闭，各工作区的「协作功能」「参考上限」都不会生效。'));
        }
        catch (error) {
            setMessage('保存结果未确认：' + errorText(error) + '。请重新读取协作配置核对，草稿未作为成功回执。');
        }
        finally {
            setBusy(false);
        }
    };
    const globalScope = workspace === null;
    const inheritLabel = globalScope ? '未设置（用安全初始值）' : '继承全局';
    const scopeWord = globalScope ? '所有工作区默认' : '本工作区';
    const gateReason = (value) => value.reason === 'extension-disabled' || value.reason === 'workspace-disabled';
    const booleanField = (field, label, effective, alert = false) => {
        const explicit = ownLeaf(draft, workspace, field);
        return (0, react_1.createElement)('label', { key: field, style: { ...settingsField, justifyContent: 'space-between' } }, (0, react_1.createElement)('span', { style: { flex: '1 1 170px', fontWeight: 550 } }, label), (0, react_1.createElement)('select', { style: settingsSelect, 'aria-label': label, value: explicit === undefined ? 'inherit' : explicit ? 'on' : 'off', disabled: busy,
            onChange: (event) => change(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') }, (0, react_1.createElement)('option', { value: 'inherit' }, inheritLabel), (0, react_1.createElement)('option', { value: 'on' }, '启用'), (0, react_1.createElement)('option', { value: 'off' }, '禁用')), (0, react_1.createElement)('small', { style: { flexBasis: '100%', color: settingsSecondary, fontSize: '12px' } }, settingsState((alert ? '总闸未开 · ' : '') + '草稿有效值：' + effective, alert ? 'warning' : 'muted'), (0, react_1.createElement)('span', { style: { display: 'block', marginTop: '2px' } }, '来源：' + SOURCE_LABELS[preview.sources[field]])));
    };
    const gateField = (field, label, open, effectiveText) => {
        const explicit = ownLeaf(draft, workspace, field);
        return (0, react_1.createElement)('div', { key: field, style: settingsField }, (0, react_1.createElement)('span', { style: { fontWeight: 600, flex: '1 1 180px' } }, label), (0, react_1.createElement)('select', { style: settingsSelect, 'aria-label': label, value: explicit === undefined ? 'inherit' : explicit ? 'on' : 'off', disabled: busy,
            onChange: (event) => change(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') }, (0, react_1.createElement)('option', { value: 'inherit' }, inheritLabel), (0, react_1.createElement)('option', { value: 'on' }, '启用'), (0, react_1.createElement)('option', { value: 'off' }, '禁用')), settingsState(effectiveText, open ? 'accent' : 'muted'), (0, react_1.createElement)('small', { style: { flexBasis: '100%', color: settingsSecondary } }, '来源：' + SOURCE_LABELS[preview.sources[field]]));
    };
    const gatePanel = (0, react_1.createElement)('section', { 'aria-label': '范围与总闸', style: { ...settingsGroup, background: 'var(--dsw-alias-bg-module-platform, Canvas)', marginBottom: '20px' } }, (0, react_1.createElement)('h4', { style: { margin: '0 0 12px', fontSize: '15px', fontWeight: 650 } }, '编辑范围与总闸'), (0, react_1.createElement)('p', { style: settingsHint }, '总闸为全局设置；其余字段按所选范围编辑。切换范围保留草稿，保存会提交全部策略更改。'), (0, react_1.createElement)('label', { style: { ...settingsField, paddingTop: 0 } }, (0, react_1.createElement)('span', { style: { fontWeight: 600, flex: '1 1 170px' } }, '配置编辑范围'), (0, react_1.createElement)('select', { 'aria-label': '配置编辑范围', value: workspace ?? '', disabled: busy, style: { ...settingsSelect, flex: '1 1 240px' }, onChange: (event) => { setWorkspace(event.target.value || null); setInspection(null); } }, ...workspaces.map(row => (0, react_1.createElement)('option', { key: row.workspaceId, value: row.workspaceId }, row.label + (row.verified ? '' : '（未核验）'))), (0, react_1.createElement)('option', { value: '' }, '全局默认'))), (0, react_1.createElement)('div', { style: { ...settingsField, gap: '12px', borderBottom: 0 } }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Checkbox, { label: '协作管理总闸（全局）', checked: draft.extensionEnabled, disabled: busy, onChange: (checked) => { setDraft({ ...draft, extensionEnabled: checked }); setMessage(null); } }), settingsState(draft.extensionEnabled ? '草稿：已开启' : '草稿：已关闭', draft.extensionEnabled ? 'accent' : 'warning'), settingsState(preview.workspaceEnabled ? scopeWord + '总闸：已开' : scopeWord + '总闸：未开', preview.workspaceEnabled ? 'accent' : 'warning')), (0, react_1.createElement)('p', { style: settingsHint }, '两级总闸都打开后，当前范围的「协作功能」才生效；只开一级时下面会标出原因。总闸不影响技能分发。'), gateField('workspace.enabled', scopeWord + '总闸', preview.workspaceEnabled, preview.workspaceEnabled ? '已启用' : '未启用'), gateField('skills.enabled', scopeWord + '技能分发', preview.skillsEnabled, preview.skillsEnabled ? '启用' : '禁用'), (0, react_1.createElement)('p', { style: { ...settingsHint, marginBottom: 0 } }, globalScope
        ? '当前编辑的是「全局默认」：选「未设置（用安全初始值）」表示没有默认值，该叶子回落到安全初始值（本工作区总闸＝关闭，技能分发＝开启）。'
        : '选「继承全局」表示删除本工作区的覆盖，回落到上面的全局默认；参考上限留空同理。'));
    const gateRow = (0, react_1.createElement)('div', { style: { color: settingsWarning, borderLeft: !draft.extensionEnabled ? '3px solid ' + settingsWarning : undefined, paddingLeft: '12px', marginBottom: '20px' } }, !draft.extensionEnabled ? diagnostic('全局总闸当前为关闭：下面各范围的「协作功能」「参考上限」都不会生效，只有「界面显示位置」与技能分发不受影响。') : null);
    const featureField = (name) => booleanField((name + '.enabled'), FEATURE_LABELS[name], policyFeatureText(preview.features[name]), gateReason(preview.features[name]));
    const interactionField = 'pendingDecisions.interactionMode';
    const interactionMode = preview.pendingDecisions.interactionMode;
    // No public Select export on the supported baseline: use native semantic HTML.
    const interaction = (0, react_1.createElement)('label', { style: settingsField }, (0, react_1.createElement)('span', { style: { fontWeight: 600, flex: '1 1 170px' } }, '裁决交互偏好'), (0, react_1.createElement)('select', { style: settingsSelect, 'aria-label': '裁决交互偏好', value: ownLeaf(draft, workspace, interactionField) ?? '__unset__', disabled: busy,
        onChange: (event) => change(interactionField, event.target.value === '__unset__' ? undefined : event.target.value) }, (0, react_1.createElement)('option', { value: '__unset__' }, inheritLabel), (0, react_1.createElement)('option', { value: 'native-question' }, '原生提问优先'), (0, react_1.createElement)('option', { value: 'async-decision' }, '异步裁决优先')), (0, react_1.createElement)('small', { style: { flexBasis: '100%', color: settingsSecondary, fontSize: '12px' } }, '草稿有效值：' + policyImpactText(interactionMode) + ' · 来源：' + (SOURCE_LABELS[preview.sources[interactionField]] ?? '安全初始值') + ' · ' + policyFeatureText(preview.features.pendingDecisions)));
    const dirty = JSON.stringify(draft) !== JSON.stringify(intentOf(saved));
    const saveLabel = busy ? '正在保存…' : saved.extensionEnabled !== draft.extensionEnabled ? draft.extensionEnabled ? '保存并启用协作管理' : '保存并关闭协作管理' : '保存并应用配置';
    return (0, react_1.createElement)('section', { 'aria-label': '插件配置', style: pageStyle }, (0, react_1.createElement)('header', null, (0, react_1.createElement)('p', { style: { ...settingsHint, margin: '0 0 4px', color: settingsAccent, fontWeight: 600 } }, 'Matt Pocock Skills · 插件设置'), (0, react_1.createElement)('h2', { style: { margin: 0, fontSize: '26px', lineHeight: 1.4, fontWeight: 650 } }, '协作与提醒'), (0, react_1.createElement)('p', { style: { ...settingsHint, marginBottom: 0 } }, '服务器策略控制协作行为；个人提醒只保存在本浏览器。两者分别保存。')), (0, react_1.createElement)('section', { 'aria-label': '工作区协作管理', style: { minWidth: 0 } }, settingsHeading('协作管理', '服务器策略 · 配置修订 ' + saved.revision + ' · ' + (dirty ? '有未保存更改' : '与已保存配置一致')), gatePanel, gateRow, (0, react_1.createElement)('div', { style: settingsGrid }, (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '协作功能'), (0, react_1.createElement)('p', { style: settingsHint }, '选择需要的协作能力；每个功能仍受两级总闸约束。'), policy_js_1.FEATURE_NAMES.map(name => featureField(name)), interaction, (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '交互偏好说明'), (0, react_1.createElement)('p', null, '原生提问优先沿用可用的原生问答；异步裁决优先使用裁决仪器，由你通过下方原生会话消息答复，agent 可继续不依赖该裁决的工作。偏好不越过明确的等待确认或宿主权限，关闭功能时不激活该引导。'))), (0, react_1.createElement)('div', { style: { display: 'grid', gap: '20px', minWidth: 0 } }, (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '参考上限'), (0, react_1.createElement)('p', { style: settingsHint }, 'T/S 仅提供规模参考，不是硬名额；留空继承，不猜测默认数值。'), ['ticketWindowSize', 'runningSubagentLimit'].map(name => {
        const field = ('windows.' + name);
        return (0, react_1.createElement)('label', { key: name, style: settingsField }, (0, react_1.createElement)('span', { style: { flex: '1 1 200px', fontWeight: 550, color: settingsAccent } }, CAPACITY_LABELS[name]), (0, react_1.createElement)(dsh_client_ui_primitives_1.Input, { 'aria-label': CAPACITY_LABELS[name], type: 'number', min: 1, step: 1, style: { width: '100px', maxWidth: '100%' }, value: String(ownLeaf(draft, workspace, field) ?? ''),
            onChange: (event) => change(field, event.target.value === '' ? undefined : Number(event.target.value)) }), (0, react_1.createElement)('small', { style: { flexBasis: '100%', color: settingsSecondary, fontSize: '12px' } }, '草稿有效值：' + (preview.windows[name] ?? '未配置') + ' · 来源：' + SOURCE_LABELS[preview.sources[field]]));
    })), (0, react_1.createElement)('fieldset', { disabled: busy, style: settingsGroup }, (0, react_1.createElement)('legend', { style: settingsLegend }, '界面显示位置'), (0, react_1.createElement)('p', { style: settingsHint }, '只控制入口显示；隐藏不关闭功能，不删除记录，也不免除现有义务。'), policy_js_1.DISPLAY_NAMES.map(name => booleanField(('display.' + name), DISPLAY_LABELS[name], preview.display[name] ? '显示' : '隐藏'))))), !Object.values(preview.display).some(Boolean) ? diagnostic('全部显示入口已关闭；本浏览器个人提醒独立于这些显示设置。') : null, (0, react_1.createElement)('section', { 'aria-label': '保存前预览', style: { ...settingsGroup, marginTop: '24px', borderLeft: '3px solid ' + (dirty ? settingsWarning : settingsAccent), background: 'var(--dsw-alias-bg-module-platform, Canvas)' } }, (0, react_1.createElement)('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '8px' } }, (0, react_1.createElement)('h4', { style: { margin: 0, fontSize: '15px' } }, '保存前预览'), settingsState(dirty ? '待保存草稿' : '与已保存配置一致', dirty ? 'warning' : 'muted')), (0, react_1.createElement)('p', { style: settingsHint }, '配置修订 ' + saved.revision + ' · ' + (dirty ? '有未保存更改' : '与已保存配置一致') + '。预览仅代表配置意图，不代表执行结果。'), impact.changes.length === 0 ? (0, react_1.createElement)('p', null, dirty ? '保存将更新稀疏覆盖；当前编辑范围的有效值未改变。' : '没有待保存的更改。') : (0, react_1.createElement)('ul', null, impact.changes.map(row => (0, react_1.createElement)('li', { key: row.field }, (POLICY_FIELD_LABELS[row.field] ?? '未知配置项') + '：' + policyImpactText(row.before) + ' → ' + policyImpactText(row.after)))), (0, react_1.createElement)('p', { style: settingsHint }, '缩小参考上限不会释放正在执行的子代理；已有事实和义务保留，实际执行状态以会话观测为准。'), (0, react_1.createElement)('div', { style: settingsActions }, (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', variant: 'primary', disabled: busy || !dirty, onClick: () => { void save(); } }, saveLabel), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', disabled: busy || !dirty, onClick: () => { setDraft(intentOf(saved)); setMessage(null); } }, '放弃未保存更改'), (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { type: 'button', disabled: busy, onClick: () => setReload(value => value + 1) }, '重新读取协作配置（丢弃草稿）')), message === null ? null : diagnostic(message)), (0, react_1.createElement)('details', { style: { marginTop: '16px' } }, (0, react_1.createElement)('summary', null, '技术详情（原始有效策略与变更）'), pretty(preview), pretty(impact)), unsupportedSeatsDetails()), (0, react_1.createElement)(client_notifications_js_1.BrowserNotificationPreferencesPanel), (0, react_1.createElement)('details', { key: 'supervision-settings', 'aria-label': '进阶交付监督', style: settingsCard }, (0, react_1.createElement)('summary', { tabIndex: 0, style: { cursor: 'pointer', fontSize: '16px', fontWeight: 600 } }, '进阶交付监督（独立保存）'), (0, react_1.createElement)(SupervisionSettingsPanel, { remote: props.remote, workspace })), (0, react_1.createElement)('details', { 'aria-label': '会话状态查看', style: settingsCard }, (0, react_1.createElement)('summary', { tabIndex: 0, style: { cursor: 'pointer', fontSize: '16px', fontWeight: 600 } }, '会话状态查看'), (0, react_1.createElement)('p', { style: settingsHint }, '仅查看已存在会话，不修改草稿、不授予权限、不唤醒模型，也不自动打开侧栏。'), (0, react_1.createElement)('label', { style: settingsField }, '选择会话', (0, react_1.createElement)('select', { 'aria-label': '选择查看会话', value: selectedInspection ?? '', style: settingsSelect, onChange: (event) => setInspection(event.target.value || null) }, (0, react_1.createElement)('option', { value: '' }, '选择会话查看'), ...sessionChoices.ids.map(id => (0, react_1.createElement)('option', { key: id, value: id }, id)))), sessionChoices.unknown ? diagnostic('会话导航未知或不完整；不能据此断言没有会话。') : sessionChoices.ids.length === 0 ? (0, react_1.createElement)('p', null, '当前导航没有列出的会话（不是实例或权限结论）。') : null, selectedInspection === null ? null : (0, react_1.createElement)(SettingsInspection, { key: selectedInspection, sessionId: selectedInspection, observer: props.observe(selectedInspection), remote: props.remote }), (0, react_1.createElement)(SupervisionHistory, { remote: props.remote, sessionId: selectedInspection })));
}
const SOURCE_ERROR_COLOR = 'var(--dsw-alias-state-error-primary, #dc2626)';
const SOURCE_STOPPED_COLOR = 'var(--dsw-alias-state-warn-label, #b45309)';
const SOURCE_CAPTION_COLOR = 'var(--dsw-alias-label-caption, #6b7280)';
const SOURCE_SECONDARY_COLOR = 'var(--dsw-alias-label-secondary, #4b5563)';
/** Expanded bodies and payloads are user-opened; parse/format only then, with a cap for pathological results. */
const SOURCE_MAX_INLINE = 200_000;
const SOURCE_SUMMARY_STYLE = { display: 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%' };
const SOURCE_SUMMARY_TEXT_STYLE = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--dsh-content-font-size-secondary, 13px)', lineHeight: 'calc(24px + var(--dsh-content-font-delta, 0px))' };
const SOURCE_SECTION_STYLE = { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 };
const SOURCE_SECTION_LABEL_STYLE = { color: SOURCE_CAPTION_COLOR, fontSize: '11px', lineHeight: '16px', margin: '0 0 0 4px' };
const SOURCE_CAPTION_STYLE = { margin: '0 0 0 4px', color: SOURCE_CAPTION_COLOR, fontSize: '12px', lineHeight: '18px' };
const SOURCE_PRE_STYLE = { margin: '0 0 0 4px', maxHeight: '200px', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word', borderRadius: '8px', border: '.5px solid var(--dsw-alias-border-l1, rgba(127,127,127,.25))', background: 'var(--dsw-alias-markdown-code-block, rgba(127,127,127,.08))', color: SOURCE_SECONDARY_COLOR, font: 'var(--dsw-font-markdown-code-block-small, 12px/1.5 ui-monospace, monospace)', padding: '8px 10px' };
const SOURCE_BODY_STYLE = { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto', overflowX: 'hidden', minWidth: 0, marginTop: '2px', paddingRight: '2px' };
const SOURCE_NOTE_STYLE = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', minWidth: 0 };
const SOURCE_NOTE_TEXT_STYLE = { minWidth: 0, color: SOURCE_CAPTION_COLOR, fontSize: '12px', lineHeight: '18px', overflowWrap: 'anywhere' };
function sourceTruncatedLabel(total) { return '内容过长（' + String(total) + ' 字符），已截断显示'; }
function isSourceRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function sourceTextField(value) { return typeof value === 'string' && value.trim() !== '' ? value.trim() : null; }
function sourceFirstLine(value) { const newline = value.search(/\r?\n/u); return newline === -1 ? value : value.slice(0, newline); }
function sourceTruncate(value, max) { return value.length <= max ? value : value.slice(0, Math.max(1, max - 1)) + '…'; }
function sourceParse(text) {
    if (text === '' || text.length > SOURCE_MAX_INLINE)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
function sourceRequest(argsRaw) {
    if (argsRaw === null)
        return null;
    const parsed = sourceParse(argsRaw);
    if (!isSourceRecord(parsed))
        return null;
    return isSourceRecord(parsed.request) ? parsed.request : parsed;
}
function sourceCommand(request) {
    return request !== null && isSourceRecord(request.command) ? request.command : null;
}
function sourceArgsRaw(props) {
    if (props.phase === 'preparing')
        return null;
    if (props.phase === 'start')
        return props.block.argsRaw;
    return props.block.call?.argsRaw ?? null;
}
function sourceState(props) {
    if (props.phase === 'preparing')
        return 'preparing';
    if (props.phase === 'start')
        return 'running';
    if (props.block.error?.code === 'interrupted')
        return 'stopped';
    return props.block.isError ? 'error' : 'ok';
}
/** Compact English summary from wire action/target values; no translated title map. */
function sourceAction(toolName, request) {
    const command = sourceCommand(request);
    const commandAction = command === null ? null : sourceTextField(command.action);
    if (commandAction !== null)
        return commandAction;
    const action = request === null ? null : sourceTextField(request.action);
    if (action !== null)
        return action;
    if (toolName === 'mattpocock_assign')
        return 'assign';
    if (toolName === 'mattpocock_delegate')
        return 'delegate';
    return toolName.replace(/^mattpocock_/u, '') || 'instrument';
}
function sourceTarget(request) {
    if (request === null)
        return '';
    const command = sourceCommand(request);
    const pick = (key) => command !== null && command[key] !== undefined ? command[key] : request[key];
    const parts = [];
    const add = (value) => { if (value !== null && value !== '' && !parts.includes(value))
        parts.push(value); };
    add(sourceTextField(request.sessionId));
    const workflow = sourceTextField(pick('workflowId'));
    const item = sourceTextField(pick('localTicketId')) ?? sourceTextField(pick('decisionId'));
    if (workflow !== null && item !== null)
        add(workflow + '/' + item);
    else {
        add(workflow);
        add(item);
    }
    add(sourceTextField(request.resourceId));
    add(sourceTextField(pick('bindingId')));
    add(sourceTextField(pick('observationId')));
    add(sourceTextField(pick('state')));
    add(sourceTextField(request.domain));
    const query = isSourceRecord(request.query) ? request.query : null;
    add(sourceTextField(query?.kind));
    add(sourceTextField(request.kind));
    add(sourceTextField(request.recordId));
    const historyIds = Array.isArray(request.historyIds) ? request.historyIds.filter(value => typeof value === 'string') : [];
    if (historyIds.length > 0)
        add(String(historyIds.length) + ' history item(s)');
    const ticketIds = Array.isArray(request.ticketIds) ? request.ticketIds.filter(value => typeof value === 'string') : [];
    if (ticketIds.length > 0)
        add(String(ticketIds.length) + ' ticket(s)');
    const description = sourceTextField(request.description);
    if (description !== null)
        add(sourceFirstLine(description));
    add(sourceTextField(request.provider));
    const expectedRevision = pick('expectedRevision');
    if (typeof expectedRevision === 'number' && Number.isSafeInteger(expectedRevision))
        add('rev ' + String(expectedRevision));
    const generation = pick('generation');
    if (typeof generation === 'number' && Number.isSafeInteger(generation))
        add('gen ' + String(generation));
    if (typeof request.included === 'boolean')
        add(request.included ? 'include' : 'exclude');
    return sourceTruncate(parts.join(' · '), 180);
}
function sourceView(props) {
    const state = sourceState(props);
    if (state === 'preparing')
        return { state, summary: '', color: null, expandable: false };
    const request = sourceRequest(sourceArgsRaw(props));
    const parts = [sourceAction(props.toolName, request), sourceTarget(request)].filter(part => part !== '');
    if (state === 'running')
        parts.push('running');
    if (state === 'stopped')
        parts.push('interrupted');
    if (state === 'error') {
        const error = props.phase === 'result' ? props.block.error : undefined;
        const reason = error === undefined ? null : sourceTextField(error.reason) ?? sourceTextField(error.code);
        parts.push(reason === null ? 'failed' : 'failed: ' + sourceFirstLine(reason));
    }
    return { state, summary: sourceTruncate(parts.join(' · '), 180), color: state === 'error' ? SOURCE_ERROR_COLOR : state === 'stopped' ? SOURCE_STOPPED_COLOR : null, expandable: true };
}
function sourceSummaryElement(view) {
    if (view.summary === '')
        return null;
    return (0, react_1.createElement)('span', { style: SOURCE_SUMMARY_STYLE }, (0, react_1.createElement)('span', { 'aria-hidden': true, style: { flex: 'none', width: 2, height: 2, borderRadius: 1, background: SOURCE_CAPTION_COLOR, opacity: 0.55, margin: '0 8px' } }), (0, react_1.createElement)('span', { title: view.summary, style: { ...SOURCE_SUMMARY_TEXT_STYLE, color: view.color ?? 'inherit' } }, view.summary));
}
function decodeSourcePayload(text, fallbackNote = null) {
    if (text === '')
        return { kind: 'text', text: '', note: fallbackNote };
    if (text.length > SOURCE_MAX_INLINE)
        return { kind: 'text', text, note: '内容较长，按原文显示' };
    const parsed = sourceParse(text);
    if (parsed === undefined)
        return { kind: 'text', text, note: fallbackNote };
    if (typeof parsed === 'string')
        return { kind: 'text', text: parsed, note: fallbackNote };
    try {
        const pretty = JSON.stringify(parsed, null, 2);
        return { kind: 'json', text: pretty ?? text, note: fallbackNote };
    }
    catch {
        return { kind: 'text', text, note: fallbackNote };
    }
}
function sourceInput(props) {
    const argsRaw = sourceArgsRaw(props);
    if (argsRaw === null)
        return null;
    return decodeSourcePayload(argsRaw, props.phase === 'start' ? '参数可能仍在准备中，按原文显示' : null);
}
function sourceOutput(props) {
    if (props.phase !== 'result')
        return null;
    const content = props.block.content;
    if (content.length === 0)
        return null;
    const texts = [];
    const other = [];
    for (const block of content) {
        if (block.type === 'text')
            texts.push(block.text);
        else
            other.push(block.type);
    }
    const otherNote = other.length === 0 ? null : '另含非文本内容：' + other.join(', ');
    if (texts.length === 0)
        return { kind: 'text', text: '[non-text content: ' + other.join(', ') + ']', note: null };
    if (texts.length === 1)
        return decodeSourcePayload(texts[0], otherNote);
    const payloads = texts.map(text => decodeSourcePayload(text));
    if (payloads.every(payload => payload.kind === 'json'))
        return { kind: 'json', text: payloads.map(payload => payload.text).join('\n\n'), note: otherNote };
    return { kind: 'text', text: texts.join('\n\n'), note: otherNote };
}
function sourceErrorText(props) {
    if (props.phase !== 'result' || !props.block.isError)
        return null;
    const error = props.block.error;
    if (error === undefined)
        return '错误详情不可用（请查看原始记录）';
    const text = [error.name, error.code, error.reason].filter((value) => typeof value === 'string' && value.trim() !== '').join(' · ');
    return text === '' ? '错误详情不可用（请查看原始记录）' : text;
}
function sourcePayloadElement(payload) {
    const content = payload.kind === 'json'
        ? (0, react_1.createElement)(dsh_client_ui_primitives_1.CodeBlock, { code: payload.text, lang: 'json', showHeader: true, copyLabel: '复制', copiedLabel: '已复制' })
        : payload.text === '' ? (0, react_1.createElement)('span', { style: SOURCE_CAPTION_STYLE }, '空文本') : (0, react_1.createElement)('pre', { style: SOURCE_PRE_STYLE }, payload.text);
    return (0, react_1.createElement)('div', { style: { minWidth: 0 } }, content, payload.note === null ? null : (0, react_1.createElement)('p', { style: SOURCE_CAPTION_STYLE }, payload.note));
}
function sourceBody(props, openDetails, annotate, canOpenDetails) {
    const children = [];
    const input = sourceInput(props);
    if (input === null)
        children.push((0, react_1.createElement)('p', { key: 'input-unknown', style: SOURCE_CAPTION_STYLE }, '输入未知（调用头不在当前窗口）'));
    else if (input.kind === 'text' && input.text === '')
        children.push((0, react_1.createElement)('p', { key: 'input-empty', style: SOURCE_CAPTION_STYLE }, '输入为空'));
    else
        children.push((0, react_1.createElement)('div', { key: 'input', style: SOURCE_SECTION_STYLE }, (0, react_1.createElement)('div', { style: SOURCE_SECTION_LABEL_STYLE }, '输入'), sourcePayloadElement(input)));
    if (props.phase === 'result') {
        const output = sourceOutput(props);
        children.push((0, react_1.createElement)('div', { key: 'output', style: SOURCE_SECTION_STYLE }, (0, react_1.createElement)('div', { style: SOURCE_SECTION_LABEL_STYLE }, '输出'), output === null ? (0, react_1.createElement)('p', { style: SOURCE_CAPTION_STYLE }, '无输出') : sourcePayloadElement(output)));
    }
    else
        children.push((0, react_1.createElement)('p', { key: 'running-output', style: SOURCE_CAPTION_STYLE }, '运行中，尚无输出'));
    const error = sourceErrorText(props);
    if (error !== null)
        children.push((0, react_1.createElement)('div', { key: 'error', style: SOURCE_SECTION_STYLE }, (0, react_1.createElement)('div', { style: SOURCE_SECTION_LABEL_STYLE }, '错误'), (0, react_1.createElement)('pre', { style: { ...SOURCE_PRE_STYLE, color: SOURCE_ERROR_COLOR } }, error)));
    if (annotate)
        children.push((0, react_1.createElement)('div', { key: 'source-note', style: SOURCE_NOTE_STYLE }, (0, react_1.createElement)('span', { style: SOURCE_NOTE_TEXT_STYLE }, '来源记录 · call ' + props.callId + ' · 历史快照；当前事实以实例账本为准。'), canOpenDetails ? (0, react_1.createElement)(dsh_client_ui_primitives_1.Button, { size: 'sm', variant: 'ghost', onClick: openDetails }, '打开当前实例') : null));
    children.push((0, react_1.createElement)(dsh_client_ui_primitives_1.JsonBlock, { key: 'raw', label: '原始记录（JSON）', payload: sourceRecord(props), defaultOpen: false, truncatedLabel: sourceTruncatedLabel }));
    return (0, react_1.createElement)('div', { style: SOURCE_BODY_STYLE }, ...children);
}
/** Read only public call material; never serialize the lazy argument reader's internals. */
function sourceRecord(props) {
    if (props.phase === 'preparing')
        return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, note: 'Arguments are still preparing and may be incomplete.' };
    if (props.phase === 'start')
        return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, argsRaw: props.block.argsRaw };
    return { phase: props.phase, callId: props.callId, name: props.toolName, time: props.block.time, seq: props.block.seq, argsRaw: props.block.call?.argsRaw ?? null, content: props.block.content, isError: props.block.isError, error: props.block.error ?? null, meta: props.block.meta ?? null };
}
/** Only our own wire Tool names may claim a toolview; never another plugin's key. */
function SourceCard(props) {
    const observation = useSummaryObservation(props.summary);
    const disclosure = props.useDisclosure();
    const view = (0, react_1.useMemo)(() => sourceView(props), [props.phase, props.block, props.toolName]);
    const annotate = observation.status === 'ready' && observation.value.policy.display.timeline;
    const canOpenDetails = annotate && observation.status === 'ready' && observation.value.policy.display.rightPanel;
    const open = disclosure.expanded && view.expandable;
    const body = (0, react_1.useMemo)(() => open ? sourceBody(props, props.openDetails, annotate, canOpenDetails) : null, [open, annotate, canOpenDetails, props.phase, props.block, props.callId, props.toolName, props.openDetails]);
    return (0, react_1.createElement)('section', { 'aria-label': '协作工具记录', 'data-tool': props.toolName, 'data-state': view.state,
        style: { boxSizing: 'border-box', width: '100%', maxWidth: '100%', minWidth: 0, textAlign: 'left' } }, (0, react_1.createElement)(dsh_client_ui_primitives_1.DisclosureRow, {
        icon: (0, react_1.createElement)(dsh_client_ui_primitives_1.IconSparkleRegular, { size: 14 }),
        title: props.toolName || 'instrument',
        running: view.state === 'preparing' || view.state === 'running',
        open,
        expandable: view.expandable,
        expandOnRowClick: true,
        keepContentWhenOpen: true,
        onToggle: disclosure.toggle,
        collapsedContent: sourceSummaryElement(view),
    }, body));
}
exports.inject = ['slots', 'remote', 'sidebarRight', 'sidebarRightTabs'];
/** Browser plugin activation, governed by Host Loader/package manifest, not DOM insertion. */
async function apply(ctx) {
    await ctx.remote.$mount(remote_contract_js_1.REMOTE_CONTRIBUTION);
    // $mount creates the namespace. Requiring it on the bootstrap itself would
    // prevent apply from running; all consumers instead belong to this child scope.
    await ctx.inject(['remote.mattpocockControls'], (ctx) => {
        const remote = ctx.remote.mattpocockControls;
        const observers = new SessionObserverCache((id, signal) => remote.readSession(id, signal));
        const notificationReading = createNotificationReading();
        const observe = (sessionId) => observers.observe(sessionId);
        const summaries = new SummaryScheduler((request, signal) => remote.readSummaries(request, signal));
        const observeSummary = (sessionId) => summaries.observe(sessionId);
        const visibility = new PolicyObserver(() => remote.readPolicy());
        ctx.effect(() => { void visibility.refresh(); return () => visibility.dispose(); }, 'collaboration: committed policy visibility');
        const refreshAll = () => { void visibility.refresh(); summaries.refresh(); observers.refreshAll(); };
        ctx.effect(() => () => { summaries.dispose(); observers.dispose(); }, 'collaboration: observations');
        const face = (sessionId) => ({ subagentNavigation: (0, client_subagents_js_1.createSubagentNavigation)(ctx, sessionId, () => observe(sessionId)), summary: observeSummary(sessionId), observe: () => observe(sessionId), openDetails: () => {
                if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId)
                    return;
                const snapshot = observeSummary(sessionId).getSnapshot();
                if (snapshot.status !== 'ready' || !snapshot.value.policy.display.rightPanel)
                    return;
                ctx.sidebarRight.openTab(exports.TAB_KIND, { preferNewPane: true });
            } });
        const definition = { id: exports.TAB_ID, kind: exports.TAB_KIND, title: () => '协作', keepMounted: false };
        ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'collaboration: tab type');
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: exports.PACKAGE_NAME,
            inject: () => ({ remote, refreshAll, observe }) }, SettingsPage));
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: exports.ROW_KEY,
            inject: () => ({ remote, refreshAll, observe }) }, SettingsPage));
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities',
            id: exports.TAB_ID + ':header', order: 100, inject: face }, HeaderEntry));
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities',
            id: exports.TAB_ID + ':notifications', order: 110, inject: (sessionId) => ({ observer: observe(sessionId), reading: notificationReading }) }, DecisionNotificationSeat));
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock',
            id: exports.TAB_ID + ':notification-reader', order: 110, inject: (sessionId) => ({ observer: observe(sessionId), reading: notificationReading }) }, DecisionNotificationReader));
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock',
            id: exports.TAB_ID + ':input', order: 100, inject: face }, InputSummary));
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: exports.TAB_ID,
            inject: (sessionId) => ({ observer: observe(sessionId), openDetails: face(sessionId).openDetails, remote }) }, Details));
        ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({ name: 'sidebar.session.row.leading',
            id: exports.TAB_ID + ':row', order: 100, inject: () => ({ observeSummary, visibility }) }, WorkspaceBadge));
        ctx.slots.inject('tool.call.toolview', () => exports.OWN_TOOL_NAMES.map(key => ctx.slots.register({ name: 'tool.call.toolview', key, inject: face }, SourceCard)));
    });
}
/** Existing Host authorization, not a model-supplied permission or business approval. */
async function grantPolicyFromSnapshot(remote, view, targetSessionId, enabled) {
    if (view.caller.kind !== 'user')
        throw new Error('Only the authenticated operator may grant agent configuration access');
    return remoteValue(await remote.grantPolicy(nonempty(targetSessionId), enabled, view.policyGrants.revision));
}
function PolicyDelegation(props) {
    const [baseGrants, setBaseGrants] = (0, react_1.useState)(props.view.policyGrants);
    const [target, setTarget] = (0, react_1.useState)(props.view.sessionId);
    const [enabled, setEnabled] = (0, react_1.useState)(props.view.policyGrants.grants.find(row => row.sessionId === props.view.sessionId)?.enabled ?? false);
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    if (props.view.caller.kind !== 'user')
        return diagnostic('当前调用者是 agent：不能自行授予配置修改权限。');
    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const grants = await grantPolicyFromSnapshot(props.remote, { ...props.view, policyGrants: baseGrants }, target, enabled);
            setBaseGrants(grants);
            await props.refresh();
            setMessage('已保存明确配置委托；这不授予业务 scope 或资源租约。');
        }
        catch (error) {
            setMessage(errorText(error));
        }
        finally {
            setBusy(false);
        }
    };
    return (0, react_1.createElement)('fieldset', { disabled: busy }, (0, react_1.createElement)('legend', null, 'Operator 明确授予 agent 配置权限（默认拒绝）'), (0, react_1.createElement)('label', null, '目标 Session ', (0, react_1.createElement)('input', { value: target, onChange: (event) => { const id = event.target.value; setTarget(id); setEnabled(props.view.policyGrants.grants.find(row => row.sessionId === id)?.enabled ?? false); } })), (0, react_1.createElement)('label', null, (0, react_1.createElement)('input', { type: 'checkbox', checked: enabled, onChange: (event) => setEnabled(event.target.checked) }), '允许此 agent 修改配置'), (0, react_1.createElement)('button', { type: 'button', disabled: !target.trim() || busy, onClick: () => { void save(); } }, '明确保存委托'), (0, react_1.createElement)('button', { type: 'button', onClick: () => { setBaseGrants(props.view.policyGrants); setEnabled(props.view.policyGrants.grants.find(row => row.sessionId === target)?.enabled ?? false); setMessage(null); } }, '重新读取委托'), diagnostic('草稿委托修订 ' + baseGrants.revision), message === null ? null : diagnostic(message));
}

},
"src/controls/instrument-state.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrumentCommandMetadata = instrumentCommandMetadata;
exports.upgradeInstrumentDocument = upgradeInstrumentDocument;
exports.parseAuthor = parseAuthor;
exports.parseInstrumentCommand = parseInstrumentCommand;
exports.parseInstrumentHistoryTarget = parseInstrumentHistoryTarget;
exports.projectInstrumentDocument = projectInstrumentDocument;
exports.initialInstrumentDocument = initialInstrumentDocument;
exports.parseInstrumentDocument = parseInstrumentDocument;
const validation_js_1 = require("./validation.js");
function instrumentCommandMetadata(event) {
    const c = event.command, workflowId = c.workflowId;
    const target = c.action === 'put-workflow' ? { kind: 'workflow', workflowId } : c.action === 'put-ticket' || c.action === 'put-task-reference' ? { kind: c.action === 'put-ticket' ? 'ticket' : 'task-reference', workflowId, localTicketId: c.localTicketId } : { kind: 'decision', workflowId, decisionId: c.decisionId };
    return { action: c.action, target, expectedRevision: c.expectedRevision, recordedAt: event.recordedAt };
}
const EMPTY_INSTRUMENT_STATE = (0, validation_js_1.freeze)({ businessRevision: 0, viewerRevisions: {}, workflows: [], tickets: [], taskReferences: [], decisions: [], decisionViews: [] });
function upgradeInstrumentDocument(document, references = false) {
    if (document.schemaVersion === 3)
        return document;
    const { taskReferences: _references, ...legacyEmpty } = EMPTY_INSTRUMENT_STATE;
    const current = document.schemaVersion === 2 ? document : (0, validation_js_1.freeze)({ ...document, schemaVersion: 2, checkpoint: { throughRevision: 0, state: legacyEmpty }, dedup: [], coverage: [] });
    return references ? (0, validation_js_1.freeze)({ ...current, schemaVersion: 3, checkpoint: { ...current.checkpoint, state: { ...current.checkpoint.state, taskReferences: [] } } }) : current;
}
function text(value, where) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 65536 || value.includes('\0'))
        (0, validation_js_1.invalid)(where + ' must be non-empty text, at most 65536 characters');
    return value;
}
function nullableText(value, where) { return value === undefined || value === null ? null : text(value, where); }
function ids(value, where) {
    const result = (0, validation_js_1.boundedArray)(value, where, 256).map(entry => (0, validation_js_1.id)(entry, where));
    if (new Set(result).size !== result.length)
        (0, validation_js_1.invalid)(where + ' contains duplicates');
    return result;
}
function parseAuthor(value) {
    const raw = (0, validation_js_1.record)(value, 'author', ['kind', 'principalId', 'sessionId']);
    if (raw.kind !== 'agent' && raw.kind !== 'user')
        (0, validation_js_1.invalid)('author kind must be an actual agent or user');
    const session = raw.sessionId === null ? null : (0, validation_js_1.id)(raw.sessionId, 'author sessionId');
    if ((raw.kind === 'agent') !== (session !== null))
        (0, validation_js_1.invalid)('agent author requires a session; direct user author has no agent session');
    return (0, validation_js_1.freeze)({ kind: raw.kind, principalId: (0, validation_js_1.id)(raw.principalId, 'author principalId'), sessionId: session });
}
/** Attaches the expected value shape to a rejected authoring payload: the caller cannot
 * derive nested keys and enum literals from a generic validator message. */
function shape(label, expected, parse) {
    try {
        return parse();
    }
    catch (error) {
        if (error instanceof validation_js_1.ControlsError && error.code === 'invalid-input')
            (0, validation_js_1.invalid)(error.message + '; ' + label + ' shape: ' + expected);
        throw error;
    }
}
const WORKFLOW_VALUE_SHAPE = '{title, axes:[{axisKey, label, counting:"exclusive"|"overlapping", statuses:[{statusKey, label, meaning?, summaryPriority?, terminal?}]}]}';
const TICKET_VALUE_SHAPE = '{title, statuses:{<axisKey>:[<statusKey>, ...]}, externalRef?, summary?, disposition?, suspicionMode?}';
const DECISION_VALUE_SHAPE = '{question, status, pending?, awaitingImplementation?, ticketIds?, context?, options?:[{key, label}], recommendation?, impact?, addressee?:{kind:"user"|"agent"|"unspecified", principalId?, label?}, result?}';
function workflowValue(value) {
    const raw = (0, validation_js_1.record)(value, 'workflow', ['title', 'axes']);
    const axes = (0, validation_js_1.boundedArray)(raw.axes, 'axes', 64).map(value => {
        const axis = (0, validation_js_1.record)(value, 'axis', ['axisKey', 'label', 'counting', 'statuses']);
        if (axis.counting !== 'exclusive' && axis.counting !== 'overlapping')
            (0, validation_js_1.invalid)('axis.counting must be "exclusive" or "overlapping"');
        const statuses = (0, validation_js_1.boundedArray)(axis.statuses, 'statuses', 64).map(value => {
            const status = (0, validation_js_1.record)(value, 'status', ['statusKey', 'label', 'meaning', 'summaryPriority', 'terminal']);
            if (status.terminal !== undefined && typeof status.terminal !== 'boolean')
                (0, validation_js_1.invalid)('status.terminal must be boolean');
            return { statusKey: (0, validation_js_1.id)(status.statusKey, 'statusKey'), label: text(status.label, 'status label'),
                meaning: nullableText(status.meaning, 'status meaning'), ...(status.summaryPriority === undefined ? {} : { summaryPriority: (0, validation_js_1.revision)(status.summaryPriority, 'summaryPriority') }),
                ...(status.terminal === undefined ? {} : { terminal: status.terminal }) };
        });
        if (new Set(statuses.map(row => row.statusKey)).size !== statuses.length)
            (0, validation_js_1.invalid)('duplicate statusKey within an axis');
        return { axisKey: (0, validation_js_1.id)(axis.axisKey, 'axisKey'), label: text(axis.label, 'axis label'), counting: axis.counting, statuses };
    });
    if (new Set(axes.map(row => row.axisKey)).size !== axes.length)
        (0, validation_js_1.invalid)('duplicate axisKey');
    return { title: text(raw.title, 'workflow title'), axes };
}
function ticketValue(value) {
    const raw = (0, validation_js_1.record)(value, 'ticket', ['title', 'externalRef', 'statuses', 'summary', 'disposition', 'suspicionMode']);
    const selections = (0, validation_js_1.record)(raw.statuses, 'ticket statuses');
    return { title: text(raw.title, 'ticket title'),
        statuses: Object.fromEntries(Object.entries(selections).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [(0, validation_js_1.id)(key, 'axisKey'), ids(value, 'status selections')])),
        ...(Object.hasOwn(raw, 'externalRef') ? { externalRef: nullableText(raw.externalRef, 'externalRef') } : {}),
        ...(Object.hasOwn(raw, 'summary') ? { summary: nullableText(raw.summary, 'ticket summary') } : {}),
        ...(Object.hasOwn(raw, 'disposition') ? { disposition: nullableText(raw.disposition, 'ticket disposition') } : {}),
        ...(Object.hasOwn(raw, 'suspicionMode') ? (raw.suspicionMode === 'auto' || raw.suspicionMode === 'off' ? { suspicionMode: raw.suspicionMode } : (0, validation_js_1.invalid)('ticket suspicionMode must be auto or off')) : {}) };
}
function taskReferenceValue(value) {
    const raw = (0, validation_js_1.record)(value, 'task reference', ['source', 'locator', 'label']);
    const input = (0, validation_js_1.record)(raw.source, 'task reference source');
    let source;
    if (input.kind === 'external') {
        (0, validation_js_1.record)(input, 'external source', ['kind', 'instance', 'project', 'taskId']);
        source = { kind: 'external', instance: (0, validation_js_1.id)(input.instance, 'source instance'), project: (0, validation_js_1.id)(input.project, 'source project'), taskId: (0, validation_js_1.id)(input.taskId, 'source taskId') };
    }
    else if (input.kind === 'repository') {
        (0, validation_js_1.record)(input, 'repository source', ['kind', 'repositoryAnchor', 'relativePath', 'anchor']);
        const relativePath = text(input.relativePath, 'source relativePath');
        if (/^(?:[\\/]|[a-z]:)/iu.test(relativePath) || relativePath.split(/[\\/]/u).some(part => part === '..'))
            (0, validation_js_1.invalid)('source relativePath must stay within its repository');
        source = { kind: 'repository', repositoryAnchor: (0, validation_js_1.id)(input.repositoryAnchor, 'repositoryAnchor'), relativePath,
            ...(Object.hasOwn(input, 'anchor') ? { anchor: text(input.anchor, 'source anchor') } : {}) };
    }
    else if (input.kind === 'unverified') {
        (0, validation_js_1.record)(input, 'unverified source', ['kind']);
        source = { kind: 'unverified' };
    }
    else
        return (0, validation_js_1.invalid)('task reference source kind must be external, repository or unverified');
    return { source, locator: text(raw.locator, 'task reference locator'), ...(Object.hasOwn(raw, 'label') ? { label: text(raw.label, 'task reference label') } : {}) };
}
function decisionValue(value) {
    const raw = (0, validation_js_1.record)(value, 'decision', ['question', 'status', 'pending', 'awaitingImplementation', 'ticketIds', 'context', 'options', 'recommendation', 'impact', 'addressee', 'result']);
    const optional = {};
    for (const key of ['pending', 'awaitingImplementation'])
        if (Object.hasOwn(raw, key))
            optional[key] = (0, validation_js_1.boolean)(raw[key], key);
    for (const key of ['context', 'recommendation', 'impact', 'result'])
        if (Object.hasOwn(raw, key))
            optional[key] = nullableText(raw[key], key);
    if (Object.hasOwn(raw, 'ticketIds'))
        optional.ticketIds = ids(raw.ticketIds, 'decision ticketIds');
    if (Object.hasOwn(raw, 'options')) {
        const options = (0, validation_js_1.boundedArray)(raw.options, 'decision options', 64).map(value => {
            const option = (0, validation_js_1.record)(value, 'decision option', ['key', 'label']);
            return { key: (0, validation_js_1.id)(option.key, 'option key'), label: text(option.label, 'option label') };
        });
        if (new Set(options.map(row => row.key)).size !== options.length)
            (0, validation_js_1.invalid)('duplicate decision option');
        optional.options = options;
    }
    if (Object.hasOwn(raw, 'addressee')) {
        const target = (0, validation_js_1.record)(raw.addressee, 'addressee', ['kind', 'principalId', 'label']);
        if (target.kind !== 'user' && target.kind !== 'agent' && target.kind !== 'unspecified')
            (0, validation_js_1.invalid)('unknown addressee kind');
        optional.addressee = { kind: target.kind, principalId: target.principalId === undefined || target.principalId === null ? null : (0, validation_js_1.id)(target.principalId, 'addressee principalId'), label: nullableText(target.label, 'addressee label') };
    }
    return { question: text(raw.question, 'decision question'), status: text(raw.status, 'decision status'), ...optional };
}
/** Thin business declarations. No author/instance/config/lease fields accepted. */
function parseInstrumentCommand(value) {
    const raw = (0, validation_js_1.record)(value, 'instrument command');
    const baseKeys = ['operationId', 'expectedRevision', 'action', 'workflowId', 'references', 'value'];
    const base = { operationId: (0, validation_js_1.id)(raw.operationId, 'operationId'), expectedRevision: (0, validation_js_1.revision)(raw.expectedRevision, 'expected instrument revision'),
        workflowId: (0, validation_js_1.id)(raw.workflowId, 'workflowId'), references: (0, validation_js_1.boundedArray)(raw.references ?? [], 'references', 256).map(value => text(value, 'declared reference')) };
    switch (raw.action) {
        case 'put-workflow':
            (0, validation_js_1.record)(raw, 'command', baseKeys);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, value: shape('workflow value', WORKFLOW_VALUE_SHAPE, () => workflowValue(raw.value)) });
        case 'put-ticket':
            (0, validation_js_1.record)(raw, 'command', [...baseKeys, 'localTicketId']);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, localTicketId: (0, validation_js_1.id)(raw.localTicketId, 'localTicketId'), value: shape('ticket value', TICKET_VALUE_SHAPE, () => ticketValue(raw.value)) });
        case 'put-task-reference':
            (0, validation_js_1.record)(raw, 'command', [...baseKeys, 'localTicketId']);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, localTicketId: (0, validation_js_1.id)(raw.localTicketId, 'localTicketId'), value: shape('task reference value', '{source, locator, label?}', () => taskReferenceValue(raw.value)) });
        case 'put-decision':
            (0, validation_js_1.record)(raw, 'command', [...baseKeys, 'decisionId']);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, decisionId: (0, validation_js_1.id)(raw.decisionId, 'decisionId'), value: shape('decision value', DECISION_VALUE_SHAPE, () => decisionValue(raw.value)) });
        case 'set-decision-view': {
            (0, validation_js_1.record)(raw, 'command', [...baseKeys, 'decisionId']);
            const view = shape('decision view value', '{read, hidden}', () => (0, validation_js_1.record)(raw.value, 'decision view', ['read', 'hidden']));
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, decisionId: (0, validation_js_1.id)(raw.decisionId, 'decisionId'), value: { read: (0, validation_js_1.boolean)(view.read, 'read'), hidden: (0, validation_js_1.boolean)(view.hidden, 'hidden') } });
        }
        default: return (0, validation_js_1.invalid)('unknown instrument action; accepted actions: put-workflow, put-ticket, put-task-reference, put-decision, set-decision-view');
    }
}
function validateTicket(value, workflow) {
    for (const [key, selections] of Object.entries(value.statuses)) {
        const axis = workflow.axes.find(row => row.axisKey === key);
        if (!axis)
            (0, validation_js_1.invalid)('ticket refers to undeclared axis ' + key);
        if (axis.counting === 'exclusive' && selections.length > 1)
            (0, validation_js_1.invalid)('exclusive axis cannot count multiple selections');
        for (const selection of selections)
            if (!axis.statuses.some(row => row.statusKey === selection))
                (0, validation_js_1.invalid)('ticket refers to undeclared status ' + selection);
    }
}
/** Replaying task-defined records also checks reference integrity; no semantic judge. */
function parseInstrumentHistoryTarget(value) {
    const r = (0, validation_js_1.record)(value, 'history target');
    const workflowId = (0, validation_js_1.id)(r.workflowId, 'workflowId');
    if (r.kind === 'workflow') {
        (0, validation_js_1.record)(value, 'workflow target', ['kind', 'workflowId']);
        return { kind: 'workflow', workflowId };
    }
    if (r.kind === 'ticket' || r.kind === 'task-reference') {
        (0, validation_js_1.record)(value, 'ticket/reference target', ['kind', 'workflowId', 'localTicketId']);
        return { kind: r.kind, workflowId, localTicketId: (0, validation_js_1.id)(r.localTicketId, 'localTicketId') };
    }
    if (r.kind === 'decision') {
        (0, validation_js_1.record)(value, 'decision target', ['kind', 'workflowId', 'decisionId']);
        return { kind: 'decision', workflowId, decisionId: (0, validation_js_1.id)(r.decisionId, 'decisionId') };
    }
    return (0, validation_js_1.invalid)('unknown instrument history target kind; accepted kinds: workflow, ticket, task-reference, decision');
}
function checkpointState(value, cut, references) {
    const s = (0, validation_js_1.record)(value, 'checkpoint state', ['businessRevision', 'viewerRevisions', 'workflows', 'tickets', 'decisions', 'decisionViews', ...(references ? ['taskReferences'] : [])]);
    const viewers = (0, validation_js_1.record)(s.viewerRevisions, 'viewer revisions');
    const viewerRevisions = Object.fromEntries(Object.entries(viewers).map(([key, value]) => [(0, validation_js_1.id)(key, 'viewer'), (0, validation_js_1.revision)(value, 'viewer revision')]));
    const parseRows = (input, kind, parse) => (0, validation_js_1.array)(input, kind + ' checkpoint rows').map(value => {
        const key = kind === 'workflow' ? undefined : kind === 'ticket' || kind === 'task-reference' ? 'localTicketId' : 'decisionId';
        const r = (0, validation_js_1.record)(value, 'checkpoint record', ['workflowId', ...(key ? [key] : []), 'revision', 'value', 'history', ...(kind === 'decision' ? ['creator'] : [])]);
        const history = (0, validation_js_1.array)(r.history, 'retained history').map(value => {
            const h = (0, validation_js_1.record)(value, 'history version', ['revision', 'recordedAt', 'author', 'references', 'value']);
            return { revision: (0, validation_js_1.revision)(h.revision, 'history revision'), recordedAt: (0, validation_js_1.revision)(h.recordedAt, 'recordedAt'), author: parseAuthor(h.author), references: (0, validation_js_1.array)(h.references, 'references').map(value => text(value, 'reference')), value: parse(h.value) };
        });
        const current = parse(r.value), rowRevision = (0, validation_js_1.revision)(r.revision, 'row revision'), last = history.at(-1);
        if (!last || rowRevision !== last.revision || rowRevision > cut || history.some((h, i) => h.revision < 1 || h.revision > cut || i > 0 && h.revision <= history[i - 1].revision) || JSON.stringify(current) !== JSON.stringify(last.value))
            (0, validation_js_1.invalid)('checkpoint current value differs from latest retained version');
        return { workflowId: (0, validation_js_1.id)(r.workflowId, 'workflowId'), ...(key ? { [key]: (0, validation_js_1.id)(r[key], key) } : {}), revision: rowRevision, value: current, history, ...(kind === 'decision' ? { creator: parseAuthor(r.creator) } : {}) };
    });
    const workflows = parseRows(s.workflows, 'workflow', workflowValue);
    const tickets = parseRows(s.tickets, 'ticket', ticketValue);
    const taskReferences = references ? parseRows(s.taskReferences, 'task-reference', taskReferenceValue) : [];
    const decisions = parseRows(s.decisions, 'decision', decisionValue);
    const decisionViews = (0, validation_js_1.array)(s.decisionViews, 'decision views').map(value => {
        const v = (0, validation_js_1.record)(value, 'decision view', ['workflowId', 'decisionId', 'principalId', 'revision', 'value']), payload = (0, validation_js_1.record)(v.value, 'view value', ['read', 'hidden']);
        return { workflowId: (0, validation_js_1.id)(v.workflowId, 'workflowId'), decisionId: (0, validation_js_1.id)(v.decisionId, 'decisionId'), principalId: (0, validation_js_1.id)(v.principalId, 'principalId'), revision: (0, validation_js_1.revision)(v.revision, 'view revision'), value: { read: (0, validation_js_1.boolean)(payload.read, 'read'), hidden: (0, validation_js_1.boolean)(payload.hidden, 'hidden') } };
    });
    for (const rows of [workflows, tickets, taskReferences, decisions, decisionViews]) {
        const identities = rows.map(row => JSON.stringify([row.workflowId, 'localTicketId' in row ? row.localTicketId : 'decisionId' in row ? row.decisionId : null, 'principalId' in row ? row.principalId : null]));
        if (new Set(identities).size !== identities.length)
            (0, validation_js_1.invalid)('duplicate checkpoint record identity');
    }
    const workflowIndex = new Map(workflows.map(row => [row.workflowId, row]));
    const ticketIndex = new Set(tickets.map(row => entityKey(row.workflowId, row.localTicketId)));
    const referenceIndex = new Set(taskReferences.map(row => entityKey(row.workflowId, row.localTicketId)));
    const decisionIndex = new Set(decisions.map(row => entityKey(row.workflowId, row.decisionId)));
    for (const row of tickets) {
        const workflow = workflowIndex.get(row.workflowId);
        if (!workflow)
            (0, validation_js_1.invalid)('checkpoint ticket has no workflow');
        validateTicket(row.value, workflow.value);
    }
    const declaredSources = new Set();
    for (const row of taskReferences) {
        if (!workflowIndex.has(row.workflowId) || ticketIndex.has(entityKey(row.workflowId, row.localTicketId)))
            (0, validation_js_1.invalid)('checkpoint task reference has no workflow or collides with legacy ticket');
        const identity = JSON.stringify(row.value.source);
        if (row.history.some(change => JSON.stringify(change.value.source) !== identity))
            (0, validation_js_1.invalid)('checkpoint task reference changed source identity');
        if (row.value.source.kind !== 'unverified') {
            const key = JSON.stringify([row.workflowId, row.value.source]);
            if (declaredSources.has(key))
                (0, validation_js_1.invalid)('duplicate declared task reference source');
            declaredSources.add(key);
        }
    }
    for (const row of decisions)
        if (!workflowIndex.has(row.workflowId) || (row.value.ticketIds ?? []).some(id => !ticketIndex.has(entityKey(row.workflowId, id)) && !referenceIndex.has(entityKey(row.workflowId, id))))
            (0, validation_js_1.invalid)('checkpoint decision references unknown records');
    for (const view of decisionViews)
        if (view.revision < 1 || view.revision > cut || !decisionIndex.has(entityKey(view.workflowId, view.decisionId)))
            (0, validation_js_1.invalid)('checkpoint decision view references unknown records');
    const businessRevision = (0, validation_js_1.revision)(s.businessRevision, 'business revision');
    if (businessRevision + Object.values(viewerRevisions).reduce((sum, n) => sum + n, 0) > cut)
        (0, validation_js_1.invalid)('checkpoint business/viewer revision exceeds source cut');
    return (0, validation_js_1.freeze)({ businessRevision, viewerRevisions, workflows, tickets, taskReferences, decisions, decisionViews });
}
function parseCommandMetadata(value) {
    const m = (0, validation_js_1.record)(value, 'technical command metadata', ['action', 'target', 'expectedRevision', 'recordedAt']);
    if (m.action !== 'put-workflow' && m.action !== 'put-ticket' && m.action !== 'put-task-reference' && m.action !== 'put-decision' && m.action !== 'set-decision-view')
        (0, validation_js_1.invalid)('unknown technical command action');
    const target = parseInstrumentHistoryTarget(m.target), kind = m.action === 'put-workflow' ? 'workflow' : m.action === 'put-ticket' ? 'ticket' : m.action === 'put-task-reference' ? 'task-reference' : 'decision';
    if (target.kind !== kind)
        (0, validation_js_1.invalid)('technical command action and target differ');
    return { action: m.action, target, expectedRevision: (0, validation_js_1.revision)(m.expectedRevision, 'expectedRevision'), recordedAt: (0, validation_js_1.revision)(m.recordedAt, 'recordedAt') };
}
function dedupRows(value, cut) {
    const rows = (0, validation_js_1.array)(value, 'instrument dedup').map(value => {
        const d = (0, validation_js_1.record)(value, 'dedup receipt', ['operationId', 'author', 'digest', 'appliedRevision', 'kind', 'command']);
        if (typeof d.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(d.digest))
            (0, validation_js_1.invalid)('invalid SHA256 command digest');
        if (d.kind !== 'command' && d.kind !== 'compact' && d.kind !== 'purge-history')
            (0, validation_js_1.invalid)('invalid dedup receipt kind');
        if (d.kind !== 'command' && d.command !== undefined)
            (0, validation_js_1.invalid)('cleanup receipt must not carry command metadata');
        return { operationId: (0, validation_js_1.id)(d.operationId, 'operationId'), author: parseAuthor(d.author), digest: d.digest, appliedRevision: (0, validation_js_1.revision)(d.appliedRevision, 'appliedRevision'), kind: d.kind, ...(d.kind === 'command' ? { command: parseCommandMetadata(d.command) } : {}) };
    });
    if (rows.length !== cut || rows.some((d, i) => d.appliedRevision !== i + 1) || new Set(rows.map(d => d.operationId)).size !== rows.length)
        (0, validation_js_1.invalid)('checkpoint dedup receipt revision gap or duplicate');
    return rows;
}
function cleanupCoverage(value, dedup) {
    const rows = (0, validation_js_1.array)(value, 'cleanup coverage').map(value => {
        const c = (0, validation_js_1.record)(value, 'cleanup coverage record', ['operationId', 'action', 'appliedRevision', 'author', 'recordedAt', 'throughRevision', 'targets', 'removedVersions', 'removedRevisions']);
        if (c.action !== 'compact' && c.action !== 'purge-history')
            (0, validation_js_1.invalid)('unknown cleanup action');
        const targets = (0, validation_js_1.array)(c.targets, 'cleanup targets').map(parseInstrumentHistoryTarget);
        const result = { operationId: (0, validation_js_1.id)(c.operationId, 'operationId'), action: c.action, appliedRevision: (0, validation_js_1.revision)(c.appliedRevision, 'appliedRevision'), author: parseAuthor(c.author), recordedAt: (0, validation_js_1.revision)(c.recordedAt, 'recordedAt'), throughRevision: (0, validation_js_1.revision)(c.throughRevision, 'throughRevision'), targets, removedVersions: (0, validation_js_1.revision)(c.removedVersions, 'removedVersions'), removedRevisions: (0, validation_js_1.array)(c.removedRevisions, 'removed revisions').map(value => (0, validation_js_1.revision)(value, 'removed revision')) };
        if (result.removedVersions !== result.removedRevisions.length || result.removedRevisions.some((r, i) => r < 1 || r > result.throughRevision || i > 0 && r <= result.removedRevisions[i - 1]) || new Set(targets.map(t => JSON.stringify(t))).size !== targets.length || targets.length > 100)
            (0, validation_js_1.invalid)('cleanup coverage removal count/index mismatch');
        const receipt = dedup.find(d => d.operationId === result.operationId);
        if (!receipt || receipt.kind !== result.action || receipt.appliedRevision !== result.appliedRevision || JSON.stringify(receipt.author) !== JSON.stringify(result.author) || result.throughRevision >= result.appliedRevision || (result.action === 'compact' && (targets.length > 0 || result.removedVersions !== 0 || result.throughRevision !== result.appliedRevision - 1)) || (result.action === 'purge-history' && targets.length === 0))
            (0, validation_js_1.invalid)('cleanup coverage has no matching technical receipt');
        return result;
    });
    if (new Set(rows.map(c => c.operationId)).size !== rows.length || rows.some((c, i) => i > 0 && c.appliedRevision <= rows[i - 1].appliedRevision) || dedup.filter(d => d.kind !== 'command').length !== rows.length)
        (0, validation_js_1.invalid)('cleanup coverage index mismatch');
    return rows;
}
function validateCheckpointHistory(state, dedup, coverage) {
    const versions = dedup.filter(d => d.kind === 'command' && d.command.action !== 'set-decision-view'), removed = new Set();
    for (const c of coverage) {
        const prior = versions.filter(d => d.appliedRevision < c.appliedRevision), latest = new Map();
        for (const d of prior)
            latest.set(JSON.stringify(d.command.target), d.appliedRevision);
        if (c.targets.some(t => !latest.has(JSON.stringify(t))))
            (0, validation_js_1.invalid)('cleanup target has no source versions at its applied revision');
        const selected = new Set(c.targets.map(t => JSON.stringify(t)));
        const expected = c.action === 'compact' ? [] : prior.filter(d => selected.has(JSON.stringify(d.command.target)) && d.appliedRevision <= c.throughRevision && latest.get(JSON.stringify(d.command.target)) !== d.appliedRevision && !removed.has(d.appliedRevision)).map(d => d.appliedRevision);
        if (JSON.stringify(c.removedRevisions) !== JSON.stringify(expected))
            (0, validation_js_1.invalid)('cleanup coverage does not match actual selectable historical revisions');
        for (const r of expected)
            removed.add(r);
    }
    const records = new Map();
    for (const row of state.workflows)
        records.set(JSON.stringify({ kind: 'workflow', workflowId: row.workflowId }), row);
    for (const row of state.tickets)
        records.set(JSON.stringify({ kind: 'ticket', workflowId: row.workflowId, localTicketId: row.localTicketId }), row);
    for (const row of state.taskReferences)
        records.set(JSON.stringify({ kind: 'task-reference', workflowId: row.workflowId, localTicketId: row.localTicketId }), row);
    for (const row of state.decisions)
        records.set(JSON.stringify({ kind: 'decision', workflowId: row.workflowId, decisionId: row.decisionId }), row);
    const byTarget = new Map();
    for (const d of versions) {
        const key = JSON.stringify(d.command.target), group = byTarget.get(key) ?? [];
        group.push(d);
        byTarget.set(key, group);
    }
    if (records.size !== byTarget.size)
        (0, validation_js_1.invalid)('checkpoint record inventory differs from command receipts');
    for (const [key, group] of byTarget) {
        const row = records.get(key), expected = group.filter(d => !removed.has(d.appliedRevision)).map(d => d.appliedRevision);
        if (!row || row.revision !== group.at(-1).appliedRevision || JSON.stringify(row.history.map(h => h.revision)) !== JSON.stringify(expected))
            (0, validation_js_1.invalid)('checkpoint history contains an unexplained hole or resurrected purged version');
    }
}
function validateCheckpointCounters(state, dedup) {
    let businessRevision = 0;
    const viewers = new Map();
    for (const receipt of dedup)
        if (receipt.kind === 'command') {
            const meta = receipt.command;
            const expected = meta.action === 'set-decision-view' ? viewers.get(receipt.author.principalId) ?? 0 : businessRevision;
            if (meta.expectedRevision !== expected)
                (0, validation_js_1.invalid)('technical receipt business/viewer revision chain mismatch');
            if (meta.action === 'set-decision-view')
                viewers.set(receipt.author.principalId, expected + 1);
            else
                businessRevision++;
        }
    if (state.businessRevision !== businessRevision || Object.keys(state.viewerRevisions).length !== viewers.size || [...viewers].some(([key, value]) => !Object.hasOwn(state.viewerRevisions, key) || state.viewerRevisions[key] !== value))
        (0, validation_js_1.invalid)('checkpoint counters differ from technical command receipts');
    const latestViews = new Map();
    for (const receipt of dedup)
        if (receipt.command?.action === 'set-decision-view') {
            const target = receipt.command.target;
            if (target.kind !== 'decision')
                (0, validation_js_1.invalid)('personal view receipt must target a decision');
            latestViews.set(JSON.stringify([target.workflowId, target.decisionId, receipt.author.principalId]), receipt.appliedRevision);
        }
    if (state.decisionViews.length !== latestViews.size || state.decisionViews.some(view => latestViews.get(JSON.stringify([view.workflowId, view.decisionId, view.principalId])) !== view.revision))
        (0, validation_js_1.invalid)('checkpoint personal view inventory/revision differs from actual viewer receipts');
}
function validateCheckpointAuthors(state, dedup) {
    const receipts = new Map(dedup.map(d => [d.appliedRevision, d])), firstCreators = new Map();
    for (const receipt of dedup)
        if (receipt.kind === 'command' && receipt.command.action === 'put-decision') {
            const key = JSON.stringify(receipt.command.target);
            if (!firstCreators.has(key))
                firstCreators.set(key, receipt.author);
        }
    const groups = [{ kind: 'workflow', rows: state.workflows }, { kind: 'ticket', rows: state.tickets }, { kind: 'task-reference', rows: state.taskReferences }, { kind: 'decision', rows: state.decisions }];
    for (const group of groups)
        for (const row of group.rows) {
            const target = group.kind === 'workflow' ? { kind: 'workflow', workflowId: row.workflowId } : (group.kind === 'ticket' || group.kind === 'task-reference') && 'localTicketId' in row ? { kind: group.kind, workflowId: row.workflowId, localTicketId: row.localTicketId } : 'decisionId' in row ? { kind: 'decision', workflowId: row.workflowId, decisionId: row.decisionId } : (0, validation_js_1.invalid)('invalid checkpoint object target');
            if (group.kind === 'decision') {
                const first = firstCreators.get(JSON.stringify(target)), creator = 'creator' in row ? row.creator : undefined;
                if (!first || JSON.stringify(first) !== JSON.stringify(creator))
                    (0, validation_js_1.invalid)('checkpoint decision creator differs from first source target receipt');
            }
            for (const version of row.history) {
                const receipt = receipts.get(version.revision), meta = receipt?.command;
                if (!receipt || receipt.kind !== 'command' || !meta || meta.action !== 'put-' + group.kind || JSON.stringify(meta.target) !== JSON.stringify(target) || meta.recordedAt !== version.recordedAt || JSON.stringify(receipt.author) !== JSON.stringify(version.author))
                    (0, validation_js_1.invalid)('checkpoint retained version metadata differs from source receipt');
            }
        }
}
/** Composite keys never alias opaque IDs containing separators. Map insertion order is
 * the source's first-insertion order, even when a later event replaces a row. */
function entityKey(workflowId, localId) { return JSON.stringify([workflowId, localId]); }
// Only successful strict parses register identities here. This is pure source
// state, never a principal/scope-authorized snapshot. Weak keys follow source life.
const validatedDocuments = new WeakMap();
function deeplyFrozenData(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object')
        return true;
    if (!Object.isFrozen(value))
        return false;
    if (seen.has(value))
        return true;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!Object.hasOwn(descriptor, 'value') || !deeplyFrozenData(descriptor.value, seen))
            return false;
    }
    return true;
}
function projectInstrumentDocument(document) {
    const known = validatedDocuments.get(document);
    if (known)
        return known.state;
    const base = document.schemaVersion !== 1 ? document.checkpoint.state : EMPTY_INSTRUMENT_STATE;
    const workflows = new Map(base.workflows.map(row => [row.workflowId, row]));
    const tickets = new Map(base.tickets.map(row => [entityKey(row.workflowId, row.localTicketId), row]));
    const taskReferences = new Map((document.schemaVersion === 3 ? document.checkpoint.state.taskReferences : []).map(row => [entityKey(row.workflowId, row.localTicketId), row]));
    const referenceSources = new Map();
    const sourceKey = (workflowId, source) => JSON.stringify([workflowId, source]);
    for (const row of taskReferences.values())
        if (row.value.source.kind !== 'unverified')
            referenceSources.set(sourceKey(row.workflowId, row.value.source), row.localTicketId);
    const decisions = new Map(base.decisions.map(row => [entityKey(row.workflowId, row.decisionId), row]));
    const viewKey = (workflowId, decisionId, principalId) => JSON.stringify([workflowId, decisionId, principalId]);
    const decisionViews = new Map(base.decisionViews.map(row => [viewKey(row.workflowId, row.decisionId, row.principalId), row]));
    const workflowTickets = new Map();
    for (const row of base.tickets) {
        const group = workflowTickets.get(row.workflowId) ?? new Map();
        group.set(row.localTicketId, row);
        workflowTickets.set(row.workflowId, group);
    }
    // Only local arrays are mutable. A checkpoint history is copied once on first
    // append; subsequent tail versions push rather than spreading all old versions.
    const histories = new Map();
    const append = (key, previous, change) => {
        let history = histories.get(key);
        if (!history) {
            history = [...previous];
            histories.set(key, history);
        }
        history.push(change);
        return history;
    };
    let businessRevision = base.businessRevision;
    const viewerRevisions = new Map(Object.entries(base.viewerRevisions));
    for (const event of document.events) {
        const command = event.command;
        const previousRevision = command.action === 'set-decision-view' ? viewerRevisions.get(event.author.principalId) ?? 0 : businessRevision;
        if (command.expectedRevision !== previousRevision)
            (0, validation_js_1.invalid)('event expectedRevision mismatches its business/viewer revision');
        if (command.action === 'set-decision-view')
            viewerRevisions.set(event.author.principalId, previousRevision + 1);
        else
            businessRevision += 1;
        const workflow = workflows.get(command.workflowId);
        const change = (value) => ({ revision: event.revision, recordedAt: event.recordedAt, author: event.author, references: command.references ?? [], value });
        if (command.action === 'put-workflow') {
            for (const ticket of workflowTickets.get(command.workflowId)?.values() ?? [])
                validateTicket(ticket.value, command.value);
            workflows.set(command.workflowId, { workflowId: command.workflowId, revision: event.revision, value: command.value,
                history: append(JSON.stringify(['workflow', command.workflowId]), workflow?.history ?? [], change(command.value)) });
            continue;
        }
        if (!workflow)
            (0, validation_js_1.invalid)('workflow must be declared before its records');
        if (command.action === 'put-ticket') {
            validateTicket(command.value, workflow.value);
            const key = entityKey(command.workflowId, command.localTicketId), previous = tickets.get(key);
            if (taskReferences.has(key))
                (0, validation_js_1.invalid)('local task handle already has another record kind');
            const value = { ...previous?.value, ...command.value };
            const row = { workflowId: command.workflowId, localTicketId: command.localTicketId, revision: event.revision, value,
                history: append('ticket' + key, previous?.history ?? [], change(value)) };
            tickets.set(key, row);
            const group = workflowTickets.get(command.workflowId) ?? new Map();
            group.set(command.localTicketId, row);
            workflowTickets.set(command.workflowId, group);
        }
        else if (command.action === 'put-task-reference') {
            if (document.schemaVersion !== 3)
                (0, validation_js_1.invalid)('task references require instrument schemaVersion 3');
            const key = entityKey(command.workflowId, command.localTicketId), previous = taskReferences.get(key);
            if (tickets.has(key))
                (0, validation_js_1.invalid)('local task handle already has another record kind');
            if (previous && JSON.stringify(previous.value.source) !== JSON.stringify(command.value.source))
                (0, validation_js_1.invalid)('task reference source identity is immutable');
            if (command.value.source.kind !== 'unverified') {
                const identity = sourceKey(command.workflowId, command.value.source), existing = referenceSources.get(identity);
                // Diagnostics never disclose an unassigned handle or its authored label.
                if (existing !== undefined && existing !== command.localTicketId)
                    (0, validation_js_1.invalid)('declared task source already has a local handle');
                referenceSources.set(identity, command.localTicketId);
            }
            const value = { ...previous?.value, ...command.value };
            taskReferences.set(key, { workflowId: command.workflowId, localTicketId: command.localTicketId, revision: event.revision, value,
                history: append('task-reference' + key, previous?.history ?? [], change(value)) });
        }
        else if (command.action === 'put-decision') {
            const key = entityKey(command.workflowId, command.decisionId), previous = decisions.get(key);
            const value = { ...previous?.value, ...command.value };
            for (const ticketId of value.ticketIds ?? [])
                if (!tickets.has(entityKey(command.workflowId, ticketId)) && !taskReferences.has(entityKey(command.workflowId, ticketId)))
                    (0, validation_js_1.invalid)('decision refers to unknown ticket or task reference');
            decisions.set(key, { workflowId: command.workflowId, decisionId: command.decisionId, revision: event.revision, value,
                history: append('decision' + key, previous?.history ?? [], change(value)), ...(previous?.creator ? { creator: previous.creator } : {}) });
        }
        else {
            if (!decisions.has(entityKey(command.workflowId, command.decisionId)))
                (0, validation_js_1.invalid)('view refers to unknown decision');
            decisionViews.set(viewKey(command.workflowId, command.decisionId, event.author.principalId), { workflowId: command.workflowId, decisionId: command.decisionId, principalId: event.author.principalId, revision: event.revision, value: command.value });
        }
    }
    return (0, validation_js_1.freeze)({ businessRevision, viewerRevisions: Object.fromEntries(viewerRevisions), workflows: [...workflows.values()], tickets: [...tickets.values()], taskReferences: [...taskReferences.values()], decisions: [...decisions.values()], decisionViews: [...decisionViews.values()] });
}
function initialInstrumentDocument(instance) {
    return parseInstrumentDocument({ ...instance, schemaVersion: 1, revision: 0, events: [] });
}
function parseInstrumentDocument(value) {
    if (value !== null && typeof value === 'object') {
        const known = validatedDocuments.get(value);
        if (known)
            return known.document;
    }
    try {
        const raw = (0, validation_js_1.record)(value, 'instrument document', ['schemaVersion', 'revision', 'instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId', 'events', 'checkpoint', 'dedup', 'coverage']);
        if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2 && raw.schemaVersion !== 3)
            (0, validation_js_1.invalid)('unsupported instrument schemaVersion');
        if (raw.schemaVersion === 1)
            (0, validation_js_1.record)(value, 'V1 instrument document', ['schemaVersion', 'revision', 'instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId', 'events']);
        const docRevision = (0, validation_js_1.revision)(raw.revision, 'instrument revision');
        let checkpoint, dedup = [], coverage = [];
        if (raw.schemaVersion !== 1) {
            const c = (0, validation_js_1.record)(raw.checkpoint, 'instrument checkpoint', ['throughRevision', 'state']), cut = (0, validation_js_1.revision)(c.throughRevision, 'checkpoint revision');
            if (cut > docRevision)
                (0, validation_js_1.invalid)('checkpoint exceeds source revision');
            const state = checkpointState(c.state, cut, raw.schemaVersion === 3);
            const { taskReferences: _references, ...legacy } = state;
            checkpoint = { throughRevision: cut, state: raw.schemaVersion === 3 ? state : legacy };
            dedup = dedupRows(raw.dedup, cut);
            coverage = cleanupCoverage(raw.coverage, dedup);
            if (raw.schemaVersion !== 3 && (dedup.some(d => d.command?.action === 'put-task-reference') || coverage.some(c => c.targets.some(t => t.kind === 'task-reference'))))
                (0, validation_js_1.invalid)('task reference receipts require instrument schemaVersion 3');
            validateCheckpointAuthors(state, dedup);
            validateCheckpointCounters(state, dedup);
            validateCheckpointHistory(state, dedup, coverage);
        }
        const cut = checkpoint?.throughRevision ?? 0;
        const events = (0, validation_js_1.array)(raw.events, 'instrument events').map((value, index) => {
            const event = (0, validation_js_1.record)(value, 'instrument event', ['revision', 'recordedAt', 'author', 'command']), eventRevision = cut + index + 1;
            if ((0, validation_js_1.revision)(event.revision, 'event revision') !== eventRevision)
                (0, validation_js_1.invalid)('instrument event revision gap');
            return { revision: eventRevision, recordedAt: (0, validation_js_1.revision)(event.recordedAt, 'recordedAt'), author: parseAuthor(event.author), command: parseInstrumentCommand(event.command) };
        });
        const operationIds = [...dedup.map(d => d.operationId), ...events.map(e => e.command.operationId)];
        if (events.length + cut !== docRevision || new Set(operationIds).size !== operationIds.length)
            (0, validation_js_1.invalid)('revision or operation-id index is inconsistent');
        const identity = { instrumentInstanceId: (0, validation_js_1.id)(raw.instrumentInstanceId, 'instrumentInstanceId'), ownerSessionId: (0, validation_js_1.id)(raw.ownerSessionId, 'ownerSessionId'), controlWorkspaceId: (0, validation_js_1.id)(raw.controlWorkspaceId, 'controlWorkspaceId'), revision: docRevision, events };
        const result = checkpoint ? raw.schemaVersion === 3 ? { schemaVersion: 3, ...identity, checkpoint: checkpoint, dedup, coverage } : { schemaVersion: 2, ...identity, checkpoint, dedup, coverage } : { schemaVersion: 1, ...identity };
        const state = projectInstrumentDocument(result);
        const document = (0, validation_js_1.freeze)(result), entry = { document, state };
        validatedDocuments.set(document, entry);
        // A storage snapshot may be detached from the parser's own result. It can be
        // reused only AFTER strict parsing and proof that the entire input graph is
        // immutable. A top-level freeze cannot protect mutable nested commands.
        if (value !== null && typeof value === 'object' && deeplyFrozenData(value))
            validatedDocuments.set(value, entry);
        return document;
    }
    catch (error) {
        if (error instanceof validation_js_1.ControlsError && error.code === 'invalid-input')
            throw new validation_js_1.ControlsError('invalid-state', error.message);
        throw error;
    }
}

},
"src/controls/policy.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_POLICY = exports.DISPLAY_NAMES = exports.FEATURE_NAMES = void 0;
exports.parsePolicyIntent = parsePolicyIntent;
exports.parsePolicySnapshot = parsePolicySnapshot;
exports.resolvePolicy = resolvePolicy;
const validation_js_1 = require("./validation.js");
exports.FEATURE_NAMES = ['binding', 'lifecycle', 'windows', 'ticketProgress', 'pendingDecisions'];
exports.DISPLAY_NAMES = ['header', 'inputSummary', 'rightPanel', 'sessionList', 'timeline'];
/** No new-work automation and no guessed numeric capacities. */
exports.INITIAL_POLICY = (0, validation_js_1.freeze)({
    revision: 0, extensionEnabled: false, defaults: {}, workspaceOverrides: {},
});
const DISPLAY_INITIAL = { header: true, inputSummary: false, rightPanel: true, sessionList: false, timeline: true };
function parseInteractionMode(value, where) {
    if (value !== 'native-question' && value !== 'async-decision')
        (0, validation_js_1.invalid)(where + ' must be native-question or async-decision');
    return value;
}
function parsePatch(value, where) {
    const raw = (0, validation_js_1.record)(value, where, [...exports.FEATURE_NAMES, 'workspace', 'skills', 'display']);
    const result = {};
    for (const feature of exports.FEATURE_NAMES) {
        if (!Object.hasOwn(raw, feature))
            continue;
        const keys = feature === 'windows' ? ['enabled', 'ticketWindowSize', 'runningSubagentLimit']
            : feature === 'pendingDecisions' ? ['enabled', 'interactionMode'] : ['enabled'];
        const group = (0, validation_js_1.record)(raw[feature], where + '.' + feature, keys);
        const parsed = {};
        for (const key of keys) {
            if (!Object.hasOwn(group, key))
                continue;
            parsed[key] = key === 'enabled' ? (0, validation_js_1.boolean)(group[key], where + '.' + feature + '.' + key)
                : key === 'interactionMode' ? parseInteractionMode(group[key], where + '.' + feature + '.' + key)
                    : (0, validation_js_1.capacity)(group[key], where + '.' + feature + '.' + key);
        }
        if (Object.keys(parsed).length > 0)
            result[feature] = parsed;
    }
    for (const gate of ['workspace', 'skills']) {
        if (!Object.hasOwn(raw, gate))
            continue;
        const group = (0, validation_js_1.record)(raw[gate], where + '.' + gate, ['enabled']);
        if (Object.hasOwn(group, 'enabled'))
            result[gate] = { enabled: (0, validation_js_1.boolean)(group.enabled, where + '.' + gate + '.enabled') };
    }
    if (Object.hasOwn(raw, 'display')) {
        const group = (0, validation_js_1.record)(raw.display, where + '.display', exports.DISPLAY_NAMES);
        const parsed = {};
        for (const key of exports.DISPLAY_NAMES)
            if (Object.hasOwn(group, key))
                parsed[key] = (0, validation_js_1.boolean)(group[key], where + '.display.' + key);
        if (Object.keys(parsed).length > 0)
            result.display = parsed;
    }
    return result;
}
/** A save replaces a complete sparse intent; removing a field restores inheritance. */
function parsePolicyIntent(value) {
    const raw = (0, validation_js_1.record)(value, 'policy', ['extensionEnabled', 'defaults', 'workspaceOverrides']);
    const overrides = (0, validation_js_1.record)(raw.workspaceOverrides, 'policy.workspaceOverrides');
    const entries = Object.entries(overrides).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, patch]) => [(0, validation_js_1.id)(key, 'workspace id'), parsePatch(patch, 'workspaceOverrides.' + key)])
        .filter(([, patch]) => Object.keys(patch).length > 0);
    return (0, validation_js_1.freeze)({
        extensionEnabled: (0, validation_js_1.boolean)(raw.extensionEnabled, 'policy.extensionEnabled'),
        defaults: parsePatch(raw.defaults, 'policy.defaults'),
        workspaceOverrides: Object.fromEntries(entries),
    });
}
function parsePolicySnapshot(value) {
    const raw = (0, validation_js_1.record)(value, 'policy snapshot', ['revision', 'extensionEnabled', 'defaults', 'workspaceOverrides']);
    return (0, validation_js_1.freeze)({ ...parsePolicyIntent({ extensionEnabled: raw.extensionEnabled, defaults: raw.defaults,
            workspaceOverrides: raw.workspaceOverrides }), revision: (0, validation_js_1.revision)(raw.revision, 'policy revision') });
}
/** Pure server-side resolution; display preferences never control functional eligibility. */
function resolvePolicy(policy, controlWorkspaceId, workspaceVerified) {
    const parsed = parsePolicySnapshot(policy);
    const workspaceId = (0, validation_js_1.id)(controlWorkspaceId, 'controlWorkspaceId');
    (0, validation_js_1.boolean)(workspaceVerified, 'workspaceVerified');
    const override = Object.hasOwn(parsed.workspaceOverrides, workspaceId) ? parsed.workspaceOverrides[workspaceId] : {};
    const sources = {};
    const choose = (group, key, initial) => {
        const workspace = override[group];
        const global = parsed.defaults[group];
        const field = (group + '.' + key);
        if (workspace && Object.hasOwn(workspace, key)) {
            sources[field] = 'workspace';
            return workspace[key];
        }
        if (global && Object.hasOwn(global, key)) {
            sources[field] = 'global';
            return global[key];
        }
        sources[field] = 'safe-initial';
        return initial;
    };
    const windows = {
        ticketWindowSize: choose('windows', 'ticketWindowSize', null),
        runningSubagentLimit: choose('windows', 'runningSubagentLimit', null),
    };
    const pendingDecisions = { interactionMode: choose('pendingDecisions', 'interactionMode', 'native-question') };
    const workspaceEnabled = choose('workspace', 'enabled', false);
    const skillsEnabled = choose('skills', 'enabled', true);
    const features = {};
    for (const feature of exports.FEATURE_NAMES) {
        const requested = choose(feature, 'enabled', false);
        const reason = !parsed.extensionEnabled ? 'extension-disabled' : !workspaceEnabled ? 'workspace-disabled' : !requested ? 'feature-disabled'
            : !workspaceVerified ? 'workspace-unverified'
                : feature === 'windows' && (windows.ticketWindowSize === null || windows.runningSubagentLimit === null) ? 'window-capacity-unset' : null;
        features[feature] = { requested, status: reason === null ? 'configured'
                : reason === 'workspace-unverified' || reason === 'window-capacity-unset' ? 'unsupported' : 'disabled', reason };
    }
    const display = Object.fromEntries(exports.DISPLAY_NAMES.map(key => [key, choose('display', key, DISPLAY_INITIAL[key])]));
    return (0, validation_js_1.freeze)({ configurationRevision: parsed.revision, controlWorkspaceId: workspaceId, workspaceVerified,
        extensionEnabled: parsed.extensionEnabled, workspaceEnabled, skillsEnabled, features, windows, pendingDecisions, display, sources });
}

},
"src/controls/remote-contract.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMOTE_CONTRIBUTION = exports.SUMMARY_RESPONSE_LIMIT = exports.SUMMARY_BATCH_LIMIT = exports.REMOTE_METHODS = exports.REMOTE_NAMESPACE = void 0;
exports.parseSessionSummaryRequest = parseSessionSummaryRequest;
exports.parseSessionSummaryBatch = parseSessionSummaryBatch;
exports.parseHostJson = parseHostJson;
exports.createHostJsonRepresentation = createHostJsonRepresentation;
exports.parsePolicyGrants = parsePolicyGrants;
exports.parseRemoteTicketWindow = parseRemoteTicketWindow;
exports.parseResourceAction = parseResourceAction;
const policy_js_1 = require("./policy.js");
const supervision_config_js_1 = require("./supervision-config.js");
const instrument_state_js_1 = require("./instrument-state.js");
const validation_js_1 = require("./validation.js");
/** Shared by Host and Client; no Host SDK or Node imports enter the browser. */
exports.REMOTE_NAMESPACE = 'mattpocockControls';
exports.REMOTE_METHODS = ['readPolicy', 'savePolicy', 'readSupervisionConfig', 'saveSupervisionConfig', 'readSupervision', 'listWorkspaces', 'readSession', 'readSummaries', 'applyInstrument', 'applyTicketWindow', 'resourceAction', 'grantPolicy', 'historyAction', 'worktreeAction'];
/** Bounded UI read model, not a full instrument snapshot or a business ledger. */
exports.SUMMARY_BATCH_LIMIT = 32;
exports.SUMMARY_RESPONSE_LIMIT = 256 * 1024;
function summaryArray(value, where, maximum) {
    if (!Array.isArray(value) || value.length > maximum)
        (0, validation_js_1.invalid)(where + ' accepts at most ' + maximum + ' entries');
    return (0, validation_js_1.boundedArray)(value, where, maximum);
}
function summaryVersion(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value))
        (0, validation_js_1.invalid)('summary version must be a SHA-256 token');
    return value;
}
function parseSessionSummaryRequest(value) {
    const request = (0, validation_js_1.record)(value, 'session summary request', ['sessions']);
    const sessions = summaryArray(request.sessions, 'summary sessions', exports.SUMMARY_BATCH_LIMIT).map(value => {
        const row = (0, validation_js_1.record)(value, 'summary session', ['sessionId', 'version']);
        return { sessionId: (0, validation_js_1.id)(row.sessionId, 'summary sessionId'), ...(row.version === undefined ? {} : { version: summaryVersion(row.version) }) };
    });
    if (sessions.length === 0 || new Set(sessions.map(row => row.sessionId)).size !== sessions.length)
        (0, validation_js_1.invalid)('summary batch needs unique sessions');
    return (0, validation_js_1.freeze)({ sessions });
}
function parseSessionSummary(value) {
    const raw = (0, validation_js_1.record)(value, 'session summary', ['sessionId', 'caller', 'instance', 'policy', 'records', 'health']);
    const sessionId = (0, validation_js_1.id)(raw.sessionId, 'summary sessionId'), c = (0, validation_js_1.record)(raw.caller, 'summary caller', ['kind', 'principalId', 'sessionId']);
    if (c.kind !== 'user' && c.kind !== 'agent' || (c.kind === 'user' ? c.sessionId !== null : c.sessionId !== sessionId))
        (0, validation_js_1.invalid)('summary caller identity is inconsistent');
    const caller = { kind: c.kind, principalId: (0, validation_js_1.id)(c.principalId, 'summary principal'), sessionId: c.kind === 'user' ? null : sessionId };
    const i = (0, validation_js_1.record)(raw.instance, 'summary instance', ['instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId']);
    const instance = { instrumentInstanceId: (0, validation_js_1.id)(i.instrumentInstanceId, 'summary instanceId'), ownerSessionId: (0, validation_js_1.id)(i.ownerSessionId, 'summary owner'), controlWorkspaceId: (0, validation_js_1.id)(i.controlWorkspaceId, 'summary workspace') };
    const p = (0, validation_js_1.record)(raw.policy, 'summary policy', ['configurationRevision', 'controlWorkspaceId', 'workspaceVerified', 'extensionEnabled', 'workspaceEnabled', 'display']);
    if (p.controlWorkspaceId !== instance.controlWorkspaceId)
        (0, validation_js_1.invalid)('summary policy and instance workspace disagree');
    const d = (0, validation_js_1.record)(p.display, 'summary display', policy_js_1.DISPLAY_NAMES);
    const display = Object.fromEntries(policy_js_1.DISPLAY_NAMES.map(key => [key, (0, validation_js_1.boolean)(d[key], 'summary display ' + key)]));
    const policy = { configurationRevision: (0, validation_js_1.revision)(p.configurationRevision, 'summary policy revision'), controlWorkspaceId: instance.controlWorkspaceId,
        workspaceVerified: (0, validation_js_1.boolean)(p.workspaceVerified, 'summary workspace verified'), extensionEnabled: (0, validation_js_1.boolean)(p.extensionEnabled, 'summary extension enabled'), workspaceEnabled: (0, validation_js_1.boolean)(p.workspaceEnabled, 'summary workspace enabled'), display };
    let records = null;
    if (raw.records !== null) {
        const r = (0, validation_js_1.record)(raw.records, 'summary records', ['businessRevision', 'viewerRevision', 'summary']);
        const s = (0, validation_js_1.record)(r.summary, 'summary counts', ['countingScope', 'pendingUserDecisionCount']);
        if (s.countingScope !== 'instance' && s.countingScope !== 'assignment')
            (0, validation_js_1.invalid)('summary counting scope is unavailable');
        records = { businessRevision: (0, validation_js_1.revision)(r.businessRevision, 'summary business revision'), viewerRevision: (0, validation_js_1.revision)(r.viewerRevision, 'summary viewer revision'),
            summary: { countingScope: s.countingScope, pendingUserDecisionCount: (0, validation_js_1.revision)(s.pendingUserDecisionCount, 'summary pending count') } };
    }
    const health = summaryArray(raw.health, 'summary health', 1).map(value => {
        const h = (0, validation_js_1.record)(value, 'summary health row', ['scope', 'status', 'reason']);
        if (h.scope !== 'records' || h.status !== 'unknown')
            (0, validation_js_1.invalid)('unsupported summary health scope');
        return { scope: 'records', status: 'unknown', reason: (0, validation_js_1.id)(h.reason, 'summary health reason') };
    });
    if (records === null ? health.length !== 1 : health.length !== 0)
        (0, validation_js_1.invalid)('summary record coverage and health disagree');
    return (0, validation_js_1.freeze)({ sessionId, caller, instance, policy, records, health });
}
function parseSessionSummaryBatch(value) {
    const raw = (0, validation_js_1.record)(value, 'session summary batch', ['rows']);
    const rows = summaryArray(raw.rows, 'summary rows', exports.SUMMARY_BATCH_LIMIT).map((value) => {
        const row = (0, validation_js_1.record)(value, 'summary result'), sessionId = (0, validation_js_1.id)(row.sessionId, 'summary result sessionId');
        if (row.status === 'current') {
            (0, validation_js_1.record)(row, 'current summary', ['sessionId', 'status', 'version', 'summary']);
            const summary = parseSessionSummary(row.summary);
            if (summary.sessionId !== sessionId)
                (0, validation_js_1.invalid)('summary result belongs to another session');
            return { sessionId, status: 'current', version: summaryVersion(row.version), summary };
        }
        if (row.status === 'unchanged') {
            (0, validation_js_1.record)(row, 'unchanged summary', ['sessionId', 'status', 'version']);
            return { sessionId, status: 'unchanged', version: summaryVersion(row.version) };
        }
        (0, validation_js_1.record)(row, 'unavailable summary', ['sessionId', 'status', 'reason']);
        if (row.status !== 'unavailable')
            (0, validation_js_1.invalid)('unsupported summary result status');
        return { sessionId, status: 'unavailable', reason: (0, validation_js_1.id)(row.reason, 'summary unavailable reason') };
    });
    if (new Set(rows.map(row => row.sessionId)).size !== rows.length)
        (0, validation_js_1.invalid)('duplicate summary result session');
    return (0, validation_js_1.freeze)({ rows });
}
/** A complete lossless JSON boundary, not JSON.stringify-based repair. */
function hostJsonRepresentation(value, inspectImmutable = false) {
    const ancestors = new Set();
    let immutable = true;
    const visit = (input, depth) => {
        if (depth > 128)
            (0, validation_js_1.invalid)('remote JSON exceeds maximum depth');
        if (input === null || typeof input === 'string' || typeof input === 'boolean')
            return input;
        if (typeof input === 'number') {
            if (!Number.isFinite(input) || Object.is(input, -0))
                (0, validation_js_1.invalid)('remote number must be lossless JSON');
            return input;
        }
        if (typeof input !== 'object' || input === null)
            (0, validation_js_1.invalid)('remote value must be JSON data');
        if (ancestors.has(input))
            (0, validation_js_1.invalid)('remote JSON must not cycle');
        ancestors.add(input);
        // This is evidence gathered during strict validation, never permission to skip it.
        if (inspectImmutable && !Object.isFrozen(input))
            immutable = false;
        try {
            if (Array.isArray(input))
                return (0, validation_js_1.array)(input, 'remote array').map(entry => visit(entry, depth + 1));
            const raw = (0, validation_js_1.record)(input, 'remote object');
            return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, visit(entry, depth + 1)]));
        }
        finally {
            ancestors.delete(input);
        }
    };
    return { value: (0, validation_js_1.freeze)(visit(value, 0)), immutable };
}
function parseHostJson(value) { return hostJsonRepresentation(value).value; }
/** Mount-local, weakly keyed representation cache. Only the strict validator above can
 * establish eligibility; a frozen root with mutable descendants never enters the cache.
 * One detached graph (no serialized string) lives at most as long as its source key.
 * Ordinary parseHostJson calls deliberately retain their validate-and-detach semantics. */
function createHostJsonRepresentation() {
    const representations = new WeakMap();
    return value => {
        const object = value !== null && typeof value === 'object' ? value : null;
        const prior = object === null ? undefined : representations.get(object);
        if (prior !== undefined)
            return prior;
        const parsed = hostJsonRepresentation(value, true);
        if (object !== null && parsed.immutable)
            representations.set(object, parsed.value);
        return parsed.value;
    };
}
function parsePolicyGrants(value) {
    const raw = (0, validation_js_1.record)(value, 'policy grants', ['schemaVersion', 'revision', 'grants']);
    if (raw.schemaVersion !== 1)
        (0, validation_js_1.invalid)('unsupported policy grant version');
    const grants = (0, validation_js_1.array)(raw.grants, 'policy grants').map(value => {
        const row = (0, validation_js_1.record)(value, 'policy grant', ['sessionId', 'enabled']);
        return { sessionId: (0, validation_js_1.id)(row.sessionId, 'grant sessionId'), enabled: (0, validation_js_1.boolean)(row.enabled, 'grant enabled') };
    });
    if (new Set(grants.map(row => row.sessionId)).size !== grants.length)
        (0, validation_js_1.invalid)('duplicate policy grant');
    return (0, validation_js_1.freeze)({ schemaVersion: 1, revision: (0, validation_js_1.revision)(raw.revision, 'grant revision'), grants });
}
/** Browser-safe equivalent of the window business command boundary, never execution receipts. */
function parseRemoteTicketWindow(value) {
    const r = (0, validation_js_1.record)(value, 'ticket window command');
    if (r.action !== 'reserve' && r.action !== 'release' && r.action !== 'reacquire')
        (0, validation_js_1.invalid)('ticket window commands must declare action "reserve", "release" or "reacquire"; there is no read action');
    (0, validation_js_1.record)(r, 'ticket window command', ['action', 'operationId', 'workflowId', 'localTicketId', ...(r.action === 'reserve' ? [] : ['generation'])]);
    const base = { operationId: (0, validation_js_1.id)(r.operationId, 'operationId'), workflowId: (0, validation_js_1.id)(r.workflowId, 'workflowId'), localTicketId: (0, validation_js_1.id)(r.localTicketId, 'localTicketId') };
    if (r.action === 'reserve')
        return (0, validation_js_1.freeze)({ ...base, action: 'reserve' });
    const generation = (0, validation_js_1.revision)(r.generation, 'generation');
    if (generation < 1)
        (0, validation_js_1.invalid)('generation must be positive');
    return (0, validation_js_1.freeze)({ ...base, action: r.action, generation });
}
function parseResourceAction(value) {
    const raw = (0, validation_js_1.record)(parseHostJson(value), 'resource action');
    const target = () => (0, validation_js_1.id)(raw.resourceId, 'resourceId');
    const text = (value, where) => { if (typeof value !== 'string' || value.length > 16384 || value.includes('\0'))
        (0, validation_js_1.invalid)(where + ' must be bounded text'); return value; };
    const absolute = (value) => { const path = text(value, 'resource path'); if (!(path.startsWith('/') || /^[A-Za-z]:/u.test(path) && (path[2] === '/' || path.charCodeAt(2) === 92)))
        (0, validation_js_1.invalid)('resource path must be absolute'); return path; };
    switch (raw.action) {
        case 'create': {
            (0, validation_js_1.record)(raw, 'create resource', ['action', 'spec']);
            const spec = (0, validation_js_1.record)(raw.spec, 'worktree spec', ['repositoryPath', 'root', 'name', 'startPoint']);
            return (0, validation_js_1.freeze)({ action: 'create', spec: { repositoryPath: absolute(spec.repositoryPath), root: absolute(spec.root), name: (0, validation_js_1.id)(spec.name, 'name'), startPoint: (0, validation_js_1.id)(spec.startPoint, 'startPoint') } });
        }
        case 'borrow':
            (0, validation_js_1.record)(raw, 'borrow resource', ['action', 'path']);
            return (0, validation_js_1.freeze)({ action: 'borrow', path: absolute(raw.path) });
        case 'read':
        case 'retain':
        case 'actual-retire':
            (0, validation_js_1.record)(raw, 'resource target', ['action', 'resourceId']);
            return (0, validation_js_1.freeze)({ action: raw.action, resourceId: target() });
        case 'update-business': {
            (0, validation_js_1.record)(raw, 'resource business', ['action', 'resourceId', 'business']);
            const business = (0, validation_js_1.record)(raw.business, 'resource business value', ['status', 'disposition', 'followup']);
            return (0, validation_js_1.freeze)({ action: 'update-business', resourceId: target(), business: Object.fromEntries(Object.entries(business).map(([key, value]) => [key, text(value, key)])) });
        }
        case 'request-retire': {
            (0, validation_js_1.record)(raw, 'retire resource', ['action', 'resourceId', 'disposition']);
            const d = (0, validation_js_1.record)(raw.disposition, 'retire disposition', ['kind', 'branch', 'expectedFactsDigest', 'explanation', 'expectedBranchOid']);
            if (d.kind !== 'remove-clean' && d.kind !== 'discard')
                (0, validation_js_1.invalid)('explicit retire disposition required');
            if (d.branch !== 'keep' && d.branch !== 'delete-owned')
                (0, validation_js_1.invalid)('explicit branch disposition required');
            if (d.expectedBranchOid !== undefined && (typeof d.expectedBranchOid !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(d.expectedBranchOid)))
                (0, validation_js_1.invalid)('invalid expected branch OID');
            return (0, validation_js_1.freeze)({ action: 'request-retire', resourceId: target(), disposition: { kind: d.kind, branch: d.branch,
                    ...(d.expectedFactsDigest === undefined ? {} : { expectedFactsDigest: (0, validation_js_1.id)(d.expectedFactsDigest, 'expectedFactsDigest') }),
                    ...(d.explanation === undefined ? {} : { explanation: text(d.explanation, 'explanation') }),
                    ...(d.expectedBranchOid === undefined ? {} : { expectedBranchOid: d.expectedBranchOid }) } });
        }
        default: return (0, validation_js_1.invalid)('unsupported resource action; program receipts are not wire operations');
    }
}
function strict(name, parse) { return { mode: 'strict', typeSymbol: exports.REMOTE_NAMESPACE + '#' + name, create: () => ({ parse }) }; }
const sessionCodec = strict('SessionId', value => (0, validation_js_1.id)(value, 'sessionId'));
const jsonCodec = strict('Json', parseHostJson);
const revisionCodec = strict('Revision', value => (0, validation_js_1.revision)(value, 'expectedRevision'));
function descriptor(method, parameters, result) {
    return { id: '@lmgatex/dsh-mattpocock-skills#' + exports.REMOTE_NAMESPACE + '/' + method, service: exports.REMOTE_NAMESPACE, namespace: exports.REMOTE_NAMESPACE, method,
        invocation: { kind: 'direct' }, parameters: parameters.map(([name, codec]) => ({ name, wire: name, source: 'json', codec })), result,
        ...((method === 'readSession' || method === 'readSummaries' || method === 'historyAction') ? { cancellation: { parameter: 'signal' } } : {}) };
}
/** The same strict contract is registered on Host and selected by Client $mount. */
exports.REMOTE_CONTRIBUTION = Object.freeze({
    package: '@lmgatex/dsh-mattpocock-skills',
    descriptors: Object.freeze([
        descriptor('readPolicy', [], strict('PolicySnapshot', policy_js_1.parsePolicySnapshot)),
        descriptor('savePolicy', [['intent', strict('PolicyIntent', policy_js_1.parsePolicyIntent)], ['expectedRevision', revisionCodec]], strict('PolicySnapshot', policy_js_1.parsePolicySnapshot)),
        descriptor('readSupervisionConfig', [], strict('SupervisionConfigSnapshot', supervision_config_js_1.parseSupervisionConfigSnapshot)),
        descriptor('saveSupervisionConfig', [['intent', strict('SupervisionConfigIntent', supervision_config_js_1.parseSupervisionConfigIntent)], ['expectedRevision', revisionCodec]], strict('SupervisionConfigSnapshot', supervision_config_js_1.parseSupervisionConfigSnapshot)),
        descriptor('readSupervision', [['sessionId', sessionCodec]], jsonCodec),
        descriptor('listWorkspaces', [], jsonCodec), descriptor('readSession', [['sessionId', sessionCodec]], jsonCodec),
        descriptor('readSummaries', [['request', strict('SessionSummaryRequest', parseSessionSummaryRequest)]], strict('SessionSummaryBatch', parseSessionSummaryBatch)),
        descriptor('applyInstrument', [['sessionId', sessionCodec], ['command', strict('InstrumentCommand', instrument_state_js_1.parseInstrumentCommand)]], jsonCodec),
        descriptor('applyTicketWindow', [['sessionId', sessionCodec], ['command', strict('TicketWindowCommand', parseRemoteTicketWindow)]], jsonCodec),
        descriptor('resourceAction', [['sessionId', sessionCodec], ['request', strict('ResourceAction', parseResourceAction)]], jsonCodec),
        descriptor('historyAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
        descriptor('worktreeAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
        descriptor('grantPolicy', [['sessionId', sessionCodec], ['enabled', strict('Boolean', value => (0, validation_js_1.boolean)(value, 'enabled'))], ['expectedRevision', revisionCodec]], strict('PolicyGrants', parsePolicyGrants)),
    ]),
});

},
"src/controls/supervision-audit.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPERVISION_SEVERITIES = exports.SUPERVISION_VERDICTS = exports.SUPERVISION_TRIGGERS = void 0;
exports.initialSupervisionDocument = initialSupervisionDocument;
exports.parseSupervisionDocument = parseSupervisionDocument;
exports.decideSupervisionTrigger = decideSupervisionTrigger;
exports.deterministicReview = deterministicReview;
exports.makeSupervisionEpisode = makeSupervisionEpisode;
exports.withSupervisionEpisode = withSupervisionEpisode;
exports.supervisionAgentText = supervisionAgentText;
const validation_js_1 = require("./validation.js");
exports.SUPERVISION_TRIGGERS = ['scheduled', 'suspicion'];
exports.SUPERVISION_VERDICTS = ['on-track', 'suspicion', 'uncertain'];
exports.SUPERVISION_SEVERITIES = ['info', 'concern', 'alert'];
const MAX_EPISODES = 2000;
const hour = 60 * 60 * 1000;
function dayKey(at) { return new Date(at).toISOString().slice(0, 10); }
function hourKey(at) { return new Date(at).toISOString().slice(0, 13); }
function integer(value, where, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum)
        (0, validation_js_1.invalid)(where + ' must be an integer between ' + minimum + ' and ' + maximum);
    return value;
}
function text(value, where, maximum = 2048) {
    if (typeof value !== 'string' || value.length > maximum || value.includes('\u0000'))
        (0, validation_js_1.invalid)(where + ' must be bounded text');
    return value;
}
function parseEvidence(value) {
    const raw = (0, validation_js_1.record)(value, 'supervision evidence', ['events', 'productWrites', 'supportWrites', 'productFiles', 'supportFiles', 'noProductHours', 'rootsConfigured']);
    const files = (key) => {
        const rows = (0, validation_js_1.array)(raw[key], 'supervision ' + key).map((row, index) => text(row, 'supervision ' + key + '[' + index + ']', 512));
        if (rows.length > 100 || new Set(rows).size !== rows.length)
            (0, validation_js_1.invalid)('supervision ' + key + ' must be bounded unique paths');
        return (0, validation_js_1.freeze)(rows);
    };
    return (0, validation_js_1.freeze)({
        events: integer(raw.events, 'supervision events', 0, 1_000_000),
        productWrites: integer(raw.productWrites, 'supervision productWrites', 0, 1_000_000),
        supportWrites: integer(raw.supportWrites, 'supervision supportWrites', 0, 1_000_000),
        productFiles: files('productFiles'), supportFiles: files('supportFiles'),
        noProductHours: raw.noProductHours === null ? null : (() => { const n = raw.noProductHours; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100000)
            (0, validation_js_1.invalid)('supervision noProductHours must be null or a non-negative number'); return n; })(),
        rootsConfigured: (0, validation_js_1.boolean)(raw.rootsConfigured, 'supervision rootsConfigured'),
    });
}
function parseEpisode(value) {
    const raw = (0, validation_js_1.record)(value, 'supervision episode', ['episodeId', 'ownerSessionId', 'ticketId', 'research', 'at', 'trigger', 'verdict', 'severity', 'observed', 'possibleIssue', 'confidence', 'delivery', 'evidence']);
    if (!exports.SUPERVISION_TRIGGERS.includes(raw.trigger))
        (0, validation_js_1.invalid)('supervision trigger is invalid');
    if (!exports.SUPERVISION_VERDICTS.includes(raw.verdict))
        (0, validation_js_1.invalid)('supervision verdict is invalid');
    if (!exports.SUPERVISION_SEVERITIES.includes(raw.severity))
        (0, validation_js_1.invalid)('supervision severity is invalid');
    if (!['none', 'card', 'card+agent'].includes(raw.delivery))
        (0, validation_js_1.invalid)('supervision delivery is invalid');
    return (0, validation_js_1.freeze)({
        episodeId: (0, validation_js_1.id)(raw.episodeId, 'supervision episodeId'), ownerSessionId: (0, validation_js_1.id)(raw.ownerSessionId, 'supervision ownerSessionId'),
        ticketId: raw.ticketId === undefined || raw.ticketId === null ? null : (0, validation_js_1.id)(raw.ticketId, 'supervision ticketId'),
        research: raw.research === undefined ? false : (0, validation_js_1.boolean)(raw.research, 'supervision research'), at: (0, validation_js_1.revision)(raw.at, 'supervision at'),
        trigger: raw.trigger, verdict: raw.verdict, severity: raw.severity,
        observed: text(raw.observed, 'supervision observed', 4096), possibleIssue: text(raw.possibleIssue, 'supervision possibleIssue', 2048),
        confidence: (() => { const n = raw.confidence; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)
            (0, validation_js_1.invalid)('supervision confidence must be 0..1'); return n; })(),
        delivery: raw.delivery, evidence: parseEvidence(raw.evidence),
    });
}
function initialSupervisionDocument(ownerSessionId, workspaceId, now) {
    return (0, validation_js_1.freeze)({ schemaVersion: 1, revision: 0, ownerSessionId: (0, validation_js_1.id)(ownerSessionId, 'ownerSessionId'), workspaceId: (0, validation_js_1.id)(workspaceId, 'workspaceId'),
        createdAt: now, lastScheduledAt: now, lastSuspicionAt: null, consecutiveOnTrack: 0, backoffUntil: null,
        hourKey: hourKey(now), hourCalls: 0, dailyKey: dayKey(now), dailyCalls: 0, dailyTokens: 0, episodes: [] });
}
function parseSupervisionDocument(value) {
    const raw = (0, validation_js_1.record)(value, 'supervision document', ['schemaVersion', 'revision', 'ownerSessionId', 'workspaceId', 'createdAt', 'lastScheduledAt', 'lastSuspicionAt', 'consecutiveOnTrack', 'backoffUntil', 'hourKey', 'hourCalls', 'dailyKey', 'dailyCalls', 'dailyTokens', 'episodes']);
    if (raw.schemaVersion !== 1)
        (0, validation_js_1.invalid)('unsupported supervision schemaVersion');
    const episodes = (0, validation_js_1.array)(raw.episodes, 'supervision episodes').map(parseEpisode);
    if (episodes.length > MAX_EPISODES)
        (0, validation_js_1.invalid)('supervision episode budget exceeded');
    return (0, validation_js_1.freeze)({
        schemaVersion: 1, revision: (0, validation_js_1.revision)(raw.revision, 'supervision revision'), ownerSessionId: (0, validation_js_1.id)(raw.ownerSessionId, 'ownerSessionId'),
        workspaceId: (0, validation_js_1.id)(raw.workspaceId, 'workspaceId'), createdAt: (0, validation_js_1.revision)(raw.createdAt, 'supervision createdAt'),
        lastScheduledAt: (0, validation_js_1.revision)(raw.lastScheduledAt, 'supervision lastScheduledAt'),
        lastSuspicionAt: raw.lastSuspicionAt === null ? null : (0, validation_js_1.revision)(raw.lastSuspicionAt, 'supervision lastSuspicionAt'),
        consecutiveOnTrack: integer(raw.consecutiveOnTrack, 'supervision consecutiveOnTrack', 0, 100000),
        backoffUntil: raw.backoffUntil === null ? null : (0, validation_js_1.revision)(raw.backoffUntil, 'supervision backoffUntil'),
        hourKey: text(raw.hourKey, 'supervision hourKey', 13), hourCalls: integer(raw.hourCalls, 'supervision hourCalls', 0, 100000),
        dailyKey: text(raw.dailyKey, 'supervision dailyKey', 10), dailyCalls: integer(raw.dailyCalls, 'supervision dailyCalls', 0, 100000),
        dailyTokens: integer(raw.dailyTokens, 'supervision dailyTokens', 0, 100_000_000),
        episodes: (0, validation_js_1.freeze)(episodes),
    });
}
function decideSupervisionTrigger(document, settings, summary, now, ticketSuspicionMode) {
    if (document.backoffUntil !== null && now < document.backoffUntil)
        return null;
    const currentHourCalls = document.hourKey === hourKey(now) ? document.hourCalls : 0;
    const currentDailyCalls = document.dailyKey === dayKey(now) ? document.dailyCalls : 0;
    const currentDailyTokens = document.dailyKey === dayKey(now) ? document.dailyTokens : 0;
    const budgetAllows = currentHourCalls < settings.scheduledMaxPerHour && currentDailyCalls < settings.scheduledMaxPerDay && currentDailyTokens < settings.scheduledDailyTokenBudget;
    if (!budgetAllows)
        return null;
    const supportSurge = settings.suspicionMode === 'auto' && ticketSuspicionMode !== 'off' && summary.supportOnly && (summary.noProductHours ?? 0) >= settings.delivery.alertMinNoProductHours && summary.supportFiles.length >= settings.delivery.alertMinSupportFiles;
    const suspicionDue = supportSurge && (document.lastSuspicionAt === null || now - document.lastSuspicionAt >= settings.cooldownMinutes * 60 * 1000);
    if (suspicionDue)
        return 'suspicion';
    const scheduledDue = summary.events > 0 && now - document.lastScheduledAt >= settings.scheduledIntervalMinutes * 60 * 1000;
    if (scheduledDue)
        return 'scheduled';
    return null;
}
function deterministicReview(trigger, summary) {
    const observed = summary.productWrites + ' product write(s), ' + summary.supportWrites + ' support write(s), ' + summary.supportFiles.length + ' support file(s)' +
        (summary.noProductHours === null ? '; no product write observed.' : '; ' + summary.noProductHours + 'h since the last product write.');
    if (trigger === 'suspicion')
        return (0, validation_js_1.freeze)({ verdict: 'suspicion', severity: 'alert', observed,
            possibleIssue: '当前正在进行的工作可能偏离原票的交付方向，也可能只是必要的准备。', confidence: 0.55 });
    if (summary.supportOnly)
        return (0, validation_js_1.freeze)({ verdict: 'uncertain', severity: 'concern', observed,
            possibleIssue: '当前正在进行的工作可能偏向支撑材料，尚未看到产品交付写入，也可能仍在准备。', confidence: 0.35 });
    return (0, validation_js_1.freeze)({ verdict: 'on-track', severity: 'info', observed, possibleIssue: '当前观察未形成明确问题；仍需结合票面交付判断。', confidence: 0.2 });
}
function makeSupervisionEpisode(input) {
    const evidence = (0, validation_js_1.freeze)({ events: input.summary.events, productWrites: input.summary.productWrites,
        supportWrites: input.summary.supportWrites, productFiles: input.summary.productFiles, supportFiles: input.summary.supportFiles,
        noProductHours: input.summary.noProductHours, rootsConfigured: input.summary.rootsConfigured });
    return (0, validation_js_1.freeze)({ episodeId: input.document.ownerSessionId + ':' + input.now + ':' + input.trigger + ':' + input.document.episodes.length,
        ownerSessionId: input.document.ownerSessionId, ticketId: input.ticketId ?? null, research: input.research === true, at: input.now, trigger: input.trigger, verdict: input.review.verdict, severity: input.review.severity,
        observed: input.review.observed, possibleIssue: input.review.possibleIssue, confidence: input.review.confidence,
        delivery: input.delivery, evidence });
}
function withSupervisionEpisode(document, episode, settings, now, tokens = 0) {
    const cutoff = now - settings.episodeRetentionDays * 24 * hour;
    const episodes = [...document.episodes.filter(row => row.at >= cutoff), episode].slice(-Math.min(settings.episodeMaxEntries, MAX_EPISODES));
    const nextHour = document.hourKey === hourKey(now) ? document.hourCalls : 0;
    const nextDaily = document.dailyKey === dayKey(now) ? document.dailyCalls : 0;
    const nextTokens = document.dailyKey === dayKey(now) ? document.dailyTokens : 0;
    const onTrack = episode.verdict === 'on-track';
    const consecutive = onTrack ? Math.min(document.consecutiveOnTrack + 1, 100) : 0;
    return (0, validation_js_1.freeze)({
        ...document, revision: document.revision + 1, lastScheduledAt: episode.trigger === 'scheduled' ? now : document.lastScheduledAt,
        lastSuspicionAt: episode.trigger === 'suspicion' ? now : document.lastSuspicionAt, consecutiveOnTrack: consecutive,
        backoffUntil: onTrack ? now + Math.min(settings.cooldownMinutes * settings.backoffFactor, 24 * 60) * 60 * 1000 : null,
        hourKey: hourKey(now), hourCalls: nextHour + 1, dailyKey: dayKey(now), dailyCalls: nextDaily + 1,
        dailyTokens: nextTokens + Math.max(0, Math.floor(tokens)), episodes: (0, validation_js_1.freeze)(episodes),
    });
}
function supervisionAgentText(episode) {
    return '[监督提示 · 轻量模型，仅供参考]\n\n观察：' + episode.observed + '\n\n可能的问题：' + episode.possibleIssue +
        '\n\n建议：无需中断当前 subagents 的工作；结合现有任务与 spec 核对这些观察，是否需要额外检查及如何安排，由主代理按当前任务约定判断。本提示不要求新增子任务或派发，也不构成交付结论。';
}

},
"src/controls/supervision-config.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSupervisionConfigDocument = exports.INITIAL_SUPERVISION_CONFIG = exports.SUPERVISION_DEFAULTS = exports.SUPERVISION_SUSPICION_MODES = exports.SUPERVISION_DELIVERY_MODES = exports.SUPERVISION_ROUTE_MODES = exports.SUPERVISION_START_MODES = exports.SUPERVISION_SCHEMA_VERSION = void 0;
exports.resolveSupervisionSettings = resolveSupervisionSettings;
exports.parseSupervisionConfigIntent = parseSupervisionConfigIntent;
exports.parseSupervisionConfigSnapshot = parseSupervisionConfigSnapshot;
exports.supervisionIntentOf = supervisionIntentOf;
exports.ownSupervisionLeaf = ownSupervisionLeaf;
exports.setSupervisionLeaf = setSupervisionLeaf;
const validation_js_1 = require("./validation.js");
exports.SUPERVISION_SCHEMA_VERSION = 1;
exports.SUPERVISION_START_MODES = ['ticket-held', 'first-support-surge'];
exports.SUPERVISION_ROUTE_MODES = ['inherit', 'explicit'];
exports.SUPERVISION_DELIVERY_MODES = ['card', 'card+agent-check'];
exports.SUPERVISION_SUSPICION_MODES = ['auto', 'off'];
exports.SUPERVISION_DEFAULTS = (0, validation_js_1.freeze)({
    enabled: false,
    scheduledIntervalMinutes: 60,
    scheduledMaxPerHour: 1,
    scheduledMaxPerDay: 24,
    scheduledDailyTokenBudget: 120000,
    rollingSummaryHours: 24,
    scheduledSummaryTopLanes: 4,
    suspicionStartMode: 'first-support-surge',
    suspicionMode: 'auto',
    checkIntervalMinutes: 20,
    noProgressChecks: 3,
    fastWindowMinutes: 90,
    supportWriteThreshold: 5,
    supportReadBackThreshold: 0.5,
    cooldownMinutes: 90,
    maxAuditsPer6h: 2,
    backoffFactor: 2,
    lazyCheck: true,
    dryRun: true,
    episodeRetentionDays: 30,
    episodeMaxEntries: 2000,
    reviewer: (0, validation_js_1.freeze)({ routeMode: 'inherit', provider: '', model: '', reasoningEffort: '', maxTokens: 2048, timeoutMs: 45000, toolRounds: 1 }),
    delivery: (0, validation_js_1.freeze)({ concern: 'card', alert: 'card+agent-check', alertMinNoProductHours: 4, alertMinSupportFiles: 10 }),
    softBudgetHours: null,
    deliverableRoots: (0, validation_js_1.freeze)([]),
    supportRoots: (0, validation_js_1.freeze)([]),
    excludeGlobs: (0, validation_js_1.freeze)([]),
});
exports.INITIAL_SUPERVISION_CONFIG = (0, validation_js_1.freeze)({
    schemaVersion: 1, revision: 0, defaults: {}, workspaceOverrides: {},
});
const TOP_KEYS = [
    'enabled', 'scheduledIntervalMinutes', 'scheduledMaxPerHour', 'scheduledMaxPerDay',
    'scheduledDailyTokenBudget', 'rollingSummaryHours', 'scheduledSummaryTopLanes', 'suspicionStartMode', 'suspicionMode', 'checkIntervalMinutes',
    'noProgressChecks', 'fastWindowMinutes', 'supportWriteThreshold', 'supportReadBackThreshold',
    'cooldownMinutes', 'maxAuditsPer6h', 'backoffFactor', 'lazyCheck', 'dryRun', 'episodeRetentionDays', 'episodeMaxEntries', 'reviewer',
    'delivery', 'softBudgetHours', 'deliverableRoots', 'supportRoots', 'excludeGlobs',
];
const REVIEWER_KEYS = ['routeMode', 'provider', 'model', 'reasoningEffort', 'maxTokens', 'timeoutMs', 'toolRounds'];
const DELIVERY_KEYS = ['concern', 'alert', 'alertMinNoProductHours', 'alertMinSupportFiles'];
function text(value, where, maximum = 256) {
    if (typeof value !== 'string' || value.length > maximum || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value))
        (0, validation_js_1.invalid)(where + ' must be a bounded single-line string');
    return value;
}
function integer(value, where, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum)
        (0, validation_js_1.invalid)(where + ' must be an integer between ' + minimum + ' and ' + maximum);
    return value;
}
function decimal(value, where, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
        (0, validation_js_1.invalid)(where + ' must be a number between ' + minimum + ' and ' + maximum);
    return value;
}
function oneOf(value, where, values) {
    if (typeof value !== 'string' || !values.includes(value))
        (0, validation_js_1.invalid)(where + ' must be one of ' + values.join(', '));
    return value;
}
function strings(value, where) {
    const rows = (0, validation_js_1.boundedArray)(value, where, 100).map((row, index) => {
        const parsed = text(row, where + '[' + index + ']', 512);
        if (parsed.length === 0)
            (0, validation_js_1.invalid)(where + ' entries must be non-empty');
        return parsed;
    });
    if (new Set(rows).size !== rows.length)
        (0, validation_js_1.invalid)(where + ' must not contain duplicates');
    return (0, validation_js_1.freeze)(rows);
}
function parseReviewerPatch(value, where) {
    const raw = (0, validation_js_1.record)(value, where, REVIEWER_KEYS);
    const result = {};
    if (Object.hasOwn(raw, 'routeMode'))
        result.routeMode = oneOf(raw.routeMode, where + '.routeMode', exports.SUPERVISION_ROUTE_MODES);
    if (Object.hasOwn(raw, 'provider'))
        result.provider = text(raw.provider, where + '.provider', 256);
    if (Object.hasOwn(raw, 'model'))
        result.model = text(raw.model, where + '.model', 256);
    if (Object.hasOwn(raw, 'reasoningEffort'))
        result.reasoningEffort = text(raw.reasoningEffort, where + '.reasoningEffort', 64);
    if (Object.hasOwn(raw, 'maxTokens'))
        result.maxTokens = integer(raw.maxTokens, where + '.maxTokens', 256, 8192);
    if (Object.hasOwn(raw, 'timeoutMs'))
        result.timeoutMs = integer(raw.timeoutMs, where + '.timeoutMs', 5000, 120000);
    if (Object.hasOwn(raw, 'toolRounds'))
        result.toolRounds = integer(raw.toolRounds, where + '.toolRounds', 0, 2);
    return result;
}
function parseDeliveryPatch(value, where) {
    const raw = (0, validation_js_1.record)(value, where, DELIVERY_KEYS);
    const result = {};
    if (Object.hasOwn(raw, 'concern'))
        result.concern = oneOf(raw.concern, where + '.concern', exports.SUPERVISION_DELIVERY_MODES);
    if (Object.hasOwn(raw, 'alert'))
        result.alert = oneOf(raw.alert, where + '.alert', exports.SUPERVISION_DELIVERY_MODES);
    if (Object.hasOwn(raw, 'alertMinNoProductHours'))
        result.alertMinNoProductHours = integer(raw.alertMinNoProductHours, where + '.alertMinNoProductHours', 1, 24);
    if (Object.hasOwn(raw, 'alertMinSupportFiles'))
        result.alertMinSupportFiles = integer(raw.alertMinSupportFiles, where + '.alertMinSupportFiles', 1, 100);
    return result;
}
function parsePatch(value, where) {
    const raw = (0, validation_js_1.record)(value, where, TOP_KEYS);
    const result = {};
    const bools = ['enabled', 'lazyCheck', 'dryRun'];
    for (const key of bools)
        if (Object.hasOwn(raw, key))
            result[key] = (0, validation_js_1.boolean)(raw[key], where + '.' + key);
    const ranges = [
        ['scheduledIntervalMinutes', 15, 240], ['scheduledMaxPerHour', 1, 4], ['scheduledMaxPerDay', 1, 24],
        ['scheduledDailyTokenBudget', 1000, 1000000], ['rollingSummaryHours', 1, 72], ['scheduledSummaryTopLanes', 1, 20], ['checkIntervalMinutes', 5, 60],
        ['noProgressChecks', 2, 12], ['fastWindowMinutes', 15, 180], ['supportWriteThreshold', 1, 100],
        ['cooldownMinutes', 15, 360], ['maxAuditsPer6h', 1, 12], ['backoffFactor', 1, 4],
        ['episodeRetentionDays', 1, 365], ['episodeMaxEntries', 100, 10000],
    ];
    for (const [key, minimum, maximum] of ranges)
        if (Object.hasOwn(raw, key)) {
            result[key] = integer(raw[key], where + '.' + key, minimum, maximum);
        }
    if (Object.hasOwn(raw, 'supportReadBackThreshold'))
        result.supportReadBackThreshold = decimal(raw.supportReadBackThreshold, where + '.supportReadBackThreshold', 0, 1);
    if (Object.hasOwn(raw, 'suspicionStartMode'))
        result.suspicionStartMode = oneOf(raw.suspicionStartMode, where + '.suspicionStartMode', exports.SUPERVISION_START_MODES);
    if (Object.hasOwn(raw, 'suspicionMode'))
        result.suspicionMode = oneOf(raw.suspicionMode, where + '.suspicionMode', exports.SUPERVISION_SUSPICION_MODES);
    if (Object.hasOwn(raw, 'reviewer')) {
        const reviewer = parseReviewerPatch(raw.reviewer, where + '.reviewer');
        if (Object.keys(reviewer).length > 0)
            result.reviewer = reviewer;
    }
    if (Object.hasOwn(raw, 'delivery')) {
        const delivery = parseDeliveryPatch(raw.delivery, where + '.delivery');
        if (Object.keys(delivery).length > 0)
            result.delivery = delivery;
    }
    if (Object.hasOwn(raw, 'softBudgetHours')) {
        result.softBudgetHours = raw.softBudgetHours === null ? null : integer(raw.softBudgetHours, where + '.softBudgetHours', 1, 720);
    }
    for (const key of ['deliverableRoots', 'supportRoots', 'excludeGlobs']) {
        if (Object.hasOwn(raw, key))
            result[key] = strings(raw[key], where + '.' + key);
    }
    return result;
}
function mergeSettings(defaults, override) {
    const reviewer = (0, validation_js_1.freeze)({
        ...exports.SUPERVISION_DEFAULTS.reviewer,
        ...(defaults.reviewer ?? {}),
        ...(override?.reviewer ?? {}),
    });
    const delivery = (0, validation_js_1.freeze)({
        ...exports.SUPERVISION_DEFAULTS.delivery,
        ...(defaults.delivery ?? {}),
        ...(override?.delivery ?? {}),
    });
    const merged = {
        ...exports.SUPERVISION_DEFAULTS,
        ...defaults,
        ...(override ?? {}),
        reviewer,
        delivery,
        deliverableRoots: override?.deliverableRoots ?? defaults.deliverableRoots ?? exports.SUPERVISION_DEFAULTS.deliverableRoots,
        supportRoots: override?.supportRoots ?? defaults.supportRoots ?? exports.SUPERVISION_DEFAULTS.supportRoots,
        excludeGlobs: override?.excludeGlobs ?? defaults.excludeGlobs ?? exports.SUPERVISION_DEFAULTS.excludeGlobs,
        softBudgetHours: override && Object.hasOwn(override, 'softBudgetHours') ? override.softBudgetHours ?? null
            : defaults && Object.hasOwn(defaults, 'softBudgetHours') ? defaults.softBudgetHours ?? null : null,
    };
    return (0, validation_js_1.freeze)(merged);
}
function resolveSupervisionSettings(snapshot, workspaceId) {
    if (workspaceId !== null)
        (0, validation_js_1.id)(workspaceId, 'workspaceId');
    return mergeSettings(snapshot.defaults, workspaceId === null ? undefined : snapshot.workspaceOverrides[workspaceId]);
}
function assertResolved(settings, where) {
    if (settings.reviewer.routeMode === 'explicit' && (settings.reviewer.provider.length === 0 || settings.reviewer.model.length === 0)) {
        (0, validation_js_1.invalid)(where + ': explicit reviewer route requires provider and model');
    }
}
function parseIntentRaw(value) {
    const raw = (0, validation_js_1.record)(value, 'supervision config intent', ['defaults', 'workspaceOverrides']);
    const overrides = (0, validation_js_1.record)(raw.workspaceOverrides, 'supervision workspaceOverrides');
    const entries = Object.entries(overrides).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, patch]) => {
        const workspace = (0, validation_js_1.id)(key, 'supervision workspace id');
        return [workspace, parsePatch(patch, 'supervision workspaceOverrides.' + workspace)];
    }).filter(([, patch]) => Object.keys(patch).length > 0);
    return (0, validation_js_1.freeze)({
        defaults: parsePatch(raw.defaults, 'supervision defaults'),
        workspaceOverrides: Object.fromEntries(entries),
    });
}
function parseSupervisionConfigIntent(value) {
    const parsed = parseIntentRaw(value);
    assertResolved(resolveSupervisionSettings(parsed, null), 'supervision defaults');
    for (const workspace of Object.keys(parsed.workspaceOverrides))
        assertResolved(resolveSupervisionSettings(parsed, workspace), 'supervision workspaceOverrides.' + workspace);
    return parsed;
}
function parseSupervisionConfigSnapshot(value) {
    const raw = (0, validation_js_1.record)(value, 'supervision config snapshot', ['schemaVersion', 'revision', 'defaults', 'workspaceOverrides']);
    if (raw.schemaVersion !== 1)
        (0, validation_js_1.invalid)('unsupported supervision schemaVersion');
    const parsed = parseSupervisionConfigIntent({ defaults: raw.defaults, workspaceOverrides: raw.workspaceOverrides });
    return (0, validation_js_1.freeze)({ schemaVersion: 1, revision: (0, validation_js_1.revision)(raw.revision, 'supervision revision'), ...parsed });
}
exports.parseSupervisionConfigDocument = parseSupervisionConfigSnapshot;
function supervisionIntentOf(snapshot) {
    return (0, validation_js_1.freeze)({ defaults: snapshot.defaults, workspaceOverrides: snapshot.workspaceOverrides });
}
function ownSupervisionLeaf(intent, workspaceId, field) {
    const patch = workspaceId === null ? intent.defaults : intent.workspaceOverrides[workspaceId];
    if (!patch)
        return undefined;
    const dot = field.indexOf('.');
    if (dot < 0)
        return patch[field];
    const group = field.slice(0, dot), key = field.slice(dot + 1);
    const nested = group === 'reviewer' ? patch.reviewer : patch.delivery;
    return nested ? nested[key] : undefined;
}
function setSupervisionLeaf(intent, workspaceId, field, value) {
    if (workspaceId !== null)
        (0, validation_js_1.id)(workspaceId, 'workspaceId');
    const next = JSON.parse(JSON.stringify(intent));
    const target = workspaceId === null ? next.defaults : (next.workspaceOverrides[workspaceId] ?? (next.workspaceOverrides[workspaceId] = {}));
    const dot = field.indexOf('.');
    if (dot < 0) {
        if (value === undefined)
            delete target[field];
        else
            target[field] = value;
    }
    else {
        const group = field.slice(0, dot), key = field.slice(dot + 1);
        const nested = target[group] ?? {};
        if (value === undefined)
            delete nested[key];
        else
            nested[key] = value;
        if (Object.keys(nested).length === 0)
            delete target[group];
        else
            target[group] = nested;
    }
    if (workspaceId !== null && Object.keys(target).length === 0)
        delete next.workspaceOverrides[workspaceId];
    // Structural parse catches wrong field types without requiring a complete explicit route while the user is typing.
    const parsed = parseIntentRaw(next);
    return parsed;
}

},
"src/controls/validation.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlsError = void 0;
exports.invalid = invalid;
exports.isPreCommitRejection = isPreCommitRejection;
exports.record = record;
exports.array = array;
exports.boundedArray = boundedArray;
exports.id = id;
exports.revision = revision;
exports.increment = increment;
exports.boolean = boolean;
exports.capacity = capacity;
exports.freeze = freeze;
exports.memoized = memoized;
/** Mechanical diagnostics only; never business blockers or approval requests. */
class ControlsError extends Error {
    code;
    name = 'ControlsError';
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.ControlsError = ControlsError;
function invalid(message) {
    throw new ControlsError('invalid-input', message);
}
const PRE_COMMIT_REJECTIONS = new Set([
    'invalid-input', 'invalid-state', 'access-denied', 'feature-disabled', 'revision-conflict',
    'operation-conflict', 'concurrent-update', 'association-conflict', 'unknown-session', 'unknown-workspace',
]);
/** True when a tracked mutation rejected before it could start its durable write, so the
 * stored documents are unchanged. A pending-read frontier must not report unknown durability
 * for these; storage-uncertain and non-controls errors keep the persistence outcome unknown. */
function isPreCommitRejection(error) {
    return error instanceof ControlsError && PRE_COMMIT_REJECTIONS.has(error.code);
}
function record(value, where, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        invalid(where + ' must be a plain object');
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string' || (keys && !keys.includes(key)))
            invalid(where + ': unknown key ' + String(key) + (keys === undefined || keys.length === 0 ? '' : '; accepted keys: ' + keys.join(', ')));
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined)
            invalid(where + ': field must be enumerable JSON data: ' + key);
        result[key] = descriptor.value;
    }
    return result;
}
/** Dense JSON arrays only: map must not silently skip holes that stringify as null. */
function array(value, where) {
    if (!Array.isArray(value))
        invalid(where + ' must be an array');
    for (const key of Reflect.ownKeys(value)) {
        if (key === 'length')
            continue;
        if (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length)
            invalid(where + ': unexpected array field ' + String(key));
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!Object.hasOwn(descriptor, 'value') || descriptor.value === undefined)
            invalid(where + ': array elements must be JSON data');
    }
    const result = [];
    for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index))
            invalid(where + ' must not contain sparse holes');
        result.push(value[index]);
    }
    return result;
}
/** Dense array with an element budget: a single accepted command must not inflate the durable document. */
function boundedArray(value, where, maximum) {
    const rows = array(value, where);
    if (rows.length > maximum)
        invalid(where + ' accepts at most ' + maximum + ' entries');
    return rows;
}
function id(value, where) {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0
        || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value))
        invalid(where + ' must be a non-empty opaque id');
    return value;
}
function revision(value, where) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        invalid(where + ' must be a non-negative safe integer');
    return value;
}
function increment(value) {
    return revision(value + 1, 'next revision');
}
function boolean(value, where) {
    if (typeof value !== 'boolean')
        invalid(where + ' must be boolean');
    return value;
}
function capacity(value, where) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
        invalid(where + ' must be a positive safe integer');
    return value;
}
function freeze(value) {
    if (value !== null && typeof value === 'object') {
        for (const child of Object.values(value))
            freeze(child);
        Object.freeze(value);
    }
    return value;
}
/** Storage adapters validate, detach and freeze the documents they return. Parsing
 * the returned value again on every read re-walked a whole store per event: one
 * controls-document parse per tool event dominated CPU on a large workspace. Any
 * value a parser produced is registered by identity, so an unchanged document is
 * reused verbatim and an already-parsed document is never parsed twice.
 */
const parsedValues = new WeakMap();
function memoized(value, parse) {
    if (value !== null && typeof value === 'object') {
        const known = parsedValues.get(value);
        if (known !== undefined)
            return known;
    }
    const parsed = parse(value);
    if (parsed !== null && typeof parsed === 'object') {
        // A validated document is recognised wherever it is passed back in.
        parsedValues.set(parsed, parsed);
        // A frozen input is one of our own validated documents, so the same value
        // describes the same content; an unfrozen input is left uncached.
        if (Object.isFrozen(value))
            parsedValues.set(value, parsed);
    }
    return parsed;
}

}};
const dependencies={"src/client-notification-sound-data.ts":{},"src/client-notification-sounds.ts":{"./client-notification-sound-data.js":"src/client-notification-sound-data.ts"},"src/client-notifications.ts":{"./client-notification-sounds.js":"src/client-notification-sounds.ts"},"src/client-subagents.ts":{},"src/client.ts":{"./client-subagents.js":"src/client-subagents.ts","./client-notifications.js":"src/client-notifications.ts","./controls/policy.js":"src/controls/policy.ts","./controls/supervision-config.js":"src/controls/supervision-config.ts","./controls/supervision-audit.js":"src/controls/supervision-audit.ts","./controls/remote-contract.js":"src/controls/remote-contract.ts"},"src/controls/instrument-state.ts":{"./validation.js":"src/controls/validation.ts"},"src/controls/policy.ts":{"./validation.js":"src/controls/validation.ts"},"src/controls/remote-contract.ts":{"./policy.js":"src/controls/policy.ts","./supervision-config.js":"src/controls/supervision-config.ts","./instrument-state.js":"src/controls/instrument-state.ts","./validation.js":"src/controls/validation.ts"},"src/controls/supervision-audit.ts":{"./validation.js":"src/controls/validation.ts"},"src/controls/supervision-config.ts":{"./validation.js":"src/controls/validation.ts"},"src/controls/validation.ts":{}};
const cache=Object.create(null);
function load(id){if(Object.hasOwn(cache,id))return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](function(request){const local=dependencies[id][request];return local===undefined?require(request):load(local)},module,module.exports);return module.exports;}
return load("src/client.ts");}});
