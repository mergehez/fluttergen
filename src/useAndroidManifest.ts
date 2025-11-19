import path from "path";
import fs from "fs";

export function useAndroidManifest() {
    const manifestPath = path.join('./android/app/src/main/AndroidManifest.xml');

    // // TODO: Remove this line in production; it's only for testing purposes.
    // fs.copyFileSync('./aa/android/app/src/main/AndroidManifest.xml', manifestPath, fs.constants.COPYFILE_FICLONE);

    if (!fs.existsSync(manifestPath)) {
        console.error(`AndroidManifest.xml not found at ${manifestPath}. Skipping manifest update.`);
        return undefined;
    }

    let content = fs.readFileSync(manifestPath, 'utf-8');
    const allLines = content.split('\n');

    function ensureAttribute(tag: string, attribute: string, value: string) {
        const tagLineIndex = allLines.findIndex(line => line.trim().startsWith(`<${tag}`));
        if (tagLineIndex === -1) return;

        const attrLines = [allLines[tagLineIndex]];
        let currentLineIndex = tagLineIndex;
        while (!allLines[currentLineIndex].trim().endsWith('>')) {
            currentLineIndex++;
            attrLines.push(allLines[currentLineIndex]);
        }
        const existingLine = attrLines.findIndex(line => line.includes(attribute + '='));
        if (existingLine !== -1) {
            allLines[tagLineIndex + existingLine] = attrLines[existingLine].replace(new RegExp(`${attribute}="[^"]*"`), `${attribute}="${value}"`);
        } else {
            const indent = attrLines.length > 1 ? '\n' + attrLines[1].substring(0, attrLines[1].indexOf(attrLines[1].trim())) : ' ';
            allLines[tagLineIndex] = allLines[tagLineIndex].replace(`<${tag}`, `<${tag}${indent}${attribute}="${value}"`);
        }
    }

    ensureAttribute('manifest', 'xmlns:tools', 'http://schemas.android.com/tools');
    ensureAttribute('activity', 'tools:replace', 'android:label');

    const updateOrCreateMetaData = (name: string, resource: string) => {
        const index = allLines.findIndex(line => line.includes(`android:name="${name}"`));
        if (index !== -1) {
            // Update the existing metadata resource
            const regex = /android:resource="[^"]*"/;
            allLines[index] = allLines[index].replace(regex, `android:resource="${resource}"`);
        } else {
            const appEndIndex = allLines.findIndex(line => line.includes('</application>'));
            const indent = allLines[appEndIndex].substring(0, allLines[appEndIndex].indexOf('</application>'));
            allLines.splice(appEndIndex, 0,
                `\n${indent}\t<meta-data\n${indent}\t\tandroid:name="${name}"\n${indent}\t\tandroid:resource="${resource}" />`
            );
        }
    };

    return {
        ensureAttribute,
        updateOrCreateMetaData,
        save: (message?: string) => {
            fs.writeFileSync(manifestPath, allLines.join('\n'));
            console.log(message || "- AndroidManifest.xml updated.");
        }
    }
}