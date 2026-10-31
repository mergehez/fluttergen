import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {spawnSync} from 'child_process';
import {cleanupTempDirs, makeTempDir, plistFixture, writeFixture} from './helpers.ts';

afterEach(cleanupTempDirs);

const entry = path.resolve(import.meta.dir, '../src/index.ts');
const packageJson = JSON.parse(fs.readFileSync(path.resolve(import.meta.dir, '../package.json'), 'utf-8'));

function runCli(args: string[], cwd: string) {
    return spawnSync(process.execPath, [entry, ...args], {
        cwd,
        encoding: 'utf-8',
        env: {...process.env, FLUTTERGEN_NO_UPDATE_CHECK: '1'},
    });
}

describe('CLI', () => {
    test('prints the current version', () => {
        const result = runCli(['--version'], makeTempDir());

        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`fluttergen current version ${packageJson.version}`);
        expect(result.stderr).toBe('');
    });

    test('supports the -v alias', () => {
        const result = runCli(['-v'], makeTempDir());

        expect(result.status).toBe(0);
        expect(result.stdout).toContain(packageJson.version);
    });

    test('prints help without requiring a pubspec', () => {
        const result = runCli(['--help'], makeTempDir());

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Configuration options:');
        expect(result.stdout).toContain('Available predefined scripts:');
        expect(result.stdout).toContain('notificationIcon');
        expect(result.stdout).toContain('--profile <name>');
    });

    test('reports unknown profiles', () => {
        const dir = makeTempDir();
        writeFixture(path.join(dir, 'pubspec.yaml'), [
            'fluttergen:',
            '  icon:',
            '    path: icon.png',
            "    bgColor: '#fff'",
            '  splash:',
            '    path: splash.png',
            "    bgColor: '#000'",
            '  profiles:',
            '    dev: {}',
        ].join('\n'));

        const result = runCli(['--profile', 'prod'], dir);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Profile 'prod' is not defined");
        expect(result.stderr).toContain('available: dev');
    });

    test('fails clearly when pubspec.yaml is missing', () => {
        const result = runCli([], makeTempDir());

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Required file not found: pubspec.yaml');
    });

    test('fails clearly when the configuration is invalid', () => {
        const dir = makeTempDir();
        writeFixture(path.join(dir, 'pubspec.yaml'), [
            'fluttergen:',
            '  icon:',
            '    path: icon.png',
            "    bgColor: '#fff'",
        ].join('\n'));

        const result = runCli([], dir);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Invalid 'fluttergen' configuration");
        expect(result.stderr).toContain('splash');
        expect(result.stderr).not.toContain('at Object');
    });

    test('does not print an update warning when the check is disabled', () => {
        const result = runCli(['--version'], makeTempDir());
        expect(result.stdout.trim().split('\n')).toHaveLength(1);
    });

    test('lists built-in tasks', () => {
        const result = runCli(['run', '--list'], makeTempDir());

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('flutter.clean');
        expect(result.stdout).toContain('ios.pods.reset');
        expect(result.stdout).toContain('build.apk');
    });

    test('shows usage for run', () => {
        const result = runCli(['run', '--help'], makeTempDir());

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('fluttergen run <task>');
        expect(result.stdout).toContain('fluttergen run build.apk');
    });

    test('runs a built-in task from the CLI', () => {
        const dir = makeTempDir();
        writeFixture(path.join(dir, 'pubspec.yaml'), 'name: app\nversion: 1.2.3+4\n');

        const result = runCli(['run', 'versionUp'], dir);

        expect(result.status).toBe(0);
        expect(fs.readFileSync(path.join(dir, 'pubspec.yaml'), 'utf-8')).toContain('version: 1.2.4+5');
    });

    test('fails for unknown built-in tasks', () => {
        const result = runCli(['run', 'does.not.exist'], makeTempDir());

        expect(result.status).toBe(1);
        expect(result.stderr).toContain("Unknown task 'does.not.exist'");
    });

    test('prints the JSON schema', () => {
        const result = runCli(['schema'], makeTempDir());

        expect(result.status).toBe(0);
        const schema = JSON.parse(result.stdout);
        expect(schema.properties).toHaveProperty('icon');
        expect(schema.properties).toHaveProperty('release');
    });

    test('supports release dry runs and version bumps', () => {
        const dir = makeTempDir();
        writeFixture(path.join(dir, 'pubspec.yaml'), [
            'name: app',
            'version: 1.0.0+1',
            'fluttergen:',
            '  icon:',
            '    path: assets/icon.png',
            "    bgColor: '#fff'",
            '  splash:',
            '    path: assets/splash.png',
            "    bgColor: '#000'",
        ].join('\n'));

        const dryRun = runCli(['release', '--patch', '--dry-run'], dir);
        expect(dryRun.status).toBe(0);
        expect(dryRun.stdout).toContain('Dry run');
        expect(fs.readFileSync(path.join(dir, 'pubspec.yaml'), 'utf-8')).toContain('version: 1.0.0+1');

        const release = runCli(['release', '--patch'], dir);
        expect(release.status).toBe(0);
        expect(fs.readFileSync(path.join(dir, 'pubspec.yaml'), 'utf-8')).toContain('version: 1.0.1+2');
    });

    test('supports only/platform/dry-run for generation', async () => {
        const dir = makeTempDir();
        writeFixture(path.join(dir, 'pubspec.yaml'), [
            'fluttergen:',
            '  icon:',
            '    path: assets/icon.png',
            "    bgColor: '#018290'",
            '  splash:',
            '    path: assets/splash.png',
            "    bgColor: '#00636E'",
        ].join('\n'));
        writeFixture(path.join(dir, 'ios/Runner/Info.plist'), plistFixture);
        writeFixture(path.join(dir, 'android/app/src/main/AndroidManifest.xml'), [
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
            '<application android:name="${applicationName}"></application>',
            '</manifest>',
        ].join('\n'));

        fs.mkdirSync(path.join(dir, 'assets'), {recursive: true});
        await sharp({create: {width: 64, height: 64, channels: 4, background: {r: 1, g: 130, b: 144, alpha: 1}}})
            .png().toFile(path.join(dir, 'assets/icon.png'));
        await sharp({create: {width: 64, height: 64, channels: 4, background: {r: 0, g: 99, b: 110, alpha: 1}}})
            .png().toFile(path.join(dir, 'assets/splash.png'));

        const appIconSet = path.join(dir, 'ios/Runner/Assets.xcassets/AppIcon.appiconset');

        const dryRun = runCli(['--only', 'icons', '--platform', 'ios', '--dry-run'], dir);
        expect(dryRun.status).toBe(0);
        expect(dryRun.stdout).toContain('Dry run');
        expect(fs.existsSync(appIconSet)).toBe(false);

        const real = runCli(['--only', 'icons', '--platform', 'ios'], dir);
        expect(real.status).toBe(0);
        expect(fs.existsSync(path.join(appIconSet, 'Contents.json'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'android/app/src/main/res'))).toBe(false);
    });
});
