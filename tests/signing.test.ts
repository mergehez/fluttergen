import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import path from 'path';
import {cleanupTempDirs, inTempDir, pbxprojFixture, writeFixture} from './helpers.ts';
import {useSigning} from '../src/useSigning.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';

afterEach(cleanupTempDirs);

function signingConfig(signing: any) {
    return {signing, variables: {}, workflows: {}, prescripts: [], postscripts: []} as any;
}

describe('useSigning', () => {
    test('writes Android credentials and applies the signing script', async () => {
        await inTempDir(() => {
            writeFixture('android/app/build.gradle.kts', 'android {\n    compileSdk = 36\n}\n');

            useSigning(signingConfig({
                android: {
                    storeFile: '../keystore/release.jks',
                    storePassword: 'store-pass',
                    keyAlias: 'release',
                    keyPassword: 'key-pass',
                },
            })).execute();

            const properties = fs.readFileSync('android/key.properties', 'utf-8');
            expect(properties).toContain('storeFile=../keystore/release.jks');
            expect(properties).toContain('storePassword=store-pass');
            expect(properties).toContain('keyAlias=release');
            expect(properties).toContain('keyPassword=key-pass');

            const gradleScript = fs.readFileSync('android/signing.gradle', 'utf-8');
            expect(gradleScript).toContain('signingConfigs');
            expect(gradleScript).toContain('buildTypes');
            expect(gradleScript).toContain("keystoreProperties['storePassword']");

            const buildFile = fs.readFileSync('android/app/build.gradle.kts', 'utf-8');
            expect(buildFile).toContain('apply(from = "signing.gradle")');
            expect(buildFile.match(/fluttergen: signing/g)).toHaveLength(1);
        });
    });

    test('applies the signing script to Groovy projects and stays idempotent', async () => {
        await inTempDir(() => {
            writeFixture('android/app/build.gradle', 'android {\n}\n');
            const config = signingConfig({android: {keystore: 'release.jks', storePassword: 'pass'}});

            useSigning(config).execute();
            useSigning(config).execute();

            const buildFile = fs.readFileSync('android/app/build.gradle', 'utf-8');
            expect(buildFile).toContain('apply from: "signing.gradle"');
            expect(buildFile.match(/fluttergen: signing/g)).toHaveLength(1);
        });
    });

    test('writes iOS entitlements and updates the development team', async () => {
        await inTempDir(() => {
            const project = pbxprojFixture.replace(
                'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;',
                'ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n                DEVELOPMENT_TEAM = OLD_TEAM;'
            );
            writeFixture('ios/Runner.xcodeproj/project.pbxproj', project);
            writeFixture('ios/Runner/Info.plist', '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict/>\n</plist>\n');
            writeFixture('ios/Runner/Runner.entitlements', [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<plist version="1.0">',
                '<dict>',
                '    <key>existing-key</key>',
                '    <string>keep-me</string>',
                '</dict>',
                '</plist>',
                '',
            ].join('\n'));

            const config = signingConfig({
                ios: {
                    team: 'NEW_TEAM',
                    entitlements: {
                        'aps-environment': 'development',
                        'com.apple.developer.associated-domains': ['applinks:example.com'],
                    },
                },
            });

            useSigning(config).execute();
            useSigning(config).execute();

            const updatedProject = fs.readFileSync('ios/Runner.xcodeproj/project.pbxproj', 'utf-8');
            expect(updatedProject).toContain('DEVELOPMENT_TEAM = NEW_TEAM;');
            expect(updatedProject).toContain('CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;');
            expect(updatedProject).not.toContain('= undefined;');
            expect((updatedProject.match(/path = "Runner\.entitlements";/g) ?? [])).toHaveLength(1);

            const entitlements = usePlist('ios/Runner/Runner.entitlements');
            expect(entitlements.getSimple('aps-environment')).toBe('development');
            expect(entitlements.getSimple('existing-key')).toBe('keep-me');
            expect(entitlements.getComplex('com\\.apple\\.developer\\.associated-domains'))
                .toEqual(['applinks:example.com']);
        });
    });

    test('rejects invalid entitlements file names', async () => {
        await inTempDir(() => {
            writeFixture('ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json', '{}');

            expect(() => useSigning(signingConfig({
                ios: {
                    entitlements: {'aps-environment': 'development'},
                    entitlementsFile: '../evil.plist',
                },
            })).execute()).toThrow(/\.entitlements/);
        });
    });

    test('skips missing platform directories without throwing', async () => {
        await inTempDir(() => {
            expect(() => useSigning(signingConfig({
                android: {storePassword: 'pass'},
                ios: {team: 'TEAM', entitlements: {'aps-environment': 'development'}},
            })).execute()).not.toThrow();

            expect(fs.existsSync('android/signing.gradle')).toBe(false);
            expect(fs.existsSync('ios/Runner/Runner.entitlements')).toBe(false);
        });
    });
});
