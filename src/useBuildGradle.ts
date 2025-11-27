import * as fs from "fs";
import {KnownError} from "./knownError.ts";

export function replaceInFile(filePath: string, search: string | RegExp, replaceWith: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const updatedContent = content.replace(search, replaceWith);
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

    function update(key: string, newValue: any, type: 'string' | 'int' | 'float' | 'bool') {
        const p = ktsExists ? paths.kts : paths.groovy;
        let useQuotes = type === 'string';
        if (!type) {
            useQuotes = typeof newValue === 'string';
        }

        const quotedValue = useQuotes ? `"${newValue}"` : newValue;

        const regex = ktsExists
            ? new RegExp(`(${key}\\s*=\\s*)([^\\n]+)`, 'g')
            : new RegExp(`(${key}(?:\\s*:\\s*|\\s+))([^\\n]+)`, 'g');

        try {
            const replacement = ktsExists ? `${key} = ${quotedValue}` : `${key} ${quotedValue}`;
            replaceInFile(p, regex, replacement);
            console.log(`- Android ${key} (${p.split('/').pop()}) updated to ${newValue}`);
        } catch (e) {
            console.error(`Error updating Android ${p.split('/').pop()} at ${p}:`, e);
        }
    }


    return {
        update: update,
    }
}
