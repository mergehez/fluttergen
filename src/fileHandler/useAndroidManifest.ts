import path from "path";
import fs from "fs";

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function useAndroidManifest() {
    const manifestPath = path.join('./android/app/src/main/AndroidManifest.xml');

    if (!fs.existsSync(manifestPath)) {
        console.warn(`AndroidManifest.xml not found at ${manifestPath}. Skipping manifest update.`);
        return undefined;
    }

    function readLines() {
        return fs.readFileSync(manifestPath, 'utf-8').split('\n');
    }

    function writeLines(allLines: string[]) {
        fs.writeFileSync(manifestPath, allLines.join('\n'));
    }

    function findTagRange(allLines: string[], tag: string) {
        const start = allLines.findIndex(line => line.trim().startsWith(`<${tag}`));
        if (start === -1) return undefined;

        let end = start;
        while (end < allLines.length && !allLines[end].trim().endsWith('>')) {
            end++;
        }
        if (end >= allLines.length) return undefined;

        return {start, end};
    }

    function ensureAttribute(tag: string, attribute: string, value: string) {
        const allLines = readLines();
        const range = findTagRange(allLines, tag);
        if (!range) {
            console.warn(`Could not find <${tag}> in AndroidManifest.xml, skipping '${attribute}'.`);
            return;
        }

        const escapedValue = escapeXml(value);
        const attributeRegex = new RegExp(`(${escapeRegExp(attribute)}=")[^"]*"`);

        for (let i = range.start; i <= range.end; i++) {
            if (allLines[i].includes(`${attribute}=`)) {
                allLines[i] = allLines[i].replace(attributeRegex, `$1${escapedValue}"`);
                writeLines(allLines);
                return;
            }
        }

        let indent = ' ';
        if (range.end > range.start) {
            const nextLine = allLines[range.start + 1];
            const trimIndex = nextLine.indexOf(nextLine.trim());
            indent = '\n' + (trimIndex > 0 ? nextLine.substring(0, trimIndex) : '    ');
        }
        allLines[range.start] = allLines[range.start].replace(`<${tag}`, `<${tag}${indent}${attribute}="${escapedValue}"`);

        writeLines(allLines);
    }

    function ensureToolsReplace(attributes: string[]) {
        const allLines = readLines();
        const range = findTagRange(allLines, 'application');
        if (!range) return;

        let existing: string | undefined;
        for (let i = range.start; i <= range.end; i++) {
            const match = /tools:replace="([^"]*)"/.exec(allLines[i]);
            if (match) {
                existing = match[1];
                break;
            }
        }

        const merged = existing
            ? existing.split(',').map(value => value.trim()).filter(Boolean)
            : [];
        for (const attribute of attributes) {
            if (!merged.includes(attribute)) merged.push(attribute);
        }

        ensureAttribute('application', 'tools:replace', merged.join(','));
    }

    /**
     * Sets application@android:label and makes sure tools:replace covers it.
     */
    function ensureApplicationLabel(label: string) {
        ensureAttribute('manifest', 'xmlns:tools', 'http://schemas.android.com/tools');
        ensureToolsReplace(['android:label']);
        ensureAttribute('application', 'android:label', label);
    }

    /**
     * Adds a `<uses-permission>` entry before `<application>` if it is missing.
     */
    function ensurePermission(permission: string) {
        const name = permission.includes('.') ? permission : `android.permission.${permission}`;
        const allLines = readLines();

        if (allLines.some(line => line.includes(`android:name="${name}"`))) {
            return false;
        }

        const appIndex = allLines.findIndex(line => line.trim().startsWith('<application'));
        if (appIndex === -1) {
            console.warn('Could not find <application> in AndroidManifest.xml, skipping permission.');
            return false;
        }

        const applicationLine = allLines[appIndex];
        const trimIndex = applicationLine.indexOf(applicationLine.trim());
        const indent = trimIndex >= 0 ? applicationLine.substring(0, trimIndex) : '';
        allLines.splice(appIndex, 0, `${indent}<uses-permission android:name="${escapeXml(name)}"/>`);
        writeLines(allLines);
        return true;
    }

    const updateOrCreateMetaData = (name: string, resource: string) => {
        const allLines = readLines();
        const index = allLines.findIndex(line => line.includes(`android:name="${name}"`));
        if (index !== -1) {
            // Update the existing metadata resource
            const regex = /android:resource="[^"]*"/g;
            for (let i = index; i < allLines.length; i++) {
                if (allLines[i].match(regex)) {
                    allLines[i] = allLines[i].replace(regex, `android:resource="${escapeXml(resource)}"`);
                    break;
                }
                if (allLines[i].endsWith('>')) {
                    break;
                }
            }
        } else {
            const appEndIndex = allLines.findIndex(line => line.includes('</application>'));
            if (appEndIndex === -1) {
                console.warn('Could not find </application> in AndroidManifest.xml, skipping metadata update.');
                return;
            }
            const indent = allLines[appEndIndex].substring(0, allLines[appEndIndex].indexOf('</application>'));
            const childIndent = `${indent}    `;
            allLines.splice(appEndIndex, 0,
                `${childIndent}<meta-data`,
                `${childIndent}    android:name="${escapeXml(name)}"`,
                `${childIndent}    android:resource="${escapeXml(resource)}" />`
            );
        }

        writeLines(allLines);
    };

    return {
        ensureAttribute,
        ensureApplicationLabel,
        ensurePermission,
        updateOrCreateMetaData,
    }
}
