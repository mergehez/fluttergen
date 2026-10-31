import fs from "fs";
import {AppInfoConfig} from "./yamlParser.ts";
import {useAndroidManifest} from "fileHandler/useAndroidManifest.ts";
import {usePlist} from "fileHandler/usePlist.ts";
import {useBuildGradle} from "fileHandler/useBuildGradle.ts";
import {usePropertiesFile} from "fileHandler/usePropertiesFile.ts";

const IOS_INFO_PLIST = './ios/Runner/Info.plist';
const IOS_PBXPROJ = './ios/Runner.xcodeproj/project.pbxproj';

function hasAndroidGradle(folder: 'android' | 'android/app') {
    return fs.existsSync(`./${folder}/build.gradle.kts`) || fs.existsSync(`./${folder}/build.gradle`);
}

/**
 * Normalizes a configured Gradle version into a wrapper distribution file name.
 * `8.14` -> `gradle-8.14-all.zip`, `8.14-bin` -> `gradle-8.14-bin.zip`.
 */
export function normalizeGradleDistribution(input: string): string {
    let version = input.trim();
    if (!version.startsWith('gradle-')) {
        version = `gradle-${version}`;
    }
    if (!version.endsWith('.zip')) {
        version = `${version}.zip`;
    }
    if (!/-(all|bin)\.zip$/.test(version)) {
        version = version.replace(/\.zip$/, '-all.zip');
    }
    return version;
}

export function useInfoHandler(config: AppInfoConfig) {
    return {
        execute: function (options: { platform?: 'ios' | 'android' | 'all' } = {}) {
            const platform = options.platform ?? 'all';
            const includeIos = platform !== 'android';
            const includeAndroid = platform !== 'ios';

            if (includeAndroid) {
                // update app name in AndroidManifest.xml
                const androidManifest = useAndroidManifest();
                if (androidManifest) {
                    androidManifest.ensureApplicationLabel(config.appName);
                    console.log(`- Android App Name (label) updated to ${config.appName}`);
                }

                // Update applicationId in build.gradle
                if (hasAndroidGradle('android/app')) {
                    useBuildGradle('android/app').update('applicationId', config.applicationId, 'string');
                }
            }

            if (includeIos) {
                // update app name in Info.plist
                if (fs.existsSync(IOS_INFO_PLIST)) {
                    const plist = usePlist(IOS_INFO_PLIST);
                    plist.set('CFBundleDisplayName', 'string', config.appName);
                    plist.set('CFBundleName', 'string', config.appName);
                    console.log(`- iOS App Name (CFBundleDisplayName and CFBundleName) updated to ${config.appName}`);
                } else {
                    console.log(`- ${IOS_INFO_PLIST} not found, skipping iOS app name update.`);
                }

                // Update bundle identifier and signing settings in iOS project.pbxproj
                if (fs.existsSync(IOS_PBXPROJ)) {
                    const pbxproj = fs.readFileSync(IOS_PBXPROJ, 'utf-8');
                    let updated = pbxproj.replace(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g, (_match, current: string) => {
                        const bundleId = current.trim();
                        // Keep the test target's bundle identifier distinct from the app's.
                        if (bundleId.endsWith('.RunnerTests')) {
                            return `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleIdentifier}.RunnerTests;`;
                        }
                        return `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleIdentifier};`;
                    });

                    if (config.iosDevelopmentTeam) {
                        updated = updated.replace(/(DEVELOPMENT_TEAM) = [^;]+;/g, `$1 = ${config.iosDevelopmentTeam};`);
                    }

                    if (config.iosMinVersion) {
                        updated = updated.replace(/(IPHONEOS_DEPLOYMENT_TARGET) = [^;]+;/g, `$1 = ${config.iosMinVersion};`);
                    }

                    fs.writeFileSync(IOS_PBXPROJ, updated);

                    console.log(`- iOS Bundle Identifier updated to ${config.bundleIdentifier}`);
                    if (config.iosDevelopmentTeam) {
                        console.log(`- iOS Development Team (DEVELOPMENT_TEAM) updated to ${config.iosDevelopmentTeam}`);
                    }
                    if (config.iosMinVersion) {
                        console.log(`- iOS Minimum Deployment Target (IPHONEOS_DEPLOYMENT_TARGET) updated to ${config.iosMinVersion}`);
                    }
                } else {
                    console.log(`- ${IOS_PBXPROJ} not found, skipping iOS project updates.`);
                }
            }

            if (includeAndroid && config.androidMinSdkVersion && hasAndroidGradle('android/app')) {
                const buildGradle = useBuildGradle('android/app');
                const updated = buildGradle.update('minSdk', config.androidMinSdkVersion, 'int', true)
                    || buildGradle.update('minSdkVersion', config.androidMinSdkVersion, 'int');
                if (updated) {
                    console.log(`- Android Minimum SDK Version updated to ${config.androidMinSdkVersion}`);
                }
            }

            if (includeAndroid && config.ndkVersion && hasAndroidGradle('android/app')) {
                useBuildGradle('android/app').update('ndkVersion', config.ndkVersion, 'string');
            }

            if (includeAndroid && config.gradleVersion) {
                const wrapperPath = './android/gradle/wrapper/gradle-wrapper.properties';
                if (!fs.existsSync(wrapperPath)) {
                    console.log(`- ${wrapperPath} not found, skipping Gradle version update.`);
                } else {
                    const distribution = normalizeGradleDistribution(config.gradleVersion);
                    usePropertiesFile(wrapperPath).set('distributionUrl', `https://services.gradle.org/distributions/${distribution}`);
                    console.log(`- Gradle Version (distributionUrl) updated to ${config.gradleVersion}`);
                }
            }
        }
    }
}