import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import path from 'path';
import {cleanupTempDirs, inTempDir, makeTempDir, pbxprojFixture, plistFixture, writeFixture} from './helpers.ts';
import {useYamlFile} from '../src/fileHandler/useYamlFile.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';
import {useAndroidManifest} from '../src/fileHandler/useAndroidManifest.ts';
import {setColorResource, setStyleItem} from '../src/fileHandler/useAndroidXml.ts';
import {useBuildGradle, replaceInFile} from '../src/fileHandler/useBuildGradle.ts';
import {usePropertiesFile} from '../src/fileHandler/usePropertiesFile.ts';
import {useIosContentsJson} from '../src/fileHandler/useIosContentsJson.ts';
import {usePlaceholderReplacer} from '../src/fileHandler/usePlaceholderReplacer.ts';
import {usePbxproj} from '../src/fileHandler/usePbxproj.ts';

afterEach(cleanupTempDirs);

describe('useYamlFile', () => {
    test('reads, writes and preserves comments', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'pubspec.yaml');
        fs.writeFileSync(file, '# keep this comment\nname: app\nversion: 1.0.0+1\n');
        const yaml = useYamlFile(file);

        expect(yaml.get('name')).toBe('app');
        expect(yaml.get('missing')).toBeUndefined();

        yaml.set('description', 'A test app');
        yaml.set('nested.key', 'value');

        expect(yaml.get('description')).toBe('A test app');
        expect(yaml.asJsObject().nested).toEqual({key: 'value'});
        expect(fs.readFileSync(file, 'utf-8')).toContain('# keep this comment');
    });

    test('returns undefined for non-string and scalar paths', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'pubspec.yaml');
        fs.writeFileSync(file, 'number: 5\nname: app\n');
        const yaml = useYamlFile(file);

        expect(yaml.get('number')).toBeUndefined();
        expect(yaml.get('number.child')).toBeUndefined();
    });

    test('adds list items and skips duplicates', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'pubspec.yaml');
        fs.writeFileSync(file, 'list:\n  - a\n');
        const yaml = useYamlFile(file);

        yaml.addToList('list', 'b');
        yaml.addToList('list', 'a');
        yaml.addToList('newList', 'x');

        expect(yaml.asJsObject().list).toEqual(['a', 'b']);
        expect(yaml.asJsObject().newList).toEqual(['x']);
    });

    test('tryAddToList is silent for wrong types', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'pubspec.yaml');
        fs.writeFileSync(file, 'name: app\n');
        const yaml = useYamlFile(file);

        expect(() => yaml.tryAddToList('name', 'x')).not.toThrow();
    });

    test('throws for a missing file', () => {
        expect(() => useYamlFile(path.join(makeTempDir(), 'missing.yaml')).get('a')).toThrow();
    });
});

