import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { isCollaborationToolName } from './silent-ptc-sdk.js';
import { isOwnedCollaborationReplayMessage, stripPtcSystemMessage, stripRuntimeContext } from './silent-replay.js';
const keepTool = (tool) => !isCollaborationToolName(tool.name);
function filterChanged(values, keep) {
    const first = values.findIndex(value => !keep(value));
    if (first < 0)
        return undefined;
    return [...values.slice(0, first), ...values.slice(first + 1).filter(keep)];
}
function projectHistory(history) {
    const tools = filterChanged(history.tools, keepTool);
    let changed = tools !== undefined;
    const updates = history.updates.map(update => {
        const additions = filterChanged(update.additions, keepTool);
        if (additions === undefined)
            return update;
        changed = true;
        return { ...update, additions };
    });
    return changed ? { tools: tools ?? history.tools, updates } : undefined;
}
function projectMessage(message) {
    if (message.role === 'system' && message.source.kind === 'system-prompt') {
        const stripped = stripPtcSystemMessage(message);
        return stripped === undefined || stripped === 'unsupported' ? message : { ...message, content: stripped.content };
    }
    if (message.role === 'user' && message.source !== undefined) {
        if (isOwnedCollaborationReplayMessage(message))
            return null;
        const stripped = stripRuntimeContext(message);
        if (stripped === null)
            return null;
        if (stripped !== undefined && stripped !== 'unsupported') {
            return { ...message, source: stripped.source, content: stripped.content };
        }
        return message;
    }
    if (message.role !== 'developer')
        return message;
    const content = filterChanged(message.content, block => (block.type !== 'tool-addition' && block.type !== 'tool-removal')
        || !isCollaborationToolName(block.toolName));
    // Keep even empty developer occurrences: the SDK checks historical update IDs
    // before projecting route-specific declarations, then drops empty content.
    return content === undefined ? message : { ...message, content };
}
/**
 * Request-only replacements for an exact DSH 0.2.3-alpha.2 auxiliary call.
 * The Host must first verify Session ownership and current silent policy. Only
 * apply replacements to the mutable one-shot envelope before calling next().
 * Ordinary loop requests and borrowed Session data are never changed.
 */
export function projectSilentCompactionInput(options) {
    if (options.purpose !== 'compaction' || Object.isFrozen(options))
        return null;
    // The producer owns purpose types. The SDK checks WeakSet identity only; a
    // string-parameterized auxiliary envelope is safe to check without importing
    // the compaction package or re-declaring its purpose.
    if (isAgentLoopRequest(options))
        return null;
    const tools = options.tools === undefined ? undefined : filterChanged(options.tools, keepTool);
    const toolHistory = options.toolHistory === undefined ? undefined : projectHistory(options.toolHistory);
    const projected = options.messages.map(projectMessage);
    const messages = projected.some((message, index) => message !== options.messages[index])
        ? projected.filter(message => message !== null) : undefined;
    if (tools === undefined && toolHistory === undefined && messages === undefined)
        return null;
    return {
        ...(tools === undefined ? {} : { tools }),
        ...(toolHistory === undefined ? {} : { toolHistory }),
        ...(messages === undefined ? {} : { messages }),
    };
}
