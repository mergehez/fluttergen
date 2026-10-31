import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {colorConverter} from '../src/colorConverter.ts';
import {parsePubspecYaml} from '../src/yamlParser.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';
import {useBuildGradle} from '../src/fileHandler/useBuildGradle.ts';
import {setColorResource, setStyleItem} from '../src/fileHandler/useAndroidXml.ts';
import {normalizeGradleDistribution} from '../src/useInfoHandler.ts';

const tmpDirs: string[] = [];

function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluttergen-test-'));
    tmpDirs.push(dir);
    return dir;
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        fs.rmSync(dir, {recursive: true, force: true});
    }
});

function configWithVariables(variables: string) {
    return [
        'fluttergen:',
        '  icon:',
        '    path: icon.png',
        "    bgColor: '#fff'",
        '  splash:',
        '    path: splash.png',
        "    bgColor: '#000'",
        '  variables:',
        variables,
    ].join('\n');
}

describe('colorConverter', () => {
    test('converts hex colors', () => {
        expect(colorConverter.hexToRgba('#018290')).toEqual({r: 1, g: 130, b: 144, alpha: 1});
        expect(colorConverter.hexToRgba('#f00')).toEqual({r: 255, g: 0, b: 0, alpha: 1});
        expect(colorConverter.hexToRgba('#FF000080')).toEqual({r: 255, g: 0, b: 0, alpha: 128 / 255});
    });

    test('converts named and functional colors', () => {
        expect(colorConverter.anyToRgba('rebeccapurple')).toEqual({r: 102, g: 51, b: 153, alpha: 1});
        expect(colorConverter.anyToRgba('rgb(1, 2, 3)')).toEqual({r: 1, g: 2, b: 3, alpha: 1});
        expect(colorConverter.anyToRgba('transparent')).toBeUndefined();
    });

    test('rejects invalid hex values', () => {
        expect(() => colorConverter.hexToRgba('#GGGGGG')).toThrow();
        expect(() => colorConverter.hexToRgba('#12345')).toThrow();
    });
});

describe('yamlParser variables', () => {
    test('evaluates arithmetic with correct precedence', () => {
        expect(parsePubspecYaml(configWithVariables('    value: 10 + 5 * 2')).variables.value).toBe(20);
        expect(parsePubspecYaml(configWithVariables('    value: (10 + 5) * 2')).variables.value).toBe(30);
    });

    test('does not eval non-expression strings', () => {
        expect(parsePubspecYaml(configWithVariables('    date: 2024-01-01')).variables.date).toBe('2024-01-01');
        expect(parsePubspecYaml(configWithVariables('    slug: my-app')).variables.slug).toBe('my-app');
        expect(parsePubspecYaml(configWithVariables('    url: https://example.com/a')).variables.url).toBe('https://example.com/a');
    });

    test('reads env variables from the process environment', () => {
        process.env.FLUTTERGEN_TEST_VALUE = 'from-process';
        try {
            expect(parsePubspecYaml(configWithVariables('    value: env.FLUTTERGEN_TEST_VALUE')).variables.value)
                .toBe('from-process');
        } finally {
            delete process.env.FLUTTERGEN_TEST_VALUE;
        }
    });

    test('reports invalid configuration with a readable error', () => {
        expect(() => parsePubspecYaml([
            'fluttergen:',
            '  icon:',
            '    path: icon.png',
            "    bgColor: '#fff'",
        ].join('\n'))).toThrow(/Invalid 'fluttergen' configuration/);
    });
});

describe('usePlist', () => {
    function writePlist() {
        const dir = makeTempDir();
        const file = path.join(dir, 'Info.plist');
        fs.writeFileSync(file, [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
            '<plist version="1.0">',
            '<dict>',
            '  <key>CFBundleName</key>',
            '  <string>Old</string>',
            '</dict>',
            '</plist>',
        ].join('\n'));
        return file;
    }

    test('sets, reads and nests values', () => {
        const plist = usePlist(writePlist());

        plist.set('CFBundleName', 'string', 'New');
        expect(plist.getSimple('CFBundleName')).toBe('New');

        plist.set('Nested.Value', 'int', 5);
        expect(plist.getSimple('Nested.Value')).toBe('5');

        plist.set('Enabled', 'bool', false);
        expect(plist.getSimple('Enabled')).toBe('false');
    });

    test('supports escaped dots in key paths', () => {
        const plist = usePlist(writePlist());
        plist.insert('key1.key2.key3\\.com.key4', 'string', 'value');
        expect(plist.getSimple('key1.key2.key3\\.com.key4')).toBe('value');
    });

    test('adds values to lists', () => {
        const plist = usePlist(writePlist());
        plist.addToList('Items', 'string', 'one');
        plist.addToList('Items', 'string', 'two');
        expect(plist.getComplex('Items')).toEqual(['one', 'two']);
    });
});