describe('usePlist', () => {
    function writePlist(extra = '') {
        const dir = makeTempDir();
        const file = path.join(dir, 'Info.plist');
        fs.writeFileSync(file, [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
            '<plist version="1.0">',
            '<dict>',
            extra,
            '</dict>',
            '</plist>',
        ].join('\n'));
        return {file, plist: usePlist(file)};
    }

    test('throws for missing and binary plists', () => {
        expect(() => usePlist(path.join(makeTempDir(), 'missing.plist')).get('x')).toThrow();

        const dir = makeTempDir();
        const binary = path.join(dir, 'binary.plist');
        fs.writeFileSync(binary, 'bplist00-data');
        expect(() => usePlist(binary).get('x')).toThrow(/Binary plist/);
    });

    test('insert throws when the key already exists', () => {
        const {plist} = writePlist('<key>Name</key><string>Old</string>');
        plist.set('Name', 'string', 'New');
        expect(() => plist.insert('Name', 'string', 'Other')).toThrow(/already exists/);
    });

    test('appends to arrays and reads complex values', () => {
        const {plist} = writePlist();
        plist.insert('Items', 'array');
        plist.insert('Items', 'string', 'one', true);
        plist.insert('Items', 'string', 'two', true);

        expect(plist.getComplex('Items')).toEqual(['one', 'two']);
        expect(() => plist.getSimple('Items')).toThrow(/not a simple value/);
        expect(plist.get('Items')).toEqual(['one', 'two']);
    });

    test('supports date and data values', () => {
        const {plist} = writePlist();
        plist.set('Created', 'date', '2024-05-06T07:08:09Z');
        plist.set('Blob', 'data', Buffer.from('hello').toString('base64'));

        expect(plist.getSimple('Created')).toStartWith('2024-05-06');
        expect(plist.getSimple('Blob')).toBe(Buffer.from('hello').toString('base64'));
    });

    test('rejects unsupported types and invalid values', () => {
        const {plist} = writePlist();
        expect(() => plist.set('Value', 'nope', 'x')).toThrow(/Unsupported/);
        expect(() => plist.set('Value', 'int', 'abc')).toThrow(/Invalid integer/);
        expect(() => plist.set('Value', 'float', 'abc')).toThrow(/Invalid float/);
        expect(() => plist.set('Value', 'bool', 'maybe')).toThrow(/Invalid boolean/);
    });

    test('reports unparsable plists and missing keys', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'broken.plist');
        fs.writeFileSync(file, '<not-a-plist');

        expect(() => usePlist(file).get('x')).toThrow(/Could not parse plist/);

        const {plist} = writePlist();
        expect(() => plist.get('Missing')).toThrow(/Key path not found/);
    });

    test('rejects append on non-arrays and accepts buffers', () => {
        const {plist} = writePlist('<key>Name</key><string>Old</string>');
        expect(() => plist.insert('Name', 'string', 'x', true)).toThrow(/not an array/);

        plist.set('Blob', 'data', Buffer.from('abc'));
        expect(plist.getSimple('Blob')).toBe(Buffer.from('abc').toString('base64'));
    });

    test('preserves complex real-world plist structures', () => {
        const {plist} = writePlist([
            '<key>CFBundleVersion</key><string>1</string>',
            '<key>Build</key><string>$(CURRENT_PROJECT_VERSION)</string>',
            '<key>UIApplicationSceneManifest</key>',
            '<dict>',
            '    <key>UIApplicationSupportsMultipleScenes</key>',
            '    <false/>',
            '</dict>',
            '<key>CFBundleURLTypes</key>',
            '<array>',
            '    <dict>',
            '        <key>CFBundleURLSchemes</key>',
            '        <array><string>myapp</string></array>',
            '    </dict>',
            '</array>',
        ].join('\n'));

        plist.set('UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes', 'bool', true);

        expect(plist.getSimple('UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes')).toBe('true');
        expect(plist.getSimple('Build')).toBe('$(CURRENT_PROJECT_VERSION)');
        expect(plist.getComplex('CFBundleURLTypes')).toEqual([
            {CFBundleURLSchemes: ['myapp']},
        ]);
        expect(plist.getSimple('CFBundleVersion')).toBe('1');
    });
});

