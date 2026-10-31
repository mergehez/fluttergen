import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import path from 'path';
import {cleanupTempDirs, inTempDir, makeTempDir, writeFixture} from './helpers.ts';
import {colorConverter} from '../src/colorConverter.ts';
import {getConfigurationOptionsForHelp, parsePubspecYaml, parsePubspecYamlFile} from '../src/yamlParser.ts';

afterEach(cleanupTempDirs);

const minimalConfig = (extra = '') => `
fluttergen:
  icon:
    path: assets/icon.png
    bgColor: '#018290'
  splash:
    path: assets/splash.png
    bgColor: '#00636E'
${extra}`;

describe('colorConverter', () => {
    test('converts hex shorthand, alpha and fallbacks', () => {
        expect(colorConverter.hexToRgba('#FFFF')).toEqual({r: 255, g: 255, b: 255, alpha: 1});
        expect(colorConverter.hexToRgba('#0000')).toEqual({r: 0, g: 0, b: 0, alpha: 0});
        expect(colorConverter.rgbaToHex({r: 255, g: 0, b: 0, alpha: 1})).toBe('#FF0000');
        expect(colorConverter.rgbaToHex({r: 255, g: 0, b: 0, alpha: 0.5})).toBe('#FF000080');
        expect(colorConverter.rgbaToHex(undefined)).toBe('#00000000');
        expect(colorConverter.rgbaToHex(undefined, '#FFFFFF')).toBe('#FFFFFF');
    });

    test('converts functional color formats', () => {
        expect(colorConverter.anyToRgba('rgba(1, 2, 3, 0.5)')).toEqual({r: 1, g: 2, b: 3, alpha: 0.5});
        expect(colorConverter.anyToRgba('hsl(0, 100%, 50%)')).toEqual({r: 255, g: 0, b: 0, alpha: 1});
        expect(colorConverter.anyToRgba('hsl(0, 0%, 50%)')).toEqual({r: 128, g: 128, b: 128, alpha: 1});
        expect(colorConverter.anyToRgba(' #FFF ')).toEqual({r: 255, g: 255, b: 255, alpha: 1});
    });

    test('handles special values and rejects unsupported formats', () => {
        expect(colorConverter.anyToRgba(undefined)).toBeUndefined();
        expect(colorConverter.anyToRgba('none')).toBeUndefined();
        expect(colorConverter.anyToRgba('system')).toBeUndefined();
        expect(() => colorConverter.anyToRgba('not-a-color')).toThrow(/Unsupported color format/);
        expect(() => colorConverter.hslaToRgba('not-hsl')).toThrow(/Invalid HSLA/);
    });
});

