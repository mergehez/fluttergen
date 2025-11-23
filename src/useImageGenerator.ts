import fs from "fs";
import path from "path";
import sharp from "sharp";
// @ts-ignore
import iosSplashTemplate from "./stub/ios-splash.txt";
// @ts-ignore
import andStylesXml from "./stub/styles.txt";
// @ts-ignore
import andStylesNightXml from "./stub/styles-night.txt";
// @ts-ignore
import andStylesV31Xml from "./stub/styles-v31.txt";
import {FluttergenConfig, YamlImageConfig} from "./yaml_parser.ts";
import {colorConverter, RgbObject} from "./colorConverter.ts";
import {useInfoPlist} from "./useInfoPlist.ts";
import {useIosContentsJson} from "./useIosContentsJson.ts";
import {useXmlParser} from "./xml.ts";
import {useAndroidManifest} from "./useAndroidManifest.ts";

const ensureArr = (item: any) => Array.isArray(item) ? item : (item ? [item] : []);

const androidResFolder = "./android/app/src/main/res";
const iosAssetsFolder = "./ios/Runner/Assets.xcassets";
const resizeConfig = {
    android: [
        [512, "./assets/icon-512x512.png"],

        [48, `${androidResFolder}/mipmap-mdpi/[NAME]`],
        [72, `${androidResFolder}/mipmap-hdpi/[NAME]`],
        [96, `${androidResFolder}/mipmap-xhdpi/[NAME]`],
        [144, `${androidResFolder}/mipmap-xxhdpi/[NAME]`],
        [192, `${androidResFolder}/mipmap-xxxhdpi/[NAME]`],
    ] satisfies [number, string][],
    androidAdaptive: [
        [108, `${androidResFolder}/mipmap-mdpi/[NAME]`],
        [162, `${androidResFolder}/mipmap-hdpi/[NAME]`],
        [216, `${androidResFolder}/mipmap-xhdpi/[NAME]`],
        [324, `${androidResFolder}/mipmap-xxhdpi/[NAME]`],
        [432, `${androidResFolder}/mipmap-xxxhdpi/[NAME]`],
    ] satisfies [number, string][],
    ios: [
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
    ] satisfies [string, number, number[]][],
    iosSplash: []
};

function ensureNoExtension(filePath: string): string {
    const parts = filePath.split('.');
    if (parts.length > 1) {
        parts.pop();
    }
    return parts.join('.');
}

