import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import {execSync} from 'child_process';
import {cleanupTempDirs, inTempDir, plistFixture, writeFixture} from './helpers.ts';
import {bumpVersion, parseVersionString, runRelease} from '../src/useRelease.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';

afterEach(cleanupTempDirs);

function releaseConfig(release: any = {}) {
    return {release, variables: {}, workflows: {}, prescripts: [], postscripts: []} as any;
}

function writeProject(version: string) {
    writeFixture('pubspec.yaml', `name: app\nversion: ${version}\n`);
    writeFixture('android/app/build.gradle.kts', [
        'android {',
        '    defaultConfig {',
        '        versionName = flutter.versionName',
        '        versionCode = flutter.versionCode',
        '    }',
        '}',
        '',
    ].join('\n'));
    writeFixture('ios/Runner/Info.plist', plistFixture.replace(
        '<dict>',
        '<dict>\n    <key>CFBundleShortVersionString</key>\n    <string>0.0.1</string>\n    <key>CFBundleVersion</key>\n    <string>1</string>'
    ));
}

function initRepo() {
    execSync('git init -q');
    execSync('git config user.email test@example.com');
    execSync('git config user.name Test');
    execSync('git add .');
    execSync('git commit -qm init');
}

describe('version helpers', () => {
    test('parses versions', () => {
        expect(parseVersionString('1.2.3+4')).toEqual({major: 1, minor: 2, patch: 3, build: 4});
        expect(parseVersionString('1.2.3')).toEqual({major: 1, minor: 2, patch: 3, build: undefined});
        expect(() => parseVersionString('1.2')).toThrow(/Invalid version format/);
    });

    test('bumps versions', () => {
        expect(bumpVersion('1.2.3+4', 'patch', true)).toEqual({version: '1.2.4+5', versionName: '1.2.4', build: 5});
        expect(bumpVersion('1.2.3+4', 'minor', true)).toEqual({version: '1.3.0+5', versionName: '1.3.0', build: 5});
        expect(bumpVersion('1.2.3+4', 'major', true)).toEqual({version: '2.0.0+5', versionName: '2.0.0', build: 5});
        expect(bumpVersion('1.2.3+4', false, true)).toEqual({version: '1.2.3+5', versionName: '1.2.3', build: 5});
        expect(bumpVersion('1.2.3+4', 'patch', false)).toEqual({version: '1.2.4+4', versionName: '1.2.4', build: 4});
        expect(bumpVersion('1.2.3', 'patch', true)).toEqual({version: '1.2.4+1', versionName: '1.2.4', build: 1});
    });
});

describe('runRelease', () => {
    test('bumps, syncs, writes a changelog and tags', async () => {
        await inTempDir(() => {
            writeProject('1.2.3+4');
            initRepo();

            const result = runRelease(releaseConfig({
                changelog: 'Notes for release',
                tag: 'v{version}',
            }), {bump: 'minor'});

            expect(result.version).toBe('1.3.0+5');
            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 1.3.0+5');

            const gradle = fs.readFileSync('android/app/build.gradle.kts', 'utf-8');
            expect(gradle).toContain('versionName = "1.3.0"');
            expect(gradle).toContain('versionCode = 5');

            const plist = usePlist('ios/Runner/Info.plist');
            expect(plist.getSimple('CFBundleShortVersionString')).toBe('1.3.0');
            expect(plist.getSimple('CFBundleVersion')).toBe('5');

            const changelog = fs.readFileSync('CHANGELOG.md', 'utf-8');
            expect(changelog).toContain('## 1.3.0+5');
            expect(changelog).toContain('- Notes for release');

            expect(execSync('git tag').toString()).toContain('v1.3.0+5');
        });
    });

    test('dry runs do not change files or create tags', async () => {
        await inTempDir(() => {
            writeProject('2.0.0+1');
            initRepo();

            const result = runRelease(releaseConfig({
                changelog: true,
                tag: true,
            }), {bump: 'major', dryRun: true});

            expect(result).toMatchObject({
                previousVersion: '2.0.0+1',
                version: '3.0.0+2',
                versionName: '3.0.0',
                build: 2,
                dryRun: true,
            });
            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 2.0.0+1');
            expect(fs.existsSync('CHANGELOG.md')).toBe(false);
            expect(execSync('git tag').toString().trim()).toBe('');
        });
    });

    test('rejects invalid versions and missing pubspec versions', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\nversion: "1.2"\n');
            expect(() => runRelease(releaseConfig())).toThrow(/Invalid version format/);
        });

        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\n');
            expect(() => runRelease(releaseConfig())).toThrow(/No version found/);
        });
    });
});
