import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import {cleanupTempDirs, inTempDir, writeFixture} from './helpers.ts';
import {useInfoHandler} from '../src/useInfoHandler.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';

afterEach(cleanupTempDirs);

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Old</string>
    <key>CFBundleDisplayName</key>
    <string>Old</string>
</dict>
</plist>
`;

const pbxproj = `// !$*UTF8*$!
{
    objects = {
        111 /* Debug */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
                PRODUCT_BUNDLE_IDENTIFIER = com.old.app;
                DEVELOPMENT_TEAM = OLD_TEAM;
                IPHONEOS_DEPLOYMENT_TARGET = 12.0;
            };
            name = Debug;
        };
        222 /* Debug */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
                PRODUCT_BUNDLE_IDENTIFIER = com.old.app.RunnerTests;
                DEVELOPMENT_TEAM = OLD_TEAM;
                IPHONEOS_DEPLOYMENT_TARGET = 12.0;
            };
            name = Debug;
        };
    };
}
`;

const manifest = `<manifest
        xmlns:android="http://schemas.android.com/apk/res/android">
    <application
            android:label="Old">
    </application>
</manifest>
`;

const appGradle = `android {
    defaultConfig {
        applicationId = "com.old"
        minSdk = flutter.minSdkVersion
        ndkVersion = flutter.ndkVersion
    }
}
`;

const wrapper = `distributionBase=GRADLE_USER_HOME
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.0-all.zip
`;

function writeIosProject() {
    writeFixture('ios/Runner/Info.plist', infoPlist);
    writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxproj);
}

function writeAndroidProject() {
    writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
    writeFixture('android/app/build.gradle.kts', appGradle);
    writeFixture('android/gradle/wrapper/gradle-wrapper.properties', wrapper);
}

const config = {
    appName: 'My App',
    bundleIdentifier: 'com.new.app',
    applicationId: 'com.new.app',
    iosDevelopmentTeam: 'TEAM123',
    iosMinVersion: '13.0',
    androidMinSdkVersion: 21,
    ndkVersion: '27.0.12077973',
    gradleVersion: '8.14-bin',
};

describe('useInfoHandler', () => {
    test('updates iOS and Android metadata together', async () => {
        await inTempDir(() => {
            writeIosProject();
            writeAndroidProject();

            useInfoHandler(config).execute();

            const plist = usePlist('ios/Runner/Info.plist');
            expect(plist.getSimple('CFBundleName')).toBe('My App');
            expect(plist.getSimple('CFBundleDisplayName')).toBe('My App');

            const project = fs.readFileSync('ios/Runner.xcodeproj/project.pbxproj', 'utf-8');
            expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.new.app;');
            expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.new.app.RunnerTests;');
            expect(project).toContain('DEVELOPMENT_TEAM = TEAM123;');
            expect(project).toContain('IPHONEOS_DEPLOYMENT_TARGET = 13.0;');

            const manifestContent = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(manifestContent).toContain('android:label="My App"');
            expect(manifestContent).toContain('tools:replace="android:label"');

            const gradle = fs.readFileSync('android/app/build.gradle.kts', 'utf-8');
            expect(gradle).toContain('applicationId = "com.new.app"');
            expect(gradle).toContain('minSdk = 21');
            expect(gradle).toContain('ndkVersion = "27.0.12077973"');

            const wrapperContent = fs.readFileSync('android/gradle/wrapper/gradle-wrapper.properties', 'utf-8');
            expect(wrapperContent).toContain('gradle-8.14-bin.zip');
        });
    });

    test('runs on an iOS-only project without creating Android files', async () => {
        await inTempDir(() => {
            writeIosProject();

            expect(() => useInfoHandler(config).execute()).not.toThrow();
            expect(fs.existsSync('android')).toBe(false);
            expect(usePlist('ios/Runner/Info.plist').getSimple('CFBundleName')).toBe('My App');
        });
    });

    test('runs on an Android-only project without creating iOS files', async () => {
        await inTempDir(() => {
            writeAndroidProject();

            expect(() => useInfoHandler(config).execute()).not.toThrow();
            expect(fs.existsSync('ios')).toBe(false);
            expect(fs.readFileSync('android/app/build.gradle.kts', 'utf-8')).toContain('minSdk = 21');
        });
    });

    test('preserves an explicit -all distribution', async () => {
        await inTempDir(() => {
            writeAndroidProject();
            useInfoHandler({...config, gradleVersion: 'gradle-8.14-all.zip'}).execute();

            expect(fs.readFileSync('android/gradle/wrapper/gradle-wrapper.properties', 'utf-8'))
                .toContain('gradle-8.14-all.zip');
        });
    });
});
