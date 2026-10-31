#!/usr/bin/env node

import {getConfigurationOptionsForHelp, parsePubspecYamlFile} from "./yamlParser.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useInfoHandler} from "./useInfoHandler.ts";
import {useSigning} from "./useSigning.ts";
import {usePermissions} from "./usePermissions.ts";
import fs from "fs";
import path from "path";
import {getBuiltInTaskNames, getPredefinedScripts, runBuiltInTask, useScripts} from "./useScripts.ts";
import {runRelease} from "./useRelease.ts";
import {getConfigJsonSchema} from "./schema.ts";
import {collectDoctorReport, printDoctorReport} from "./useDoctor.ts";
import {diffSnapshots, restoreBackup, restoreSnapshot, takeSnapshot, writeBackup} from "./safety.ts";
import {KnownError} from "./knownError.ts";

function currentVersion() {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = fs.readFileSync(pkgPath);
    const packageJson = JSON.parse(pkg.toString());
    return packageJson.version;
}

function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(part => parseInt(part, 10) || 0);
    const partsB = b.split('.').map(part => parseInt(part, 10) || 0);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const left = partsA[i] ?? 0;
        const right = partsB[i] ?? 0;
        if (left !== right) return left - right;
    }
    return 0;
}

async function warnIfNewerVersionAvailable() {
    if (process.env.FLUTTERGEN_NO_UPDATE_CHECK) return;

    const curr = currentVersion();
    try {
        const res = await fetch('https://registry.npmjs.org/fluttergen/latest', {
            signal: AbortSignal.timeout(1500),
        });
        if (!res.ok) return;
        const data = await res.json() as { version?: string };
        const latest = data.version;
        if (latest && compareVersions(latest, curr) > 0) {
            console.log();
            console.warn(`A newer version of fluttergen is available (${latest}). You are using version ${curr}. Consider updating to the latest version.`);
        }
    } catch (err) {
        // Ignore errors
    }
}

function getArgValue(names: string[]): string | undefined {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        for (const name of names) {
            if (args[i] === name) {
                return args[i + 1];
            }
            if (args[i].startsWith(`${name}=`)) {
                return args[i].slice(name.length + 1);
            }
        }
    }
    return undefined;
}

const SELECTABLE_PHASES = new Set(['info', 'icons', 'splash', 'permissions', 'signing', 'scripts', 'all']);

function parsePhaseList(value: string | undefined, flag: string): Set<string> {
    const phases = new Set(
        (value ?? '').split(',').map(item => item.trim()).filter(Boolean)
    );
    for (const phase of phases) {
        if (!SELECTABLE_PHASES.has(phase)) {
            throw new KnownError(`Unknown ${flag} value '${phase}'. Use: ${[...SELECTABLE_PHASES].join(', ')}.`);
        }
    }
    return phases;
}

function parsePlatform(value: string | undefined): 'ios' | 'android' | 'all' {
    if (!value || value === 'all') return 'all';
    if (value === 'ios' || value === 'android') return value;
    throw new KnownError(`Unknown platform '${value}'. Use ios, android or all.`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--restore')) {
        restoreBackup();
        process.exit(0);
    }

    const profile = getArgValue(['--profile', '-p']);
    const only = parsePhaseList(getArgValue(['--only']), '--only');
    const skip = parsePhaseList(getArgValue(['--skip']), '--skip');
    const platform = parsePlatform(getArgValue(['--platform']));
    const dryRun = args.includes('--dry-run');
    const showDiff = args.includes('--diff') || dryRun;
    const createBackup = args.includes('--backup');

    const phaseEnabled = (phase: string) => {
        if (skip.has(phase) || skip.has('all')) return false;
        if (only.size > 0) return only.has(phase) || only.has('all');
        return true;
    };

    const snapshot = (dryRun || showDiff || createBackup) ? takeSnapshot() : undefined;
    if (createBackup && snapshot) {
        writeBackup(snapshot);
    }

    const config = parsePubspecYamlFile('pubspec.yaml', profile);

    if (!dryRun && phaseEnabled('scripts') && config.prescripts) {
        await useScripts(config, 'prescripts').execute();
    } else if (dryRun && config.prescripts) {
        console.log('- Dry run: skipping prescripts.');
    }

    const imageGenerator = useImageGenerator(config);
    await imageGenerator.execute({
        icons: phaseEnabled('icons'),
        splash: phaseEnabled('splash'),
        platform,
    });

    if (config.info && phaseEnabled('info')) {
        useInfoHandler(config.info).execute({platform});
    } else if (!config.info) {
        console.log("No renaming configuration found, skipping renaming step.");
    }

    if (config.permissions && phaseEnabled('permissions')) {
        usePermissions(config).execute({platform});
    }

    if (config.signing && phaseEnabled('signing')) {
        useSigning(config).execute({platform});
    }

    if (!dryRun && phaseEnabled('scripts') && config.postscripts) {
        await useScripts(config, 'postscripts').execute();
    } else if (dryRun && config.postscripts) {
        console.log('- Dry run: skipping postscripts.');
    }

    if (showDiff && snapshot) {
        const patch = diffSnapshots(snapshot, takeSnapshot());
        console.log(patch || '- No file changes.');
    }

    if (dryRun && snapshot) {
        restoreSnapshot(snapshot);
        console.log('- Dry run: changes reverted.');
    }

    await warnIfNewerVersionAvailable();
    process.exit(0);
}

