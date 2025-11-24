import YAML from "yaml";
import fs from 'fs';
import * as z from 'zod';

function getImageConfigSchemaYaml() {
    return z.object({
        path: z.union([z.string(), z.object({light: z.string(), dark: z.string().optional()})]),
        bgColor: z.union([z.string(), z.object({light: z.string(), dark: z.string()})]),
        name: (z.union([z.string(), z.object({android: z.string(), ios: z.string()})])).optional(),
        borderRadius: z.number().optional(),
        padding: (z.union([z.number(), z.object({android: z.number(), ios: z.number()})])).optional(),
    });
}

const fluttergenConfigSchema = z.object({
    rename: z.object({
        appName: z.string(),
        bundleIdentifier: z.string(),
        applicationId: z.string(),
    }).optional(),
    icon: getImageConfigSchemaYaml(),
    splash: getImageConfigSchemaYaml(),
    // false or object
    notificationIcon: z.union([
        z.literal(false),
        z.object({
            path: z.string().optional(),
            tintColor: z.string().optional(),
            name: z.string().optional(),
            padding: z.number().optional(),
        }),
    ]).optional(),
});

type PrettyPrint<T> = { [K in keyof T]: T[K]; } & {};

export type RenameConfig = {
    appName: string;
    bundleIdentifier: string;
    applicationId: string;
}
export type ImageConfig = {
    path: { light: string; dark: string; };
    bgColor: { light: string; dark: string; };
    name: { android: string; ios: string; };
    borderRadius: number;
    padding: { android: number; ios: number; };
}
export type FluttergenConfig = {
    rename: RenameConfig | undefined;
    icon: ImageConfig;
    splash: ImageConfig
    notificationIcon: false | {
        path: string;
        tintColor: string;
        name: string;
        padding: number;
    }
}

export function parsePubspecYamlFile(path: string): FluttergenConfig {
    if (!fs.existsSync(path)) {
        throw new Error(`Required file not found: ${path}`);
    }
    const yamlContent = fs.readFileSync(path, 'utf8');
    return parsePubspecYaml(yamlContent);
}

export function parsePubspecYaml(yamlContent: string): FluttergenConfig {
    const pubspec = YAML.parse(yamlContent) as Record<string, any>;
    if (!pubspec) {
        throw new Error("YAML content is empty or invalid.");
    }
    const config = pubspec.fluttergen as PrettyPrint<z.infer<typeof fluttergenConfigSchema>> | undefined;
    if (!config) {
        throw new Error("Missing 'fluttergen' configuration in pubspec.yaml.");
    }

    // throwIfInvalidConfig('Icon', config, ['icon', 'splash'], ['rename']);
    fluttergenConfigSchema.parse(config);

    if (!config.icon || !config.splash) {
        throw new Error("Missing required 'icon' or 'splash' configuration.");
    }

    // fluttergenConfigSchema.parse(config);


    function ensureNoExtension(filePath: string): string {
        const parts = filePath.split('.');
        if (parts.length > 1) {
            parts.pop();
        }
        return parts.join('.');
    }

    const [icon, splash] = [config.icon, config.splash].map((imgConfig, index, __) => {
        const str = <O>(val: string | O | undefined, innerProp: keyof O): any => val && typeof val === 'object' ? val[innerProp] : val;
        const num = <O>(val: number | O | undefined, innerProp: keyof O): any => val && typeof val === 'object' ? val[innerProp] : val;
        const isIcons = index === 0;
        return {
            name: {
                android: ensureNoExtension(str(imgConfig.name, 'android') ?? (isIcons ? 'ic_launcher' : 'splash_screen')),
                ios: ensureNoExtension(str(imgConfig.name, 'ios') ?? (isIcons ? 'AppIcon' : 'LaunchImage')),
            },
            path: {
                light: str(imgConfig.path, 'light'),
                dark: str(imgConfig.path, 'dark') || str(imgConfig.path, 'light'),
            },
            bgColor: {
                light: str(imgConfig.bgColor, 'light') || '#FFFFFF',
                dark: str(imgConfig.bgColor, 'dark') || '#000000',
            },
            borderRadius: imgConfig.borderRadius ?? 0.0,
            padding: {
                android: num(imgConfig.padding, 'android') ?? 0.16,
                ios: num(imgConfig.padding, 'ios') ?? 0.16,
            },
        };
    });

    return {
        rename: config.rename,
        icon: icon,
        splash: splash,
        notificationIcon: config.notificationIcon === false ? false : {
            path: config.notificationIcon?.path || icon.path.light,
            tintColor: config.notificationIcon?.tintColor ?? '#FFFFFF',
            name: config.notificationIcon?.name || icon.name.android,
            padding: config.notificationIcon?.padding ?? 0.0,
        }
    };
}