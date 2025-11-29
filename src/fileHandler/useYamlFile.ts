import * as fs from "fs";
import YAML, {LineCounter, Pair, YAMLSeq} from "yaml";
import {KnownError} from "knownError.ts";

export function useYamlFile(path: string) {
    function _getContent() {
        if (!fs.existsSync(path)) {
            throw new KnownError(`File at path '${path}' does not exist.`);
        }
        return fs.readFileSync(path, 'utf8');
    }

    function encode(root: YAML.Document.Parsed) {
        return root.toString({
            lineWidth: 0,
            minContentWidth: 0
        });
    }

    function addToList(keyPath: string, newValue: string, mkDir: boolean | number = 1) {
        const root = YAML.parseDocument(_getContent(), {lineCounter: new LineCounter()});
        let list = root.getIn(keyPath.split('.'));
        if (!list && mkDir) {
            root.setIn(keyPath.split('.'), [newValue]);
            fs.writeFileSync(path, encode(root), 'utf8');
            return;
        }

        if (typeof list === 'object' && list instanceof YAMLSeq) {
            // convert list to a simple array for easier checking
            list = list.items.map(item => {
                if (typeof item === 'object' && 'value' in item) {
                    return item.value;
                }
                return item;
            });
        }

        if (Array.isArray(list)) {
            if (list.includes(newValue)) {
                return; // already exists
            }
            list.push(newValue);
            root.setIn(keyPath.split('.'), list);
            fs.writeFileSync(path, encode(root), 'utf8');
        } else {
            if (typeof list === 'object') {
                console.log(list)
            }
            throw new KnownError(`The type of key '${keyPath}' should be a list/array, but got ${typeof list}`);
        }
    }

    function set(keyPath: string, newValue: string) {
        const lineCounter = new LineCounter();
        let root = YAML.parseDocument(_getContent(), {lineCounter});
        root.setIn(keyPath.split('.'), newValue);
        fs.writeFileSync(path, encode(root), 'utf8');
    }

    function get(keyPath: string): string | undefined {
        const root = YAML.parse(_getContent()) as Record<string, any>;

        const keys = keyPath.split('.');
        let current: any = root;
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!(k in current)) {
                return undefined;
            }
            current = current[k];
        }

        return typeof current === 'string' ? current : undefined;
    }

    return {
        get: get,
        set: set,
        addToList: addToList,
        tryAddToList: (keyPath: string, newValue: string, mkDir: boolean | number = 1, silent: boolean = true) => {
            try {
                addToList(keyPath, newValue, mkDir);
            } catch (e) {
                if (silent) return;
                console.warn(`Warning: Could not add value to list at key '${keyPath}': ${(e as Error).message}`);
            }
        },
        asJsObject: () => {
            return YAML.parse(_getContent()) as Record<string, any>;
        }
    }
}
