import xcode from 'xcode'
import fs from "fs";
import path from "path";
import {KnownError} from "knownError.ts";

export function usePbxproj(pbxprojPath: string) {
    if (!fs.existsSync(pbxprojPath)) {
        throw new KnownError(`Project file not found at ${pbxprojPath}`);
    }

    function findGroupKey(proj: any, groupName: string): string | undefined {
        const groups = proj.getPBXObject('PBXGroup') as Record<string, any>;
        for (const [key, value] of Object.entries(groups)) {
            // xcode stores a "<uuid>_comment" entry holding the group's display name.
            if (key.endsWith('_comment') && value === groupName) {
                return key.replace(/_comment$/, '');
            }
            if (value && typeof value === 'object') {
                const name = typeof value.name === 'string' ? value.name.replaceAll('"', '') : undefined;
                const groupPath = typeof value.path === 'string' ? value.path.replaceAll('"', '') : undefined;
                if (name === groupName || groupPath === groupName || key === groupName) {
                    return key;
                }
            }
        }
        return undefined;
    }

    // TODO: check if all entitlements are added the same way (this is the case for 'Runner.entitlements')
    function addEntitlements(fileName: string, groupName: string, isCodeSign: boolean | number = false) {
        const projectDir = path.dirname(path.dirname(pbxprojPath));
        const entitlementsPath = path.join(projectDir, groupName, fileName);
        if (!fs.existsSync(entitlementsPath)) {
            console.warn(`Warning: entitlements file not found at ${entitlementsPath}`);
        }

        const proj = xcode.project(pbxprojPath);
        proj.parseSync();

        const groupKey = findGroupKey(proj, groupName);
        if (!groupKey) {
            throw new KnownError(`Could not find the '${groupName}' group in ${pbxprojPath}`);
        }

        proj.addFile(fileName, groupKey, {lastKnownFileType: "text.plist.entitlements", path: fileName, sourceTree: `"<group>"`});

        if (isCodeSign) {
            Object.values(proj.pbxXCBuildConfigurationSection())
                .filter((c: any) => c && typeof c === 'object' && c.buildSettings?.ASSETCATALOG_COMPILER_APPICON_NAME)
                .forEach((c: any) => c.buildSettings.CODE_SIGN_ENTITLEMENTS = `${groupName}/${fileName}`);
        }

        // The xcode package serialises missing options as `key = undefined;`.
        // Strip those keys so Xcode does not receive an invalid project file.
        const content = proj.writeSync({}).replace(/[ \t]+[\w]+ = undefined;/g, '');
        fs.writeFileSync(pbxprojPath, content);
    }

    return {
        addEntitlements: addEntitlements,
    }
}
