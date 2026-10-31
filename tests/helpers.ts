import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDirs: string[] = [];

export function makeTempDir(prefix = 'fluttergen-test-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
}

export function cleanupTempDirs() {
    for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, {recursive: true, force: true});
    }
}

export async function inTempDir(fn: (dir: string) => void | Promise<void>) {
    const dir = makeTempDir();
    const previousCwd = process.cwd();
    process.chdir(dir);
    try {
        await fn(dir);
    } finally {
        process.chdir(previousCwd);
    }
}

export function writeFixture(filePath: string, content: string) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, content);
}

export const plistFixture = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;

export const pbxprojFixture = `// !$*UTF8*$!
{
    archiveVersion = 1;
    classes = {
    };
    objectVersion = 56;
    objects = {

/* Begin PBXFileReference section */
        97C146E61CF9000F007C117D /* Runner.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Runner.app; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
        97C146F01CF9000F007C117D /* Runner */ = {
            isa = PBXGroup;
            children = (
            );
            path = Runner;
            sourceTree = "<group>";
        };
        97C146EE1CF9000F007C117D = {
            isa = PBXGroup;
            children = (
                97C146F01CF9000F007C117D /* Runner */,
            );
            sourceTree = "<group>";
        };
/* End PBXGroup section */

/* Begin PBXProject section */
        97C146E81CF9000F007C117D /* Project object */ = {
            isa = PBXProject;
            attributes = {
            };
            buildConfigurationList = 97C146EB1CF9000F007C117D;
            compatibilityVersion = "Xcode 14.0";
            developmentRegion = en;
            hasScannedForEncodings = 0;
            knownRegions = (
                en,
                Base,
            );
            mainGroup = 97C146EE1CF9000F007C117D;
            productRefGroup = 97C146EE1CF9000F007C117D;
            projectDirPath = "";
            projectRoot = "";
            targets = (
            );
        };
/* End PBXProject section */

/* Begin XCBuildConfiguration section */
        97C147031CF9000F007C117D /* Debug */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
                ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
            };
            name = Debug;
        };
/* End XCBuildConfiguration section */

        97C146EB1CF9000F007C117D = {
            isa = XCConfigurationList;
            buildConfigurations = (
                97C147031CF9000F007C117D /* Debug */,
            );
            defaultConfigurationIsVisible = 0;
            defaultConfigurationName = Release;
        };
    };
    rootObject = 97C146E81CF9000F007C117D;
}
`;

