import { createMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { isCollaborationToolName, stripSilentPtcSdk } from './silent-ptc-sdk.js';
function hasCollaborationToolHistory(session) {
    const { tools, updates } = session.toolHistory();
    return tools.some(tool => isCollaborationToolName(tool.name))
        || updates.some(update => update.additions.some(tool => isCollaborationToolName(tool.name)));
}
/** True only for a standalone generated collaboration message, never an ordinary chat mention. */
export function isOwnedCollaborationReplayMessage(message) {
    if (message.role !== 'user' || message.content.length !== 1 || message.content[0]?.type !== 'text')
        return false;
    const expected = standaloneKind(message.source.kind);
    return expected !== undefined && sourceFields(message.source).form === expected;
}
function standaloneKind(kind) {
    switch (kind) {
        case 'mattpocock-controls': return 'snapshot';
        case 'mattpocock-controls-notification':
        case 'mattpocock-controls-supervision': return 'notice';
        default: return undefined;
    }
}
// MessageSource is extensible; the current package's type graph need not declare
// every historical producer, nor do types certify shapes loaded from a log.
function sourceFields(source) {
    return source;
}
const RUNTIME_CONTEXT_SECTION = 'mattpocock-controls';
const RUNTIME_CONTEXT_INTROS = [
    'The following information describes your current session:',
    'The following information describes your current session. It replaces earlier versions of this context, including any retained in conversation summaries.',
];
function isContextSection(value) {
    return value !== null && typeof value === 'object' && 'name' in value && typeof value.name === 'string'
        && 'text' in value && typeof value.text === 'string';
}
function runtimeContextText(intro, sections) {
    const body = sections.map(section => section.text).join('\n\n')
        .replace(/<\/system-reminder\s*>/gi, tag => `<\\${tag.slice(1)}`);
    return `<system-reminder>\n${intro}\n\n${body}\n</system-reminder>`;
}
function stripRuntimeContext(message) {
    const { kind, form, sections } = sourceFields(message.source);
    if (kind !== 'runtime-context')
        return undefined;
    if (form !== 'snapshot' || !Array.isArray(sections) || !sections.every(isContextSection))
        return 'unsupported';
    const kept = sections.filter(section => section.name !== RUNTIME_CONTEXT_SECTION);
    if (kept.length === sections.length)
        return undefined;
    const [content] = message.content;
    if (message.content.length !== 1 || content?.type !== 'text')
        return 'unsupported';
    const intro = RUNTIME_CONTEXT_INTROS.find(candidate => runtimeContextText(candidate, sections) === content.text);
    if (intro === undefined)
        return 'unsupported';
    if (kept.length === 0)
        return null;
    // The loop's runtime-context registration is not exported in this SDK type graph.
    // The producer, snapshot form and complete ordered sections were verified above.
    const source = { ...message.source, sections: kept };
    return createUserMessage({ source: source, content: [{ type: 'text', text: runtimeContextText(intro, kept) }] });
}
function isStructuredSystemSection(value) {
    if (value === null || typeof value !== 'object' || !('name' in value) || typeof value.name !== 'string'
        || !('state' in value))
        return false;
    if ('noticeIndex' in value && (!Array.isArray(value.noticeIndex) || !value.noticeIndex.every(Number.isInteger)))
        return false;
    return value.state === 'retired' || value.state === 'active'
        && 'contentIndex' in value && Number.isInteger(value.contentIndex);
}
function stripPtcSystemMessage(message) {
    const sections = message.source.sections;
    if (!Array.isArray(sections) || !sections.some(section => section !== null && typeof section === 'object'
        && 'name' in section && section.name === 'tools:sdk'))
        return undefined;
    if (!sections.every(isStructuredSystemSection))
        return 'unsupported';
    const matches = sections.filter(section => section.name === 'tools:sdk' && section.state === 'active');
    if (matches.length === 0)
        return undefined;
    if (matches.length !== 1)
        return 'unsupported';
    const [target] = matches;
    if (target?.state !== 'active')
        return 'unsupported';
    const index = target.contentIndex;
    if (!Number.isInteger(index) || index < 0 || sections.some(section => section.noticeIndex?.includes(index)
        || (section !== target && section.state === 'active' && section.contentIndex === index)))
        return 'unsupported';
    const original = message.content[index];
    if (original?.type !== 'text')
        return 'unsupported';
    const stripped = stripSilentPtcSdk(original.text);
    if (stripped.status === 'unsupported')
        return 'unsupported';
    if (stripped.status !== 'stripped')
        return undefined;
    const content = message.content.map((block, i) => i === index ? { ...original, text: stripped.text } : block);
    // The SystemPrompt admission fold consumes events in append order, not
    // surface order. Replaying the original reset/delta would undo later native
    // admissions. Empty named contributions are its no-op; the original source
    // metadata and all other blocks remain retained in the raw event.
    return createMessage({ role: 'system', content, source: { kind: 'system-prompt', sections: [] } });
}
function shadow(seq) {
    return { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] };
}
/**
 * Reconcile the current model surface only. The original events and every prior
 * request boundary remain intact. An empty native system node shadows exactly
 * one historical node and contributes no model message, text, or tool change.
 */
export function stripOwnedCollaborationReplay(session, position = { turn: 0, step: 0 }) {
    const writes = [];
    const unsupported = new Set();
    for (const seq of session.surface.nodes) {
        // Exact-version compatibility: Session has no non-deprecated synchronous
        // event reader for its own positional surface. Do not scan the raw log.
        const event = session.eventAt(seq);
        if (event?.type !== 'system/message' && event?.type !== 'user/message')
            continue;
        // Other producers may already have projected this node (e.g. redacted a
        // different block). A replacement must preserve the current view, not
        // resurrect raw text just because an older event still stores it.
        const message = session.deriveEventMessage(event);
        if (event.type === 'system/message' && message?.role === 'system') {
            const replacement = stripPtcSystemMessage(message);
            if (replacement === 'unsupported')
                unsupported.add('ptc-sdk-format');
            else if (replacement !== undefined)
                writes.push(['system/message', { ...position, message: replacement }, shadow(seq)]);
            continue;
        }
        if (event.type !== 'user/message' || message?.role !== 'user')
            continue;
        const standalone = isOwnedCollaborationReplayMessage(message);
        if (!standalone && standaloneKind(message.source.kind) !== undefined) {
            unsupported.add('standalone-format');
            continue;
        }
        const replacement = standalone ? null : stripRuntimeContext(message);
        if (replacement === 'unsupported') {
            unsupported.add('runtime-context-format');
        }
        else if (replacement === null) {
            writes.push(['system/message', { ...position, message: createMessage({
                        role: 'system', content: [], source: { kind: 'system-prompt', sections: [] },
                    }) }, shadow(seq)]);
        }
        else if (replacement !== undefined) {
            writes.push(['user/message', replacement, shadow(seq)]);
        }
    }
    if (writes.length > 0)
        session.append(writes);
    return { startsRequestSeries: writes.length > 0 || hasCollaborationToolHistory(session), unsupported: [...unsupported] };
}
