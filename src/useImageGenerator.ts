// noinspection SpellCheckingInspection,GrazieInspection,HttpUrlsUsage

import fs from "fs";
import path from "path";
import sharp from "sharp";
import {FluttergenConfig} from "./yaml_parser.ts";
import {colorConverter, transparentRgb} from "./colorConverter.ts";
import {useInfoPlist} from "./useInfoPlist.ts";
import {useIosContentsJson} from "./useIosContentsJson.ts";
import {useXmlParser} from "./xml.ts";
import {useAndroidManifest} from "./useAndroidManifest.ts";

const ensureArr = (item: any) => Array.isArray(item) ? item : (item ? [item] : []);

function ensureNoExtension(filePath: string): string {
    const parts = filePath.split('.');
    if (parts.length > 1) {
        parts.pop();
    }
    return parts.join('.');
}

export function useImageGenerator(config: FluttergenConfig) {
    // console.log("Generating icons and splash with config:", config);
    const androidResFolder = "./android/app/src/main/res";
    const iosAssetsFolder = "./ios/Runner/Assets.xcassets";
    const androidIconName = config.icon.name.android;
    const iosIconName = config.icon.name.ios;
    const androidSplashName = config.splash.name.android;
    const iosSplashName = config.splash.name.ios;
    const storyboardName = 'LaunchScreen';

    async function generateIosIcons() {
        const iconContents = useIosContentsJson(path.join(iosAssetsFolder, `${iosIconName}.appiconset/Contents.json`));
        iconContents.deleteOldFiles();
        type T = {
            borderRadius: number | undefined;
            path: string;
            bgColor?: string;
            grayscale?: true;
            idiom: string;
            size: number;
            scale: number;
            suffix?: string;
            appearances?: 'dark' | 'monochrome';
        }

        async function resizeAndAdd(t: T) {
            const fileName = `${iosIconName}-${t.size}@${t.scale}x${t.suffix ?? ''}.png`;
            await resizeImage({
                borderRadius: t.borderRadius,
                inputPath: t.path,
                bgColor: t.bgColor,
                width: t.size * t.scale,
                height: t.size * t.scale,
                outputPath: path.join(iosAssetsFolder, `${iosIconName}.appiconset`, fileName),
                padding: config.icon.padding.ios,
                grayscale: t.suffix === '-monochrome' ? true : undefined,
            });
            iconContents.add(t.idiom, `${t.size}x${t.size}`, `${t.scale}x`, fileName, t.appearances);
        }

        const iconConfigs = [
            ['iphone', 20, [2, 3]],
            ['iphone', 29, [2, 3]],
            ['iphone', 40, [2, 3]],
            ['iphone', 60, [2, 3]],
            ['ipad', 20, [1, 2]],
            ['ipad', 29, [1, 2]],
            ['ipad', 40, [1, 2]],
            ['ipad', 76, [1, 2]],
            ['ipad', 83.5, [2]],
            ['ios-marketing', 1024, [1]],
        ] as const;
        for (const [idiom, size, scales] of iconConfigs) {
            // console.log(`Resizing icon to ${size}x${size} for iOS idiom ${idiom} with scales ${scales.join(', ')}`);
            for (const scale of scales) {
                await resizeAndAdd({
                    borderRadius: config.icon.borderRadius,
                    path: config.icon.path.light,
                    bgColor: config.icon.bgColor.light,
                    idiom, size, scale,
                });
            }

            // 'appearances' for ios-marketing (dark and tinted)
            if (idiom === 'ios-marketing') {
                await resizeAndAdd({
                    borderRadius: config.icon.borderRadius,
                    path: config.icon.path.dark,
                    bgColor: config.icon.bgColor.dark,
                    idiom, size,
                    scale: scales[0],
                    suffix: '-dark',
                    appearances: 'dark',
                });
                await resizeAndAdd({
                    borderRadius: config.icon.borderRadius,
                    path: config.icon.path.light,
                    bgColor: config.icon.bgColor.light,
                    idiom, size,
                    scale: scales[0],
                    suffix: '-monochrome',
                    appearances: 'monochrome',
                });
            }
        }
        iconContents.save();
        console.log(`- iOS icons (${iosIconName}) generated.`);

        const plist = useInfoPlist('./ios/Runner/Info.plist');
        plist.ensureKeyValue('CFBundleIconName', `<string>${iosIconName}</string>`);
    }

    async function generateIosSplashScreen() {
        const imgMeta = await sharp(config.splash.path.light).metadata();
        if (!imgMeta.width || !imgMeta.height) {
            throw new Error("Could not get image dimensions for iOS splash screen.");
        }
        const storyboardWidth = 393;
        const storyboardHeight = 852;
        let width1x, height1x;
        // iphone7,8,SE: 375x667 pt
        if (imgMeta.width >= imgMeta.height) {
            const wScale = storyboardWidth * (1 - config.splash.padding.ios) / imgMeta.width;
            width1x = Math.floor(wScale * imgMeta.width);
            height1x = Math.floor(wScale * imgMeta.height);
        } else {
            const hScale = storyboardHeight * (1 - config.splash.padding.ios) / imgMeta.height;
            width1x = Math.floor(hScale * imgMeta.width);
            height1x = Math.floor(hScale * imgMeta.height);
        }

        const splashImageContents = useIosContentsJson(path.join(iosAssetsFolder, `${iosSplashName}.imageset/Contents.json`));
        splashImageContents.deleteOldFiles();
        for (const suffix of ['', '-dark']) {
            for (const scale of [1, 2, 3]) {
                const fileName = `${iosSplashName}@${scale}x${suffix}.png`;
                const outputPath = path.join(iosAssetsFolder, `${iosSplashName}.imageset`, fileName);
                await resizeImage({
                    borderRadius: config.icon.borderRadius,
                    inputPath: suffix == '-dark' ? config.splash.path.dark : config.splash.path.light,
                    width: width1x * scale,
                    height: height1x * scale,
                    outputPath,

                    // these are for the storyboard
                    bgColor: undefined,
                    padding: 0,
                    transparent: true,
                });
                splashImageContents.add(
                    'universal',
                    undefined,
                    `${scale}x`,
                    fileName,
                    suffix == '-dark' ? 'dark' : undefined
                );
            }
        }
        splashImageContents.save();
        console.log(`- iOS splash images (${iosSplashName}) generated.`);

        const rgb = colorConverter.anyToRgba(config.splash.bgColor.light);
        const rgbDark = colorConverter.anyToRgba(config.splash.bgColor.dark);
        const colorAsset = {
            "colors": [
                {
                    "color": rgb
                        ? {"color-space": "srgb", "components": {"alpha": "1.000", "red": (rgb.r / 255).toFixed(3), "green": (rgb.g / 255).toFixed(3), "blue": (rgb.b / 255).toFixed(3)}}
                        : {"reference": "systemBackgroundColor"} as any,
                    "idiom": "universal"
                },
                {
                    "appearances": [{"appearance": "luminosity", "value": "dark"}],
                    "color": rgbDark
                        ? {"color-space": "srgb", "components": {"alpha": "1.000", "red": (rgbDark.r / 255).toFixed(3), "green": (rgbDark.g / 255).toFixed(3), "blue": (rgbDark.b / 255).toFixed(3)}}
                        : {"reference": "systemBackgroundColor"} as any,
                    "idiom": "universal"
                }
            ],
            "info": {"author": "fluttergen", "version": 1}
        }
        fs.mkdirSync(`./ios/Runner/Assets.xcassets/${iosSplashName}BackColor.colorset`, {recursive: true});
        fs.writeFileSync(`./ios/Runner/Assets.xcassets/${iosSplashName}BackColor.colorset/Contents.json`, JSON.stringify(colorAsset, null, 2));
        console.log(`- iOS splash background color asset (${iosSplashName}BackColor) generated.`);

        // @ts-ignore
        const splashContent = (await import("./stub/ios-splash.txt")).default
            .replaceAll('{ASSET-NAME}', iosSplashName)
            .replaceAll('{IMAGE-WIDTH}', width1x.toString())
            .replaceAll('{IMAGE-HEIGHT}', height1x.toString())
            .replaceAll('{COLOR-VAR}', `${iosSplashName}BackColor`)
            .replaceAll('{CONTENT-WEIGHT}', (1 - 2 * config.splash.padding.ios).toString())

        const outputPath = `./ios/Runner/Base.lproj/${storyboardName}.storyboard`;
        fs.mkdirSync(path.dirname(outputPath), {recursive: true});
        fs.writeFileSync(outputPath, splashContent);
        console.log(`- iOS splash storyboard (${storyboardName}.storyboard) generated.`);

        const plist = useInfoPlist('./ios/Runner/Info.plist');
        plist.ensureKeyValue('UILaunchStoryboardName', `<string>${storyboardName}</string>`);
    }

    async function generateAndroidIcons() {
        const mipmapScales = {
            'mdpi': 1,
            'hdpi': 1.5,
            'xhdpi': 2,
            'xxhdpi': 3,
            'xxxhdpi': 4,
        } as const;
        for (const [folder, scale] of Object.entries({...mipmapScales, './assets/icon-512x512.png': 512})) {
            const asIs = scale == 512;
            await resizeImage({
                borderRadius: config.icon.borderRadius,
                inputPath: config.icon.path.light,
                bgColor: config.icon.bgColor.light,
                width: asIs ? scale : Math.round(48 * scale),
                height: asIs ? scale : Math.round(48 * scale),
                outputPath: asIs ? folder : `${androidResFolder}/mipmap-${folder}/${androidIconName}.png`,
                padding: config.icon.padding.android,
            });
        }
        console.log("- Android icons (mipmap/*) generated.");

        // ADAPTIVE ICONS
        const rgb = colorConverter.anyToRgba(config.icon.bgColor.light) || transparentRgb;
        const rgbDark = colorConverter.anyToRgba(config.icon.bgColor.dark) || transparentRgb;
        await ensureColorResource('values', `${androidIconName}_background`, colorConverter.rgbaToHex(rgb).substring(0, 7));
        await ensureColorResource('values-night', `${androidIconName}_background`, colorConverter.rgbaToHex(rgbDark).substring(0, 7));

        const bgDrawablePath = path.join(androidResFolder, 'drawable', `${androidIconName}_background.xml`);
        fs.mkdirSync(path.dirname(bgDrawablePath), {recursive: true});
        const bgDrawableContent =
            `<?xml version="1.0" encoding="utf-8"?>\n` +
            `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n` +
            `\t<solid android:color="@color/${androidIconName}_background"/>\n` +
            `</shape>`;
        fs.writeFileSync(bgDrawablePath, bgDrawableContent);

        const adaptiveConfigs = [
            [108, `${androidResFolder}/mipmap-mdpi/[NAME]`],
            [162, `${androidResFolder}/mipmap-hdpi/[NAME]`],
            [216, `${androidResFolder}/mipmap-xhdpi/[NAME]`],
            [324, `${androidResFolder}/mipmap-xxhdpi/[NAME]`],
            [432, `${androidResFolder}/mipmap-xxxhdpi/[NAME]`],
        ] as const;
        for (const [size, outputPathTemplate] of adaptiveConfigs) {
            // full: 108
            // safe: 66
            const safeWidth = size * 66 / 108;
            const paddingWeight = (safeWidth * config.icon.padding.android + (size - safeWidth) / 2) / size;
            await resizeImage({
                borderRadius: config.icon.borderRadius,
                inputPath: config.icon.path.light,
                width: size,
                height: size,
                outputPath: outputPathTemplate.replace('[NAME]', androidIconName + '_foreground.png'),
                padding: paddingWeight,
                transparent: true,
                bgColor: undefined,
            });

            await resizeImage({
                borderRadius: config.icon.borderRadius,
                inputPath: config.icon.path.light,
                width: size,
                height: size,
                outputPath: outputPathTemplate.replace('[NAME]', androidIconName + '_monochrome.png'),
                padding: paddingWeight,
                transparent: true,
                grayscale: true,
                bgColor: undefined,
            });
        }

        // 4. Create mipmap-anydpi-v26/ic_launcher.xml
        const anydpiV26Path = path.join(androidResFolder, 'mipmap-anydpi-v26', `${androidIconName}.xml`);
        fs.mkdirSync(path.dirname(anydpiV26Path), {recursive: true});
        const anydpiV26Content = `<?xml version="1.0" encoding="utf-8"?>\n` +
            `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
            `\t<background android:drawable="@drawable/${androidIconName}_background"/>\n` +
            `\t<foreground android:drawable="@mipmap/${androidIconName}_foreground"/>\n` +
            `\t<monochrome android:drawable="@mipmap/${androidIconName}_monochrome"/>\n` +
            `</adaptive-icon>`;
        fs.writeFileSync(anydpiV26Path, anydpiV26Content);

        console.log("- Android adaptive icons generated.");

        const notificationColorName = 'notification_accent_color';
        const notificationIconName = config.notificationIcon !== false
            ? ensureNoExtension(config.icon.name.android || 'ic').replace('_launcher', '') + '_notification'
            : undefined;

        if (config.notificationIcon !== false) {
            await ensureColorResource('values', notificationColorName, '#ffffff');

            // 3. Generate Image for each density
            for (const [folder, scale] of Object.entries(mipmapScales)) {
                const mipmapFolder = path.join(androidResFolder, `mipmap-${folder}`);
                fs.mkdirSync(mipmapFolder, {recursive: true});

                const CANVAS_DP = 32;
                const CONTENT_DP = 24;
                // Calculate size based on the content area (24dp)
                const contentSizePx = CONTENT_DP * scale;

                await resizeImage({
                    borderRadius: 0,
                    inputPath: config.notificationIcon.path,
                    width: contentSizePx,
                    height: contentSizePx,
                    outputPath: path.join(mipmapFolder, `${notificationIconName}.png`),
                    padding: config.notificationIcon.padding ?? 0,
                    bgColor: undefined,
                    transparent: true,
                    whiteOnly: true,
                });
            }
            console.log(`- Android notification icons (${notificationIconName}) generated.`);
        }

        const manifest = useAndroidManifest();
        if (manifest) {
            manifest.ensureAttribute('application', 'android:icon', '@mipmap/' + androidIconName);
            if (config.notificationIcon !== false) {
                manifest.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_icon', `@mipmap/${notificationIconName}`);
                manifest.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_color', `@color/${notificationColorName}`);
            } else {
                console.log("- Android notification icon generation skipped as per configuration.");
            }
            console.log("- AndroidManifest.xml updated for icons.");
        }
    }

    async function generateAndroidSplashScreen() {
        const cfgStyles = {
            'values': {
                // @ts-ignore
                stub: (await import("./stub/styles.txt")).default,
                attrs: [
                    ['android:windowBackground', `@drawable/${androidSplashName}_light`, true]
                ],
            },
            'values-night': {
                // @ts-ignore
                stub: (await import("./stub/styles-night.txt")).default,
                attrs: [
                    ['android:windowBackground', `@drawable/${androidSplashName}_dark`, true]
                ],
            },
            'values-v31': {
                // @ts-ignore
                stub: (await import("./stub/styles-v31.txt")).default,
                attrs: [
                    ['android:windowSplashScreenAnimatedIcon', `@drawable/${androidSplashName}_12`, true],
                    ['android:windowSplashScreenBackground', `@color/${androidSplashName}_color`, false],
                ],
            },
        } as const;

        for (const [folder, {stub, attrs}] of Object.entries(cfgStyles)) {
            const stylesXmlPath = path.join(`./android/app/src/main/res/${folder}/styles.xml`);
            fs.mkdirSync(path.dirname(stylesXmlPath), {recursive: true});
            if (!fs.existsSync(stylesXmlPath)) {
                fs.writeFileSync(stylesXmlPath, stub);
            }
            let content = fs.readFileSync(stylesXmlPath, 'utf-8');

            for (const attr of attrs) {
                const [name, value, required] = attr;
                //TODO: find a better library to preserve comments!
                const [parsed, xmlBuilder] = await useXmlParser(content);
                const styles = ensureArr(parsed.resources.style);
                for (const style of styles) {
                    const items = ensureArr(style.item);

                    const index = items.findIndex((item: any) => item.$.name === name);
                    if (index !== -1) {
                        items[index]._ = value;
                    } else if (required) {
                        items.push({_: value, $: {name: name}});
                    }
                }
                content = xmlBuilder(parsed);
            }
            fs.writeFileSync(stylesXmlPath, content);
        }
        console.log("- Android styles.xml updated for splash screens.");

        const drawableFolder = path.join(androidResFolder, 'drawable');
        fs.mkdirSync(drawableFolder, {recursive: true});

        await resizeImage({
            borderRadius: config.splash.borderRadius,
            inputPath: config.splash.path.light,
            width: 432,
            height: 432,
            outputPath: path.join(drawableFolder, `${androidSplashName}_12.png`),
            padding: config.splash.padding.android,
            transparent: true,
            bgColor: undefined,
        });
        console.log(`- Android v31 splash animated icon (drawable/${androidSplashName}_12.png) generated.`);

        const rgb = colorConverter.rgbaToHex(colorConverter.anyToRgba(config.splash.bgColor.light), '#FFFFFF');
        const rgbDark = colorConverter.rgbaToHex(colorConverter.anyToRgba(config.splash.bgColor.dark), '#000000');
        const modes = ['light', 'dark'] as const;
        for (const mode of modes) {
            await ensureColorResource(mode == 'dark' ? 'values-night' : 'values', `${androidSplashName}_color`, mode == 'dark' ? rgbDark : rgb);

            const imgMeta = await sharp(config.splash.path[mode]).metadata();
            if (!imgMeta.width || !imgMeta.height) {
                throw new Error("Could not get image dimensions for Android splash screen.");
            }
            const targetSizeDp = 200;
            const targetScale = 3;
            const targetSizePx = targetSizeDp * targetScale;
            const aspectRatio = imgMeta.width / imgMeta.height;

            await resizeImage({
                borderRadius: config.splash.borderRadius,
                inputPath: config.splash.path[mode],
                width: aspectRatio >= 1 ? targetSizePx : Math.round(targetSizePx * aspectRatio),
                height: aspectRatio < 1 ? targetSizePx : Math.round(targetSizePx / aspectRatio),
                outputPath: path.join(drawableFolder, `${androidSplashName}_${mode}.png`),
                padding: 0, // CRUCIAL: Remove padding from the PNG
                transparent: true,
                bgColor: undefined,
            });
            console.log(`- Android ${mode} splash logo (drawable/${androidSplashName}_${mode}.png) generated.`);

            const paddingDp = 100;
            const splashXmlPath = path.join(drawableFolder, `${androidSplashName}_${mode}_xml.xml`);
            fs.writeFileSync(splashXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 1. Background color defined in colors.xml -->
    <item android:drawable="@color/${androidSplashName}_color" />

    <!-- 2. Centered logo with padding to ensure it's not glued to the edges -->
    <item android:top="${paddingDp}dp" 
          android:bottom="${paddingDp}dp" 
          android:left="${paddingDp}dp" 
          android:right="${paddingDp}dp">
        <bitmap 
            android:gravity="center"
            android:src="@drawable/${androidSplashName}_${mode}" />
    </item>
</layer-list>`);
            console.log(`- Android ${mode} splash drawable XML (drawable/${androidSplashName}_${mode}.xml) generated.`);
        }
    }

    type ResizeOptions = {
        borderRadius: number | undefined;
        inputPath: string;
        bgColor: string | undefined;
        outputPath: string;
        width: number;
        height: number;
        transparent?: true;
        grayscale?: true;
        whiteOnly?: true;
        padding?: number; // 0.0 to 1.0
    }

    async function resizeImage(opts: ResizeOptions) {
        const {width: fullWidth, height: fullHeight, padding = 0, borderRadius = 0, outputPath} = opts;

        const bgColorRgba = opts.transparent || !opts.bgColor
            ? transparentRgb
            : colorConverter.anyToRgba(opts.bgColor) || transparentRgb;

        fs.mkdirSync(path.dirname(outputPath), {recursive: true});

        const padX = Math.floor(fullWidth * padding);
        const padY = Math.floor(fullHeight * padding);
        const contentWidth = fullWidth - 2 * padX;
        const contentHeight = fullHeight - 2 * padY;

        let image = sharp(opts.inputPath).png();

        image = image.resize(contentWidth, contentHeight, {
            fit: 'contain',
            background: transparentRgb, // Always resize onto a transparent background
        });

        if (opts.whiteOnly) {
            image = image
                .grayscale()
                .tint({r: 255, g: 255, b: 255});
        } else if (opts.grayscale) {
            image = image.grayscale();
        }

        if (!opts.transparent && bgColorRgba.alpha > 0) {
            // Flatten the image onto the non-transparent background color
            const {alpha, ...rgb} = bgColorRgba;
            image = image.flatten({background: rgb});
        }

        if (padding > 0) {
            // Use the determined background color (will be transparent if opts.transparent is true)
            image = image
                .extend({
                    top: padY,
                    bottom: padY,
                    left: padX,
                    right: padX,
                    background: bgColorRgba,
                });
        }

        // 6. Corner Radius
        if (borderRadius > 0) {
            const mask = Buffer.from(
                `<svg><rect x="0" y="0" width="${fullWidth}" height="${fullHeight}" rx="${borderRadius * fullWidth}" ry="${borderRadius * fullHeight}" /></svg>`
            );
            image = image
                .composite([
                    {
                        input: mask,
                        blend: 'dest-in',
                    }
                ]);
        }

        await image.toFile(outputPath);
    }


    async function ensureColorResource(folder: 'values' | 'values-night', colorName: string, hexValue: string) {
        const colorsXmlPath = path.join(androidResFolder, folder, 'colors.xml');
        fs.mkdirSync(path.dirname(colorsXmlPath), {recursive: true});

        if (!fs.existsSync(colorsXmlPath)) {
            fs.writeFileSync(colorsXmlPath, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n<color name="${colorName}">${hexValue}</color>\n</resources>`);
            console.log(`- Android colors.xml created: Added ${colorName} to ${hexValue}`);
            return;
        }

        //TODO: find a better library to preserve comments!
        let [parsed, xmlBuilder] = await useXmlParser(fs.readFileSync(colorsXmlPath, 'utf-8'));
        if (!parsed.resources || typeof parsed.resources === 'string') {
            parsed.resources = {color: []};
        }
        const colors = ensureArr(parsed.resources.color);

        const index = colors.findIndex((item: any) => item.$.name === colorName);
        if (index !== -1) {
            colors[index]._ = hexValue;
        } else {
            colors.push({_: hexValue, $: {name: colorName}});
        }
        fs.writeFileSync(colorsXmlPath, xmlBuilder(parsed));
        console.log(`- Android colors.xml updated: Added ${colorName} to ${hexValue}`);
    }

    return {
        execute: async () => {
            await generateIosIcons();

            await generateIosSplashScreen();
            await generateAndroidIcons();
            await generateAndroidSplashScreen();
        },
    }
}

