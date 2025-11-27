import YAML from "yaml";
import fs from 'fs';
import * as z from 'zod';
import {useYamlFile} from "./useYamlFile.ts";
import {KnownError} from "./knownError.ts";
import {ZodType} from "zod";

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
    info: z.object({
        appName: z.string(),
        bundleIdentifier: z.string(),
        applicationId: z.string(),
        iosDevelopmentTeam: z.string().optional(),
        iosMinVersion: z.string().optional(),
        androidMinSdkVersion: z.number().optional(),
        ndkVersion: z.string().optional(),
        gradleVersion: z.string().optional(),
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
    variables: z.any().optional(),
    prescripts: z.array(z.any()).optional(),
    postscripts: z.array(z.any()).optional(),
});

export function getConfigurationOptionsForHelp(): string {
    // auto generate from schema
    const lines = [] as { key: string; type: string; optional: string }[];

    function appendSchema(schema: z.ZodTypeAny, prefix: string = '') {
        if (schema instanceof z.ZodObject) {
            const shape = schema.shape;
            for (const key in shape) {
                let field = shape[key] as ZodType;
                const isOptional = field.def.type == 'optional';
                if ('innerType' in field.def)
                    field = (field.def as any).innerType as ZodType;

                let fieldType = field.type;
                if (fieldType == 'union') {
                    fieldType = (field as any).def.options.map((t: any) => t.type).join(' | ');
                }
                lines.push({
                    key: ` ${prefix}${key}`,
                    optional: isOptional ? ' (optional)' : '',
                    type: fieldType,
                })
                appendSchema(field, `${prefix}   `);
            }
        } else if (schema instanceof z.ZodUnion) {
            for (const option of schema.def.options) {
                appendSchema(option as any, prefix);
            }
        }
    }

    appendSchema(fluttergenConfigSchema);
    let helpText = '';
    const longestKeyLength = Math.max(...lines.map(l => l.key.length));
    const longestTypeLength = Math.max(...lines.map(l => l.type.length));
    const longestOptionalLength = Math.max(...lines.map(l => l.optional.length));
    // helpText += '-'.repeat(longestKeyLength + longestTypeLength + 7) + '\n';
    for (const line of lines) {
        const padding = ' '.repeat(longestKeyLength - line.key.length + 2);
        const paddingType = ' '.repeat(longestTypeLength - line.type.length + 2);
        const padEnd = ' '.repeat(longestOptionalLength - line.optional.length + 1);
        if (!line.key.startsWith('  '))
            helpText += '|' + '-'.repeat(longestKeyLength + longestTypeLength + longestOptionalLength + 8) + '|\n';
        helpText += `|${line.key}${padding}| ${line.type}${paddingType}|${line.optional}${padEnd}|\n`;
    }
    helpText += '|' + '-'.repeat(longestKeyLength + longestTypeLength + longestOptionalLength + 8) + '|\n';
    return helpText;
}

type PrettyPrint<T> = { [K in keyof T]: T[K]; } & {};

export type AppInfoConfig = {
    appName: string;
    bundleIdentifier: string;
    applicationId: string;
    iosDevelopmentTeam?: string;
    iosMinVersion?: string;
    androidMinSdkVersion?: number;
    ndkVersion?: string;
    gradleVersion?: string;
}
export type ImageConfig = {
    path: { light: string; dark: string; };
    bgColor: { light: string; dark: string; };
    name: { android: string; ios: string; };
    borderRadius: number;
    padding: { android: number; ios: number; };
}
export type FluttergenConfig = {
    variables: Record<string, any> | undefined;
    info: AppInfoConfig | undefined;
    icon: ImageConfig;
    splash: ImageConfig
    notificationIcon: false | {
        path: string;
        tintColor: string;
        name: string;
        padding: number;
    }
    prescripts: (string | Record<string, any>)[] | undefined;
    postscripts: (string | Record<string, any>)[] | undefined;
}

export function parsePubspecYamlFile(path: string): FluttergenConfig {
    if (!fs.existsSync(path)) {
        throw new KnownError(`Required file not found: ${path}`);
    }
    const yamlContent = fs.readFileSync(path, 'utf8');
    return parsePubspecYaml(yamlContent);
}

export function parsePubspecYaml(yamlContent: string): FluttergenConfig {
    yamlContent = yamlContent.replaceAll(' :: ', ' : '); // normalize incorrect spacing
    const pubspec = YAML.parse(yamlContent) as Record<string, any>;
    if (!pubspec) {
        throw new KnownError("YAML content is empty or invalid.");
    }
    const config = pubspec.fluttergen as PrettyPrint<z.infer<typeof fluttergenConfigSchema>> | undefined;
    if (!config) {
        throw new KnownError("Missing 'fluttergen' configuration in pubspec.yaml.");
    }

    try {
        fluttergenConfigSchema.parse(config);
    } catch (e) {
        console.log(config)
        throw e;
    }

    if (!config.icon || !config.splash) {
        throw new KnownError("Missing required 'icon' or 'splash' configuration.");
    }

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
                light: str(imgConfig.bgColor, 'light') || 'transparent',
                dark: str(imgConfig.bgColor, 'dark') || 'transparent',
            },
            borderRadius: imgConfig.borderRadius ?? 0.0,
            padding: {
                android: num(imgConfig.padding, 'android') ?? 0.16,
                ios: num(imgConfig.padding, 'ios') ?? 0.16,
            },
        };
    });

    const vars = {} as Record<string, any>;
    if (config.variables && typeof config.variables === 'object') {
        const entries = Object.entries(config.variables);
        const hasEnv = entries.some(([_, v]) => typeof v === 'string' && v.startsWith('env.'));
        const env = hasEnv ? useYamlFile('.env') : undefined;
        for (const [key, value] of Object.entries(config.variables)) {
            if (typeof value === 'string' && value.startsWith('env.')) {
                const envKey = value.slice(4);
                const envValue = env?.get(envKey);
                if (envValue !== undefined) {
                    vars[key] = envValue;
                } else {
                    throw new KnownError(`Environment variable '${envKey}' not found for configuration variable '${key}'.`);
                }
            } else {
                // if the value is a string containing special characters, eval it
                vars[key] = typeof value === 'string' && /[+\-*/()%]/.test(value) ? eval(value) : value;
            }
        }
    }

    return {
        info: config.info,
        icon: icon,
        splash: splash,
        notificationIcon: config.notificationIcon === false ? false : {
            path: config.notificationIcon?.path || icon.path.light,
            tintColor: config.notificationIcon?.tintColor ?? '#FFFFFF',
            name: config.notificationIcon?.name || icon.name.android,
            padding: config.notificationIcon?.padding ?? 0.0,
        },
        variables: vars,
        prescripts: config.prescripts?.filter(t => t),
        postscripts: config.postscripts?.filter(t => t),
    };
}