export function useImageGenerator(config: FluttergenConfig) {
    // console.log("Generating icons and splash with config:", config);
    const androidIconName = ensureNoExtension(config.icon.androidName || 'ic_launcher');
    const iosIconName = ensureNoExtension(config.icon.iosName || 'AppIcon');
    const androidSplashName = ensureNoExtension(config.splash.androidName || 'splash_screen');
    const iosSplashName = ensureNoExtension(config.splash.iosName || 'LaunchImage');
    const storyboardName = 'LaunchScreen';
    const notificationIconName = androidIconName.replace('_launcher', '') + '_notification';
    const notificationColorName = 'notification_accent_color';
    const iosIconPadding = 0.05;
    const iosSplashPadding = 0.16;
    const androidAdaptivePadding = 0.16;
    const androidLegacyIconPadding = 0.05;

    async function generateIosIcons() {
        const iconContents = useIosContentsJson(path.join(iosAssetsFolder, `${iosIconName}.appiconset/Contents.json`));
        iconContents.deleteOldFiles();

        async function resizeAndAdd(iconConfig: YamlImageConfig, idiom: string, size: number, scale: number, suffix = '', appearances?: 'dark' | 'monochrome') {
            const fileName = `${iosIconName}-${size}@${scale}x${suffix}.png`;
            const outputPath = path.join(iosAssetsFolder, `${iosIconName}.appiconset`, fileName);
            await resizeImage({
                ...iconConfig,
                width: size * scale,
                height: size * scale,
                outputPath,
                padding: iosIconPadding,
                grayscale: suffix === '-monochrome' ? true : undefined,
            });
            iconContents.add(idiom, `${size}x${size}`, `${scale}x`, fileName, appearances);
        }

        for (const [idiom, size, scales] of resizeConfig.ios) {
            // console.log(`Resizing icon to ${size}x${size} for iOS idiom ${idiom} with scales ${scales.join(', ')}`);
            for (const scale of scales) {
                await resizeAndAdd(config.icon, idiom, size, scale);
            }

            // 'appearances' for ios-marketing (dark + tinted)
            if (idiom === 'ios-marketing') {
                if (config.icon.pathDark) {
                    await resizeAndAdd(
                        {...config.icon, path: config.icon.pathDark, bgColor: config.icon.bgColorDark ?? '',},
                        idiom, size, scales[0], '-dark',
                        'dark'
                    );
                }
                await resizeAndAdd(
                    config.icon,
                    idiom, size, scales[0], '-monochrome',
                    'monochrome'
                );
            }
        }
        iconContents.save();
        console.log(`- iOS icons (${iosIconName}) generated.`);

        const plist = useInfoPlist('./ios/Runner/Info.plist');
        plist.ensureKeyValue('CFBundleIconName', `<string>${iosIconName}</string>`);
    }

    async function generateIosSplashScreen() {
        const imgMeta = await sharp(config.splash.path).metadata();
        if (!imgMeta.width || !imgMeta.height) {
            throw new Error("Could not get image dimensions for iOS splash screen.");
        }
        const storyboardWidth = 393;
        const storyboardHeight = 852;
        let width1x, height1x;
        // iphone7,8,SE: 375x667 pt
        if (imgMeta.width >= imgMeta.height) {
            const wScale = storyboardWidth * (1 - iosSplashPadding) / imgMeta.width;
            width1x = Math.floor(wScale * imgMeta.width);
            height1x = Math.floor(wScale * imgMeta.height);
        } else {
            const hScale = storyboardHeight * (1 - iosSplashPadding) / imgMeta.height;
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
                    ...config.splash,
                    path: suffix ? config.splash.pathDark || config.splash.path : config.splash.path,
                    width: width1x * scale,
                    height: height1x * scale,
                    outputPath,

                    // these are for the storyboard
                    bgColor: '',
                    bgColorDark: '',
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

        const rgb = colorConverter.anyToRgba(config.splash.bgColor);
        const rgbDark = colorConverter.anyToRgba(config.splash.bgColorDark || config.splash.bgColor);
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

        const splashContent = iosSplashTemplate
            .replaceAll('{ASSET-NAME}', iosSplashName)
            .replaceAll('{IMAGE-WIDTH}', width1x.toString())
            .replaceAll('{IMAGE-HEIGHT}', height1x.toString())
            .replaceAll('{COLOR-VAR}', `${iosSplashName}BackColor`)
            .replaceAll('{CONTENT-WEIGHT}', (1 - 2 * iosSplashPadding).toString())

        const outputPath = `./ios/Runner/Base.lproj/${storyboardName}.storyboard`;
        fs.mkdirSync(path.dirname(outputPath), {recursive: true});
        fs.writeFileSync(outputPath, splashContent);
        console.log(`- iOS splash storyboard (${storyboardName}.storyboard) generated.`);


        const plist = useInfoPlist('./ios/Runner/Info.plist');
        plist.ensureKeyValue('UILaunchStoryboardName', `<string>${storyboardName}</string>`);
    }


    async function generateAndroidIcons() {
        for (const [size, outputPathTemplate] of resizeConfig.android) {
            const outputPath = outputPathTemplate.replace('[NAME]', androidIconName + '.png');
            await resizeImage({
                ...config.icon,
                width: size,
                height: size,
                outputPath,
                padding: androidLegacyIconPadding,
            });
        }
        console.log("- Android icons (mipmap/*) generated.");

        const rgb = colorConverter.anyToRgba(config.icon.bgColor);
        if (rgb) {
            ensureColorResource(`${androidIconName}_background`, colorConverter.rgbaToHex(rgb).substring(0, 7));

            // 2. Create the ${androidIconName}_background.xml drawable that references the color resource.
            //    This is needed for the <background> tag in ${androidIconName}.xml to be a color, not a PNG bitmap.
            const bgDrawablePath = path.join(androidResFolder, 'drawable', `${androidIconName}_background.xml`);
            fs.mkdirSync(path.dirname(bgDrawablePath), {recursive: true});
            const bgDrawableContent =
                `<?xml version="1.0" encoding="utf-8"?>\n` +
                `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n` +
                `\t<solid android:color="@color/${androidIconName}_background"/>\n` +
                `</shape>`;
            fs.writeFileSync(bgDrawablePath, bgDrawableContent);

            // 3. Loop through sizes to generate foreground PNGs (background PNG is NOT needed now).
            for (const [size, outputPathTemplate] of resizeConfig.androidAdaptive) {
                await resizeImage({
                    ...config.icon,
                    width: size,
                    height: size,
                    outputPath: outputPathTemplate.replace('[NAME]', androidIconName + '_foreground.png'),
                    padding: androidAdaptivePadding,
                    transparent: true,
                });

                await resizeImage({
                    ...config.icon,
                    width: size,
                    height: size,
                    outputPath: outputPathTemplate.replace('[NAME]', androidIconName + '_monochrome.png'),
                    padding: androidAdaptivePadding,
                    transparent: true,
                    grayscale: true,
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
        }

        if (config.icon.pathAndroidNotification !== false) {
            const sourcePath = config.icon.pathAndroidNotification || config.icon.path;

            const CANVAS_DP = 32;
            const CONTENT_DP = 24;
            const scales = {
                'mdpi': 1,   // 24px content on 32px canvas
                'hdpi': 1.5, // 36px content on 48px canvas
                'xhdpi': 2,  // 48px content on 64px canvas
                'xxhdpi': 3, // 72px content on 96px canvas
                'xxxhdpi': 4, // 96px content on 128px canvas
            };

            // Use a fixed accent color for the notification icon tint (example: a common Flutter primary color)
            ensureColorResource(notificationColorName, '#018786'); // TODO: Make configurable

            // 3. Generate Image for each density
            for (const [density, scale] of Object.entries(scales)) {
                const mipmapFolder = path.join(androidResFolder, `mipmap-${density}`);
                fs.mkdirSync(mipmapFolder, {recursive: true});

                // Calculate size based on the content area (24dp)
                const contentSizePx = CONTENT_DP * scale;

                const outputPath = path.join(mipmapFolder, `${notificationIconName}.png`);

                await resizeImage({
                    ...config.icon,
                    path: sourcePath,
                    width: contentSizePx,
                    height: contentSizePx,
                    outputPath: outputPath,
                    padding: (CANVAS_DP - CONTENT_DP) / CANVAS_DP / 2,
                    transparent: true,
                    whiteOnly: true,
                });
            }
            console.log(`- Android notification icons (${notificationIconName}) generated.`);
        }

        const manifest = useAndroidManifest();
        if (manifest) {
            manifest.ensureAttribute('application', 'android:icon', '@mipmap/' + androidIconName);
            if (config.icon.pathAndroidNotification !== false) {
                manifest.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_icon', `@mipmap/${notificationIconName}`);
                manifest.updateOrCreateMetaData('com.google.firebase.messaging.default_notification_color', `@color/${notificationColorName}`);
            }
            manifest.save("- AndroidManifest.xml updated for icons.");
        }
    }

    async function generateAndroidSplashScreen() {
        const rgb = colorConverter.anyToRgba(config.splash.bgColor);
        const rgbDark = colorConverter.anyToRgba(config.splash.bgColorDark || config.splash.bgColor);

        // 1. Ensure Color Resources Exist
        if (rgb) {
            ensureColorResource(`${androidSplashName}_color`, colorConverter.rgbaToHex(rgb));
        }
        if (rgbDark) {
            ensureColorResource(`${androidSplashName}_color_night`, colorConverter.rgbaToHex(rgbDark));
        }


        await updateStylesForSplash();
        console.log("- Android styles.xml updated for splash screens.");

        // 3. Calculate Image Dimensions (Logo size only, no padding)
        const imgMeta = await sharp(config.splash.path).metadata();
        if (!imgMeta.width || !imgMeta.height) {
            throw new Error("Could not get image dimensions for Android splash screen.");
        }

        // Use a large enough target size (e.g., 600px at a 3x scale) for the logo PNG
        const targetSizeDp = 200;
        const targetScale = 3;
        const targetSizePx = targetSizeDp * targetScale;

        let widthPx: number;
        let heightPx: number;
        const aspectRatio = imgMeta.width / imgMeta.height;

        if (aspectRatio >= 1) {
            widthPx = targetSizePx;
            heightPx = Math.round(targetSizePx / aspectRatio);
        } else {
            heightPx = targetSizePx;
            widthPx = Math.round(targetSizePx * aspectRatio);
        }

        // 4. Define Output Paths and Folders
        const drawableFolder = path.join(androidResFolder, 'drawable');
        fs.mkdirSync(drawableFolder, {recursive: true});

        // Logo PNG paths
        const splashLogoPath = path.join(drawableFolder, `${androidSplashName}.png`);
        const splashDarkLogoPath = path.join(drawableFolder, `${androidSplashName}_dark.png`);
        const splashV31Path = path.join(drawableFolder, `${androidSplashName}_12.png`);

        // XML Drawable paths
        const splashXmlPath = path.join(drawableFolder, `${androidSplashName}.xml`);
        const splashDarkXmlPath = path.join(drawableFolder, `${androidSplashName}_dark.xml`);


        // 5. Generate Logo PNGs (NO PADDING - XML will handle centering/padding)
        await resizeImage({
            ...config.splash,
            width: widthPx,
            height: heightPx,
            outputPath: splashLogoPath,
            padding: 0, // CRUCIAL: Remove padding from the PNG
            transparent: true,
        });
        console.log(`- Android splash logo (drawable/${androidSplashName}.png) generated.`);

        // 5a. Generate Dark Mode Logo PNG (NO PADDING)
        if (config.splash.pathDark) {
            await resizeImage({
                ...config.splash,
                path: config.splash.pathDark,
                width: widthPx,
                height: heightPx,
                outputPath: splashDarkLogoPath,
                padding: 0, // CRUCIAL: Remove padding from the PNG
                transparent: true,
            });
            console.log(`- Android dark splash logo (drawable/${androidSplashName}_dark.png) generated.`);
        }

        // 5b. Generate Android 12+ Animated Icon (${androidSplashName}_12.png) - (Adaptive Padding needed here)
        const v31Size = 432;
        await resizeImage({
            ...config.splash,
            width: v31Size,
            height: v31Size,
            outputPath: splashV31Path,
            padding: androidAdaptivePadding,
            transparent: true,
        });
        console.log(`- Android v31 splash animated icon (drawable/${androidSplashName}_12.png) generated.`);


        // 6. Generate Layer-list XML Drawables

        // Helper function to create the XML content
        const generateSplashXml = (colorName: string, logoName: string): string => {
            // Use 100dp for margin/padding, which is a standard large margin for centered logos.
            const paddingDp = 100;

            return `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 1. Background color defined in colors.xml -->
    <item android:drawable="@color/${colorName}" />

    <!-- 2. Centered logo with padding to ensure it's not glued to the edges -->
    <item android:top="${paddingDp}dp" 
          android:bottom="${paddingDp}dp" 
          android:left="${paddingDp}dp" 
          android:right="${paddingDp}dp">
        <bitmap 
            android:gravity="center"
            android:src="@drawable/${logoName}" />
    </item>
</layer-list>`;
        };

        // 6a. Generate Default XML (`drawable/${androidSplashName}.xml`)
        const defaultXmlContent = generateSplashXml(
            `${androidSplashName}_color`,
            androidSplashName
        );
        fs.writeFileSync(splashXmlPath, defaultXmlContent);
        console.log(`- Android splash drawable XML (drawable/${androidSplashName}.xml) generated.`);

        // 6b. Generate Dark XML (`drawable/${androidSplashName}_dark.xml`)
        const darkXmlContent = generateSplashXml(
            `${androidSplashName}_color_night`,
            config.splash.pathDark ? `${androidSplashName}_dark` : androidSplashName
        );
        fs.writeFileSync(splashDarkXmlPath, darkXmlContent);
        console.log(`- Android dark splash drawable XML (drawable/${androidSplashName}_dark.xml) generated.`);
    }

    type ResizeOptions = YamlImageConfig & {
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

        const transparent: RgbObject = {r: 0, g: 0, b: 0, alpha: 0};
        const bgColorRgba = opts.transparent || !opts.bgColor
            ? transparent
            : colorConverter.anyToRgba(opts.bgColor) || transparent;

        fs.mkdirSync(path.dirname(outputPath), {recursive: true});

        const padX = Math.floor(fullWidth * padding);
        const padY = Math.floor(fullHeight * padding);
        const contentWidth = fullWidth - 2 * padX;
        const contentHeight = fullHeight - 2 * padY;

        let image = sharp(opts.path)
            .png();

        image = image.resize(contentWidth, contentHeight, {
            fit: 'contain',
            background: transparent, // Always resize onto a transparent background
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

    const colorsXmlPath = path.join(androidResFolder, 'values', 'colors.xml');

    async function ensureColorResource(colorName: string, hexValue: string) {
        fs.mkdirSync(path.dirname(colorsXmlPath), {recursive: true});

        if (!fs.existsSync(colorsXmlPath)) {
            fs.writeFileSync(colorsXmlPath, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>`);
        }
        let content = fs.readFileSync(colorsXmlPath, 'utf-8');

        //TODO: find a better library to preserve comments!
        const [parsed, xmlBuilder] = await useXmlParser(content);
        const colors = ensureArr(parsed.resources?.color);

        const index = colors.findIndex((item: any) => item.$.name === colorName);
        if (index !== -1) {
            colors[index]._ = hexValue;
        } else {
            colors.push({_: hexValue, $: {name: colorName}});
        }
        content = xmlBuilder(parsed);
        fs.writeFileSync(colorsXmlPath, content);
        console.log(`- Android colors.xml updated: Added ${colorName} to ${hexValue}`);
    }


    async function updateStylesForSplash() {
        const cfg = {
            'values': {
                stub: andStylesXml,
                attrs: [
                    ['android:windowBackground', `@drawable/${androidSplashName}`, true]
                ],
            },
            'values-night': {
                stub: andStylesNightXml,
                attrs: [
                    ['android:windowBackground', `@drawable/${androidSplashName}_dark`, true]
                ],
            },
            'values-v31': {
                stub: andStylesV31Xml,
                attrs: [
                    ['android:windowSplashScreenAnimatedIcon', `@drawable/${androidSplashName}_12`, true],
                    ['android:windowSplashScreenBackground', `@color/${androidSplashName}_color`, false],
                ],
            },
        } as const;

        for (const [folder, {stub, attrs}] of Object.entries(cfg)) {
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