describe('useAndroidManifest', () => {
    const manifest = [
        '<manifest',
        '        xmlns:android="http://schemas.android.com/apk/res/android">',
        '    <application',
        '            android:label="Old"',
        '            android:name="${applicationName}"',
        '            android:icon="@mipmap/ic_launcher">',
        '    </application>',
        '</manifest>',
        '',
    ].join('\n');

    test('updates existing attributes and escapes values', () => {
        inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
            const file = useAndroidManifest()!;
            file.ensureAttribute('application', 'android:label', 'Tom & Jerry');

            const content = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(content).toContain('android:label="Tom &amp; Jerry"');
            expect(content).toContain('android:icon="@mipmap/ic_launcher"');
        });
    });

    test('adds new attributes', () => {
        inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
            useAndroidManifest()!.ensureAttribute('application', 'android:exported', 'true');

            expect(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8'))
                .toContain('android:exported="true"');
        });
    });

    test('merges tools:replace instead of replacing the list', () => {
        inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', [
                '<manifest',
                '        xmlns:android="http://schemas.android.com/apk/res/android"',
                '        xmlns:tools="http://schemas.android.com/tools">',
                '    <application',
                '            tools:replace="android:icon"',
                '            android:label="Old">',
                '    </application>',
                '</manifest>',
                '',
            ].join('\n'));

            const file = useAndroidManifest()!;
            file.ensureApplicationLabel('New App');

            const content = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(content).toContain('tools:replace="android:icon,android:label"');
            expect(content).toContain('android:label="New App"');
        });
    });

    test('updates and creates notification metadata', () => {
        inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', [
                '<manifest',
                '        xmlns:android="http://schemas.android.com/apk/res/android">',
                '    <application>',
                '        <meta-data',
                '                android:name="com.google.firebase.messaging.default_notification_icon"',
                '                android:resource="@mipmap/old" />',
                '    </application>',
                '</manifest>',
                '',
            ].join('\n'));

            const file = useAndroidManifest()!;
            file.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_icon', '@mipmap/new');
            file.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_color', '@color/accent');

            const content = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(content).toContain('android:resource="@mipmap/new"');
            expect(content).toContain('com.google.firebase.messaging.default_notification_color');
            expect(content).toContain('android:resource="@color/accent"');
        });
    });

    test('warns instead of crashing when </application> is missing', () => {
        inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', [
                '<manifest',
                '        xmlns:android="http://schemas.android.com/apk/res/android">',
                '    <application>',
                '</manifest>',
                '',
            ].join('\n'));

            const file = useAndroidManifest()!;
            expect(() => file.updateOrCreateMetaData('name', '@mipmap/x')).not.toThrow();
        });
    });

    test('returns undefined when the manifest is missing', () => {
        inTempDir(() => {
            expect(useAndroidManifest()).toBeUndefined();
        });
    });

    test('handles a single-line application tag', () => {
        inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', [
                '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
                '<application android:label="Old"></application>',
                '</manifest>',
                '',
            ].join('\n'));

            const file = useAndroidManifest()!;
            file.ensureAttribute('application', 'android:label', 'New');
            file.ensureAttribute('application', 'android:icon', '@mipmap/icon');

            const content = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(content).toContain('android:label="New"');
            expect(content).toContain('android:icon="@mipmap/icon"');
        });
    });

    test('handles CRLF line endings', () => {
        inTempDir(() => {
            const crlf = [
                '<manifest',
                '        xmlns:android="http://schemas.android.com/apk/res/android">',
                '    <application',
                '            android:label="Old">',
                '    </application>',
                '</manifest>',
                '',
            ].join('\r\n');
            writeFixture('android/app/src/main/AndroidManifest.xml', crlf);

            useAndroidManifest()!.ensureAttribute('application', 'android:label', 'New');

            const content = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(content).toContain('android:label="New"');
        });
    });
});

describe('useAndroidXml', () => {
    test('replaces self-closing colors and escapes values', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'colors.xml');
        fs.writeFileSync(file, '<resources>\n    <color name="brand" />\n</resources>\n');

        expect(setColorResource(file, 'brand', '#123456')).toBe('updated');
        expect(fs.readFileSync(file, 'utf-8')).toContain('<color name="brand">#123456</color>');

        setColorResource(file, 'brand', 'a&b');
        expect(fs.readFileSync(file, 'utf-8')).toContain('<color name="brand">a&amp;b</color>');
    });

    test('replaces self-closing style items', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'styles.xml');
        fs.writeFileSync(file, [
            '<resources>',
            '    <style name="LaunchTheme" parent="Theme.Light">',
            '        <item name="android:windowBackground" />',
            '    </style>',
            '</resources>',
            '',
        ].join('\n'));

        expect(setStyleItem(file, 'LaunchTheme', 'android:windowBackground', '@drawable/splash')).toBe(true);
        expect(fs.readFileSync(file, 'utf-8'))
            .toContain('<item name="android:windowBackground">@drawable/splash</item>');
    });

    test('creates single-line style items safely', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'styles.xml');
        fs.writeFileSync(file, '<resources><style name="LaunchTheme"></style></resources>');

        expect(setStyleItem(file, 'LaunchTheme', 'android:windowBackground', '@drawable/splash')).toBe(true);
        const content = fs.readFileSync(file, 'utf-8');
        expect(content).toContain('<item name="android:windowBackground">@drawable/splash</item>');
        expect(content).toContain('</style>');
    });

    test('throws when the resources closing tag is missing', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'colors.xml');
        fs.writeFileSync(file, '<resources>\n');

        expect(() => setColorResource(file, 'brand', '#123456')).toThrow(/</);
    });

    test('handles CRLF colors.xml and styles.xml files', () => {
        const dir = makeTempDir();
        const colors = path.join(dir, 'colors.xml');
        const styles = path.join(dir, 'styles.xml');

        fs.writeFileSync(colors, '<resources>\r\n    <color name="brand">#000000</color>\r\n</resources>\r\n');
        fs.writeFileSync(styles, [
            '<resources>',
            '    <style name="LaunchTheme" parent="Theme.Light">',
            '        <item name="android:windowBackground">@drawable/old</item>',
            '    </style>',
            '</resources>',
            '',
        ].join('\r\n'));

        setColorResource(colors, 'brand', '#123456');
        setColorResource(colors, 'accent', '#abcdef');
        setStyleItem(styles, 'LaunchTheme', 'android:windowBackground', '@drawable/new');

        const colorsContent = fs.readFileSync(colors, 'utf-8');
        expect(colorsContent).toContain('<color name="brand">#123456</color>');
        expect(colorsContent).toContain('<color name="accent">#abcdef</color>');
        expect(fs.readFileSync(styles, 'utf-8'))
            .toContain('<item name="android:windowBackground">@drawable/new</item>');
    });
});

