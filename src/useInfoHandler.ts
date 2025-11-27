import {AppInfoConfig} from "./yamlParser.ts";
import {useAndroidManifest} from "./useAndroidManifest.ts";
import {usePlist} from "./usePlist.ts";
import {replaceInFile, useBuildGradle} from "./useBuildGradle.ts";
import {usePropertiesFile} from "./usePropertiesFile.ts";

export function useInfoHandler(config: AppInfoConfig) {
    return {
        execute: function () {
            // update app name in AndroidManifest.xml
            const androidManifest = useAndroidManifest();
            if (androidManifest) {
                androidManifest.ensureAttribute('application', 'android:label', config.appName);
                console.log(`- Android App Name (label) updated to ${config.appName}`);
            }

            // update app name in Info.plist
            const appFramework = usePlist('./ios/Flutter/AppFrameworkInfo.plist');
            appFramework.set('CFBundleName', 'string', config.appName);
            console.log(`- iOS App Name in AppFrameworkInfo.plist updated to ${config.appName}`);

            const plist = usePlist('./ios/Runner/Info.plist');
            plist.set('CFBundleDisplayName', 'string', config.appName);
            plist.set('CFBundleName', 'string', config.appName);
            console.log(`- iOS App Name (CFBundleDisplayName and CFBundleName) updated to ${config.appName}`);

            // Update applicationId in build.gradle
            const buildGradle = useBuildGradle('android/app')
            buildGradle.update('applicationId', config.applicationId, 'string');

            // Update bundle identifier in iOS project.pbxproj
            appFramework.set('CFBundleIdentifier', 'string', config.bundleIdentifier);
            replaceInFile(
                './ios/Runner.xcodeproj/project.pbxproj',
                new RegExp(`(PRODUCT_BUNDLE_IDENTIFIER) = [^;]+;`, 'g'),
                `$1 = ${config.bundleIdentifier};`
            );
            console.log(`- iOS Bundle Identifier updated to ${config.bundleIdentifier}`);

            if (config.iosDevelopmentTeam) {
                replaceInFile(
                    './ios/Runner.xcodeproj/project.pbxproj',
                    new RegExp(`(DEVELOPMENT_TEAM) = [^;]+;`, 'g'),
                    `$1 = ${config.iosDevelopmentTeam};`
                );
                console.log(`- iOS Development Team (DEVELOPMENT_TEAM) updated to ${config.iosDevelopmentTeam}`);
            }

            if (config.iosMinVersion) {
                appFramework.set('MinimumOSVersion', 'string', config.iosMinVersion);
                replaceInFile(
                    './ios/Runner.xcodeproj/project.pbxproj',
                    new RegExp(`(IPHONEOS_DEPLOYMENT_TARGET) = [^;]+;`, 'g'),
                    `$1 = ${config.iosMinVersion};`
                );
                console.log(`- iOS Minimum Deployment Target (IPHONEOS_DEPLOYMENT_TARGET) updated to ${config.iosMinVersion}`);
            }

            if (config.androidMinSdkVersion) {
                const buildGradle = useBuildGradle('android');
                buildGradle.update('minSdkVersion', config.androidMinSdkVersion, 'int');
                console.log(`- Android Minimum SDK Version (minSdkVersion) updated to ${config.androidMinSdkVersion}`);
            }

            if (config.ndkVersion) {
                const buildGradle = useBuildGradle('android/app');
                buildGradle.update('ndkVersion', config.ndkVersion, 'string');
                console.log(`- Android NDK Version (ndkVersion) updated to ${config.ndkVersion}`);
            }

            if (config.gradleVersion) {
                let v = config.gradleVersion;
                if (!v.startsWith('gradle-')) {
                    v = `gradle-${v}`;
                }
                if (!v.endsWith('.zip')) {
                    v = `${v}.zip`;
                }
                if (!v.endsWith('-all.zip') || !v.endsWith('-bin.zip')) {
                    v = v.replace('.zip', '-all.zip');
                }
                usePropertiesFile('./android/gradle/wrapper/gradle-wrapper.properties').set('distributionUrl', `https\\://services.gradle.org/distributions/${v}`);
                console.log(`- Gradle Version (distributionUrl) updated to ${config.gradleVersion}`);
            }
        }
    }
}