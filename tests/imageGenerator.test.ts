import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import {DOMParser} from '@xmldom/xmldom';
import xcode from 'xcode';
import {cleanupTempDirs, inTempDir, writeFixture} from './helpers.ts';
import {parsePubspecYaml} from '../src/yamlParser.ts';
import {useImageGenerator} from '../src/useImageGenerator.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';

afterEach(cleanupTempDirs);

function snapshotTree(dir: string) {
    const entries: Record<string, string> = {};

    function walk(current: string) {
        for (const name of fs.readdirSync(current).sort()) {
            const full = path.join(current, name);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                walk(full);
            } else {
                entries[path.relative(dir, full)] = crypto.createHash('sha256')
                    .update(fs.readFileSync(full))
                    .digest('hex');
            }
        }
    }

    walk(dir);
    return entries;
}

function parseXml(filePath: string) {
    const errors: string[] = [];
    const document = new DOMParser({
        onError: (level, message) => {
            errors.push(`${level}: ${message}`);
        },
    }).parseFromString(fs.readFileSync(filePath, 'utf-8'), 'text/xml');

    expect(errors).toEqual([]);
    return document;
}

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>App</string>
</dict>
</plist>
`;

const manifest = `<manifest
        xmlns:android="http://schemas.android.com/apk/res/android">
    <application
            android:name="\${applicationName}">
    </application>
</manifest>
`;

const pbxproj = `// !$*UTF8*$!
{
    objects = {
        111 /* Debug */ = {
            isa = XCBuildConfiguration;
            buildSettings = {
                ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
            };
        };
    };
}
`;

const configYaml = `
fluttergen:
  icon:
    name:
      android: my_icon
      ios: MyIcon
    path: assets/icon.png
    bgColor: '#018290'
    borderRadius: 0.2
    padding: 0.05
  notificationIcon: false
  splash:
    name:
      android: splash_screen
      ios: LaunchImage
    path: assets/splash.png
    bgColor:
      light: '#00636E'
      dark: '#001F24'
    padding: 0.1
`;

async function writeImages() {
    fs.mkdirSync('assets', {recursive: true});
    await sharp({
        create: {width: 64, height: 64, channels: 4, background: {r: 1, g: 130, b: 144, alpha: 1}},
    }).png().toFile('assets/icon.png');

    await sharp({
        create: {width: 120, height: 60, channels: 4, background: {r: 0, g: 99, b: 110, alpha: 1}},
    }).png().toFile('assets/splash.png');
}

describe('useImageGenerator', () => {
    test('generates iOS and Android icons and splash assets', async () => {
        await inTempDir(async () => {
            writeFixture('ios/Runner/Info.plist', infoPlist);
            writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxproj);
            writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
            await writeImages();

            await useImageGenerator(parsePubspecYaml(configYaml)).execute();

            const appIconContentsPath = 'ios/Runner/Assets.xcassets/MyIcon.appiconset/Contents.json';
            expect(fs.existsSync(appIconContentsPath)).toBe(true);
            const appIconContents = JSON.parse(fs.readFileSync(appIconContentsPath, 'utf-8'));
            expect(appIconContents.images.length).toBeGreaterThan(15);
            expect(appIconContents.images.some((image: any) => image.filename?.includes('-dark'))).toBe(true);
            expect(appIconContents.images.some((image: any) => image.filename?.includes('-monochrome'))).toBe(true);

            const marketingIcon = 'ios/Runner/Assets.xcassets/MyIcon.appiconset/MyIcon-1024@1x.png';
            const metadata = await sharp(marketingIcon).metadata();
            expect(metadata.hasAlpha).toBe(false);

            const smallIcon = await sharp('ios/Runner/Assets.xcassets/MyIcon.appiconset/MyIcon-20@2x.png').metadata();
            expect(smallIcon.width).toBe(40);
            expect(smallIcon.height).toBe(40);

            for (const [density, size] of [['mdpi', 48], ['hdpi', 72], ['xxxhdpi', 192]] as const) {
                const image = await sharp(`android/app/src/main/res/mipmap-${density}/my_icon.png`).metadata();
                expect(image.width).toBe(size);
                expect(image.height).toBe(size);
            }

            const legacyIcon = await sharp('android/app/src/main/res/mipmap-xxxhdpi/my_icon.png')
                .ensureAlpha()
                .raw()
                .toBuffer({resolveWithObject: true});
            expect(legacyIcon.data[3]).toBe(0); // rounded corner

            const androidSplash = await sharp('android/app/src/main/res/drawable/splash_screen_image.png').metadata();
            expect(androidSplash.width).toBe(600);
            expect(androidSplash.height).toBe(300);

            expect(fs.existsSync('ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x-dark.png')).toBe(true);
            expect(fs.readFileSync('ios/Runner/Base.lproj/LaunchScreen.storyboard', 'utf-8'))
                .toContain('image="LaunchImage"');

            const plist = usePlist('ios/Runner/Info.plist');
            expect(plist.getSimple('CFBundleIconName')).toBe('MyIcon');
            expect(plist.getSimple('UILaunchStoryboardName')).toBe('LaunchScreen');
            expect(fs.readFileSync('ios/Runner.xcodeproj/project.pbxproj', 'utf-8'))
                .toContain('ASSETCATALOG_COMPILER_APPICON_NAME = MyIcon;');

            expect(fs.existsSync('android/app/src/main/res/mipmap-xxxhdpi/my_icon.png')).toBe(true);
            expect(fs.existsSync('android/app/src/main/res/mipmap-anydpi-v26/my_icon.xml')).toBe(true);
            expect(fs.existsSync('android/app/src/main/res/drawable/my_icon_foreground.png')).toBe(true);
            expect(fs.existsSync('android/app/src/main/res/drawable-night/my_icon_foreground.png')).toBe(true);
            expect(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8'))
                .toContain('android:icon="@mipmap/my_icon"');
            expect(fs.readFileSync('android/app/src/main/res/values/colors.xml', 'utf-8'))
                .toContain('my_icon_background');

            // notificationIcon: false must not generate notification assets
            expect(fs.existsSync('android/app/src/main/res/mipmap-mdpi/my_icon_notification.png')).toBe(false);

            // Validate the generated XML with a real parser.
            for (const file of [
                'android/app/src/main/AndroidManifest.xml',
                'android/app/src/main/res/values/colors.xml',
                'android/app/src/main/res/values/styles.xml',
                'android/app/src/main/res/values-night/styles.xml',
                'android/app/src/main/res/values-v31/styles.xml',
                'android/app/src/main/res/values-night-v31/styles.xml',
                'android/app/src/main/res/mipmap-anydpi-v26/my_icon.xml',
                'android/app/src/main/res/drawable/my_icon_background.xml',
                'android/app/src/main/res/drawable/splash_screen.xml',
                'ios/Runner/Base.lproj/LaunchScreen.storyboard',
            ]) {
                expect(parseXml(file).documentElement.tagName).toBeTruthy();
            }

            // Validate the generated Xcode project with the xcode parser.
            expect(() => xcode.project('ios/Runner.xcodeproj/project.pbxproj').parseSync()).not.toThrow();
        });
    });

    test('skips Android generation for an iOS-only project', async () => {
        await inTempDir(async () => {
            writeFixture('ios/Runner/Info.plist', infoPlist);
            writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxproj);
            await writeImages();

            await useImageGenerator(parsePubspecYaml(configYaml)).execute();

            expect(fs.existsSync('ios/Runner/Assets.xcassets/MyIcon.appiconset/Contents.json')).toBe(true);
            expect(fs.existsSync('android')).toBe(false);
        });
    });

    test('honours notification options and square splash images', async () => {
        await inTempDir(async () => {
            writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
            fs.mkdirSync('assets', {recursive: true});
            await sharp({
                create: {width: 64, height: 64, channels: 4, background: {r: 1, g: 130, b: 144, alpha: 1}},
            }).png().toFile('assets/icon.png');
            await sharp({
                create: {width: 64, height: 64, channels: 4, background: {r: 0, g: 99, b: 110, alpha: 1}},
            }).png().toFile('assets/splash.png');
            await sharp({
                create: {width: 32, height: 32, channels: 4, background: {r: 255, g: 255, b: 255, alpha: 1}},
            }).png().toFile('assets/notif.png');

            const squareConfig = `
