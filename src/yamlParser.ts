import YAML from "yaml";
import fs from 'fs';
import * as z from 'zod';
import {expandEnvironment, loadEnvironment} from "./env.ts";
import {KnownError} from "./knownError.ts";
import {ZodType} from "zod";

const fluttergenConfigSchema = z.object({
    info: z.object({
        appName: z.string().describe('Display name of your app'),
        bundleIdentifier: z.string().describe('iOS bundle identifier (e.g., com.my_company.my_app)'),
        applicationId: z.string().describe('Android application ID (e.g., com.my_company.my_app)'),
        iosDevelopmentTeam: z.string().optional().describe('iOS development team ID (e.g., ABCDE12345)'),
        iosMinVersion: z.string().optional().describe('iOS minimum deployment target (e.g., "13.0")'),
        androidMinSdkVersion: z.number().optional().describe('Android minimum SDK version (e.g., 21)'),
        ndkVersion: z.string().optional().describe('Android NDK version'),
        gradleVersion: z.string().optional().describe('Gradle version (e.g., "8.14")'),
    }).optional().describe('App metadata configuration for iOS and Android platforms'),

    icon: z.object({
        path: z.union([z.string(), z.object({light: z.string(), dark: z.string().optional()})]).describe('Path to icon image file or object with light and dark properties'),
        bgColor: z.union([z.string(), z.object({light: z.string(), dark: z.string()})]).describe('Background color in hex format (e.g., #018290) or object with light and dark properties'),
        name: (z.union([z.string(), z.object({android: z.string(), ios: z.string()})])).optional().describe('Icon name string or object with android and ios properties'),
        borderRadius: z.number().optional().describe('Corner radius from 0.0 to 1.0 (0 = square, 1 = circle)'),
        padding: (z.union([z.number(), z.object({android: z.number(), ios: z.number()})])).optional().describe('Padding value or object with android and ios properties'),
    }).describe('App icon configuration for iOS and Android'),
    splash: z.object({
        path: z.union([z.string(), z.object({light: z.string(), dark: z.string().optional()})]).describe('Path to splash image file or object with light and dark properties'),
        bgColor: z.union([z.string(), z.object({light: z.string(), dark: z.string()})]).describe('Background color in hex format (e.g., #00636E) or object with light and dark properties'),
        name: (z.union([z.string(), z.object({android: z.string(), ios: z.string()})])).optional().describe('Splash name string or object with android and ios properties'),
        borderRadius: z.number().optional().describe('Corner radius from 0.0 to 1.0'),
        padding: (z.union([z.number(), z.object({android: z.number(), ios: z.number()})])).optional().describe('Padding value or object with android and ios properties'),
    }).describe('Splash screen configuration for iOS and Android'),
    notificationIcon: z.union([
        z.literal(false),
        z.object({
            path: z.string().optional().describe('Path to notification icon image'),
            tintColor: z.string().optional().describe('Tint color in hex format (default: #FFFFFF)'),
            name: z.string().optional().describe('Notification icon resource name'),
            padding: z.number().optional().describe('Padding value'),
        }),
    ]).optional().describe('Android notification icon configuration (set to false to disable)'),
    variables: z.any().optional().describe('Reusable variables that can be referenced in scripts'),
    workflows: z.record(z.string(), z.array(z.any())).optional().describe('Named reusable workflow steps'),
    profiles: z.record(z.string(), z.any()).optional().describe('Named configuration overrides selected with --profile'),
    signing: z.object({
        android: z.object({
            keystore: z.string().optional().describe('Path to the keystore file (alias for storeFile)'),
            storeFile: z.string().optional().describe('Path to the keystore file'),
            storePassword: z.string().optional().describe('Keystore password'),
            keyAlias: z.string().optional().describe('Key alias'),
            keyPassword: z.string().optional().describe('Key password'),
        }).optional().describe('Android signing configuration'),
        ios: z.object({
            team: z.string().optional().describe('Apple development team ID'),
            entitlements: z.record(z.string(), z.any()).optional().describe('Entitlements plist values'),
            entitlementsFile: z.string().optional().describe('Entitlements file name (default: Runner.entitlements)'),
        }).optional().describe('iOS signing configuration'),
    }).optional().describe('Signing and credentials configuration'),
    prescripts: z.array(z.any()).optional().describe('Scripts to execute before the main fluttergen operations'),
    postscripts: z.array(z.any()).optional().describe('Scripts to execute after the main fluttergen operations'),
});

