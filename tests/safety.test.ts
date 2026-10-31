import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import {cleanupTempDirs, inTempDir, writeFixture} from './helpers.ts';
import {
    diffSnapshots,
    restoreBackup,
    restoreSnapshot,
    takeSnapshot,
    writeBackup,
} from '../src/safety.ts';

afterEach(cleanupTempDirs);

const originalPlist = '<?xml version="1.0"?>\n<plist version="1.0"><dict/></plist>\n';

describe('safety', () => {
    test('snapshots, diffs and restores files', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.0.0+1\n');
            writeFixture('ios/Runner/Info.plist', originalPlist);

            const before = takeSnapshot();

            fs.writeFileSync('pubspec.yaml', 'name: app\nversion: 1.0.1+2\n');
            writeFixture('ios/Runner/New.plist', '<plist/>');
            fs.rmSync('ios/Runner/Info.plist');

            const patch = diffSnapshots(before, takeSnapshot());
            expect(patch).toContain('version: 1.0.1+2');
            expect(patch).toContain('ios/Runner/New.plist');
            expect(patch).toContain('Info.plist');

            restoreSnapshot(before);

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toBe('name: app\nversion: 1.0.0+1\n');
            expect(fs.readFileSync('ios/Runner/Info.plist', 'utf-8')).toBe(originalPlist);
            expect(fs.existsSync('ios/Runner/New.plist')).toBe(false);
        });
    });

    test('redacts sensitive files in diffs', async () => {
        await inTempDir(() => {
            writeFixture('android/app/build.gradle.kts', 'android {}\n');
            const before = takeSnapshot();

            writeFixture('android/key.properties', 'storePassword=super-secret\n');

            const patch = diffSnapshots(before, takeSnapshot());
            expect(patch).toContain('Sensitive file changed: android/key.properties');
            expect(patch).not.toContain('super-secret');
        });
    });

    test('creates and restores backups', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.0.0+1\n');
            writeFixture('android/app/build.gradle.kts', 'android {}\n');

            const before = takeSnapshot();
            writeBackup(before);

            fs.writeFileSync('pubspec.yaml', 'name: app\nversion: 9.9.9\n');
            fs.rmSync('android/app/build.gradle.kts');
            writeFixture('android/app/Extra.kt', 'extra');

            restoreBackup();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toBe('name: app\nversion: 1.0.0+1\n');
            expect(fs.readFileSync('android/app/build.gradle.kts', 'utf-8')).toBe('android {}\n');
            expect(fs.existsSync('android/app/Extra.kt')).toBe(false);
        });
    });

    test('fails when no backup exists', async () => {
        await inTempDir(() => {
            expect(() => restoreBackup()).toThrow(/No backup found/);
        });
    });
});
