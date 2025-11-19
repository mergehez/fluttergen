import YAML from "yaml";
import fs from 'fs';

export type FluttergenConfig = {
    rename?: YamlRenameConfig;
    icon: YamlImageConfig;
    splash: YamlImageConfig;
}
export type YamlRenameConfig = {
    appName: string;
    bundleIdentifier: string;
    applicationId: string;
}

export type YamlImageConfig = {
    androidName?: string;
    iosName?: string;
    path: string;
    pathDark?: string;
    pathAndroidNotification?: string | false; // if not set, use path
    bgColor: string;
    bgColorDark?: string;
    borderRadius?: number;
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
    const config = pubspec.fluttergen as FluttergenConfig | undefined;
    if (!config) {
        throw new Error("Missing 'fluttergen' configuration in pubspec.yaml.");
    }

    throwIfInvalidConfig('Icon', config, ['icon', 'splash'], ['rename']);

    if (!config.icon || !config.splash) {
        throw new Error("Missing required 'icon' or 'splash' configuration.");
    }

    const requiredIconKeys: (keyof YamlImageConfig)[] = ['path', 'bgColor'];
    const optionalIconKeys: (keyof YamlImageConfig)[] = ['androidName', 'iosName', 'pathDark', 'bgColorDark', 'borderRadius'];
    throwIfInvalidConfig('Icon', config.icon, requiredIconKeys, [...optionalIconKeys, 'pathAndroidNotification']);
    throwIfInvalidConfig('Splash', config.splash, requiredIconKeys, optionalIconKeys);

    if (config.rename)
        throwIfInvalidConfig('Rename', config.rename, ['appName', 'bundleIdentifier', 'applicationId'], []);

    return config;
}


function throwIfInvalidConfig<T extends Record<string, any>>(name: string, obj: T, requiredKeys: (keyof T)[], optionalKeys: (keyof T)[]): void {
    const objKeys = Object.keys(obj);
    for (const key of requiredKeys) {
        if (!objKeys.includes(key as string)) {
            throw new Error(`'${name}' configuration is missing required key: '${key as string}'.`);
        }
    }
    for (const key of objKeys) {
        if (!requiredKeys.includes(key as keyof T) && !optionalKeys.includes(key as keyof T)) {
            throw new Error(`'${name}' configuration has unknown key: '${key as string}'.`);
        }
    }
}