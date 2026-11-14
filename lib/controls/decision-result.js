import { boundedArray, freeze, id, invalid, record } from './validation.js';
function text(value, where) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 65536 || value.includes('\0'))
        invalid(where + ' must be non-empty text, at most 65536 characters');
    return value;
}
/** Strict browser-safe parser for the closed structured branch of DecisionValue.result. */
export function parseDecisionResult(value) {
    const raw = record(value, 'decision result', ['answer', 'selectedOptionKey', 'source', 'included', 'excluded']);
    let source;
    if (Object.hasOwn(raw, 'source')) {
        const input = record(raw.source, 'decision result source', ['kind', 'sessionId', 'messageId', 'text', 'position']);
        source = { kind: text(input.kind, 'source kind'),
            ...(Object.hasOwn(input, 'sessionId') ? { sessionId: id(input.sessionId, 'source sessionId') } : {}),
            ...(Object.hasOwn(input, 'messageId') ? { messageId: id(input.messageId, 'source messageId') } : {}),
            ...(Object.hasOwn(input, 'text') ? { text: text(input.text, 'source text') } : {}),
            ...(Object.hasOwn(input, 'position') ? { position: text(input.position, 'source position') } : {}) };
    }
    const scope = (value, where) => typeof value === 'string' ? text(value, where) : boundedArray(value, where, 64).map(entry => text(entry, where));
    const result = { answer: text(raw.answer, 'result answer'),
        ...(Object.hasOwn(raw, 'selectedOptionKey') ? { selectedOptionKey: id(raw.selectedOptionKey, 'selectedOptionKey') } : {}),
        ...(source === undefined ? {} : { source }),
        ...(Object.hasOwn(raw, 'included') ? { included: scope(raw.included, 'included') } : {}),
        ...(Object.hasOwn(raw, 'excluded') ? { excluded: scope(raw.excluded, 'excluded') } : {}) };
    if (JSON.stringify(result).length > 65536)
        invalid('decision result JSON must be at most 65536 characters');
    return freeze(result);
}
/** Readable presentation only; the original structure remains the stored/transport value. */
export function decisionResultText(value) {
    if (value == null)
        return '';
    if (typeof value === 'string')
        return value;
    const result = parseDecisionResult(value), lines = [result.answer];
    if (result.selectedOptionKey !== undefined)
        lines.push('Selected option: ' + result.selectedOptionKey);
    if (result.source !== undefined) {
        const source = result.source, details = [
            ...(source.sessionId === undefined ? [] : ['session=' + source.sessionId]),
            ...(source.messageId === undefined ? [] : ['message=' + source.messageId]),
            ...(source.position === undefined ? [] : ['position=' + source.position]),
            ...(source.text === undefined ? [] : [source.text]),
        ];
        lines.push('Source (' + source.kind + ')' + (details.length === 0 ? '' : ': ' + details.join('; ')));
    }
    for (const key of ['included', 'excluded']) {
        const scope = result[key];
        if (scope !== undefined)
            lines.push((key === 'included' ? 'Included: ' : 'Excluded: ') + (typeof scope === 'string' ? scope : scope.join('; ')));
    }
    return lines.join('\n');
}
