import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import {execSync} from 'child_process';
import {cleanupTempDirs, inTempDir, pbxprojFixture, plistFixture, writeFixture} from './helpers.ts';
import {getBuiltInTaskNames, getPredefinedScripts, runBuiltInTask, useScripts} from '../src/useScripts.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';

afterEach(cleanupTempDirs);

function scriptConfig(postscripts: any[], variables: Record<string, any> = {}, workflows: Record<string, any[]> = {}) {
    return {variables, postscripts, prescripts: [], workflows} as any;
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
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.2.3+4\n');

            await useScripts(scriptConfig(['versionUp()']), 'postscripts').execute();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 1.2.4+5');
        });
    });

    test('adds a build number when missing', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.2.3\n');

            await useScripts(scriptConfig(['versionUp()']), 'postscripts').execute();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 1.2.4+1');
        });
    });

    test('rejects invalid versions', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\nversion: "1.2"\n');

            await expect(useScripts(scriptConfig(['versionUp()']), 'postscripts').execute())
                .rejects.toThrow(/Invalid version format/);
        });
    });

    test('runs yaml helpers and grouped tasks', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.0.0+1\n');

            await useScripts(scriptConfig([
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
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');
            writeFixture('.env', 'TOKEN=from-env\n');

            await useScripts(scriptConfig(
                ["yamlSet('pubspec.yaml', 'value', `${vars.one}-${params.two}-${variables.three}-${env.TOKEN}`)"],
                {one: 'a', two: 'b', three: 'c'}
            ), 'postscripts').execute();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('value: a-b-c-from-env');
        });
    });

    test('throws for unknown groups and invalid entries', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');

            await expect(useScripts(scriptConfig(['missing()']), 'postscripts').execute())
                .rejects.toThrow(/not defined/);
            await expect(useScripts(scriptConfig([{group: 'x'}]), 'postscripts').execute())
                .rejects.toThrow(/Unknown workflow step 'group'/);
        });
    });

    test('does nothing for empty sections', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');
            await useScripts(scriptConfig([]), 'postscripts').execute();
        });
    });

    test('runs shell commands', async () => {
        await inTempDir(async () => {
            await useScripts(scriptConfig([
                "runCommand('echo one > command.txt')",
                "exec('echo two >> command.txt')",
            ]), 'postscripts').execute();

            expect(fs.readFileSync('command.txt', 'utf-8')).toBe('one\ntwo\n');
        });
    });

    test('runs file, plist, YAML and property helpers', async () => {
        await inTempDir(async () => {
            writeFixture('source.txt', 'hello');
            writeFixture('dir/a.txt', 'a');
            writeFixture('dir/sub/b.txt', 'b');
            writeFixture('placeholder.txt', 'name={vars.name}');
            writeFixture('Info.plist', plistFixture);
            writeFixture('pubspec.yaml', 'name: app\n');
            writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxprojFixture);
            writeFixture('ios/Runner/Runner.entitlements', plistFixture);
            fs.mkdirSync('destdir');

            await useScripts(scriptConfig([
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

    test('exposes namespaced built-in tasks', () => {
        const names = getBuiltInTaskNames();

        expect(names).toContain('flutter.clean');
        expect(names).toContain('flutter.pubGet');
        expect(names).toContain('ios.pods.reset');
        expect(names).toContain('android.clean');
        expect(names).toContain('build.apk');
        expect(names).toContain('firebase.configure');
        expect(names).toContain('git.tag');
        expect(names.every(name => name.includes('.'))).toBe(true);
    });

    test('runs bare built-in names without parentheses', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.2.3+4\n');

            await useScripts(scriptConfig(['versionUp']), 'postscripts').execute();

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 1.2.4+5');
        });
    });

    test('runs object built-ins with options and array parameters', async () => {
        await inTempDir(async () => {
            execSync('git init -q');
            execSync('git config user.email test@example.com');
            execSync('git config user.name Test');
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.2.3+4\n');
            execSync('git add pubspec.yaml');
            execSync('git commit -qm init');

            await useScripts(scriptConfig([
                {'git.tag': {prefix: 'release-'}},
                {runCommand: ['echo ok > via-array.txt']},
            ]), 'postscripts').execute();

            expect(execSync('git tag').toString()).toContain('release-1.2.3+4');
            expect(fs.readFileSync('via-array.txt', 'utf-8')).toBe('ok\n');

            // Tagging again is a no-op instead of failing.
            await useScripts(
                scriptConfig([{'git.tag': {prefix: 'release-'}}]),
                'postscripts'
            ).execute();
        });
    });

    test('runs built-ins through the exported dispatcher', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\nversion: 1.0.0+1\n');

            runBuiltInTask('versionUp');

            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('version: 1.0.1+2');
        });
    });

    test('rejects unknown tasks and missing Android wrappers', async () => {
        expect(() => runBuiltInTask('does.not.exist')).toThrow(/Unknown task/);

        await inTempDir(async () => {
            expect(() => runBuiltInTask('android.clean')).toThrow(/gradlew/);
        });
    });

    test('rejects unknown built-in objects', async () => {
        await inTempDir(async () => {
            await expect(useScripts(
                scriptConfig([{'does.not.exist': {}}]),
                'postscripts'
            ).execute()).rejects.toThrow(/Unknown workflow step 'does.not.exist'/);
        });
    });

    test('runs workflows with typed steps', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');
            writeFixture('Info.plist', plistFixture);

            const config = {
                variables: {},
                prescripts: ['prepare'],
                postscripts: [],
                workflows: {
                    prepare: [
                        {run: 'echo hello > workflow.txt'},
                        {copy: {from: 'workflow.txt', to: 'copy.txt'}},
                        {copy: ['workflow.txt', 'copy2.txt']},
                        {replace: {file: 'workflow.txt', from: 'hello', to: 'bye'}},
                        {yaml: {file: 'pubspec.yaml', key: 'description', value: 'from workflow'}},
                        {props: {file: 'config.properties', key: 'key', value: 'value'}},
                        {plist: {file: 'Info.plist', key: 'CFBundleName', type: 'string', value: 'App'}},
                        {delete: ['copy.txt', 'copy2.txt']},
                    ],
                },
            } as any;

            await useScripts(config, 'prescripts').execute();

            expect(fs.readFileSync('workflow.txt', 'utf-8')).toBe('bye\n');
            expect(fs.existsSync('copy.txt')).toBe(false);
            expect(fs.existsSync('copy2.txt')).toBe(false);
            expect(fs.readFileSync('pubspec.yaml', 'utf-8')).toContain('description: from workflow');
            expect(fs.readFileSync('config.properties', 'utf-8')).toContain('key=value');
            expect(usePlist('Info.plist').getSimple('CFBundleName')).toBe('App');
        });
    });

    test('evaluates workflow conditions', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');

            const config = {
                variables: {},
                prescripts: ['conditional'],
                postscripts: [],
                workflows: {
                    conditional: [
                        {run: 'echo flag > flag.txt', when: {flag: '--feature'}},
                        {run: 'echo file > file.txt', when: {file: 'pubspec.yaml'}},
                        {run: 'echo env > env.txt', when: {env: 'FLUTTERGEN_WORKFLOW_ENV'}},
                        {run: 'echo platform > platform.txt', when: {platform: 'darwin'}},
                        {run: 'echo skip > skip.txt', when: {not: {flag: '--feature'}}},
                        {run: 'echo all > all.txt', when: {all: [{file: 'pubspec.yaml'}, {any: [{flag: '--missing'}, {file: 'pubspec.yaml'}]}]}},
                    ],
                },
            } as any;

            const originalArgvLength = process.argv.length;
            process.argv.push('--feature');
            process.env.FLUTTERGEN_WORKFLOW_ENV = '1';

            try {
                await useScripts(config, 'prescripts').execute();
            } finally {
                process.argv.length = originalArgvLength;
                delete process.env.FLUTTERGEN_WORKFLOW_ENV;
            }

            expect(fs.existsSync('flag.txt')).toBe(true);
            expect(fs.existsSync('file.txt')).toBe(true);
            expect(fs.existsSync('env.txt')).toBe(true);
            expect(fs.existsSync('platform.txt')).toBe(true);
            expect(fs.existsSync('skip.txt')).toBe(false);
            expect(fs.existsSync('all.txt')).toBe(true);
        });
    });

    test('supports nested workflows and rejects cycles', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');

            const nested = {
                variables: {},
                prescripts: ['outer'],
                postscripts: [],
                workflows: {
                    outer: [{use: 'inner'}],
                    inner: [{run: 'echo inner > inner.txt'}],
                },
            } as any;
            await useScripts(nested, 'prescripts').execute();
            expect(fs.readFileSync('inner.txt', 'utf-8')).toBe('inner\n');

            const cyclic = {
                variables: {},
                prescripts: ['loopA'],
                postscripts: [],
                workflows: {
                    loopA: [{use: 'loopB'}],
                    loopB: [{use: 'loopA'}],
                },
            } as any;
            await expect(useScripts(cyclic, 'prescripts').execute())
                .rejects.toThrow(/Circular workflow reference/);

            const missing = {
                variables: {},
                prescripts: [{use: 'missing'}],
                postscripts: [],
                workflows: {},
            } as any;
            await expect(useScripts(missing, 'prescripts').execute())
                .rejects.toThrow(/Workflow 'missing' is not defined/);
        });
    });

    test('rejects malformed workflow steps', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');

            const config = {
                variables: {},
                prescripts: [{run: 'echo a', copy: {from: 'a', to: 'b'}}],
                postscripts: [],
                workflows: {},
            } as any;
            await expect(useScripts(config, 'prescripts').execute())
                .rejects.toThrow(/exactly one action key/);

            const unknown = {
                variables: {},
                prescripts: [{unknownStep: 'x'}],
                postscripts: [],
                workflows: {},
            } as any;
            await expect(useScripts(unknown, 'prescripts').execute())
                .rejects.toThrow(/Unknown workflow step 'unknownStep'/);
        });
    });

    test('supports generate steps', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'name: app\n');

            const config = {
                variables: {},
                prescripts: [{generate: true}, {generate: false}],
                postscripts: [],
                workflows: {},
            } as any;

            // No ios/android projects exist, so generation is a safe no-op here.
            await expect(useScripts(config, 'prescripts').execute()).resolves.toBeUndefined();
        });
    });
});