describe('useBuildGradle', () => {
    test('updates minSdk in a Kotlin build file', () => {
        const dir = makeTempDir();
        const previousCwd = process.cwd();
        try {
            fs.mkdirSync(path.join(dir, 'android/app'), {recursive: true});
            const file = path.join(dir, 'android/app/build.gradle.kts');
            fs.writeFileSync(file, 'android {\n    defaultConfig {\n        minSdk = flutter.minSdkVersion\n    }\n}\n');

            process.chdir(dir);
            const updated = useBuildGradle('android/app').update('minSdk', 21, 'int');

            expect(updated).toBe(true);
            expect(fs.readFileSync(file, 'utf-8')).toContain('minSdk = 21');
        } finally {
            process.chdir(previousCwd);
        }
    });

    test('reports missing keys instead of silently succeeding', () => {
        const dir = makeTempDir();
        const previousCwd = process.cwd();
        try {
            fs.mkdirSync(path.join(dir, 'android/app'), {recursive: true});
            fs.writeFileSync(path.join(dir, 'android/app/build.gradle.kts'), 'android { }\n');

            process.chdir(dir);
            expect(useBuildGradle('android/app').update('minSdk', 21, 'int', true)).toBe(false);
        } finally {
            process.chdir(previousCwd);
        }
    });
});

describe('normalizeGradleDistribution', () => {
    test('builds wrapper distribution file names', () => {
        expect(normalizeGradleDistribution('8.14')).toBe('gradle-8.14-all.zip');
        expect(normalizeGradleDistribution('8.14-bin')).toBe('gradle-8.14-bin.zip');
        expect(normalizeGradleDistribution('8.14-all')).toBe('gradle-8.14-all.zip');
        expect(normalizeGradleDistribution('gradle-8.14-all.zip')).toBe('gradle-8.14-all.zip');
        expect(normalizeGradleDistribution('gradle-8.14-bin.zip')).toBe('gradle-8.14-bin.zip');
    });
});

describe('useAndroidXml', () => {
    test('updates colors while preserving comments and formatting', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'colors.xml');
        fs.writeFileSync(file, [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<resources>',
            '    <!-- brand colors -->',
            '    <color name="brand">#000000</color>',
            '</resources>',
            '',
        ].join('\n'));

        expect(setColorResource(file, 'brand', '#123456')).toBe('updated');
        expect(setColorResource(file, 'accent', '#abcdef')).toBe('updated');

        const content = fs.readFileSync(file, 'utf-8');
        expect(content).toContain('<!-- brand colors -->');
        expect(content).toContain('<color name="brand">#123456</color>');
        expect(content).toContain('<color name="accent">#abcdef</color>');
    });

    test('creates a colors.xml when missing', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'values/colors.xml');

        expect(setColorResource(file, 'brand', '#123456')).toBe('created');
        expect(fs.readFileSync(file, 'utf-8')).toContain('<color name="brand">#123456</color>');
    });

    test('updates and adds style items while preserving comments', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'styles.xml');
        fs.writeFileSync(file, [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<resources>',
            '    <!-- launch theme -->',
            '    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">',
            '        <!-- window background -->',
            '        <item name="android:windowBackground">@drawable/launch_background</item>',
            '    </style>',
            '</resources>',
            '',
        ].join('\n'));

        expect(setStyleItem(file, 'LaunchTheme', 'android:windowBackground', '@drawable/splash_screen')).toBe(true);
        expect(setStyleItem(file, 'LaunchTheme', 'android:windowSplashScreenBackground', '@color/splash_color')).toBe(true);
        expect(setStyleItem(file, 'Missing', 'x', 'y')).toBe(false);

        const content = fs.readFileSync(file, 'utf-8');
        expect(content).toContain('<!-- launch theme -->');
        expect(content).toContain('<!-- window background -->');
        expect(content).toContain('<item name="android:windowBackground">@drawable/splash_screen</item>');
        expect(content).toContain('<item name="android:windowSplashScreenBackground">@color/splash_color</item>');
        expect(content).toContain('</style>');
    });
});
