import {RenameConfig} from "./yaml_parser.ts";
import {useAndroidManifest} from "./useAndroidManifest.ts";
import {useInfoPlist} from "./useInfoPlist.ts";
import fs from 'fs';

export function useNamer(config: RenameConfig) {
    function updateName() {
        const manifest = useAndroidManifest();
        if (manifest) {
            manifest.ensureAttribute('application', 'android:label', config.appName);
            console.log(`- Android App Name (label) updated to ${config.appName}`);
        }

        const infoPlist = useInfoPlist('./ios/Runner/Info.plist');
        infoPlist.ensureKeyValue('CFBundleDisplayName', `<string>${config.appName}</string>`);
        infoPlist.ensureKeyValue('CFBundleName', `<string>${config.appName}</string>`);
        console.log(`- iOS App Name (CFBundleDisplayName and CFBundleName) updated to ${config.appName}`);
    }

    function updateBundleIdentifier() {
        const manifest = useAndroidManifest();
        if (manifest) {
            manifest.ensureAttribute('manifest', 'package', config.applicationId);
            console.log(`- Android Manifest Package updated to ${config.applicationId}`);
        }

        // 2. Update build.gradle applicationId
        const buildGradlePaths = ['./android/app/build.gradle', './android/app/build.gradle.kts'];
        const regex = /applicationId[\s:]*"[^"]+"/g;
        if (buildGradlePaths.every(p => !fs.existsSync(p))) {
            console.error(`Error: Neither build.gradle nor build.gradle.kts file found in ./android/app/.`);
        } else {
            for (const p of buildGradlePaths) {
                if (fs.existsSync(p)) {
                    try {
                        let content = fs.readFileSync(p, 'utf-8');
                        fs.writeFileSync(p, content.replace(regex, `applicationId "${config.applicationId}"`));
                        console.log(`- Android Application ID (${p.split('/').pop()}) updated to ${config.applicationId}`);
                    } catch (e) {
                        console.error(`Error updating Android ${p.split('/').pop()} at ${p}:`, e);
                    }
                }
            }
        }

        // 3. Update iOS project.pbxproj PRODUCT_BUNDLE_IDENTIFIER
        const projPath = './ios/Runner.xcodeproj/project.pbxproj';
        try {
            let projContent = fs.readFileSync(projPath, 'utf-8');
            // Regex handles multiple PRODUCT_BUNDLE_IDENTIFIER definitions (e.g., Debug/Release)
            const regex = /PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g;
            projContent = projContent.replace(regex, `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleIdentifier};`);
            fs.writeFileSync(projPath, projContent);
            console.log(`- iOS Bundle Identifier (project.pbxproj) updated to ${config.bundleIdentifier}`);
        } catch (e) {
            if (e instanceof Error && e.message.includes('no such file or directory')) {
                console.error(`Error: project.pbxproj file not found at ${projPath}.`);
            } else {
                console.error(`Error updating iOS project.pbxproj at ${projPath}:`, e);
            }
        }
    }

    return {
        execute: function () {
            updateName();
            updateBundleIdentifier();
        }
    }
}