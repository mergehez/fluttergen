import fs from "fs";
import path from "path";
import {execSync} from "child_process";
import sharp from "sharp";
import {FluttergenConfig, parsePubspecYamlFile} from "./yamlParser.ts";
import {KnownError} from "./knownError.ts";

export type DoctorStatus = 'ok' | 'warn' | 'error';
export type DoctorCheck = { name: string; status: DoctorStatus; message: string };
export type DoctorReport = { checks: DoctorCheck[]; errors: number; warnings: number };

function commandExists(command: string): boolean {
    try {
        execSync(process.platform === 'win32' ? `where ${command}` : `command -v ${command}`, {stdio: 'ignore'});
        return true;
    } catch {
        return false;
    }
}

async function checkImage(checkName: string, filePath: string, checks: DoctorCheck[], minimumSize?: number) {
    if (!fs.existsSync(filePath)) {
        checks.push({name: checkName, status: 'error', message: `File not found: ${filePath}`});
        return;
    }

    try {
        const metadata = await sharp(filePath).metadata();
        if (!metadata.width || !metadata.height) {
            checks.push({name: checkName, status: 'warn', message: `Could not read image dimensions: ${filePath}`});
        } else if (minimumSize && (metadata.width < minimumSize || metadata.height < minimumSize)) {
            checks.push({
                name: checkName,
                status: 'warn',
                message: `${filePath} is ${metadata.width}x${metadata.height}; ${minimumSize}px is recommended.`,
            });
        } else {
            checks.push({name: checkName, status: 'ok', message: `${filePath} (${metadata.width}x${metadata.height})`});
        }
    } catch (e) {
        checks.push({name: checkName, status: 'error', message: `Invalid image ${filePath}: ${(e as Error).message}`});
    }
}

async function checkConfig(config: FluttergenConfig, checks: DoctorCheck[]) {
    checks.push({name: 'pubspec.yaml', status: 'ok', message: 'Configuration parsed successfully'});

    await checkImage('icon.light', config.icon.path.light, checks, 1024);
    if (config.icon.path.dark !== config.icon.path.light) {
        await checkImage('icon.dark', config.icon.path.dark, checks, 1024);
    }
    await checkImage('splash.light', config.splash.path.light, checks);
    if (config.splash.path.dark !== config.splash.path.light) {
        await checkImage('splash.dark', config.splash.path.dark, checks);
    }

    if (!fs.existsSync('ios') && !fs.existsSync('android')) {
        checks.push({name: 'platforms', status: 'warn', message: 'Neither ios/ nor android/ was found'});
    } else {
        checks.push({
            name: 'platforms',
            status: 'ok',
            message: `${fs.existsSync('ios') ? 'ios' : ''}${fs.existsSync('ios') && fs.existsSync('android') ? ', ' : ''}${fs.existsSync('android') ? 'android' : ''}`,
        });
    }

    if (config.signing?.android) {
        const hasKey = fs.existsSync('android/key.properties');
        checks.push({
            name: 'android signing',
            status: hasKey ? 'ok' : 'warn',
            message: hasKey ? 'android/key.properties found' : 'Signing is configured but android/key.properties is missing',
        });
    }

    if (config.signing?.ios?.entitlementsFile || config.signing?.ios?.entitlements) {
        const name = config.signing.ios.entitlementsFile ?? 'Runner.entitlements';
        const file = path.join('ios', 'Runner', path.basename(name));
        checks.push({
            name: 'ios entitlements',
            status: fs.existsSync(file) ? 'ok' : 'warn',
            message: fs.existsSync(file) ? `${file} found` : `${file} is missing (it will be generated on the next run)`,
        });
    }
}

export async function collectDoctorReport(options: {
    profile?: string;
    skipCommands?: boolean;
} = {}): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [];

    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    checks.push({
        name: 'Node.js',
        status: nodeMajor >= 18 ? 'ok' : 'error',
        message: `v${process.versions.node}${nodeMajor >= 18 ? '' : ' (18+ required)'}`,
    });

    if (process.versions.bun) {
        checks.push({name: 'Bun', status: 'ok', message: process.versions.bun});
    }

    if (fs.existsSync('pubspec.yaml')) {
        try {
            const config = parsePubspecYamlFile('pubspec.yaml', options.profile);
            await checkConfig(config, checks);
        } catch (e) {
            checks.push({
                name: 'fluttergen config',
                status: 'error',
                message: e instanceof KnownError ? e.message : String((e as Error).message ?? e),
            });
        }
    } else {
        checks.push({name: 'pubspec.yaml', status: 'error', message: 'pubspec.yaml not found in the current directory'});
    }

    if (!options.skipCommands) {
        checks.push({
            name: 'Flutter',
            status: commandExists('flutter') ? 'ok' : 'error',
            message: commandExists('flutter') ? 'flutter found' : 'flutter is not on PATH',
        });
        checks.push({
            name: 'Git',
            status: commandExists('git') ? 'ok' : 'warn',
            message: commandExists('git') ? 'git found' : 'git is not on PATH (tags/releases unavailable)',
        });

        const androidSdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
        const adb = commandExists('adb');
        checks.push({
            name: 'Android SDK',
            status: androidSdk || adb ? 'ok' : 'warn',
            message: androidSdk ? `${androidSdk}` : adb ? 'adb found on PATH' : 'ANDROID_HOME/ANDROID_SDK_ROOT not set and adb not found',
        });

        if (process.platform === 'darwin') {
            checks.push({
                name: 'Xcode',
                status: commandExists('xcodebuild') ? 'ok' : 'warn',
                message: commandExists('xcodebuild') ? 'xcodebuild found' : 'xcodebuild not found',
            });
            checks.push({
                name: 'CocoaPods',
                status: commandExists('pod') ? 'ok' : 'warn',
                message: commandExists('pod') ? 'pod found' : 'pod not found (iOS pods unavailable)',
            });
        }
    }

    const errors = checks.filter(check => check.status === 'error').length;
    const warnings = checks.filter(check => check.status === 'warn').length;
    return {checks, errors, warnings};
}

export function printDoctorReport(report: DoctorReport) {
    const icons: Record<DoctorStatus, string> = {ok: '✓', warn: '!', error: '✗'};
    for (const check of report.checks) {
        console.log(`${icons[check.status]} ${check.name}: ${check.message}`);
    }
    console.log(`\n${report.checks.length} checks, ${report.errors} errors, ${report.warnings} warnings.`);
}
