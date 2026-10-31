import fs from 'fs';
import {parse as parseEnv} from 'dotenv';

/**
 * Loads `.env`, an optional `.env.<profile>` override, and the process environment.
 * Later sources win.
 */
export function loadEnvironment(profile?: string): Record<string, string> {
    const values: Record<string, string> = {};

    const files = ['.env'];
    if (profile) files.push(`.env.${profile}`);

    for (const file of files) {
        if (fs.existsSync(file)) {
            Object.assign(values, parseEnv(fs.readFileSync(file, 'utf-8')));
        }
    }

    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
            values[key] = value;
        }
    }

    return values;
}

/**
 * Expands `${NAME}` and `${NAME:-fallback}` in a string.
 * Unknown variables without a fallback are left untouched.
 */
export function expandEnvironmentString(input: string, environment: Record<string, string>): string {
    return input.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?}/g, (match, name: string, fallback?: string) => {
        const value = environment[name];
        if (value !== undefined) return value;
        return fallback !== undefined ? fallback : match;
    });
}

/**
 * Recursively expands environment references in config values.
 * Script/workflow sections are skipped so JS template literals keep working.
 */
export function expandEnvironment<T>(value: T, environment: Record<string, string>, key?: string): T {
    if (key === 'prescripts' || key === 'postscripts' || key === 'workflows' || key === 'profiles') {
        return value;
    }

    if (typeof value === 'string') {
        return expandEnvironmentString(value, environment) as unknown as T;
    }

    if (Array.isArray(value)) {
        return value.map(item => expandEnvironment(item, environment)) as unknown as T;
    }

    if (value && typeof value === 'object') {
        const result: Record<string, any> = {};
        for (const [childKey, childValue] of Object.entries(value as Record<string, any>)) {
            result[childKey] = expandEnvironment(childValue, environment, childKey);
        }
        return result as T;
    }

    return value;
}