export function getConfigurationOptionsForHelp(): string {
    // auto generate from schema
    const lines = [] as { key: string; type: string; optional: string; description: string; depth: number }[];

    function appendSchema(schema: z.ZodTypeAny, prefix: string = '', depth: number = 0) {
        if (schema instanceof z.ZodObject) {
            const shape = schema.shape;
            for (const key in shape) {
                let field = shape[key] as ZodType;
                const isOptional = field.def.type == 'optional';
                const description = field.description || '';

                if ('innerType' in field.def)
                    field = (field.def as any).innerType as ZodType;

                let fieldType = field.type;
                if (fieldType == 'union') {
                    fieldType = (field as any).def.options.map((t: any) => t.type).join(' | ');
                }

                lines.push({
                    key: ` ${prefix}${key}`,
                    optional: isOptional ? ' ' : '*',
                    type: fieldType,
                    description: description,
                    depth: depth,
                })

                // Recurse if the field is an object
                if (field instanceof z.ZodObject) {
                    appendSchema(field, `${prefix}   `, depth + 1);
                }
                // Also recurse into union types that contain objects
                else if (field instanceof z.ZodUnion) {
                    for (const option of field.def.options) {
                        if (option instanceof z.ZodObject) {
                            appendSchema(option, `${prefix}   `, depth + 1);
                        }
                    }
                }
            }
        }
    }

    appendSchema(fluttergenConfigSchema);
    let helpText = '\n\x1b[3mNote: Required fields are marked with \'*\'\x1b[0m\n';
    const longestKeyLength = Math.max(...lines.map(l => l.key.length));
    const longestTypeLength = Math.max(...lines.map(l => l.type.length));
    const longestOptionalLength = Math.max(...lines.map(l => l.optional.length));

    for (const line of lines) {
        const isTopLevel = line.depth === 0;

        if (isTopLevel) {
            helpText += '─'.repeat(80) + '\n';
        }

        const padding = ' '.repeat(longestKeyLength - line.key.length + 2);
        const paddingType = ' '.repeat(longestTypeLength - line.type.length + 2);
        const paddingOptional = ' '.repeat(longestOptionalLength - line.optional.length + 1);

        // ANSI escape codes: \x1b[1m for bold, \x1b[0m to reset, \x1b[3m for italic
        const descText = line.description ? `\x1b[3m${line.description}\x1b[0m` : '';
        helpText += `\x1b[1m${line.key}\x1b[0m${padding}${line.optional}${paddingOptional}${line.type}${paddingType}${descText}\n`;
    }

    helpText += '─'.repeat(80) + '\n';

    return helpText;
}

type PrettyPrint<T> = { [K in keyof T]: T[K]; } & {};

/**
 * Evaluates a simple arithmetic expression without using `eval`.
 * Returns `undefined` when the input is not a valid arithmetic expression.
 */
function evaluateArithmetic(input: string): number | undefined {
    if (!/^[\d\s.+\-*/%()]+$/.test(input)) return undefined;

    let index = 0;

    function skipWhitespace() {
        while (index < input.length && /\s/.test(input[index])) index++;
    }

    function parseNumber(): number {
        skipWhitespace();
        if (input[index] === '-' || input[index] === '+') {
            const sign = input[index] === '-' ? -1 : 1;
            index++;
            return sign * parseNumber();
        }
        if (input[index] === '(') {
            index++;
            const value = parseExpression();
            skipWhitespace();
            if (input[index] !== ')') throw new Error('Missing closing parenthesis');
            index++;
            return value;
        }
        const match = /^\d*\.?\d+/.exec(input.slice(index));
        if (!match) throw new Error('Number expected');
        index += match[0].length;
        return parseFloat(match[0]);
    }

    function parseTerm(): number {
        let value = parseNumber();
        for (; ;) {
            skipWhitespace();
            const operator = input[index];
            if (operator !== '*' && operator !== '/' && operator !== '%') break;
            index++;
            const right = parseNumber();
            if ((operator === '/' || operator === '%') && right === 0) throw new Error('Division by zero');
            value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
        }
        return value;
    }

    function parseExpression(): number {
        let value = parseTerm();
        for (; ;) {
            skipWhitespace();
            const operator = input[index];
            if (operator !== '+' && operator !== '-') break;
            index++;
            const right = parseTerm();
            value = operator === '+' ? value + right : value - right;
        }
        return value;
    }

    try {
        const result = parseExpression();
        skipWhitespace();
        if (index !== input.length || !Number.isFinite(result)) return undefined;
        return result;
    } catch {
        return undefined;
    }
}

/**
 * Only treat values as arithmetic when they clearly look like an expression.
 * This prevents values such as `2024-01-01` from being silently converted to `2022`.
 */