describe('useBuildGradle', () => {
    test('updates Groovy properties and preserves separators', async () => {
        await inTempDir(() => {
            writeFixture('android/app/build.gradle', [
                'android {',
                '    defaultConfig {',
                '        applicationId = "com.old"',
                '        minSdkVersion 21',
                '    }',
                '}',
                '',
            ].join('\n'));

            const gradle = useBuildGradle('android/app');
            expect(gradle.update('applicationId', 'com.new', 'string')).toBe(true);
            expect(gradle.update('minSdkVersion', 22, 'int')).toBe(true);

            const content = fs.readFileSync('android/app/build.gradle', 'utf-8');
            expect(content).toContain('applicationId = "com.new"');
            expect(content).toContain('minSdkVersion 22');
        });
    });

    test('escapes quotes in Kotlin strings', async () => {
        await inTempDir(() => {
            writeFixture('android/app/build.gradle.kts', 'android {\n    namespace = "old"\n}\n');
            useBuildGradle('android/app').update('namespace', 'my "app"', 'string');

            expect(fs.readFileSync('android/app/build.gradle.kts', 'utf-8'))
                .toContain('namespace = "my \\"app\\""');
        });
    });

    test('throws when both or neither build files exist', async () => {
        await inTempDir(() => {
            expect(() => useBuildGradle('android/app')).toThrow(/Neither/);
        });

        await inTempDir(() => {
            writeFixture('android/app/build.gradle', '');
            writeFixture('android/app/build.gradle.kts', '');
            expect(() => useBuildGradle('android/app')).toThrow(/Both/);
        });
    });

    test('replaceInFile handles literals and regular expressions', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'file.txt');
        fs.writeFileSync(file, 'foo foo BAR');

        replaceInFile(file, 'foo', 'baz');
        expect(fs.readFileSync(file, 'utf-8')).toBe('baz baz BAR');

        replaceInFile(file, /baz/g, 'qux');
        expect(fs.readFileSync(file, 'utf-8')).toBe('qux qux BAR');
    });
});

describe('usePropertiesFile', () => {
    test('creates files and updates existing keys', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'nested/gradle.properties');

        usePropertiesFile(file).set('first', 'one');
        usePropertiesFile(file).set('second', 'two');
        usePropertiesFile(file).set('first', 'updated');

        const content = fs.readFileSync(file, 'utf-8');
        expect(content).toContain('first=updated');
        expect(content).toContain('second=two');
    });

    test('escapes backslashes and newlines', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'values.properties');

        usePropertiesFile(file).set('path', 'C:\\temp\\new');
        usePropertiesFile(file).set('text', 'line1\nline2');

        const content = fs.readFileSync(file, 'utf-8');
        expect(content).toContain('path=C:\\\\temp\\\\new');
        expect(content).toContain('text=line1\\nline2');
    });
});

