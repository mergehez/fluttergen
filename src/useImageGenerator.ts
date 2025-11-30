// noinspection SpellCheckingInspection,GrazieInspection,HttpUrlsUsage

import fs from "fs";
import path from "path";
import sharp from "sharp";
import {FluttergenConfig} from "./yamlParser.ts";
import {colorConverter, transparentRgb} from "./colorConverter.ts";
import {usePlist} from "fileHandler/usePlist.ts";
import {useIosContentsJson} from "fileHandler/useIosContentsJson.ts";
import {useXmlParser} from "fileHandler/useXmlParser.ts";
import {useAndroidManifest} from "fileHandler/useAndroidManifest.ts";
import {KnownError} from "./knownError.ts";

const ensureArr = (item: any) => Array.isArray(item) ? item : (item ? [item] : []);

function ensureNoExtension(filePath: string): string {
    const parts = filePath.split('.');
    if (parts.length > 1) {
        parts.pop();
    }
    return parts.join('.');
}

function getEnsuredPath(...paths: string[]) {
    const res = path.join(...paths);
    fs.mkdirSync(path.dirname(res), {recursive: true});
    return res;
}

function writeFileSync(filePath: string, content: string) {
    getEnsuredPath(filePath);
    fs.writeFileSync(filePath, content);
}

const androidResFolder = "./android/app/src/main/res";
const iosAssetsFolder = "./ios/Runner/Assets.xcassets";
const storyboardName = 'LaunchScreen';