function evaluateConfiguredValue(value: string): string | number {
    const looksLikeExpression = /[+*/%()]/.test(value) || /\s-\s/.test(value);
    if (!looksLikeExpression) return value;
    const result = evaluateArithmetic(value);
    return result === undefined ? value : result;
}

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
export type AndroidSigningConfig = {
    keystore?: string;
    storeFile?: string;
    storePassword?: string;
    keyAlias?: string;
    keyPassword?: string;
}
export type IosSigningConfig = {
    team?: string;
    entitlements?: Record<string, any>;
    entitlementsFile?: string;
}
export type SigningConfig = {
    android?: AndroidSigningConfig;
    ios?: IosSigningConfig;
}
export type FluttergenConfig = {
    variables: Record<string, any>;
    info: AppInfoConfig | undefined;
    icon: ImageConfig;
    splash: ImageConfig
    notificationIcon: false | {
        path: string;
        tintColor: string;
        name?: string;
        padding: number;
    }
    workflows: Record<string, WorkflowStep[]>;
    signing: SigningConfig | undefined;
    profile: string | undefined;
    prescripts: (string | Record<string, any>)[] | undefined;
    postscripts: (string | Record<string, any>)[] | undefined;
}

export type WorkflowStep = string | Record<string, any>;

function isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        && (value as object).constructor === Object;
}

/**
 * Merges a profile override into the base config.
 * Plain objects merge recursively; arrays and primitives replace.
 */
function mergeConfig(base: any, override: any): any {
    if (override === undefined) return base;
    if (Array.isArray(base) || Array.isArray(override)) return override;
    if (isPlainObject(base) && isPlainObject(override)) {
        const result: Record<string, any> = {...base};
        for (const [key, value] of Object.entries(override)) {
            result[key] = mergeConfig(base[key], value);
        }
        return result;
    }
    return override;
}

export function parsePubspecYamlFile(path: string, profile?: string): FluttergenConfig {
    if (!fs.existsSync(path)) {
        throw new KnownError(`Required file not found: ${path}`);
    }
    const yamlContent = fs.readFileSync(path, 'utf8');
    return parsePubspecYaml(yamlContent, profile);
}

export function parsePubspecYaml(yamlContent: string, profile?: string): FluttergenConfig {
    yamlContent = yamlContent.replaceAll(' :: ', ' : '); // normalize incorrect spacing
    const pubspec = YAML.parse(yamlContent) as Record<string, any>;
    if (!pubspec) {
        throw new KnownError("YAML content is empty or invalid.");
    }
    const baseConfig = pubspec.fluttergen as PrettyPrint<z.infer<typeof fluttergenConfigSchema>> | undefined;
    if (!baseConfig) {
        throw new KnownError("Missing 'fluttergen' configuration in pubspec.yaml.");
    }

    const selectedProfile = profile ?? process.env.FLUTTERGEN_PROFILE;
    let config = baseConfig;

    if (selectedProfile) {
        const profiles = baseConfig.profiles as Record<string, any> | undefined;
        if (!profiles || !profiles[selectedProfile]) {
            const available = profiles ? Object.keys(profiles) : [];
            throw new KnownError(
                `Profile '${selectedProfile}' is not defined in pubspec.yaml`
                + (available.length ? ` (available: ${available.join(', ')})` : '')
                + '.'
            );
        }
        config = mergeConfig(baseConfig, profiles[selectedProfile]);
    }

    const environment = loadEnvironment(selectedProfile);
    config = expandEnvironment(config, environment);

    try {
        fluttergenConfigSchema.parse(config);
    } catch (e) {
        if (e instanceof z.ZodError) {
            const issues = e.issues
                .map(issue => `  - ${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
                .join('\n');
            throw new KnownError(`Invalid 'fluttergen' configuration in pubspec.yaml:\n${issues}`);
        }
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
        for (const [key, value] of entries) {
            if (typeof value === 'string' && value.startsWith('env.')) {
                const envKey = value.slice(4);
                const envValue = environment[envKey];
                if (envValue !== undefined) {
                    vars[key] = envValue;
                } else {
                    throw new KnownError(`Environment variable '${envKey}' not found for configuration variable '${key}'.`);
                }
            } else if (typeof value === 'string') {
                vars[key] = evaluateConfiguredValue(value);
            } else {
                vars[key] = value;
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
            name: config.notificationIcon?.name,
            padding: config.notificationIcon?.padding ?? 0.0,
        },
        variables: vars,
        workflows: config.workflows ?? {},
        signing: config.signing as SigningConfig | undefined,
        profile: selectedProfile,
        prescripts: config.prescripts?.filter(t => t),
        postscripts: config.postscripts?.filter(t => t),
    };
}