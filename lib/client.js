window.__ModuleLoader__.load({id:"@lmgatex/dsh-mattpocock-skills",factory:function(require){
"use strict";const modules={"src/client.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.StartupSettingsController = exports.PolicyObserver = exports.SessionObserver = exports.UNSUPPORTED_SEATS = exports.OWN_TOOL_NAMES = exports.ROW_KEY = exports.TAB_ID = exports.TAB_KIND = exports.PACKAGE_NAME = void 0;
exports.decodeSession = decodeSession;
exports.setPolicyLeaf = setPolicyLeaf;
exports.savePolicyDraft = savePolicyDraft;
exports.policyDraftImpact = policyDraftImpact;
exports.windowSummary = windowSummary;
exports.WindowProjection = WindowProjection;
exports.resourceSummary = resourceSummary;
exports.ResourceProjection = ResourceProjection;
exports.compactInstrumentSummary = compactInstrumentSummary;
exports.HeaderEntry = HeaderEntry;
exports.InputSummary = InputSummary;
exports.decisionAnswerCommand = decisionAnswerCommand;
exports.Details = Details;
exports.bindingSummary = bindingSummary;
exports.WorktreeBindingsPanel = WorktreeBindingsPanel;
exports.WorktreeBindingEditor = WorktreeBindingEditor;
exports.HistoryPanel = HistoryPanel;
exports.sessionListRequested = sessionListRequested;
exports.WorkspaceBadge = WorkspaceBadge;
exports.decodeWorkspaces = decodeWorkspaces;
exports.settingsSessionChoices = settingsSessionChoices;
exports.SettingsInspection = SettingsInspection;
exports.ObservedSettingsInspection = ObservedSettingsInspection;
exports.StartupSettingsPanel = StartupSettingsPanel;
exports.SettingsPage = SettingsPage;
exports.sourceRecord = sourceRecord;
exports.SourceCard = SourceCard;
exports.apply = apply;
exports.grantPolicyFromSnapshot = grantPolicyFromSnapshot;
const react_1 = require("react");
const policy_js_1 = require("./controls/policy.js");
const startup_state_js_1 = require("./controls/startup-state.js");
const remote_contract_js_1 = require("./controls/remote-contract.js");
exports.PACKAGE_NAME = '@lmgatex/dsh-mattpocock-skills';
exports.TAB_KIND = 'mattpocock-collaboration';
exports.TAB_ID = exports.PACKAGE_NAME + ':collaboration';
exports.ROW_KEY = exports.PACKAGE_NAME + '#dsh-mattpocock-skills';
exports.OWN_TOOL_NAMES = ['mattpocock_record', 'mattpocock_window', 'mattpocock_resource', 'mattpocock_controls', 'mattpocock_execute', 'mattpocock_assign', 'mattpocock_history', 'mattpocock_worktree', 'mattpocock_delegate'];
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
            if (generation === this.generation && !this.closed && this.holds > 0 && this.intervalMs > 0)
                this.timer = setTimeout(() => { void this.refresh(); }, this.intervalMs);
        }
    };
    dispose() { this.closed = true; this.generation++; this.controller?.abort(); this.holds = 0; this.clearTimer(); this.state = { status: 'unknown', value: null, error: 'Observer disposed' }; this.listeners.clear(); }
    clearTimer() { if (this.timer !== undefined)
        clearTimeout(this.timer); this.timer = undefined; }
    publish(state) { this.state = state; for (const listener of this.listeners)
        listener(); }
}
exports.SessionObserver = SessionObserver;
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
    for (const key of policy_js_1.DISPLAY_NAMES)
        add('display.' + key, { value: old.display[key], source: old.sources[('display.' + key)] }, { value: next.display[key], source: next.sources[('display.' + key)] });
    return { readRevision: saved.revision, scope: workspaceId ?? 'global-defaults', changes, executionEffects: 'Intent only. Existing obligations/executions remain; inspect the authorized Session snapshot for actual usage/convergence.' };
}
function intentOf(snapshot) { return (0, policy_js_1.parsePolicyIntent)({ extensionEnabled: snapshot.extensionEnabled, defaults: snapshot.defaults, workspaceOverrides: snapshot.workspaceOverrides }); }
function useObservation(observer) {
    (0, react_1.useEffect)(() => observer.retain(), [observer]);
    return (0, react_1.useSyncExternalStore)(observer.subscribe, observer.getSnapshot, observer.getSnapshot);
}
const panelStyle = { boxSizing: 'border-box', padding: '16px', height: '100%', overflow: 'auto', minHeight: 0 };
function diagnostic(message) { return (0, react_1.createElement)('p', { role: 'status' }, message); }
function pretty(value) { return (0, react_1.createElement)('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, JSON.stringify(value, null, 2)); }
function countText(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : '未知'; }
function capacityText(value) { return value === null ? '未配置' : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : '未知'; }
/** T is explicit bookkeeping; S tracking is not proof that all runtime work is known. */
function windowSummary(windows, health = []) {
    if (windows === null || health.some(row => row.scope === 'windows' && row.status === 'unknown'))
        return ['T 未知', 'S 未知'];
    const signed = (value) => typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '未知';
    const reference = (usage) => '/' + capacityText(usage.capacity) + '（参考） · 超出 ' + countText(usage.overage) + ' · 差额 ' + signed(usage.gap);
    const T = 'T ' + countText(windows.T.used) + reference(windows.T);
    const knownS = windows.S.countKnown === true && windows.capability === 'cooperative' && windows.runtimeKnowledge?.known === true && windows.S.byState.unknown === 0;
    const S = knownS ? 'S ' + countText(windows.S.used) + reference(windows.S)
        : 'S 已登记 ' + countText(windows.S.used) + reference(windows.S) + ' · 总数未知';
    return [T, S];
}
function WindowProjection(props) {
    const failed = props.view.health.find(row => row.scope === 'windows' && row.status === 'unknown');
    const windows = props.view.windows;
    if (failed || windows === null)
        return diagnostic('窗口观测未知：' + (failed?.reason ?? '未返回 T/S；不是 0 或默认容量'));
    return (0, react_1.createElement)('section', { 'aria-label': '参考窗口观测' }, diagnostic('T/S 是参考值，不是硬名额；超出或统计未知不拒绝派发，也不要求额外审批。'), diagnostic('available 仅是登记账本余量，不是全机可派发数量；countKnown=false 时 used 只是已登记量，总数未知。'), diagnostic(windowSummary(windows, props.view.health).join(' · ')), pretty(windows));
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
    const records = view.records;
    const statuses = records?.summary.statusCounts.flatMap(axis => axis.statuses.map(status => ({
        key: axis.workflowId + '/' + axis.axisKey + '/' + status.statusKey,
        priority: status.summaryPriority ?? Number.MAX_SAFE_INTEGER,
        text: axis.workflowId + '/' + axis.label + ':' + status.label + ' ' + countText(status.count) + ' (' + axis.counting + ')',
    }))).sort((a, b) => a.priority - b.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) ?? [];
    const custom = statuses.slice(0, 2).map(row => row.text).join(' · ');
    const ticket = '票 ' + (records === null ? '未知' : countText(records.summary.totalTickets)) + (custom ? ' · ' + custom : '') + (statuses.length > 2 ? ' · 更多 ' + (statuses.length - 2) : '');
    const [T = 'T 未知', S = 'S 未知'] = windowSummary(view.windows, view.health);
    const resource = resourceSummary(view);
    const parts = ['待用户裁决 ' + (records === null ? '未知' : countText(records.summary.pendingUserDecisionCount)) + ' · 待落实 ' + (records === null ? '未知' : countText(records.summary.awaitingImplementationCount)), ticket, T, S,
        bindingSummary(view), resource.label];
    const detail = '实例 ' + view.instance.instrumentInstanceId + ' · ' + (records?.summary.countingScope ?? '统计未知') + ' · ' + parts.join(' · ')
        + (statuses.length ? ' · 完整状态：' + statuses.map(row => row.text).join(' · ') : '') + (resource.reason === null ? '' : ' · 资源读取原因：' + resource.reason);
    return { parts, detail };
}
function HeaderEntry(props) {
    const observation = useObservation(props.observer);
    if (props.observer.getDisplay()?.header === false)
        return null;
    if (observation.status === 'unknown')
        return (0, react_1.createElement)('span', { title: observation.error ?? 'No committed snapshot', role: 'status' }, '协作 · 状态未知');
    const view = observation.value;
    if (!view.policy.display.header)
        return null;
    const summary = compactInstrumentSummary(view);
    const style = { display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: 'min(60vw, 680px)', minWidth: 0, overflow: 'hidden', fontSize: '11px' };
    const content = [(0, react_1.createElement)('span', { key: 'identity' }, '协作'), ...summary.parts.map((part, index) => (0, react_1.createElement)('span', { key: index, style: { maxWidth: index === 1 ? '220px' : '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, part))];
    return view.policy.display.rightPanel ? (0, react_1.createElement)('button', { type: 'button', onClick: props.openDetails, title: summary.detail, 'aria-label': summary.detail, style }, ...content)
        : (0, react_1.createElement)('span', { title: summary.detail + ' · 右侧详情入口已关闭', 'aria-label': summary.detail, style }, ...content);
}
function InputSummary(props) {
    const observation = useObservation(props.observer);
    if (observation.status !== 'ready' || !observation.value.policy.display.inputSummary)
        return null;
    const view = observation.value;
    return (0, react_1.createElement)('section', { 'aria-label': '协作进度摘要', style: { maxHeight: '96px', overflow: 'auto' } }, view.records === null ? diagnostic('票进度未知') : (0, react_1.createElement)('span', null, '票 ' + String(view.records.summary.totalTickets) + ' · ' + view.records.summary.countingScope), (0, react_1.createElement)('span', null, ' · ' + windowSummary(view.windows, view.health).join(' · ')), view.records?.summary.statusCounts.map(axis => (0, react_1.createElement)('div', { key: axis.workflowId + ':' + axis.axisKey }, axis.workflowId + ' / ' + axis.label + ' (' + axis.counting + ') · ' + axis.statuses.map(status => status.label + ' ' + status.count).join(' · '))));
}
/** Explicit user answer; the Host RPC derives the real author, never the command. */
function decisionAnswerCommand(records, decision, answer, status, pending, awaitingImplementation, operationId) {
    if (!answer.trim() || !status.trim())
        throw new Error('Answer and user-selected status are required');
    return { operationId, expectedRevision: records.businessRevision, workflowId: decision.workflowId,
        action: 'put-decision', decisionId: decision.decisionId,
        value: { question: decision.value.question, status, result: answer, pending, awaitingImplementation } };
}
function DecisionEditor(props) {
    const [base, setBase] = (0, react_1.useState)({ records: props.records, decision: props.decision });
    const [answer, setAnswer] = (0, react_1.useState)('');
    const [status, setStatus] = (0, react_1.useState)(props.decision.value.status);
    const [pending, setPending] = (0, react_1.useState)(props.decision.value.pending ?? false);
    const [awaiting, setAwaiting] = (0, react_1.useState)(props.decision.value.awaitingImplementation ?? false);
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [message, setMessage] = (0, react_1.useState)(null);
    const save = async () => {
        setBusy(true);
        setMessage(null);
        try {
            const command = decisionAnswerCommand(base.records, base.decision, answer, status, pending, awaiting, crypto.randomUUID());
            remoteValue(await props.remote.applyInstrument(props.sessionId, command));
            setMessage('已记录你的裁决；待落实标记按你的明确选择保存。');
            await props.refresh();
        }
        catch (error) {
            setMessage(errorText(error));
        }
        finally {
            setBusy(false);
        }
    };
    return (0, react_1.createElement)('article', { style: { borderBottom: '1px solid currentColor', padding: '12px 0' } }, (0, react_1.createElement)('h4', null, props.decision.value.question), (0, react_1.createElement)('p', null, props.decision.workflowId + ' · ' + props.decision.value.status + (props.decision.value.pending ? ' · 未解决' : '') + (props.decision.value.awaitingImplementation ? ' · 已裁决待落实' : '')), props.decision.value.context ? (0, react_1.createElement)('p', null, props.decision.value.context) : null, props.decision.value.options?.map(option => (0, react_1.createElement)('button', { key: option.key, type: 'button', disabled: busy, onClick: () => setAnswer(option.label) }, option.label)), props.decision.value.result ? (0, react_1.createElement)('p', null, '已记录结果：' + props.decision.value.result) : null, (0, react_1.createElement)('label', null, '你的裁决', (0, react_1.createElement)('textarea', { value: answer, disabled: busy, onChange: (event) => setAnswer(event.target.value) })), (0, react_1.createElement)('label', null, '保存状态（任务自定义）', (0, react_1.createElement)('input', { value: status, disabled: busy, onChange: (event) => setStatus(event.target.value) })), (0, react_1.createElement)('label', null, (0, react_1.createElement)('input', { type: 'checkbox', checked: pending, disabled: busy, onChange: (event) => setPending(event.target.checked) }), '仍 pending'), (0, react_1.createElement)('label', null, (0, react_1.createElement)('input', { type: 'checkbox', checked: awaiting, disabled: busy, onChange: (event) => setAwaiting(event.target.checked) }), '已裁决，仍待落实'), (0, react_1.createElement)('button', { type: 'button', disabled: busy || !answer.trim() || !status.trim(), onClick: () => { void save(); } }, '按明确选择记录裁决'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { setBase({ records: props.records, decision: props.decision }); setAnswer(''); setStatus(props.decision.value.status); setPending(props.decision.value.pending ?? false); setAwaiting(props.decision.value.awaitingImplementation ?? false); setMessage(null); } }, '重新读取事项（丢弃草稿）'), diagnostic('草稿业务修订 ' + base.records.businessRevision + '；背景刷新不会升级保存修订。'), message === null ? null : diagnostic(message), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '来源历史（不是当前状态）'), pretty(props.decision.history)));
}
function Details(props) {
    const observation = useObservation(props.observer);
    const tab = props.useTabInfo();
    if (props.observer.sessionId !== props.sessionId)
        return diagnostic('Session 选择与观察归属不一致；状态未知。');
    if (observation.status === 'unknown')
        return (0, react_1.createElement)('section', { style: panelStyle }, diagnostic('当前状态未知：' + (observation.error ?? '读取中')), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '重新读取'));
    const view = observation.value;
    if (!view.policy.display.rightPanel)
        return (0, react_1.createElement)('section', { style: panelStyle }, diagnostic('右侧显示已关闭；账本和模型消费不受影响。'));
    return (0, react_1.createElement)('section', { style: panelStyle, 'aria-label': '协作详情' }, (0, react_1.createElement)('h3', null, '协作 · ' + view.instance.ownerSessionId), diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · Session ' + props.sessionId + (tab.tab.visible ? '' : ' · 非前台')), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '刷新已提交投影'), (0, react_1.createElement)('h4', null, '票进度'), view.records === null ? diagnostic('票/事项账本未知或不可用') : (0, react_1.createElement)('div', null, diagnostic('统计范围：' + view.records.summary.countingScope + ' · 业务修订 ' + view.records.businessRevision), view.records.workflows.map(workflow => (0, react_1.createElement)('section', { key: workflow.workflowId }, (0, react_1.createElement)('h4', null, workflow.value.title), workflow.value.axes.map(axis => (0, react_1.createElement)('div', { key: axis.axisKey }, (0, react_1.createElement)('p', null, axis.label + ' · ' + axis.counting), axis.statuses.map(status => (0, react_1.createElement)('span', { key: status.statusKey, title: status.meaning ?? undefined }, status.label + ' ')))), view.records?.tickets.filter(ticket => ticket.workflowId === workflow.workflowId).map(ticket => (0, react_1.createElement)('article', { key: ticket.localTicketId }, (0, react_1.createElement)('strong', null, ticket.value.title), pretty(ticket.value))))), (0, react_1.createElement)('h4', null, '待用户裁决 ' + view.records.summary.pendingUserDecisionCount + ' · 待落实 ' + view.records.summary.awaitingImplementationCount), view.records.decisions.map(decision => (0, react_1.createElement)(DecisionEditor, { key: props.sessionId + ':' + decision.workflowId + ':' + decision.decisionId, decision, records: view.records, sessionId: props.sessionId, remote: props.remote, refresh: props.observer.refresh }))), (0, react_1.createElement)('h4', null, '双窗口（实例范围，观测/参考）'), (0, react_1.createElement)(WindowProjection, { view }), (0, react_1.createElement)(WorktreeBindingsPanel, { key: props.sessionId, view, remote: props.remote, refresh: props.observer.refresh }), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '旧资源记录（仅只读，不提供创建/实际退役入口）'), ResourceProjection({ view })), (0, react_1.createElement)('h4', null, '能力与健康（观测标签）'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health }), (0, react_1.createElement)(HistoryPanel, { key: props.sessionId, sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }), (0, react_1.createElement)(PolicyDelegation, { key: props.sessionId, view, remote: props.remote, refresh: props.observer.refresh }), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '有效策略及来源'), pretty(view.policy)));
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
        return diagnostic('所选 Session 历史状态未知；等待重新选择查询。');
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
    listeners = new Set();
    constructor(read) {
        this.read = read;
    }
    getSnapshot = () => this.value;
    subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    async refresh() {
        const generation = ++this.generation;
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
    }
    dispose() { this.closed = true; this.generation++; this.listeners.clear(); }
}
exports.PolicyObserver = PolicyObserver;
function WorkspaceBadge(props) {
    const policy = (0, react_1.useSyncExternalStore)(props.visibility.subscribe, props.visibility.getSnapshot, props.visibility.getSnapshot);
    if (!sessionListRequested(policy))
        return null;
    return (0, react_1.createElement)(BadgeContent, { observer: props.observe(props.sessionId), policyRevision: policy.revision });
}
function BadgeContent(props) {
    const observation = (0, react_1.useSyncExternalStore)(props.observer.subscribe, props.observer.getSnapshot, props.observer.getSnapshot);
    const active = observation.status !== 'ready' || observation.value.policy.configurationRevision !== props.policyRevision || observation.value.policy.display.sessionList;
    (0, react_1.useEffect)(() => active ? props.observer.retain() : undefined, [props.observer, active]);
    if (observation.status !== 'ready' || !observation.value.policy.display.sessionList)
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
        return diagnostic('Session 选择与观察归属不一致；状态未知。');
    return (0, react_1.createElement)(ObservedSettingsInspection, props);
}
function ObservedSettingsInspection(props) {
    const observation = useObservation(props.observer);
    if (observation.status !== 'ready')
        return (0, react_1.createElement)('section', { 'aria-label': '设置页 Session 仪器', style: { maxHeight: '50vh', overflow: 'auto' } }, diagnostic(props.sessionId + ' · 仪器状态未知：' + (observation.error ?? '读取中')), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '重新读取所选 Session'));
    const view = observation.value;
    return (0, react_1.createElement)('section', { 'aria-label': '设置页 Session 仪器', style: { maxHeight: '50vh', overflow: 'auto' } }, (0, react_1.createElement)('h4', null, '所选 Session ' + props.sessionId + ' · 当前投影与显式登记'), diagnostic('实例 ' + view.instance.instrumentInstanceId + ' · Owner ' + view.instance.ownerSessionId + ' · 真实调用者 ' + view.caller.kind + ':' + view.caller.principalId), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void props.observer.refresh(); } }, '刷新所选 Session'), (0, react_1.createElement)('h4', null, '票进度与待裁决'), view.records === null ? diagnostic('票/事项账本未知') : pretty(view.records), (0, react_1.createElement)('h4', null, '独立 T/S（观测/参考）'), (0, react_1.createElement)(WindowProjection, { view }), props.remote ? (0, react_1.createElement)(WorktreeBindingsPanel, { key: props.sessionId, view, remote: props.remote, refresh: props.observer.refresh }) : null, (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '旧资源记录（仅只读）'), ResourceProjection({ view })), props.remote ? (0, react_1.createElement)(HistoryPanel, { key: props.sessionId, sessionId: props.sessionId, instance: view.instance, remote: props.remote, refresh: props.observer.refresh }) : null, (0, react_1.createElement)('h4', null, '能力、健康观测与有效策略'), diagnostic('能力与健康标签是宿主观测，不是操作许可或业务裁决。'), pretty({ capabilities: view.capabilities, health: view.health, policy: view.policy }));
}
/** Global Profile startup intent only; no Workspace Policy revision or SDK write enters this seam. */
class StartupSettingsController {
    remote;
    state = { saved: null, draft: null, busy: null, error: null, notice: null };
    listeners = new Set();
    generation = 0;
    controller;
    holds = 0;
    closed = false;
    constructor(remote) {
        this.remote = remote;
    }
    getSnapshot = () => this.state;
    subscribe = (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    publish(state) { this.state = state; for (const listener of this.listeners)
        listener(); }
    cancel() { this.generation++; this.controller?.abort(); this.controller = undefined; }
    retain = () => {
        if (this.closed)
            throw new Error('Startup settings have been disposed');
        if (this.holds++ === 0)
            void this.refresh();
        let released = false;
        return () => { if (released || this.closed)
            return; released = true; if (--this.holds === 0) {
            this.cancel();
            this.publish({ saved: null, draft: null, busy: null, error: null, notice: null });
        } };
    };
    refresh = async () => {
        if (this.closed)
            return;
        this.cancel();
        const generation = this.generation;
        const controller = this.controller = new AbortController();
        this.publish({ saved: null, draft: null, busy: 'loading', error: null, notice: null });
        try {
            const saved = (0, startup_state_js_1.parseStartupStatus)(remoteValue(await this.remote.startupStatus(controller.signal)));
            if (this.closed || generation !== this.generation)
                return;
            this.publish({ saved, draft: (0, startup_state_js_1.parseStartupDesired)(saved.desired), busy: null, error: null, notice: null });
        }
        catch (error) {
            if (!this.closed && generation === this.generation)
                this.publish({ ...this.state, busy: null, error: '启动状态不可用：' + errorText(error) });
        }
    };
    setDesired = (startupCwdEnabled) => {
        const draft = (0, startup_state_js_1.parseStartupDesired)({ startupCwdEnabled });
        if (this.closed || this.state.busy !== null || this.state.saved === null)
            return;
        this.publish({ ...this.state, draft, notice: null });
    };
    save = async () => {
        const { saved, draft, busy } = this.state;
        if (this.closed || busy !== null || saved === null || draft === null || saved.desired.startupCwdEnabled === draft.startupCwdEnabled)
            return;
        const desired = (0, startup_state_js_1.parseStartupDesired)(draft);
        const expectedRevision = saved.revision;
        this.cancel();
        const generation = this.generation;
        const controller = this.controller = new AbortController();
        this.publish({ ...this.state, busy: 'saving', error: null, notice: null });
        try {
            const receipt = (0, startup_state_js_1.parseStartupStatus)(remoteValue(await this.remote.saveStartupSettings(desired, expectedRevision, controller.signal)));
            if (this.closed || generation !== this.generation)
                return;
            if (receipt.desired.startupCwdEnabled !== desired.startupCwdEnabled || receipt.revision < expectedRevision)
                throw new Error('Host startup save receipt does not confirm the submitted configuration');
            this.publish({ saved: receipt, draft: (0, startup_state_js_1.parseStartupDesired)(receipt.desired), busy: null, error: null, notice: '已保存下次启动配置修订 ' + receipt.revision + '；当前进程不会立即改变。' });
        }
        catch (error) {
            if (!this.closed && generation === this.generation)
                this.publish({ ...this.state, busy: null, error: '保存结果未确认：' + errorText(error) + '。配置可能已写入；请重新读取启动状态核对。', notice: null });
        }
    };
    dispose = () => { if (this.closed)
        return; this.closed = true; this.cancel(); this.holds = 0; this.publish({ saved: null, draft: null, busy: null, error: '启动设置已卸载；状态不可用。', notice: null }); this.listeners.clear(); };
}
exports.StartupSettingsController = StartupSettingsController;
const STARTUP_HINT = '此项为启动时配置。启用或禁用后，需要重启 DSH 才会生效；当前运行状态不会立即改变。刷新网页不能代替重启。';
function startupFlag(value) { return value === null ? '未知（观测不可用）' : value ? '启用' : '禁用'; }
function startupStateText(saved) {
    if (saved.state === 'disabled')
        return '禁用';
    if (saved.preparation.status !== 'ready')
        return ({ 'not-prepared': '需要兼容准备', incompatible: '版本不兼容', failed: '兼容准备失败', uncertain: '状态不确定' })[saved.preparation.status];
    return ({ disabled: '禁用', enabled: '启用', 'pending-restart': '待重启（当前运行状态未改变）', 'needs-preparation': '需要兼容准备', unsupported: '当前 SDK 原生能力不支持', incompatible: '版本不兼容', failed: '兼容准备失败', uncertain: '状态不确定' })[saved.state];
}
// Examples deliberately contain no Host-derived path, executable, version or environment value.
const STARTUP_COMMAND_EXAMPLES = [
    'dsh-mattpocock-skills-cwd inspect --host-root /absolute/sdk',
    'dsh-mattpocock-skills-cwd prepare --host-root /absolute/sdk --dsh-stopped',
    'dsh-mattpocock-skills-cwd restore --host-root /absolute/sdk --dsh-stopped',
    'dsh-mattpocock-skills-cwd start --host-root /absolute/sdk --dsh-stopped -- [DSH args...]',
].join('\n');
/** Permanently separate from the Workspace Policy form, including while that form is unavailable. */
function StartupSettingsPanel(props) {
    const controller = (0, react_1.useMemo)(() => new StartupSettingsController(props.remote), [props.remote]);
    (0, react_1.useEffect)(() => controller.retain(), [controller]);
    const view = (0, react_1.useSyncExternalStore)(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    const saved = view.saved;
    const draft = view.draft;
    const dirty = saved !== null && draft !== null && saved.desired.startupCwdEnabled !== draft.startupCwdEnabled;
    return (0, react_1.createElement)('section', { 'aria-label': '全局 Profile 启动配置', style: { borderBottom: '1px solid currentColor', paddingBottom: '16px', marginBottom: '16px' } }, (0, react_1.createElement)('h3', null, '全局 Profile · 首次工作树目录启动'), diagnostic('独立启动配置；不受工作区策略、管理总开关或 Skills 开关控制。'), (0, react_1.createElement)('label', { style: { display: 'block', margin: '8px 0' } }, (0, react_1.createElement)('input', { type: 'checkbox', checked: draft?.startupCwdEnabled ?? false, disabled: view.busy !== null || draft === null,
        onChange: (event) => { const checked = event.target.checked; controller.setDesired(checked); } }), '下次启动启用首次指定工作树目录（草稿）'), diagnostic(STARTUP_HINT), saved !== null && view.error !== null ? diagnostic('以下为上次确认的启动状态；保存后的持久配置尚未确认，不能当作当前配置回执。') : null, saved === null ? diagnostic(view.error ?? '启动状态不可用：读取中；当前生效与下次配置均未知。') : (0, react_1.createElement)('div', null, diagnostic('当前生效：' + startupFlag(saved.enabledNow)), diagnostic('本次启动请求：' + startupFlag(saved.boot.requested.startupCwdEnabled) + ' · 启动 epoch ' + saved.boot.epoch), diagnostic('下次启动（已保存）：' + startupFlag(saved.desired.startupCwdEnabled)), diagnostic('草稿：' + startupFlag(draft?.startupCwdEnabled ?? null) + (dirty ? '（未保存）' : '（与已保存一致）')), diagnostic('启动配置修订 ' + saved.revision + ' · 原生首次目录支持：' + (saved.nativeInitialCwdSupported === null ? '未知（观测不可用）' : saved.nativeInitialCwdSupported ? '支持' : '不支持')), diagnostic('宿主重启标记：' + (saved.restartNeeded ? '是（不代表兼容准备已完成）' : '否')), diagnostic('启动状态：' + startupStateText(saved)), diagnostic('兼容准备：' + saved.preparation.status + ' · SDK 版本：' + (saved.preparation.sdkVersion ?? '未知（观测不可用）')), saved.preparation.diagnostic === null ? null : diagnostic('准备诊断：' + saved.preparation.diagnostic), saved.preparation.status !== 'ready' || ['needs-preparation', 'unsupported', 'incompatible', 'failed'].includes(saved.state)
        ? diagnostic(saved.state === 'disabled'
            ? '当前已关闭，不要求兼容准备。若以后启用首次目录功能，需要先完成兼容准备，普通重启不会自动打补丁。'
            : '需要先完成兼容准备，普通重启不会自动打补丁。请先退出 DSH，在完全停止后使用随包离线管理程序检查兼容性；未确认准备成功前不承诺下次启动能够启用。') : null, saved.preparation.status === 'ready' && saved.nativeInitialCwdSupported === false
        ? diagnostic('磁盘兼容准备已就绪，但当前 SDK 已加载且原生能力仍不支持；磁盘准备不等于当前生效。网页刷新不会替换已加载的 SDK，启用请求需重启 DSH 后重新核对。') : null, diagnostic('配置差异：本次请求 ' + startupFlag(saved.boot.requested.startupCwdEnabled) + ' → 下次已保存 ' + startupFlag(saved.desired.startupCwdEnabled) + ' → 草稿 ' + startupFlag(draft?.startupCwdEnabled ?? null))), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '随包离线兼容管理命令（示例，不在 GUI 执行）'), diagnostic('首次准备需完全退出所有使用该 SDK 的 DSH 进程；--dsh-stopped 是离线前提，不是强制停止命令。将 /absolute/sdk 替换为已核验的 SDK 绝对目录，将 [DSH args...] 替换为原 DSH 启动参数；此处不推断目录或环境。start 会先兼容准备再启动；inspect 只读，prepare/restore 只在线下操作。'), (0, react_1.createElement)('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, (0, react_1.createElement)('code', null, STARTUP_COMMAND_EXAMPLES))), view.error === null || saved === null ? null : diagnostic(view.error), view.notice === null ? null : diagnostic(view.notice), (0, react_1.createElement)('button', { type: 'button', disabled: view.busy !== null || !dirty, onClick: () => { void controller.save(); } }, '保存下次启动配置'), (0, react_1.createElement)('button', { type: 'button', onClick: () => { void controller.refresh(); } }, '重新读取启动状态（丢弃草稿）'));
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
            setMessage(errorText(error)); });
        return () => { active = false; };
    }, [props.remote, reload]);
    if (props.view === 'summary')
        return (0, react_1.createElement)('span', null, '工作区策略与 session 仪器；显式保存、稀疏覆盖。');
    if (saved === null || draft === null)
        return (0, react_1.createElement)('section', null, (0, react_1.createElement)(StartupSettingsPanel, { remote: props.remote }), diagnostic(message ?? '读取已保存策略…'), (0, react_1.createElement)('button', { type: 'button', onClick: () => setReload(value => value + 1) }, '重新读取'));
    const selected = workspaces.find(row => row.workspaceId === workspace);
    const sessionChoices = settingsSessionChoices(workspaces, workspace);
    const selectedInspection = inspection !== null && sessionChoices.ids.includes(inspection) ? inspection : null;
    const preview = (0, policy_js_1.resolvePolicy)({ ...draft, workspaceOverrides: workspace === null ? {} : draft.workspaceOverrides, revision: saved.revision }, workspace ?? 'global-preview', workspace === null || selected?.verified === true);
    const change = (field, value) => {
        try {
            setDraft(setPolicyLeaf(draft, workspace, field, value));
            setMessage(null);
        }
        catch (error) {
            setMessage(errorText(error));
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
            setMessage('已保存修订 ' + snapshot.revision);
        }
        catch (error) {
            setMessage(errorText(error));
        }
        finally {
            setBusy(false);
        }
    };
    const booleanField = (field, label) => {
        const explicit = ownLeaf(draft, workspace, field);
        return (0, react_1.createElement)('label', { key: field, style: { display: 'block', margin: '8px 0' } }, label + ' ', (0, react_1.createElement)('select', { value: explicit === undefined ? 'inherit' : explicit ? 'on' : 'off', disabled: busy,
            onChange: (event) => change(field, event.target.value === 'inherit' ? undefined : event.target.value === 'on') }, (0, react_1.createElement)('option', { value: 'inherit' }, '继承'), (0, react_1.createElement)('option', { value: 'on' }, '开'), (0, react_1.createElement)('option', { value: 'off' }, '关')), (0, react_1.createElement)('small', null, ' 来源：' + preview.sources[field]));
    };
    const dirty = JSON.stringify(draft) !== JSON.stringify(intentOf(saved));
    return (0, react_1.createElement)('section', { 'aria-label': '工作区协作配置' }, (0, react_1.createElement)(StartupSettingsPanel, { remote: props.remote }), (0, react_1.createElement)('h3', null, '工作区策略'), (0, react_1.createElement)('label', null, '编辑范围 ', (0, react_1.createElement)('select', { value: workspace ?? '', disabled: busy, onChange: (event) => { setWorkspace(event.target.value || null); setInspection(null); } }, ...workspaces.map(row => (0, react_1.createElement)('option', { key: row.workspaceId, value: row.workspaceId }, row.label + (row.verified ? '' : '（未核验）'))), (0, react_1.createElement)('option', { value: '' }, '全局默认'))), (0, react_1.createElement)('label', null, '按 Session 查看仪器（导航，不授予权限） ', (0, react_1.createElement)('select', { 'aria-label': '选择查看 Session', value: selectedInspection ?? '', onChange: (event) => setInspection(event.target.value || null) }, (0, react_1.createElement)('option', { value: '' }, '选择 Session 查看'), ...sessionChoices.ids.map(id => (0, react_1.createElement)('option', { key: id, value: id }, id)))), sessionChoices.unknown ? diagnostic('Session 导航未知或不完整；不能据此断言没有 Session。') : sessionChoices.ids.length === 0 ? diagnostic('当前导航没有列出的 Session（不是实例/ACL 结论）。') : null, selectedInspection === null ? null : (0, react_1.createElement)(SettingsInspection, { key: selectedInspection, sessionId: selectedInspection, observer: props.observe(selectedInspection), remote: props.remote }), diagnostic('配置修订 ' + saved.revision + '；查看 Session 不更新草稿保存修订。'), (0, react_1.createElement)('label', null, (0, react_1.createElement)('input', { type: 'checkbox', checked: draft.extensionEnabled, disabled: busy, onChange: (event) => setDraft({ ...draft, extensionEnabled: event.target.checked }) }), '全局管理总开关（不影响 Skills）'), (0, react_1.createElement)('fieldset', { disabled: busy }, (0, react_1.createElement)('legend', null, '功能意图'), policy_js_1.FEATURE_NAMES.map(name => booleanField((name + '.enabled'), name))), (0, react_1.createElement)('fieldset', { disabled: busy }, (0, react_1.createElement)('legend', null, 'T/S 参考上限（不是硬名额；留空继承，无默认猜值）'), ['ticketWindowSize', 'runningSubagentLimit'].map(name => {
        const field = ('windows.' + name);
        return (0, react_1.createElement)('label', { key: name }, name + ' ', (0, react_1.createElement)('input', { type: 'number', min: 1, step: 1, value: ownLeaf(draft, workspace, field) ?? '',
            onChange: (event) => change(field, event.target.value === '' ? undefined : Number(event.target.value)) }), (0, react_1.createElement)('small', null, ' 有效 ' + (preview.windows[name] ?? '未配置') + ' · ' + preview.sources[field]));
    })), (0, react_1.createElement)('fieldset', { disabled: busy }, (0, react_1.createElement)('legend', null, '独立显示位置（不关闭功能/账本/消费）'), policy_js_1.DISPLAY_NAMES.map(name => booleanField(('display.' + name), name))), !Object.values(preview.display).some(Boolean) ? diagnostic('全部入口关闭：待裁决不再有常驻 GUI 提醒；仍可明确保存。') : null, (0, react_1.createElement)('h4', null, '有效策略与影响预览（意图，不代表已执行）'), pretty(preview), pretty(policyDraftImpact(saved, draft, workspace, workspace === null || selected?.verified === true)), diagnostic('缩容不释放正在执行的 S；已有事实和义务保留，实际执行状态以 session 投影为准。'), (0, react_1.createElement)('h4', null, '不支持的席位'), exports.UNSUPPORTED_SEATS.map(row => (0, react_1.createElement)('p', { key: row.key }, row.key + ': unsupported — ' + row.reason)), (0, react_1.createElement)('button', { type: 'button', disabled: busy || !dirty, onClick: () => { void save(); } }, '显式保存草稿'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { setDraft(intentOf(saved)); setMessage(null); } }, '放弃草稿'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => setReload(value => value + 1) }, '重新读取（丢弃草稿）'), message === null ? null : diagnostic(message));
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
    const observation = useObservation(props.observer);
    const annotate = observation.status === 'ready' && observation.value.policy.display.timeline;
    return (0, react_1.createElement)('section', { 'aria-label': '协作工具记录' }, (0, react_1.createElement)('strong', null, props.toolName), annotate ? diagnostic('来源记录 · call ' + props.callId + ' · 历史快照；当前事实以实例账本为准。') : null, pretty(sourceRecord(props)), annotate && observation.value.policy.display.rightPanel ? (0, react_1.createElement)('button', { type: 'button', onClick: props.openDetails }, '打开当前实例') : null);
}
exports.inject = ['slots', 'remote', 'sidebarRight', 'sidebarRightTabs'];
/** Browser plugin activation, governed by Host Loader/package manifest, not DOM insertion. */
async function apply(ctx) {
    await ctx.remote.$mount(remote_contract_js_1.REMOTE_CONTRIBUTION);
    const remote = ctx.remote.mattpocockControls;
    const observers = new Map();
    const observe = (sessionId) => {
        let observer = observers.get(sessionId);
        if (observer === undefined) {
            observer = new SessionObserver(sessionId, (id, signal) => remote.readSession(id, signal));
            observers.set(sessionId, observer);
        }
        return observer;
    };
    const visibility = new PolicyObserver(() => remote.readPolicy());
    ctx.effect(() => { void visibility.refresh(); return () => visibility.dispose(); }, 'collaboration: committed policy visibility');
    const refreshAll = () => { void visibility.refresh(); for (const observer of observers.values())
        void observer.refresh(); };
    ctx.effect(() => () => { for (const observer of observers.values())
        observer.dispose(); observers.clear(); }, 'collaboration: observations');
    const face = (sessionId) => ({ observer: observe(sessionId), openDetails: () => {
            if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId)
                return;
            const snapshot = observe(sessionId).getSnapshot();
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
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock',
        id: exports.TAB_ID + ':input', order: 100, inject: face }, InputSummary));
    ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: exports.TAB_ID,
        inject: (sessionId) => ({ ...face(sessionId), remote }) }, Details));
    ctx.slots.inject('sidebar.session.row.leading', () => ctx.slots.register({ name: 'sidebar.session.row.leading',
        id: exports.TAB_ID + ':row', order: 100, inject: () => ({ observe, visibility }) }, WorkspaceBadge));
    ctx.slots.inject('tool.call.toolview', () => exports.OWN_TOOL_NAMES.map(key => ctx.slots.register({ name: 'tool.call.toolview', key, inject: face }, SourceCard)));
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
    const target = c.action === 'put-workflow' ? { kind: 'workflow', workflowId } : c.action === 'put-ticket' ? { kind: 'ticket', workflowId, localTicketId: c.localTicketId } : { kind: 'decision', workflowId, decisionId: c.decisionId };
    return { action: c.action, target, expectedRevision: c.expectedRevision, recordedAt: event.recordedAt };
}
const EMPTY_INSTRUMENT_STATE = (0, validation_js_1.freeze)({ businessRevision: 0, viewerRevisions: {}, workflows: [], tickets: [], decisions: [], decisionViews: [] });
function upgradeInstrumentDocument(document) {
    if (document.schemaVersion === 2)
        return document;
    return (0, validation_js_1.freeze)({ ...document, schemaVersion: 2, checkpoint: { throughRevision: 0, state: EMPTY_INSTRUMENT_STATE }, dedup: [], coverage: [] });
}
function text(value, where) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 65536 || value.includes('\0'))
        (0, validation_js_1.invalid)(where + ' must be non-empty text, at most 65536 characters');
    return value;
}
function nullableText(value, where) { return value === undefined || value === null ? null : text(value, where); }
function ids(value, where) {
    const result = (0, validation_js_1.array)(value, where).map(entry => (0, validation_js_1.id)(entry, where));
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
function workflowValue(value) {
    const raw = (0, validation_js_1.record)(value, 'workflow', ['title', 'axes']);
    const axes = (0, validation_js_1.array)(raw.axes, 'axes').map(value => {
        const axis = (0, validation_js_1.record)(value, 'axis', ['axisKey', 'label', 'counting', 'statuses']);
        if (axis.counting !== 'exclusive' && axis.counting !== 'overlapping')
            (0, validation_js_1.invalid)('axis must declare its counting convention');
        const statuses = (0, validation_js_1.array)(axis.statuses, 'statuses').map(value => {
            const status = (0, validation_js_1.record)(value, 'status', ['statusKey', 'label', 'meaning', 'summaryPriority']);
            return { statusKey: (0, validation_js_1.id)(status.statusKey, 'statusKey'), label: text(status.label, 'status label'),
                meaning: nullableText(status.meaning, 'status meaning'), ...(status.summaryPriority === undefined ? {} : { summaryPriority: (0, validation_js_1.revision)(status.summaryPriority, 'summaryPriority') }) };
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
    const raw = (0, validation_js_1.record)(value, 'ticket', ['title', 'externalRef', 'statuses', 'summary', 'disposition']);
    const selections = (0, validation_js_1.record)(raw.statuses, 'ticket statuses');
    return { title: text(raw.title, 'ticket title'),
        statuses: Object.fromEntries(Object.entries(selections).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [(0, validation_js_1.id)(key, 'axisKey'), ids(value, 'status selections')])),
        ...(Object.hasOwn(raw, 'externalRef') ? { externalRef: nullableText(raw.externalRef, 'externalRef') } : {}),
        ...(Object.hasOwn(raw, 'summary') ? { summary: nullableText(raw.summary, 'ticket summary') } : {}),
        ...(Object.hasOwn(raw, 'disposition') ? { disposition: nullableText(raw.disposition, 'ticket disposition') } : {}) };
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
        const options = (0, validation_js_1.array)(raw.options, 'decision options').map(value => {
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
        workflowId: (0, validation_js_1.id)(raw.workflowId, 'workflowId'), references: (0, validation_js_1.array)(raw.references ?? [], 'references').map(value => text(value, 'declared reference')) };
    switch (raw.action) {
        case 'put-workflow':
            (0, validation_js_1.record)(raw, 'command', baseKeys);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, value: workflowValue(raw.value) });
        case 'put-ticket':
            (0, validation_js_1.record)(raw, 'command', [...baseKeys, 'localTicketId']);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, localTicketId: (0, validation_js_1.id)(raw.localTicketId, 'localTicketId'), value: ticketValue(raw.value) });
        case 'put-decision':
            (0, validation_js_1.record)(raw, 'command', [...baseKeys, 'decisionId']);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, decisionId: (0, validation_js_1.id)(raw.decisionId, 'decisionId'), value: decisionValue(raw.value) });
        case 'set-decision-view': {
            (0, validation_js_1.record)(raw, 'command', [...baseKeys, 'decisionId']);
            const view = (0, validation_js_1.record)(raw.value, 'decision view', ['read', 'hidden']);
            return (0, validation_js_1.freeze)({ ...base, action: raw.action, decisionId: (0, validation_js_1.id)(raw.decisionId, 'decisionId'), value: { read: (0, validation_js_1.boolean)(view.read, 'read'), hidden: (0, validation_js_1.boolean)(view.hidden, 'hidden') } });
        }
        default: return (0, validation_js_1.invalid)('unknown instrument action');
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
    if (r.kind === 'ticket') {
        (0, validation_js_1.record)(value, 'ticket target', ['kind', 'workflowId', 'localTicketId']);
        return { kind: 'ticket', workflowId, localTicketId: (0, validation_js_1.id)(r.localTicketId, 'localTicketId') };
    }
    if (r.kind === 'decision') {
        (0, validation_js_1.record)(value, 'decision target', ['kind', 'workflowId', 'decisionId']);
        return { kind: 'decision', workflowId, decisionId: (0, validation_js_1.id)(r.decisionId, 'decisionId') };
    }
    return (0, validation_js_1.invalid)('unknown instrument history target kind');
}
function checkpointState(value, cut) {
    const s = (0, validation_js_1.record)(value, 'checkpoint state', ['businessRevision', 'viewerRevisions', 'workflows', 'tickets', 'decisions', 'decisionViews']);
    const viewers = (0, validation_js_1.record)(s.viewerRevisions, 'viewer revisions');
    const viewerRevisions = Object.fromEntries(Object.entries(viewers).map(([key, value]) => [(0, validation_js_1.id)(key, 'viewer'), (0, validation_js_1.revision)(value, 'viewer revision')]));
    const parseRows = (input, kind, parse) => (0, validation_js_1.array)(input, kind + ' checkpoint rows').map(value => {
        const key = kind === 'workflow' ? undefined : kind === 'ticket' ? 'localTicketId' : 'decisionId';
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
    const decisions = parseRows(s.decisions, 'decision', decisionValue);
    const decisionViews = (0, validation_js_1.array)(s.decisionViews, 'decision views').map(value => {
        const v = (0, validation_js_1.record)(value, 'decision view', ['workflowId', 'decisionId', 'principalId', 'revision', 'value']), payload = (0, validation_js_1.record)(v.value, 'view value', ['read', 'hidden']);
        return { workflowId: (0, validation_js_1.id)(v.workflowId, 'workflowId'), decisionId: (0, validation_js_1.id)(v.decisionId, 'decisionId'), principalId: (0, validation_js_1.id)(v.principalId, 'principalId'), revision: (0, validation_js_1.revision)(v.revision, 'view revision'), value: { read: (0, validation_js_1.boolean)(payload.read, 'read'), hidden: (0, validation_js_1.boolean)(payload.hidden, 'hidden') } };
    });
    for (const rows of [workflows, tickets, decisions, decisionViews]) {
        const identities = rows.map(row => JSON.stringify([row.workflowId, 'localTicketId' in row ? row.localTicketId : 'decisionId' in row ? row.decisionId : null, 'principalId' in row ? row.principalId : null]));
        if (new Set(identities).size !== identities.length)
            (0, validation_js_1.invalid)('duplicate checkpoint record identity');
    }
    for (const row of tickets) {
        const workflow = workflows.find(w => w.workflowId === row.workflowId);
        if (!workflow)
            (0, validation_js_1.invalid)('checkpoint ticket has no workflow');
        validateTicket(row.value, workflow.value);
    }
    for (const row of decisions)
        if (!workflows.some(w => w.workflowId === row.workflowId) || (row.value.ticketIds ?? []).some(id => !tickets.some(t => t.workflowId === row.workflowId && t.localTicketId === id)))
            (0, validation_js_1.invalid)('checkpoint decision references unknown records');
    for (const view of decisionViews)
        if (view.revision < 1 || view.revision > cut || !decisions.some(d => d.workflowId === view.workflowId && d.decisionId === view.decisionId))
            (0, validation_js_1.invalid)('checkpoint decision view references unknown records');
    const businessRevision = (0, validation_js_1.revision)(s.businessRevision, 'business revision');
    if (businessRevision + Object.values(viewerRevisions).reduce((sum, n) => sum + n, 0) > cut)
        (0, validation_js_1.invalid)('checkpoint business/viewer revision exceeds source cut');
    return (0, validation_js_1.freeze)({ businessRevision, viewerRevisions, workflows, tickets, decisions, decisionViews });
}
function parseCommandMetadata(value) {
    const m = (0, validation_js_1.record)(value, 'technical command metadata', ['action', 'target', 'expectedRevision', 'recordedAt']);
    if (m.action !== 'put-workflow' && m.action !== 'put-ticket' && m.action !== 'put-decision' && m.action !== 'set-decision-view')
        (0, validation_js_1.invalid)('unknown technical command action');
    const target = parseInstrumentHistoryTarget(m.target), kind = m.action === 'put-workflow' ? 'workflow' : m.action === 'put-ticket' ? 'ticket' : 'decision';
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
    const receipts = new Map(dedup.map(d => [d.appliedRevision, d]));
    const groups = [{ kind: 'workflow', rows: state.workflows }, { kind: 'ticket', rows: state.tickets }, { kind: 'decision', rows: state.decisions }];
    for (const group of groups)
        for (const row of group.rows) {
            const target = group.kind === 'workflow' ? { kind: 'workflow', workflowId: row.workflowId } : group.kind === 'ticket' && 'localTicketId' in row ? { kind: 'ticket', workflowId: row.workflowId, localTicketId: row.localTicketId } : 'decisionId' in row ? { kind: 'decision', workflowId: row.workflowId, decisionId: row.decisionId } : (0, validation_js_1.invalid)('invalid checkpoint object target');
            if (group.kind === 'decision') {
                const first = dedup.find(d => d.kind === 'command' && d.command.action === 'put-decision' && JSON.stringify(d.command.target) === JSON.stringify(target)), creator = 'creator' in row ? row.creator : undefined;
                if (!first || JSON.stringify(first.author) !== JSON.stringify(creator))
                    (0, validation_js_1.invalid)('checkpoint decision creator differs from first source target receipt');
            }
            for (const version of row.history) {
                const receipt = receipts.get(version.revision), meta = receipt?.command;
                if (!receipt || receipt.kind !== 'command' || !meta || meta.action !== 'put-' + group.kind || JSON.stringify(meta.target) !== JSON.stringify(target) || meta.recordedAt !== version.recordedAt || JSON.stringify(receipt.author) !== JSON.stringify(version.author))
                    (0, validation_js_1.invalid)('checkpoint retained version metadata differs from source receipt');
            }
        }
}
function projectInstrumentDocument(document) {
    const base = document.schemaVersion === 2 ? document.checkpoint.state : EMPTY_INSTRUMENT_STATE;
    const workflows = [...base.workflows], tickets = [...base.tickets], decisions = [...base.decisions], decisionViews = [...base.decisionViews];
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
        const workflow = workflows.find(row => row.workflowId === command.workflowId);
        const change = (value) => ({ revision: event.revision, recordedAt: event.recordedAt, author: event.author, references: command.references ?? [], value });
        if (command.action === 'put-workflow') {
            for (const ticket of tickets.filter(row => row.workflowId === command.workflowId))
                validateTicket(ticket.value, command.value);
            const row = { workflowId: command.workflowId, revision: event.revision, value: command.value, history: [...(workflow?.history ?? []), change(command.value)] };
            if (workflow)
                workflows[workflows.indexOf(workflow)] = row;
            else
                workflows.push(row);
            continue;
        }
        if (!workflow)
            (0, validation_js_1.invalid)('workflow must be declared before its records');
        if (command.action === 'put-ticket') {
            validateTicket(command.value, workflow.value);
            const previous = tickets.find(row => row.workflowId === command.workflowId && row.localTicketId === command.localTicketId);
            const value = { ...previous?.value, ...command.value };
            const row = { workflowId: command.workflowId, localTicketId: command.localTicketId, revision: event.revision, value, history: [...(previous?.history ?? []), change(value)] };
            if (previous)
                tickets[tickets.indexOf(previous)] = row;
            else
                tickets.push(row);
        }
        else if (command.action === 'put-decision') {
            const previous = decisions.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId);
            const value = { ...previous?.value, ...command.value };
            for (const ticketId of value.ticketIds ?? [])
                if (!tickets.some(row => row.workflowId === command.workflowId && row.localTicketId === ticketId))
                    (0, validation_js_1.invalid)('decision refers to unknown ticket');
            const row = { workflowId: command.workflowId, decisionId: command.decisionId, revision: event.revision, value, history: [...(previous?.history ?? []), change(value)], ...(previous?.creator ? { creator: previous.creator } : {}) };
            if (previous)
                decisions[decisions.indexOf(previous)] = row;
            else
                decisions.push(row);
        }
        else {
            if (!decisions.some(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId))
                (0, validation_js_1.invalid)('view refers to unknown decision');
            const previous = decisionViews.find(row => row.workflowId === command.workflowId && row.decisionId === command.decisionId && row.principalId === event.author.principalId);
            const row = { workflowId: command.workflowId, decisionId: command.decisionId, principalId: event.author.principalId, revision: event.revision, value: command.value };
            if (previous)
                decisionViews[decisionViews.indexOf(previous)] = row;
            else
                decisionViews.push(row);
        }
    }
    return (0, validation_js_1.freeze)({ businessRevision, viewerRevisions: Object.fromEntries(viewerRevisions), workflows, tickets, decisions, decisionViews });
}
function initialInstrumentDocument(instance) {
    return parseInstrumentDocument({ ...instance, schemaVersion: 1, revision: 0, events: [] });
}
function parseInstrumentDocument(value) {
    try {
        const raw = (0, validation_js_1.record)(value, 'instrument document', ['schemaVersion', 'revision', 'instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId', 'events', 'checkpoint', 'dedup', 'coverage']);
        if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2)
            (0, validation_js_1.invalid)('unsupported instrument schemaVersion');
        if (raw.schemaVersion === 1)
            (0, validation_js_1.record)(value, 'V1 instrument document', ['schemaVersion', 'revision', 'instrumentInstanceId', 'ownerSessionId', 'controlWorkspaceId', 'events']);
        const docRevision = (0, validation_js_1.revision)(raw.revision, 'instrument revision');
        let checkpoint, dedup = [], coverage = [];
        if (raw.schemaVersion === 2) {
            const c = (0, validation_js_1.record)(raw.checkpoint, 'instrument checkpoint', ['throughRevision', 'state']), cut = (0, validation_js_1.revision)(c.throughRevision, 'checkpoint revision');
            if (cut > docRevision)
                (0, validation_js_1.invalid)('checkpoint exceeds source revision');
            checkpoint = { throughRevision: cut, state: checkpointState(c.state, cut) };
            dedup = dedupRows(raw.dedup, cut);
            coverage = cleanupCoverage(raw.coverage, dedup);
            validateCheckpointAuthors(checkpoint.state, dedup);
            validateCheckpointCounters(checkpoint.state, dedup);
            validateCheckpointHistory(checkpoint.state, dedup, coverage);
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
        const result = checkpoint ? { schemaVersion: 2, ...identity, checkpoint, dedup, coverage } : { schemaVersion: 1, ...identity };
        projectInstrumentDocument(result);
        return (0, validation_js_1.freeze)(result);
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
function parsePatch(value, where) {
    const raw = (0, validation_js_1.record)(value, where, [...exports.FEATURE_NAMES, 'display']);
    const result = {};
    for (const feature of exports.FEATURE_NAMES) {
        if (!Object.hasOwn(raw, feature))
            continue;
        const keys = feature === 'windows' ? ['enabled', 'ticketWindowSize', 'runningSubagentLimit'] : ['enabled'];
        const group = (0, validation_js_1.record)(raw[feature], where + '.' + feature, keys);
        const parsed = {};
        for (const key of keys) {
            if (!Object.hasOwn(group, key))
                continue;
            parsed[key] = key === 'enabled' ? (0, validation_js_1.boolean)(group[key], where + '.' + feature + '.' + key)
                : (0, validation_js_1.capacity)(group[key], where + '.' + feature + '.' + key);
        }
        if (Object.keys(parsed).length > 0)
            result[feature] = parsed;
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
    const features = {};
    for (const feature of exports.FEATURE_NAMES) {
        const requested = choose(feature, 'enabled', false);
        const reason = !parsed.extensionEnabled ? 'extension-disabled' : !requested ? 'feature-disabled'
            : !workspaceVerified ? 'workspace-unverified'
                : feature === 'windows' && (windows.ticketWindowSize === null || windows.runningSubagentLimit === null) ? 'window-capacity-unset' : null;
        features[feature] = { requested, status: reason === null ? 'configured'
                : reason === 'workspace-unverified' || reason === 'window-capacity-unset' ? 'unsupported' : 'disabled', reason };
    }
    const display = Object.fromEntries(exports.DISPLAY_NAMES.map(key => [key, choose('display', key, DISPLAY_INITIAL[key])]));
    return (0, validation_js_1.freeze)({ configurationRevision: parsed.revision, controlWorkspaceId: workspaceId, workspaceVerified,
        extensionEnabled: parsed.extensionEnabled, features, windows, display, sources });
}

},
"src/controls/remote-contract.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REMOTE_CONTRIBUTION = exports.REMOTE_METHODS = exports.REMOTE_NAMESPACE = void 0;
exports.parseHostJson = parseHostJson;
exports.parsePolicyGrants = parsePolicyGrants;
exports.parseRemoteTicketWindow = parseRemoteTicketWindow;
exports.parseResourceAction = parseResourceAction;
const startup_state_js_1 = require("./startup-state.js");
const policy_js_1 = require("./policy.js");
const instrument_state_js_1 = require("./instrument-state.js");
const validation_js_1 = require("./validation.js");
/** Shared by Host and Client; no Host SDK or Node imports enter the browser. */
exports.REMOTE_NAMESPACE = 'mattpocockControls';
exports.REMOTE_METHODS = ['readPolicy', 'savePolicy', 'listWorkspaces', 'readSession', 'applyInstrument', 'applyTicketWindow', 'resourceAction', 'grantPolicy', 'historyAction', 'worktreeAction', 'startupStatus', 'saveStartupSettings'];
/** A complete lossless JSON boundary, not JSON.stringify-based repair. */
function parseHostJson(value) {
    const ancestors = new Set();
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
    return (0, validation_js_1.freeze)(visit(value, 0));
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
        (0, validation_js_1.invalid)('explicit ticket reserve/release/reacquire required');
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
        ...((method === 'readSession' || method === 'historyAction' || method === 'startupStatus' || method === 'saveStartupSettings') ? { cancellation: { parameter: 'signal' } } : {}) };
}
/** The same strict contract is registered on Host and selected by Client $mount. */
exports.REMOTE_CONTRIBUTION = Object.freeze({
    package: '@lmgatex/dsh-mattpocock-skills',
    descriptors: Object.freeze([
        descriptor('startupStatus', [], strict('StartupStatus', startup_state_js_1.parseStartupStatus)),
        descriptor('saveStartupSettings', [['desired', strict('StartupDesired', startup_state_js_1.parseStartupDesired)], ['expectedRevision', revisionCodec]], strict('StartupStatus', startup_state_js_1.parseStartupStatus)),
        descriptor('readPolicy', [], strict('PolicySnapshot', policy_js_1.parsePolicySnapshot)),
        descriptor('savePolicy', [['intent', strict('PolicyIntent', policy_js_1.parsePolicyIntent)], ['expectedRevision', revisionCodec]], strict('PolicySnapshot', policy_js_1.parsePolicySnapshot)),
        descriptor('listWorkspaces', [], jsonCodec), descriptor('readSession', [['sessionId', sessionCodec]], jsonCodec),
        descriptor('applyInstrument', [['sessionId', sessionCodec], ['command', strict('InstrumentCommand', instrument_state_js_1.parseInstrumentCommand)]], jsonCodec),
        descriptor('applyTicketWindow', [['sessionId', sessionCodec], ['command', strict('TicketWindowCommand', parseRemoteTicketWindow)]], jsonCodec),
        descriptor('resourceAction', [['sessionId', sessionCodec], ['request', strict('ResourceAction', parseResourceAction)]], jsonCodec),
        descriptor('historyAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
        descriptor('worktreeAction', [['sessionId', sessionCodec], ['request', jsonCodec]], jsonCodec),
        descriptor('grantPolicy', [['sessionId', sessionCodec], ['enabled', strict('Boolean', value => (0, validation_js_1.boolean)(value, 'enabled'))], ['expectedRevision', revisionCodec]], strict('PolicyGrants', parsePolicyGrants)),
    ]),
});

},
"src/controls/startup-state.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseStartupDesired = parseStartupDesired;
exports.parseStartupObservation = parseStartupObservation;
exports.parseStartupStatus = parseStartupStatus;
exports.emptyStartupDocument = emptyStartupDocument;
exports.parseStartupDocument = parseStartupDocument;
const validation_js_1 = require("./validation.js");
function parseStartupDesired(value) {
    const raw = (0, validation_js_1.record)(value, 'startup desired', ['startupCwdEnabled']);
    return (0, validation_js_1.freeze)({ startupCwdEnabled: (0, validation_js_1.boolean)(raw.startupCwdEnabled, 'startupCwdEnabled') });
}
function nullableText(value, where) {
    if (value === null)
        return null;
    if (typeof value !== 'string')
        (0, validation_js_1.invalid)(where + ' must be a string or null');
    return value;
}
function parseStartupObservation(value) {
    const raw = (0, validation_js_1.record)(value, 'startup observation', ['nativeInitialCwdSupported', 'preparation']);
    const prep = (0, validation_js_1.record)(raw.preparation, 'startup preparation', ['status', 'sdkVersion', 'diagnostic']);
    const statuses = ['ready', 'not-prepared', 'incompatible', 'failed', 'uncertain'];
    const status = statuses.find(status => status === prep.status);
    if (!status)
        (0, validation_js_1.invalid)('unsupported startup preparation status');
    return (0, validation_js_1.freeze)({ nativeInitialCwdSupported: raw.nativeInitialCwdSupported === null ? null : (0, validation_js_1.boolean)(raw.nativeInitialCwdSupported, 'nativeInitialCwdSupported'),
        preparation: { status, sdkVersion: nullableText(prep.sdkVersion, 'sdkVersion'), diagnostic: nullableText(prep.diagnostic, 'diagnostic') } });
}
/** Strict transport decoder. It validates JSON facts, not a second UI projection. */
function parseStartupStatus(value) {
    const raw = (0, validation_js_1.record)(value, 'startup status', ['revision', 'desired', 'boot', 'enabledNow', 'nativeInitialCwdSupported', 'preparation', 'restartNeeded', 'state']);
    const receipt = (0, validation_js_1.record)(raw.boot, 'startup boot receipt', ['epoch', 'requested']);
    const observation = parseStartupObservation({ nativeInitialCwdSupported: raw.nativeInitialCwdSupported, preparation: raw.preparation });
    const states = ['disabled', 'enabled', 'pending-restart', 'needs-preparation', 'unsupported', 'incompatible', 'failed', 'uncertain'];
    const state = states.find(state => state === raw.state);
    if (!state)
        (0, validation_js_1.invalid)('unsupported startup state');
    return (0, validation_js_1.freeze)({ revision: (0, validation_js_1.revision)(raw.revision, 'startup revision'), desired: parseStartupDesired(raw.desired),
        boot: { epoch: (0, validation_js_1.id)(receipt.epoch, 'startup epoch'), requested: parseStartupDesired(receipt.requested) },
        enabledNow: raw.enabledNow === null ? null : (0, validation_js_1.boolean)(raw.enabledNow, 'enabledNow'),
        ...observation, restartNeeded: (0, validation_js_1.boolean)(raw.restartNeeded, 'restartNeeded'), state });
}
function emptyStartupDocument() {
    return (0, validation_js_1.freeze)({ schemaVersion: 1, revision: 0, desired: { startupCwdEnabled: false }, bootReceipts: [] });
}
function parseStartupDocument(value) {
    try {
        const raw = (0, validation_js_1.record)(value, 'startup document', ['schemaVersion', 'revision', 'desired', 'bootReceipts']);
        if (raw.schemaVersion !== 1)
            (0, validation_js_1.invalid)('unsupported startup schemaVersion');
        const bootReceipts = (0, validation_js_1.array)(raw.bootReceipts, 'bootReceipts').map(value => {
            const receipt = (0, validation_js_1.record)(value, 'startup boot receipt', ['epoch', 'requested']);
            return { epoch: (0, validation_js_1.id)(receipt.epoch, 'startup epoch'), requested: parseStartupDesired(receipt.requested) };
        });
        if (new Set(bootReceipts.map(receipt => receipt.epoch)).size !== bootReceipts.length)
            (0, validation_js_1.invalid)('duplicate startup epoch');
        return (0, validation_js_1.freeze)({ schemaVersion: 1, revision: (0, validation_js_1.revision)(raw.revision, 'startup revision'), desired: parseStartupDesired(raw.desired), bootReceipts });
    }
    catch (error) {
        if (error instanceof validation_js_1.ControlsError && error.code === 'invalid-input')
            throw new validation_js_1.ControlsError('invalid-state', error.message);
        throw error;
    }
}

},
"src/controls/validation.ts":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlsError = void 0;
exports.invalid = invalid;
exports.record = record;
exports.array = array;
exports.id = id;
exports.revision = revision;
exports.increment = increment;
exports.boolean = boolean;
exports.capacity = capacity;
exports.freeze = freeze;
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
function record(value, where, keys) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        invalid(where + ' must be a plain object');
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string' || (keys && !keys.includes(key)))
            invalid(where + ': unknown key ' + String(key));
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

}};
const dependencies={"src/client.ts":{"./controls/policy.js":"src/controls/policy.ts","./controls/startup-state.js":"src/controls/startup-state.ts","./controls/remote-contract.js":"src/controls/remote-contract.ts"},"src/controls/instrument-state.ts":{"./validation.js":"src/controls/validation.ts"},"src/controls/policy.ts":{"./validation.js":"src/controls/validation.ts"},"src/controls/remote-contract.ts":{"./startup-state.js":"src/controls/startup-state.ts","./policy.js":"src/controls/policy.ts","./instrument-state.js":"src/controls/instrument-state.ts","./validation.js":"src/controls/validation.ts"},"src/controls/startup-state.ts":{"./validation.js":"src/controls/validation.ts"},"src/controls/validation.ts":{}};
const cache=Object.create(null);
function load(id){if(Object.hasOwn(cache,id))return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](function(request){const local=dependencies[id][request];return local===undefined?require(request):load(local)},module,module.exports);return module.exports;}
return load("src/client.ts");}});