export function useImageGenerator(cfg: FluttergenConfig) {

    async function generateIosIcons(iconCfg: FluttergenConfig['icon']) {
        const iconFileName = iconCfg.name.ios;
        const iconContents = useIosContentsJson(path.join(iosAssetsFolder, `${iconFileName}.appiconset/Contents.json`));
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
            appearances?: 'dark';
        }

        async function resizeAndAdd(t: T, monochromeAsWell = false) {
            const fileName = `${iconFileName}-${t.size}@${t.scale}x${t.suffix ?? ''}.png`;
            const outputPath = path.join(iosAssetsFolder, `${iconFileName}.appiconset`, fileName);
            const cfg = {
                borderRadius: t.borderRadius,
                inputPath: t.path,
                bgColor: t.bgColor,
                width: t.size * t.scale,
                height: t.size * t.scale,
                outputPath: outputPath,
                padding: iconCfg.padding.ios,
                grayscale: undefined,
            }
            await resizeImage(cfg);
            iconContents.add(t.idiom, `${t.size}x${t.size}`, `${t.scale}x`, fileName, t.appearances);

            if (monochromeAsWell) {
                const monoFileName = `${iconFileName}-${t.size}@${t.scale}x-monochrome.png`;
                await resizeImage({
                    ...cfg,
                    inputPath: outputPath,
                    outputPath: path.join(iosAssetsFolder, `${iconFileName}.appiconset`, monoFileName),
                    borderRadius: 0,
                    padding: 0,
                    grayscale: true
                });
                iconContents.add(t.idiom, `${t.size}x${t.size}`, `${t.scale}x`, monoFileName, 'monochrome');
            }
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
            const isBigIcon = idiom === 'ios-marketing'
            for (const scale of scales) {
                await resizeAndAdd({
                    borderRadius: isBigIcon ? 0 : iconCfg.borderRadius,
                    path: iconCfg.path.light,
                    bgColor: iconCfg.bgColor.light,
                    idiom, size, scale,
                }, isBigIcon);
                // 'appearances' for ios-marketing (dark and tinted)
                if (isBigIcon) {
                    await resizeAndAdd({
                        borderRadius: 0,
                        path: iconCfg.path.dark,
                        bgColor: iconCfg.bgColor.dark,
                        idiom, size,
                        scale: scales[0],
                        suffix: '-dark',
                        appearances: 'dark',
                    });
                }
            }

        }
        iconContents.save();
        console.log(`- iOS icons (${iconFileName}) generated.`);

        const plist = usePlist('./ios/Runner/Info.plist');
        plist.set('CFBundleIconName', 'string', iconFileName);
    }

    async function generateIosSplashScreen(splashCfg: FluttergenConfig['splash']) {
        const splashFileName = splashCfg.name.ios;
        const imgMeta = await sharp(splashCfg.path.light).metadata();
        if (!imgMeta.width || !imgMeta.height) {
            throw new KnownError("Could not get image dimensions for iOS splash screen.");
        }
        const storyboardWidth = 393;
        const storyboardHeight = 852;
        let width1x, height1x;
        // iphone7,8,SE: 375x667 pt
        if (imgMeta.width >= imgMeta.height) {
            const wScale = storyboardWidth * (1 - splashCfg.padding.ios) / imgMeta.width;
            width1x = Math.floor(wScale * imgMeta.width);
            height1x = Math.floor(wScale * imgMeta.height);
        } else {
            const hScale = storyboardHeight * (1 - splashCfg.padding.ios) / imgMeta.height;
            width1x = Math.floor(hScale * imgMeta.width);
            height1x = Math.floor(hScale * imgMeta.height);
        }

        const splashImageContents = useIosContentsJson(path.join(iosAssetsFolder, `${splashFileName}.imageset/Contents.json`));
        splashImageContents.deleteOldFiles();
        for (const suffix of ['', '-dark']) {
            for (const scale of [1, 2, 3]) {
                const fileName = `${splashFileName}@${scale}x${suffix}.png`;
                const outputPath = path.join(iosAssetsFolder, `${splashFileName}.imageset`, fileName);
                await resizeImage({
                    borderRadius: splashCfg.borderRadius,
                    inputPath: suffix == '-dark' ? splashCfg.path.dark : splashCfg.path.light,
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
        console.log(`- iOS splash images (${splashFileName}) generated.`);

        const rgb = colorConverter.anyToRgba(splashCfg.bgColor.light);
        const rgbDark = colorConverter.anyToRgba(splashCfg.bgColor.dark);
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
        writeFileSync(`./ios/Runner/Assets.xcassets/${splashFileName}BackColor.colorset/Contents.json`, JSON.stringify(colorAsset, null, 2));
        console.log(`- iOS splash background color asset (${splashFileName}BackColor) generated.`);

        // @ts-ignore
        const splashContent = (await import("./stub/ios-splash.txt")).default
            .replaceAll('{ASSET-NAME}', splashFileName)
            .replaceAll('{IMAGE-WIDTH}', width1x.toString())
            .replaceAll('{IMAGE-HEIGHT}', height1x.toString())
            .replaceAll('{COLOR-VAR}', `${splashFileName}BackColor`)
            .replaceAll('{CONTENT-WEIGHT}', (1 - 2 * splashCfg.padding.ios).toString())

        writeFileSync(`./ios/Runner/Base.lproj/${storyboardName}.storyboard`, splashContent);
        console.log(`- iOS splash storyboard (${storyboardName}.storyboard) generated.`);

        const plist = usePlist('./ios/Runner/Info.plist');
        plist.set('UILaunchStoryboardName', 'string', storyboardName);
    }

    async function generateAndroidIcons(iconCfg: FluttergenConfig['icon'], notifCfg: FluttergenConfig['notificationIcon']) {
        const iconFileName = iconCfg.name.android;
        // Helper function for generating adaptive icon foregrounds/monochromes
        const generateAdaptiveIconForMode = async (mode: 'light' | 'dark', drawableFolder: string) => {
            // 1. Determine the correct image path based on the mode
            const inputPath = mode === 'dark' ? iconCfg.path.dark : iconCfg.path.light;

            // Use XXXHDPI size (432px) as the base for high-quality adaptive drawables
            const size = 432;
            const paddingWeight = (size * 66 / 108 * iconCfg.padding.android + (size - size * 66 / 108) / 2) / size;

            console.log(`- Generating ${mode} adaptive icon foreground to ${drawableFolder}/`);

            // --- Generate Foreground (colored) ---
            await resizeImage({
                borderRadius: iconCfg.borderRadius,
                inputPath: inputPath,
                width: size,
                height: size,
                outputPath: path.join(androidResFolder, drawableFolder, `${iconFileName}_foreground.png`),
                padding: paddingWeight,
                transparent: true,
                bgColor: undefined,
            });

            // --- Generate Monochrome (grayscale) ---
            await resizeImage({
                borderRadius: iconCfg.borderRadius,
                inputPath: inputPath,
                width: size,
                height: size,
                outputPath: path.join(androidResFolder, drawableFolder, `${iconFileName}_monochrome.png`),
                padding: paddingWeight,
                transparent: true,
                grayscale: true,
                bgColor: undefined,
            });
        };

        // ------------------------------------------------
        // 1. LEGACY ICONS (Non-Adaptive, Mipmap folders)
        // ------------------------------------------------

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
                borderRadius: iconCfg.borderRadius,
                inputPath: iconCfg.path.light,
                bgColor: iconCfg.bgColor.light,
                width: asIs ? scale : Math.round(48 * scale),
                height: asIs ? scale : Math.round(48 * scale),
                outputPath: asIs ? folder : `${androidResFolder}/mipmap-${folder}/${iconFileName}.png`,
                padding: iconCfg.padding.android,
            });
        }
        console.log("- Android legacy icons (mipmap/*) generated.");

        // ------------------------------------------------
        // 2. ADAPTIVE ICON BACKGROUND COLORS (Light/Dark Mode)
        // ------------------------------------------------

        const rgb = colorConverter.anyToRgba(iconCfg.bgColor.light) || transparentRgb;
        const rgbDark = colorConverter.anyToRgba(iconCfg.bgColor.dark) || transparentRgb;

        // Define color resources for light and dark mode backgrounds
        await ensureColorResource('values', `${iconFileName}_background`, colorConverter.rgbaToHex(rgb).substring(0, 7));
        await ensureColorResource('values-night', `${iconFileName}_background`, colorConverter.rgbaToHex(rgbDark).substring(0, 7));

        // Create a simple XML shape drawable for the background color (references the color resource)
        const bgDrawableContent =
            `<?xml version="1.0" encoding="utf-8"?>\n` +
            `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n` +
            `\t<solid android:color="@color/${iconFileName}_background"/>\n` +
            `</shape>`;
        writeFileSync(getEnsuredPath(androidResFolder, 'drawable', `${iconFileName}_background.xml`), bgDrawableContent);

        // ------------------------------------------------
        // 3. ADAPTIVE ICON FOREGROUND (Light/Dark Images)
        // ------------------------------------------------

        // Process Light Mode Foreground/Monochrome (to default 'drawable' folder)
        await generateAdaptiveIconForMode('light', 'drawable');

        // Process Dark Mode Foreground/Monochrome (to 'drawable-night' folder)
        getEnsuredPath(androidResFolder, 'drawable-night')
        await generateAdaptiveIconForMode('dark', 'drawable-night');

        // ------------------------------------------------
        // 4. ADAPTIVE ICON XML DEFINITION (API 26+)
        // ------------------------------------------------

        // IMPORTANT: Reference @drawable/ for the foreground/monochrome to enable theme swapping
        const anydpiV26Content = `<?xml version="1.0" encoding="utf-8"?>\n` +
            `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n` +
            `\t<background android:drawable="@drawable/${iconFileName}_background"/>\n` +
            `\t<foreground android:drawable="@drawable/${iconFileName}_foreground"/>\n` +
            `\t<monochrome android:drawable="@drawable/${iconFileName}_monochrome"/>\n` +
            `</adaptive-icon>`;
        writeFileSync(path.join(androidResFolder, 'mipmap-anydpi-v26', `${iconFileName}.xml`), anydpiV26Content);

        console.log("- Android adaptive icons generated.");

        // ------------------------------------------------
        // 5. NOTIFICATION ICONS
        // ------------------------------------------------

        const notificationColorName = 'notification_accent_color';
        const notificationIconName = notifCfg !== false
            ? ensureNoExtension(iconCfg.name.android || 'ic').replace('_launcher', '') + '_notification'
            : undefined;

        if (notifCfg !== false && notifCfg.path) {
            await ensureColorResource('values', notificationColorName, '#ffffff');

            // Generate Image for each density
            for (const [folder, scale] of Object.entries(mipmapScales)) {
                const mipmapFolder = getEnsuredPath(androidResFolder, `mipmap-${folder}`);

                await resizeImage({
                    borderRadius: 0,
                    inputPath: notifCfg.path,
                    width: 24 * scale,
                    height: 24 * scale,
                    outputPath: path.join(mipmapFolder, `${notificationIconName}.png`),
                    padding: notifCfg.padding ?? 0,
                    bgColor: undefined,
                    transparent: true,
                    whiteOnly: true,
                });
            }
            console.log(`- Android notification icons (${notificationIconName}) generated.`);
        } else {
            console.log("- Android notification icon generation skipped as per configuration.");
        }

        // ------------------------------------------------
        // 6. MANIFEST UPDATE
        // ------------------------------------------------

        const manifest = useAndroidManifest();
        if (manifest) {
            manifest.ensureAttribute('application', 'android:icon', '@mipmap/' + iconFileName);
            if (notifCfg !== false) {
                manifest.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_icon', `@mipmap/${notificationIconName}`);
                manifest.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_color', `@color/${notificationColorName}`);
            }
            console.log("- AndroidManifest.xml updated for icons.");
        }
    }

    async function generateAndroidSplashScreen(splashCfg: FluttergenConfig['splash'], iconName: string) {
        const splashFileName = splashCfg.name.android;
        const valuesStyle = {
            // @ts-ignore
            light: useStylesXml('values', (await import("./stub/styles.txt")).default),
            // @ts-ignore
            dark: useStylesXml('values-night', (await import("./stub/styles-night.txt")).default),
        };
        const valuesV31Style = {
            // @ts-ignore
            light: useStylesXml('values-v31', (await import("./stub/styles-v31.txt")).default),
            // @ts-ignore
            dark: useStylesXml('values-night-v31', (await import("./stub/styles-v31.txt")).default)
        }

        console.log("- Android styles.xml files updated for splash screens.");

        const createDrawableXml = (drawableName: string) => `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <bitmap 
            android:gravity="center"
            android:src="${drawableName}" />
    </item>
</layer-list>`;

        const rgb = colorConverter.rgbaToHex(colorConverter.anyToRgba(splashCfg.bgColor.light), '#FFFFFF');
        const rgbDark = colorConverter.rgbaToHex(colorConverter.anyToRgba(splashCfg.bgColor.dark), '#000000');
        for (const mode of ['light', 'dark'] as const) {
            await ensureColorResource(mode == 'dark' ? 'values-night' : 'values', `${splashFileName}_color`, mode == 'dark' ? rgbDark : rgb);
            const imgMeta = await sharp(splashCfg.path[mode]).metadata();
            if (!imgMeta.width || !imgMeta.height) {
                throw new KnownError("Could not get image dimensions for Android splash screen.");
            }
            const targetSizeDp = 200;
            const targetScale = 3;
            const targetSizePx = targetSizeDp * targetScale;
            const aspectRatio = imgMeta.width / imgMeta.height;

            const drawableFolder = mode == 'dark' ? 'drawable-night' : 'drawable';

            const cfg = {
                borderRadius: splashCfg.borderRadius,
                inputPath: splashCfg.path[mode],
                width: aspectRatio >= 1 ? targetSizePx : Math.round(targetSizePx * aspectRatio),
                height: aspectRatio < 1 ? targetSizePx : Math.round(targetSizePx / aspectRatio),
                outputPath: path.join(androidResFolder, drawableFolder, `${splashFileName}_image.png`),
                padding: 0, // CRUCIAL: Remove padding from the PNG
                transparent: true,
                bgColor: undefined,
            } as const;
            await resizeImage(cfg);
            console.log(`- Android ${mode} splash logo (${drawableFolder}/${splashFileName}_image.png) generated.`);

            writeFileSync(path.join(androidResFolder, drawableFolder, `${splashFileName}.xml`), createDrawableXml(`@drawable/${splashFileName}_image`));
            console.log(`- Android ${mode} splash drawable XML (drawable/${splashFileName}.xml) generated.`);

            await valuesStyle[mode].ensureAttribute('android:windowBackground', `@drawable/${splashFileName}`);

            const useIconAsFallback = aspectRatio != 1;
            if (useIconAsFallback)
                console.log(`- Android ${mode} splash logo for v31: using icon image as fallback because splash image is not square.`);
            await valuesV31Style[mode].ensureAttribute('android:windowSplashScreenAnimatedIcon', useIconAsFallback ? `@mipmap/${iconName}` : `@drawable/${splashFileName}_image`);
            await valuesV31Style[mode].ensureAttribute('android:windowSplashScreenBackground', `@color/${splashFileName}_color`);
        }
    }

    function useStylesXml(folder: string, stubContent: string) {
        const stylesXmlPath = getEnsuredPath(`./android/app/src/main/res/${folder}/styles.xml`);
        if (!fs.existsSync(stylesXmlPath)) {
            fs.writeFileSync(stylesXmlPath, stubContent);
        }

        return {
            ensureAttribute: async (name: string, value: string, required: boolean = true) => {
                let content = fs.readFileSync(stylesXmlPath, 'utf-8');
                const [parsed, xmlBuilder] = await useXmlParser(content);
                const styles = ensureArr(parsed.resources.style);
                for (const style of styles) {
                    if (style.$.name !== 'LaunchTheme')
                        continue;
                    const items = ensureArr(style.item);

                    const index = items.findIndex((item: any) => item.$.name === name);
                    if (index !== -1) {
                        items[index]._ = value;
                    } else if (required) {
                        items.push({_: value, $: {name: name}});
                    }
                }
                fs.writeFileSync(stylesXmlPath, xmlBuilder(parsed));
            }
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

        getEnsuredPath(outputPath);

        const padX = Math.floor(fullWidth * padding);
        const padY = Math.floor(fullHeight * padding);
        const contentWidth = fullWidth - 2 * padX;
        const contentHeight = fullHeight - 2 * padY;

        let image = sharp(opts.inputPath).png();

        image = image.resize(contentWidth, contentHeight, {
            fit: 'contain',
            background: transparentRgb, // Always resize onto a transparent background
        });


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

        if (opts.whiteOnly) {
            image = image.grayscale().tint({r: 255, g: 255, b: 255});
        } else if (opts.grayscale) {
            image = image.grayscale();
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
        const colorsXmlPath = getEnsuredPath(androidResFolder, folder, 'colors.xml');

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
            await generateIosIcons(cfg.icon);

            await generateIosSplashScreen(cfg.splash);
            await generateAndroidIcons(cfg.icon, cfg.notificationIcon);
            await generateAndroidSplashScreen(cfg.splash, cfg.icon.name.android);
        },
    }
}