function parseTaskOptions(args: string[]): Record<string, any> {
    const options: Record<string, any> = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--')) continue;

        const equalsIndex = arg.indexOf('=');
        let key: string;
        let value: any;

        if (equalsIndex !== -1) {
            key = arg.slice(2, equalsIndex);
            value = arg.slice(equalsIndex + 1);
        } else {
            key = arg.slice(2);
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                value = next;
                i++;
            } else {
                value = true;
            }
        }

        key = key.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());

        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (typeof value === 'string' && /^-?\d+$/.test(value)) value = Number(value);

        if (key === 'args' && typeof value === 'string') {
            value = value.split(/\s+/).filter(Boolean);
        }

        options[key] = value;
    }

    return options;
}

function runSchemaCommand(args: string[]) {
    const options = parseTaskOptions(args);
    const output = typeof options.output === 'string' ? options.output : undefined;
    const json = `${JSON.stringify(getConfigJsonSchema(), null, 2)}\n`;

    if (output) {
        fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
        fs.writeFileSync(output, json);
        console.log(`- JSON schema written to ${output}.`);
    } else {
        process.stdout.write(json);
    }
    process.exit(0);
}

async function runDoctorCommand(args: string[]) {
    const options = parseTaskOptions(args);
    const profile = typeof options.profile === 'string' ? options.profile : undefined;
    const report = await collectDoctorReport({profile});
    printDoctorReport(report);
    process.exit(report.errors > 0 ? 1 : 0);
}

function runTaskCommand(args: string[]) {
    const usage = `usage: fluttergen run <task> [--key=value]

Examples:
  fluttergen run --list
  fluttergen run flutter.clean
  fluttergen run ios.pods.reset
  fluttergen run build.apk --mode=release --flavor=prod`;

    if (args.includes('--help') || args.includes('-h')) {
        console.log(usage);
        process.exit(0);
    }

    if (args[0] === '--list') {
        console.log('Built-in tasks:\n' + getBuiltInTaskNames().map(name => `- ${name}`).join('\n'));
        process.exit(0);
    }

    const taskName = args[0];
    if (!taskName || taskName.startsWith('-')) {
        console.error(usage);
        process.exit(1);
    }

    try {
        runBuiltInTask(taskName, parseTaskOptions(args.slice(1)));
        process.exit(0);
    } catch (e) {
        if (e instanceof KnownError) {
            console.error("Error:", e.message);
        } else {
            console.error("Error during execution:", (e as Error).message ?? String(e));
        }
        process.exit(1);
    }
}

function runReleaseCommand(args: string[]) {
    const usage = `usage: fluttergen release [--patch|--minor|--major] [--dry-run] [--tag] [--push] [--build=apk,ipa]

Examples:
  fluttergen release --patch
  fluttergen release --minor --dry-run
  fluttergen release --major --tag --build=apk`;

    if (args.includes('--help') || args.includes('-h')) {
        console.log(usage);
        process.exit(0);
    }

    const options = parseTaskOptions(args);
    const profile = typeof options.profile === 'string' ? options.profile : undefined;
    const bump = options.major ? 'major' : options.minor ? 'minor' : options.patch ? 'patch' : undefined;
    const build = typeof options.build === 'string'
        ? options.build.split(',').map(value => value.trim()).filter(Boolean)
        : undefined;
    const tag = options.noTag ? false : options.tag ? true : undefined;

    try {
        const config = parsePubspecYamlFile('pubspec.yaml', profile);
        runRelease(config, {
            bump,
            dryRun: Boolean(options.dryRun),
            tag,
            push: Boolean(options.push),
            build,
        });
        process.exit(0);
    } catch (e) {
        if (e instanceof KnownError) {
            console.error("Error:", e.message);
        } else {
            console.error("Error during execution:", (e as Error).message ?? String(e));
        }
        process.exit(1);
    }
}


const firstArg = process.argv[2];

if (firstArg === 'run') {
    runTaskCommand(process.argv.slice(3));
} else if (firstArg === 'release') {
    runReleaseCommand(process.argv.slice(3));
} else if (firstArg === 'doctor') {
    runDoctorCommand(process.argv.slice(3)).catch(e => {
        console.error("Error during execution:", (e as Error).message ?? String(e));
        process.exit(1);
    });
} else if (firstArg === 'schema') {
    runSchemaCommand(process.argv.slice(3));
} else if (process.argv.includes('--help') || process.argv.includes('-h')) {
    (async () => {
        console.log(`help for fluttergen:
[no flags]       Run fluttergen with configuration from pubspec.yaml
run <task>       Run a built-in task (fluttergen run --list)
release          Bump version, sync builds, tag and optionally build
doctor           Check the project and toolchain
schema           Print or write the JSON Schema
--profile <name> Apply a named profile from the config
--only <phases>  Run only: info, icons, splash, permissions, signing, scripts
--skip <phases>  Skip selected phases
--platform <p>   Limit to ios or android
--dry-run        Preview changes and restore files afterwards
--diff           Print a diff of changed files
--backup         Back up watched files before running
--restore        Restore the last backup
--help, -h       Show help information
--version, -v    Show current version

Configuration options:
${getConfigurationOptionsForHelp()}

Available predefined scripts:
${getPredefinedScripts()}
`);
        await warnIfNewerVersionAvailable();
        process.exit(0);
    })().catch(e => {
        console.error("Error during execution:", e);
        process.exit(1);
    });
} else if (process.argv.includes('--version') || process.argv.includes('-v')) {
    (async () => {
        console.log(`fluttergen current version ${currentVersion()}`);
        await warnIfNewerVersionAvailable();
        process.exit(0);
    })().catch(e => {
        console.error("Error during execution:", e);
        process.exit(1);
    });
} else {
    main().catch(e => {
        if (e instanceof KnownError) {
            console.error("Error:", e.message);
            process.exit(1);
        }
        console.error("Error during execution:", e.toString());
        process.exit(1);
    });
}
