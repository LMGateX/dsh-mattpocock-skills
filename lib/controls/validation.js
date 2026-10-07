/** Mechanical diagnostics only; never business blockers or approval requests. */
export class ControlsError extends Error {
    code;
    name = 'ControlsError';
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export function invalid(message) {
    throw new ControlsError('invalid-input', message);
}
export function record(value, where, keys) {
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
export function array(value, where) {
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
export function id(value, where) {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0
        || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value))
        invalid(where + ' must be a non-empty opaque id');
    return value;
}
export function revision(value, where) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        invalid(where + ' must be a non-negative safe integer');
    return value;
}
export function increment(value) {
    return revision(value + 1, 'next revision');
}
export function boolean(value, where) {
    if (typeof value !== 'boolean')
        invalid(where + ' must be boolean');
    return value;
}
export function capacity(value, where) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
        invalid(where + ' must be a positive safe integer');
    return value;
}
export function freeze(value) {
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
export function memoized(value, parse) {
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
