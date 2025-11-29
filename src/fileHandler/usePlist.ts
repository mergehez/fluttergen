import fs from "fs";
import {execSync} from "child_process";

export function usePlist(filePath: string) {
    function fixDots(keyPath: string) {
        return keyPath.replaceAll('\\.', 'A_DOT_WAS_HERE'); // fix dots in keys
    }

    function mkDir(keyPath: string) {
        keyPath = fixDots(keyPath);
        const parts = keyPath.split('.');
        let currentPath = '';

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];

            currentPath = currentPath ? `${currentPath}.${part}` : part;
            try {
                const createDictCommand = `plutil -insert ${currentPath} -dictionary "${filePath}"`;
                execSync(createDictCommand, {stdio: 'pipe'});
                console.log(`Created dictionary for path: ${currentPath}`);
            } catch (error) {
                // ignore
            }
        }
    }

    function insert(keyPath: string, type: string, value?: string, append: boolean = false) {
        keyPath = fixDots(keyPath);
        if (!append)
            mkDir(keyPath);

        try {
            value = value ? `"${value}"` : '';
            type = type.startsWith('-') ? type : `-${type}`;
            const action = append ? '-append' : '';
            const finalCommand = `plutil -insert ${keyPath} ${type} ${value} ${action} "${filePath}"`;
            console.log(`Inserting key: ${keyPath} of type ${type} with value ${value} into ${filePath}`);
            execSync(finalCommand, {stdio: 'inherit'});
        } catch (error) {
            // console.error(`Failed to insert final key ${keyPath}:`, (error as Error).message);
            throw error;
        }
    }

    const set = (keyPath: string, type: string, value: string) => {
        keyPath = fixDots(keyPath);
        mkDir(keyPath);

        type = type.startsWith('-') ? type : `-${type}`;
        const command = `plutil -replace ${keyPath} ${type} "${value}" "${filePath}"`;
        execSync(command, {stdio: 'inherit'});
    }
    const getSimple = (keyPath: string): string => {
        keyPath = fixDots(keyPath);
        const command = `plutil -extract ${keyPath} raw "${filePath}"`;
        return execSync(command, {stdio: 'pipe'}).toString().trim();
    }
    const getComplex = (keyPath: string): Record<string, any> => {
        keyPath = fixDots(keyPath);
        const command = `plutil -extract ${keyPath} json -o - "${filePath}"`;
        const output = execSync(command, {stdio: 'pipe'}).toString().trim();
        return JSON.parse(output);
    }
    const get = (keyPath: string): any => {
        try {
            return getSimple(keyPath);
        } catch (error) {
            return getComplex(keyPath);
        }
    }
    return {
        insert: insert,
        set: set,
        get: get,
        getSimple: getSimple,
        getComplex: getComplex,

        addToList(keyPath: string, type: string, newValue: string) {
            keyPath = fixDots(keyPath);
            // mkDir(keyPath);
            // const paths = keyPath.split('.');
            // const arrayPath = paths.slice(0, -1).join('.');
            try {
                insert(keyPath, 'array');
            } catch (_) {
            }

            insert(keyPath, type, newValue, true);
        },
    }
}