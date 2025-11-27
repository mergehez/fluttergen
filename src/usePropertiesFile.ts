import fs, {mkdirSync} from "fs";
import {execSync} from "child_process";
import path from "path";
import * as propFile from "properties-file";

export function usePropertiesFile(filePath: string) {
    return {
        set(key: string, value: string) {
            mkdirSync(path.dirname(filePath), {recursive: true});
            const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
            const props = propFile.getProperties(content);
            props[key] = value;
            fs.writeFileSync(filePath, Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n'), 'utf-8');
        }
    }
}