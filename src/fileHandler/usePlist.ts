import fs from "fs";
import plist from "plist";
import {KnownError} from "knownError.ts";

type PlistValue = string | number | boolean | Date | Buffer | PlistValue[] | { [key: string]: PlistValue };

function splitKeyPath(keyPath: string): string[] {
    const parts: string[] = [];
    let current = '';
    for (let i = 0; i < keyPath.length; i++) {
        const char = keyPath[i];
        if (char === '\\' && keyPath[i + 1] === '.') {
            current += '.';
            i++;
        } else if (char === '.') {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

function coerceValue(type: string, value?: unknown): PlistValue {
    const normalizedType = type.replace(/^-/, '').toLowerCase();
    switch (normalizedType) {
        case 'string':
            return value === undefined ? '' : String(value);
        case 'bool':
        case 'boolean': {
            if (value === true || value === 1) return true;
            if (value === false || value === 0 || value === undefined) return false;
            const text = String(value).trim().toLowerCase();
            if (['true', 'yes', '1'].includes(text)) return true;
            if (['false', 'no', '0', ''].includes(text)) return false;
            throw new KnownError(`Invalid boolean value: ${value}`);
        }
        case 'int':
        case 'integer': {
            const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
            if (!Number.isFinite(parsed)) throw new KnownError(`Invalid integer value: ${value}`);
            return Math.trunc(parsed);
        }
        case 'float':
        case 'real': {
            const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
            if (!Number.isFinite(parsed)) throw new KnownError(`Invalid float value: ${value}`);
            return parsed;
        }
        case 'date':
            return value instanceof Date ? value : new Date(String(value ?? Date.now()));
        case 'data':
            return value instanceof Buffer ? value : Buffer.from(String(value ?? ''), 'base64');
        case 'array':
            return [];
        case 'dict':
        case 'dictionary':
            return {};
        default:
            throw new KnownError(`Unsupported plist type: ${type}`);
    }
}

export function usePlist(filePath: string) {
    function load(): { [key: string]: PlistValue } {
        if (!fs.existsSync(filePath)) {
            throw new KnownError(`Plist file not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.startsWith('bplist')) {
            throw new KnownError(`Binary plist files are not supported: ${filePath}. Convert it to XML first.`);
        }

        try {
            const parsed = plist.parse(content);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as { [key: string]: PlistValue };
            }
            return {};
        } catch (e) {
            throw new KnownError(`Could not parse plist file ${filePath}: ${(e as Error).message}`);
        }
    }

    function save(root: { [key: string]: PlistValue }) {
        fs.writeFileSync(filePath, plist.build(root as any), 'utf-8');
    }

    function resolveContainer(root: any, parts: string[], create: boolean): { container: any, key: string } {
        let current = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            let next = current[part];
            if (next === undefined || next === null || typeof next !== 'object') {
                if (!create) throw new KnownError(`Key path not found: ${parts.join('.')}`);
                next = {};
                current[part] = next;
            }
            current = next;
        }
        return {container: current, key: parts[parts.length - 1]};
    }

    function getValue(parts: string[]): PlistValue | undefined {
        let current: any = load();
        for (const part of parts) {
            if (current === null || typeof current !== 'object' || !(part in current)) {
                return undefined;
            }
            current = current[part];
        }
        return current as PlistValue;
    }

    const set = (keyPath: string, type: string, value: unknown) => {
        const root = load();
        const parts = splitKeyPath(keyPath);
        const {container, key} = resolveContainer(root, parts, true);
        container[key] = coerceValue(type, value);
        save(root);
    };

    function insert(keyPath: string, type: string, value?: unknown, append: boolean = false) {
        const root = load();
        const parts = splitKeyPath(keyPath);
        const {container, key} = resolveContainer(root, parts, !append);

        if (append) {
            if (!Array.isArray(container[key])) {
                throw new KnownError(`Key path is not an array: ${keyPath}`);
            }
            container[key].push(coerceValue(type, value));
        } else {
            if (key in container) {
                throw new KnownError(`Value already exists at key path: ${keyPath}`);
            }
            container[key] = coerceValue(type, value);
        }

        save(root);
    }

    const getSimple = (keyPath: string): string => {
        const value = getValue(splitKeyPath(keyPath));
        if (value === undefined) {
            throw new KnownError(`Key path not found: ${keyPath}`);
        }
        if (value instanceof Date) return value.toISOString();
        if (Buffer.isBuffer(value)) return value.toString('base64');
        if (value !== null && typeof value === 'object') {
            throw new KnownError(`Value at '${keyPath}' is not a simple value.`);
        }
        return String(value);
    };

    const getComplex = (keyPath: string): Record<string, any> => {
        const value = getValue(splitKeyPath(keyPath));
        if (value === undefined) {
            throw new KnownError(`Key path not found: ${keyPath}`);
        }
        return value as Record<string, any>;
    };

    const get = (keyPath: string): any => {
        try {
            return getSimple(keyPath);
        } catch {
            return getComplex(keyPath);
        }
    };

    return {
        insert: insert,
        set: set,
        get: get,
        getSimple: getSimple,
        getComplex: getComplex,

        addToList(keyPath: string, type: string, newValue: string) {
            const root = load();
            const parts = splitKeyPath(keyPath);
            const {container, key} = resolveContainer(root, parts, true);

            if (container[key] === undefined) {
                container[key] = [];
            }
            if (!Array.isArray(container[key])) {
                throw new KnownError(`The value at '${keyPath}' is not an array.`);
            }
            (container[key] as PlistValue[]).push(coerceValue(type, newValue));
            save(root);
        },
    }
}
