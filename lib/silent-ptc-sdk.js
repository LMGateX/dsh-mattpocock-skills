// Historical DSH 0.2.3-alpha.2 `tools:sdk` projection only. The Host must
// identify the structured section before calling this helper.
const collaborationTools = new Set([
    'mattpocock_assign', 'mattpocock_audit', 'mattpocock_controls', 'mattpocock_delegate',
    'mattpocock_history', 'mattpocock_record', 'mattpocock_resource', 'mattpocock_window', 'mattpocock_worktree',
]);
const heading = '## Writing code for run_code\n\n';
const prelude = [
    '', '', '```ts',
    'type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }', '',
    'declare class Image { private constructor(); readonly attachmentId: string; readonly path: string; readonly width: number; readonly height: number; }', '',
    'declare function inspect(...values: unknown[]): void;', '', 'interface ToolArgsMap {',
].join('\n');
const separator = '}\n\ninterface ToolOutputMap {';
const suffix = [
    '}', '', 'type ToolName = keyof ToolOutputMap', '',
    'declare class ToolCallError extends Error {', '  readonly name: "ToolCallError";', '  readonly toolName: ToolName;', '}', '',
    'declare const tools: {', '  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;', '}', '```',
].join('\n');
const identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
// Keep comments and quoted literals opaque, including braces, escapes and
// raw U+2028/U+2029 in JSON.stringify's output. Single quotes, line comments
// and template literals are only used by the unsupported-format detector.
const lexicalToken = /\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\r\n]*|"(?:[^"\\\r\n]|\\[\s\S])*"|'(?:[^'\\\r\n]|\\[\s\S])*'|`(?:[^`\\]|\\[\s\S])*`|=>|[A-Za-z_$][A-Za-z0-9_$]*|\S/g;
function lex(text) {
    return Array.from(text.matchAll(lexicalToken), ({ 0: token, index }) => ({ text: token, start: index, end: index + token.length }));
}
function keyOf(token) {
    if (identifier.test(token))
        return token;
    if (token[0] === '"') {
        try {
            return JSON.parse(token);
        }
        catch {
            return undefined;
        }
    }
    if (token[0] === "'" && identifier.test(token.slice(1, -1)))
        return token.slice(1, -1);
    return undefined;
}
const closers = new Map([['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']]);
const closingTokens = new Set(closers.values());
const oneLineDoc = /^\/\*\* [^\r\n]* \*\/$/;
// The pinned renderer puts a declaration terminator outside all type
// delimiters. Consume it before looking for another map member; indentation
// alone could mistake an object-valued tool's nested property for a tool.
function typeEnd(tokens, from) {
    const expected = [];
    for (let i = from; i < tokens.length; i++) {
        const { text } = tokens[i];
        const close = closers.get(text);
        if (close)
            expected.push(close);
        else if (closingTokens.has(text)) {
            if (expected.pop() !== text)
                return undefined;
        }
        else if (text === ';' && expected.length === 0) {
            return i === from ? undefined : i;
        }
        else if (text[0] === '/') {
            if (expected.at(-1) !== '}' || !oneLineDoc.test(text))
                return undefined;
        }
        else if (text === '=>' || text[0] === "'" || text[0] === '`' || (text[0] === '"' && keyOf(text) === undefined))
            return undefined;
    }
    return undefined;
}
function parseMap(body, hasToolDocs) {
    if (body === '')
        return [];
    const tokens = lex(body), members = [];
    let at = 0, cursor = 0;
    while (at < tokens.length) {
        let token = tokens[at];
        if (body.slice(cursor, token.start) !== '\n  ')
            return undefined;
        if (hasToolDocs && oneLineDoc.test(token.text)) {
            const doc = token;
            token = tokens[++at];
            if (!token || body.slice(doc.end, token.start) !== '\n  ')
                return undefined;
        }
        const key = keyOf(token.text);
        if (key === undefined || (identifier.test(key) ? key : JSON.stringify(key)) !== token.text)
            return undefined;
        if (members.length && members.at(-1).key >= key)
            return undefined;
        const colon = tokens[++at], startType = tokens[++at];
        if (colon?.text !== ':' || colon.start !== token.end || startType?.start !== colon.end + 1 || body[colon.end] !== ' ')
            return undefined;
        const terminator = typeEnd(tokens, at);
        if (terminator === undefined)
            return undefined;
        const end = tokens[terminator].end;
        members.push({ key, start: cursor, end });
        cursor = end;
        at = terminator + 1;
    }
    return members.length && body.slice(cursor) === '\n' ? members : undefined;
}
function keepMembers(body, members) {
    const kept = members.filter(member => !collaborationTools.has(member.key));
    return kept.length ? kept.map(({ start, end }) => body.slice(start, end)).join('') + '\n' : '';
}
function canonicalProjection(text) {
    if (!text.startsWith(heading) || !text.endsWith(suffix))
        return undefined;
    const before = text.indexOf(prelude);
    if (before < 0)
        return undefined;
    const argsStart = before + prelude.length;
    const argsEnd = text.indexOf(separator, argsStart);
    if (argsEnd < 0)
        return undefined;
    const outputStart = argsEnd + separator.length, outputEnd = text.length - suffix.length;
    if (outputStart > outputEnd)
        return undefined;
    const argsBody = text.slice(argsStart, argsEnd), outputBody = text.slice(outputStart, outputEnd);
    const args = parseMap(argsBody, true), output = parseMap(outputBody, false);
    if (!args || !output || args.length !== output.length || args.some((member, i) => member.key !== output[i].key))
        return undefined;
    if (!args.some(member => collaborationTools.has(member.key)))
        return text;
    return text.slice(0, argsStart) + keepMembers(argsBody, args) + separator + keepMembers(outputBody, output) + suffix;
}
// Unknown layouts are never edited. Detect recognizable direct members of
// the named SDK maps (or an inline tools declaration) for honest coverage,
// not mentions in instructions, comments, literals or nested type members.
function hasOwnedDeclaration(text) {
    for (const block of text.split(/(?:^|\n)[ \t]*```[^\n]*\n?/)) {
        const tokens = lex(block).filter(token => !token.text.startsWith('/*') && !token.text.startsWith('//'));
        for (let i = 0; i < tokens.length; i++) {
            const name = tokens[i].text, before = tokens[i - 1]?.text;
            const map = name === 'ToolArgsMap' || name === 'ToolOutputMap';
            let brace;
            if (map && before === 'interface')
                brace = i + 1;
            else if ((map && before === 'type' && tokens[i + 1]?.text === '=') ||
                (name === 'tools' && before === 'const' && tokens[i - 2]?.text === 'declare' && tokens[i + 1]?.text === ':'))
                brace = i + 2;
            else
                continue;
            if (tokens[brace]?.text !== '{')
                continue;
            const expected = ['}'];
            for (let j = brace + 1; j < tokens.length && expected.length; j++) {
                const token = tokens[j], previous = tokens[j - 1], next = tokens[j + 1]?.text;
                const key = keyOf(token.text);
                if (expected.length === 1 && key !== undefined && collaborationTools.has(key) &&
                    (next === ':' || next === '(' || (next === '?' && [':', '('].includes(tokens[j + 2]?.text ?? ''))) &&
                    (j === brace + 1 || previous.text === ';' || previous.text === ',' || previous.text === 'readonly' || block.slice(previous.end, token.start).includes('\n')))
                    return true;
                const close = closers.get(token.text);
                if (close)
                    expected.push(close);
                else if (closingTokens.has(token.text) && expected.pop() !== token.text)
                    break;
            }
        }
    }
    return false;
}
export function stripSilentPtcSdk(text) {
    const projected = canonicalProjection(text);
    if (projected !== undefined)
        return { status: projected === text ? 'unchanged' : 'stripped', text: projected };
    return { status: hasOwnedDeclaration(text) ? 'unsupported' : 'unchanged', text };
}