describe('useIosContentsJson', () => {
    test('writes image variants and preserves unrelated files', () => {
        const dir = makeTempDir();
        const folder = path.join(dir, 'AppIcon.appiconset');
        const output = path.join(folder, 'Contents.json');

        const contents = useIosContentsJson(output);
        contents.add('iphone', '20x20', '2x', 'icon-20@2x.png');
        contents.add('ios-marketing', '1024x1024', '1x', 'icon-1024.png', 'dark');
        contents.add('ios-marketing', '1024x1024', '1x', 'icon-1024-tinted.png', 'tinted');
        contents.save();

        const json = JSON.parse(fs.readFileSync(output, 'utf-8'));
        expect(json.images).toHaveLength(3);
        expect(json.images[0].appearances).toBeUndefined();
        expect(json.images[1].appearances).toEqual([{appearance: 'luminosity', value: 'dark'}]);
        expect(json.images[2].appearances).toEqual([{appearance: 'luminosity', value: 'tinted'}]);

        fs.writeFileSync(path.join(folder, 'image.png'), 'png');
        fs.writeFileSync(path.join(folder, 'custom.txt'), 'keep');
        contents.deleteOldFiles();

        expect(fs.existsSync(path.join(folder, 'image.png'))).toBe(false);
        expect(fs.existsSync(path.join(folder, 'custom.txt'))).toBe(true);
        expect(fs.existsSync(output)).toBe(true);
    });
});

describe('usePlaceholderReplacer', () => {
    test('replaces nested values and leaves unknown placeholders', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'file.txt');
        fs.writeFileSync(file, [
            'name={cfg.info.appName}',
            'token={env.TOKEN}',
            'number={cfg.count}',
            'missing={cfg.missing}',
        ].join('\n'));

        usePlaceholderReplacer(file).replace('cfg', {info: {appName: 'My App'}, count: 5});
        usePlaceholderReplacer(file).replace('env', {TOKEN: 'secret'});

        const content = fs.readFileSync(file, 'utf-8');
        expect(content).toContain('name=My App');
        expect(content).toContain('token=secret');
        expect(content).toContain('number=5');
        expect(content).toContain('missing={cfg.missing}');
    });
});

describe('usePbxproj', () => {
    function writeProject() {
        writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxprojFixture);
        writeFixture('ios/Runner/Runner.entitlements', plistFixture);
    }

    test('adds entitlements and code signing without undefined keys', async () => {
        await inTempDir(() => {
            writeProject();

            usePbxproj('ios/Runner.xcodeproj/project.pbxproj')
                .addEntitlements('Runner.entitlements', 'Runner', true);

            const content = fs.readFileSync('ios/Runner.xcodeproj/project.pbxproj', 'utf-8');
            expect(content).toContain('Runner.entitlements');
            expect(content).toContain('CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;');
            expect(content).not.toContain('= undefined;');
        });
    });

    test('does not duplicate the file reference on repeated runs', async () => {
        await inTempDir(() => {
            writeProject();
            const pbxproj = 'ios/Runner.xcodeproj/project.pbxproj';

            usePbxproj(pbxproj).addEntitlements('Runner.entitlements', 'Runner', true);
            usePbxproj(pbxproj).addEntitlements('Runner.entitlements', 'Runner', true);

            const content = fs.readFileSync(pbxproj, 'utf-8');
            const references = content.match(/isa = PBXFileReference;[^}]*path = "?Runner\.entitlements"?;/g) ?? [];
            expect(references).toHaveLength(1);
            expect(content).not.toContain('= undefined;');
        });
    });

    test('throws for an unknown group', async () => {
        await inTempDir(() => {
            writeProject();

            expect(() => usePbxproj('ios/Runner.xcodeproj/project.pbxproj')
                .addEntitlements('Runner.entitlements', 'Missing', false))
                .toThrow(/Could not find the 'Missing' group/);
        });
    });

    test('warns but still adds a reference when the file is missing', async () => {
        await inTempDir(() => {
            writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxprojFixture);

            expect(() => usePbxproj('ios/Runner.xcodeproj/project.pbxproj')
                .addEntitlements('Runner.entitlements', 'Runner', false))
                .not.toThrow();

            expect(fs.readFileSync('ios/Runner.xcodeproj/project.pbxproj', 'utf-8'))
                .toContain('Runner.entitlements');
        });
    });

    test('throws when the project file is missing', () => {
        expect(() => usePbxproj(path.join(makeTempDir(), 'missing.pbxproj')))
            .toThrow(/Project file not found/);
    });
});
