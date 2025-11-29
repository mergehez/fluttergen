import xcode from 'xcode'
import fs from "fs";

export function usePbxproj(pbxprojPath: string) {
    if (!fs.existsSync(pbxprojPath)) {
        console.error(`Error: Project file not found at ${pbxprojPath}`);
        // return false;
    }

    // TODO: check if all entitlements are added the same way (this is the case for 'Runner.entitlements')
    function addEntitlements(fileName: string, groupName: string, isCodeSign: boolean | number = false) {
        const proj = xcode.project(pbxprojPath);
        proj.parseSync();

        const groupKey = Object.entries(proj.getPBXObject("PBXGroup")).filter(t => t[1] === groupName)[0]?.[0].replace('_comment', '');
        proj.addFile(fileName, groupKey, {lastKnownFileType: "text.plist.entitlements", path: fileName, sourceTree: `"<group>"`});

        if (isCodeSign)
            Object.values(proj.pbxXCBuildConfigurationSection())
                .filter((c: any) => c && typeof c === 'object' && c.buildSettings?.ASSETCATALOG_COMPILER_APPICON_NAME)
                .forEach((c: any) => c.buildSettings.CODE_SIGN_ENTITLEMENTS = `${groupName}/${fileName}`);

        fs.writeFileSync(pbxprojPath, proj.writeSync({}));
        // console.log(`✅ Successfully saved changes to ${pbxprojPath}`);
    }

    return {
        addEntitlements: addEntitlements,
    }
}