describe('parsePubspecYaml', () => {
    test('applies defaults', () => {
        const config = parsePubspecYaml(minimalConfig());

        expect(config.icon.name).toEqual({android: 'ic_launcher', ios: 'AppIcon'});
        expect(config.splash.name).toEqual({android: 'splash_screen', ios: 'LaunchImage'});
        expect(config.icon.path.dark).toBe('assets/icon.png');
        expect(config.splash.path.dark).toBe('assets/splash.png');
        expect(config.icon.bgColor).toEqual({light: '#018290', dark: '#018290'});
        expect(config.icon.borderRadius).toBe(0);
        expect(config.icon.padding).toEqual({android: 0.16, ios: 0.16});
        expect(config.info).toBeUndefined();
        expect(config.workflows).toEqual({});
        expect(config.notificationIcon).toMatchObject({
            path: 'assets/icon.png',
            tintColor: '#FFFFFF',
            padding: 0,
        });
        expect(config.notificationIcon).not.toBe(false);
    });

    test('normalizes object and string forms', () => {
        const config = parsePubspecYaml(`
fluttergen:
  icon:
    path:
      light: assets/light.png
      dark: assets/dark.png
    bgColor:
      light: '#ffffff'
      dark: '#000000'
    name:
      android: android_icon.png
      ios: IosIcon.png
    borderRadius: 0.2
    padding:
      android: 0.1
      ios: 0.2
  splash:
    path: assets/splash.png
    bgColor: '#00636E'
    name: splash
    padding: 0.05
`);

        expect(config.icon.path).toEqual({light: 'assets/light.png', dark: 'assets/dark.png'});
        expect(config.icon.bgColor).toEqual({light: '#ffffff', dark: '#000000'});
        expect(config.icon.name).toEqual({android: 'android_icon', ios: 'IosIcon'});
        expect(config.icon.borderRadius).toBe(0.2);
        expect(config.icon.padding).toEqual({android: 0.1, ios: 0.2});
        expect(config.splash.name).toEqual({android: 'splash', ios: 'splash'});
        expect(config.splash.padding).toEqual({android: 0.05, ios: 0.05});
    });

    test('honours notification icon options and disable flag', () => {
        const custom = parsePubspecYaml(minimalConfig(`  notificationIcon:
    path: assets/notif.png
    tintColor: '#123456'
    name: notif_icon.png
    padding: 0.05
`));
        expect(custom.notificationIcon).toEqual({
            path: 'assets/notif.png',
            tintColor: '#123456',
            name: 'notif_icon.png',
            padding: 0.05,
        });

        const disabled = parsePubspecYaml(minimalConfig('  notificationIcon: false\n'));
        expect(disabled.notificationIcon).toBe(false);
    });

    test('filters empty scripts and keeps raw variables', () => {
        const config = parsePubspecYaml(minimalConfig(`  prescripts:
    -
    - runCommand('echo hi')
  variables:
    number: 42
    list: [1, 2]
    nested:
      key: value
`));

        expect(config.prescripts).toEqual([`runCommand('echo hi')`]);
        expect(config.variables.number).toBe(42);
        expect(config.variables.list).toEqual([1, 2]);
        expect(config.variables.nested).toEqual({key: 'value'});
    });

    test('parses named workflows', () => {
        const config = parsePubspecYaml(minimalConfig(`  workflows:
    clean:
      - run: flutter clean
      - delete: [android, ios]
    prepare:
      - flutter.pubGet
      - use: clean
`));

        expect(config.workflows.clean).toEqual([
            {run: 'flutter clean'},
            {delete: ['android', 'ios']},
        ]);
        expect(config.workflows.prepare).toEqual([
            'flutter.pubGet',
            {use: 'clean'},
        ]);
    });

    test('reads config from disk', () => {
        const dir = makeTempDir();
        const file = path.join(dir, 'pubspec.yaml');
        fs.writeFileSync(file, minimalConfig());

        expect(parsePubspecYamlFile(file).icon.name.android).toBe('ic_launcher');
    });

    test('reports missing files and missing config clearly', () => {
        expect(() => parsePubspecYamlFile(path.join(makeTempDir(), 'missing.yaml')))
            .toThrow(/Required file not found/);
        expect(() => parsePubspecYaml('')).toThrow(/empty or invalid/);
        expect(() => parsePubspecYaml('name: app\n')).toThrow(/Missing 'fluttergen'/);
    });

    test('reports schema violations with paths', () => {
        expect(() => parsePubspecYaml(`
fluttergen:
  icon:
    path: assets/icon.png
    bgColor: '#fff'
`)).toThrow(/splash/);

        expect(() => parsePubspecYaml(minimalConfig(`  info:
    appName: App
    bundleIdentifier: com.example.app
    applicationId: com.example.app
    androidMinSdkVersion: 'twenty'
`))).toThrow(/info\.androidMinSdkVersion/);
    });

    test('throws for missing environment variables', () => {
        expect(() => parsePubspecYaml(minimalConfig(`  variables:
    token: env.FLUTTERGEN_MISSING_ENV
`))).toThrow(/Environment variable 'FLUTTERGEN_MISSING_ENV' not found/);
    });

    test('reads environment variables from .env files', async () => {
        await inTempDir(() => {
            writeFixture('.env', 'FLUTTERGEN_FILE_ENV=from-file\n');

            const config = parsePubspecYaml(minimalConfig(`  variables:
    value: env.FLUTTERGEN_FILE_ENV
`));
            expect(config.variables.value).toBe('from-file');
        });
    });

    test('renders configuration help from the schema', () => {
        const help = getConfigurationOptionsForHelp();

        expect(help).toContain('info');
        expect(help).toContain('appName');
        expect(help).toContain('notificationIcon');
        expect(help).toContain('prescripts');
        expect(help).toContain('workflows');
        expect(help).toContain('Required fields are marked');
    });
});
