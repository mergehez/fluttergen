import fs from "fs";

export function useInfoPlist(infoPlistPath: string) {

    return {
        ensureKeyValue: function (key: string, valueLine: string) {
            let infoPlistContent = fs.readFileSync(infoPlistPath, 'utf-8');
            const lines = infoPlistContent.split('\n');
            const index = lines.findIndex(line => line.includes(`<key>${key}</key>`));
            if (index === -1) {
                // add the key before </dict>
                const dictEndIndex = lines.findIndex(line => line.includes('</dict>'));
                lines.splice(dictEndIndex, 0,
                    `\t<key>${key}</key>`,
                    `\t${valueLine}`
                );
                infoPlistContent = lines.join('\n');
                fs.writeFileSync(infoPlistPath, infoPlistContent);
            } else if (!lines[index + 1].includes(valueLine)) {
                // update the existing value
                lines[index + 1] = `\t${valueLine}`;
                infoPlistContent = lines.join('\n');
                fs.writeFileSync(infoPlistPath, infoPlistContent);
            } else {
                return;
            }
            console.log(`- iOS Info.plist updated: ${key} = ${valueLine}`);
        },
    }
}