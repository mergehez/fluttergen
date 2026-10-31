import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import {cleanupTempDirs, inTempDir, pbxprojFixture, plistFixture, writeFixture} from './helpers.ts';
import {getPredefinedScripts, useScripts} from '../src/useScripts.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';

afterEach(cleanupTempDirs);

function scriptConfig(postscripts: any[], variables: Record<string, any> = {}) {
    return {variables, postscripts, prescripts: []} as any;
}

describe('useScripts', () => {
    test('lists the available helper functions', () => {
        const help = getPredefinedScripts();
        expect(help).toContain('versionUp()');
        expect(help).toContain('runCommand(command)');
        expect(help).toContain('yamlSet(filePath, keyPath, newValue)');
        expect(help).toContain('plistSet(filePath, keyPath, type, newValue)');
    });

    test('increments the version and build number', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.2.3+4\n');

            useScripts(scriptConfig(['versionUp()']), 'postscripts').execute();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 1.2.4+5');
        });
    });

    test('adds a build number when missing', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.2.3\n');

            useScripts(scriptConfig(['versionUp()']), 'postscripts').execute();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 1.2.4+1');
        });
    });

    test('rejects invalid versions', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\nversion: "1.2"\n');

            expect(() => useScripts(scriptConfig(['versionUp()']), 'postscripts').execute())
                .toThrow(/Invalid version format/);
        });
    });

    test('runs yaml helpers and grouped tasks', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.0.0+1\n');

            useScripts(scriptConfig([
                { 'group:setup': ["yamlSet('pubspec.yaml', 'description', 'grouped')"] },
                'setup()',
                "yamlAddToList('pubspec.yaml', 'tags', 'one')",
                "yamlAddToList('pubspec.yaml', 'tags', 'two')",
            ]), 'postscripts').execute();

            const content = fs.readFileSync('pubspec.yaml', 'utf-8');
            expect(content).toContain('description: grouped');
            expect(content).toContain('tags:');
            expect(content).toContain('- one');
            expect(content).toContain('- two');
        });
    });

    test('exposes variables, params and env to tasks', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\n');
            writeFixture('.env', 'TOKEN=from-env\n');

            useScripts(scriptConfig(
                ["yamlSet('pubspec.yaml', 'value', `${vars.one}-${params.two}-${variables.three}-${env.TOKEN}`)"],
                {one: 'a', two: 'b', three: 'c'}
            ), 'postscripts').execute();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('value: a-b-c-from-env');
        });
    });

    test('throws for unknown groups and invalid entries', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\n');

            expect(() => useScripts(scriptConfig(['missing()']), 'postscripts').execute())
                .toThrow(/not defined/);
            expect(() => useScripts(scriptConfig([{group: 'x'}]), 'postscripts').execute())
                .toThrow(/can only be defined as strings/);
        });
    });

    test('does nothing for empty sections', async () => {
        await inTempDir(() => {
            writeFixture('pubspec.yaml', 'name: app\n');
            expect(() => useScripts(scriptConfig([]), 'postscripts').execute()).not.toThrow();
        });
    });

    test('runs shell commands', async () => {
        await inTempDir(() => {
            useScripts(scriptConfig([
                "runCommand('echo one > command.txt')",
                "exec('echo two >> command.txt')",
            ]), 'postscripts').execute();

            expect(fs.readFileSync('command.txt', 'utf-8')).toBe('one\ntwo\n');
        });
    });

    test('runs file, plist, YAML and property helpers', async () => {
        await inTempDir(() => {
            writeFixture('source.txt', 'hello');
            writeFixture('dir/a.txt', 'a');
            writeFixture('dir/sub/b.txt', 'b');
            writeFixture('placeholder.txt', 'name={vars.name}');
            writeFixture('Info.plist', plistFixture);
            writeFixture('pubspec.yaml', 'name: app\n');
            writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxprojFixture);
            writeFixture('ios/Runner/Runner.entitlements', plistFixture);
            fs.mkdirSync('destdir');

            useScripts(scriptConfig([
                "copyFile('source.txt', 'dest.txt')",
                "copyFile('source.txt', 'destdir')",
                "copyDirectory('dir', 'copied')",
                "appendToFile('dest.txt', '-more')",
                "replaceInFile('dest.txt', 'hello', 'world', 'string')",
                "replaceInFile('dest.txt', '/world/g', 'regex', 'string')",
                "replacePlaceholdersInFile('placeholder.txt', 'vars', params)",
                "propertiesSet('config.properties', 'key', 'value')",
                "plistSet('Info.plist', 'CFBundleName', 'string', 'App')",
                "plistAddToList('Info.plist', 'Items', 'string', 'one')",
                "plistAddToList('Info.plist', 'Items', 'string', 'two')",
                "plistInsert('Info.plist', 'Nested.Key', 'string', 'nested')",
                "yamlSet('pubspec.yaml', 'description', plistGet('Info.plist', 'CFBundleName'))",
                "yamlAddToList('pubspec.yaml', 'tags', 'x')",
                "pbxprojAddEntitlements('ios/Runner.xcodeproj/project.pbxproj', 'Runner.entitlements', 'Runner', 1)",
            ], {name: 'App'}), 'postscripts').execute();

            expect(fs.readFileSync('dest.txt', 'utf-8')).toBe('regex-more');
            expect(fs.readFileSync('destdir/source.txt', 'utf-8')).toBe('hello');
            expect(fs.readFileSync('copied/a.txt', 'utf-8')).toBe('a');
            expect(fs.readFileSync('copied/sub/b.txt', 'utf-8')).toBe('b');
            expect(fs.readFileSync('placeholder.txt', 'utf-8')).toBe('name=App');
            expect(fs.readFileSync('config.properties', 'utf-8')).toContain('key=value');

            const plist = usePlist('Info.plist');
            expect(plist.getSimple('CFBundleName')).toBe('App');
            expect(plist.getComplex('Items')).toEqual(['one', 'two']);
            expect(plist.getSimple('Nested.Key')).toBe('nested');

            const pubspec = fs.readFileSync('pubspec.yaml', 'utf-8');
            expect(pubspec).toContain('description: App');
            expect(pubspec).toContain('- x');

            expect(fs.readFileSync('ios/Runner.xcodeproj/project.pbxproj', 'utf-8'))
                .toContain('CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;');
        });
    });
});