fluttergen:
  icon:
    path: assets/icon.png
    bgColor: '#018290'
    borderRadius: 0.3
    padding: 0.05
  notificationIcon:
    path: assets/notif.png
    name: notif_icon
    tintColor: '#abcdef'
    padding: 0.1
  splash:
    path: assets/splash.png
    bgColor: '#00636E'
    borderRadius: 0.2
    padding: 0
`;

            await useImageGenerator(parsePubspecYaml(squareConfig)).execute();

            expect(fs.existsSync('android/app/src/main/res/mipmap-mdpi/notif_icon.png')).toBe(true);

            const colors = fs.readFileSync('android/app/src/main/res/values/colors.xml', 'utf-8');
            expect(colors).toContain('notification_accent_color');
            expect(colors).toContain('#abcdef');

            const manifestContent = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(manifestContent).toContain('com.google.firebase.messaging.default_notification_icon');
            expect(manifestContent).toContain('@mipmap/notif_icon');
            expect(manifestContent).toContain('@color/notification_accent_color');

            const v31 = fs.readFileSync('android/app/src/main/res/values-v31/styles.xml', 'utf-8');
            expect(v31).toContain('@drawable/splash_screen_image');
            expect(fs.existsSync('android/app/src/main/res/drawable/splash_screen_image.png')).toBe(true);

            const squareSplash = await sharp('android/app/src/main/res/drawable/splash_screen_image.png').metadata();
            expect(squareSplash.width).toBe(600);
            expect(squareSplash.height).toBe(600);
        });
    });

    test('produces an identical tree when run twice', async () => {
        await inTempDir(async () => {
            writeFixture('ios/Runner/Info.plist', infoPlist);
            writeFixture('ios/Runner.xcodeproj/project.pbxproj', pbxproj);
            writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
            await writeImages();

            const generator = useImageGenerator(parsePubspecYaml(configYaml));
            await generator.execute();
            const firstRun = snapshotTree('.');

            await generator.execute();
            const secondRun = snapshotTree('.');

            expect(secondRun).toEqual(firstRun);
        });
    });
});
