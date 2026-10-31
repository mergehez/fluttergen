import * as fs from "fs";
import {KnownError} from "knownError.ts";

export function replaceInFile(filePath: string, search: string | RegExp, replaceWith: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const isRegex = search instanceof RegExp;
    const updatedContent = isRegex
        ? content.replace(search, replaceWith)
        : content.replaceAll(search, replaceWith);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
}

export function useBuildGradle(folder: 'android' | 'android/app') {
    const paths = {
        kts: `./${folder}/build.gradle.kts`,
        groovy: `./${folder}/build.gradle`,
    }

    const ktsExists = fs.existsSync(paths.kts);
    const groovyExists = fs.existsSync(paths.groovy);

    if (!ktsExists && !groovyExists) {
        throw new KnownError(`Error: Neither build.gradle nor build.gradle.kts file found in '${folder}' folder.`);
    }
    if (ktsExists && groovyExists) {
        throw new KnownError(`Error: Both build.gradle and build.gradle.kts files found in '${folder}' folder. Please keep only one of them.`);
    }

    function update(key: string, newValue: any, type?: 'string' | 'int' | 'float' | 'bool', quiet = false): boolean {
        const p = ktsExists ? paths.kts : paths.groovy;
        const useQuotes = type ? type === 'string' : typeof newValue === 'string';
        const quotedValue = useQuotes
            ? `"${String(newValue).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
            : newValue;

        const regex = ktsExists
            ? new RegExp(`(${key}\\s*=\\s*)([^\\n]+)`, 'g')
            : new RegExp(`(${key}\\s*(?:=|:)?\\s+)([^\\n]+)`, 'g');

        try {
            const content = fs.readFileSync(p, 'utf-8');
            if (!regex.test(content)) {
                if (!quiet) console.warn(`- Warning: '${key}' was not found in ${p}, skipping.`);
                return false;
            }
            regex.lastIndex = 0;

            const replacement = ktsExists ? `${key} = ${quotedValue}` : `${key} ${quotedValue}`;
            const updated = ktsExists
                ? content.replace(regex, replacement)
                : content.replace(regex, (_match, prefix: string) => {
                    const separator = prefix.includes('=') ? ' = ' : prefix.includes(':') ? ': ' : ' ';
                    return `${key}${separator}${quotedValue}`;
                });
            fs.writeFileSync(p, updated, 'utf-8');
            console.log(`- Android ${key} (${p.split('/').pop()}) updated to ${newValue}`);
            return true;
        } catch (e) {
            console.error(`Error updating Android ${p.split('/').pop()} at ${p}:`, e);
            return false;
        }
    }


    return {
        update: update,
    }
}
