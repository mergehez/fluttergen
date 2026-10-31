#!/usr/bin/env node

import {getConfigurationOptionsForHelp, parsePubspecYamlFile} from "./yamlParser.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useInfoHandler} from "./useInfoHandler.ts";
import {useSigning} from "./useSigning.ts";
import fs from "fs";
import path from "path";
import {getBuiltInTaskNames, getPredefinedScripts, runBuiltInTask, useScripts} from "./useScripts.ts";
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

async function main() {

    const profile = getArgValue(['--profile', '-p']);
    const config = parsePubspecYamlFile('pubspec.yaml', profile);
    // console.log("Parsed Fluttergen Configuration:", config);
    if (config.prescripts) {
        await useScripts(config, 'prescripts').execute();
    }

    const imageGenerator = useImageGenerator(config);
    await imageGenerator.execute();

    if (config.info) {
        const namer = useInfoHandler(config.info)
        namer.execute();
    } else {
        console.log("No renaming configuration found, skipping renaming step.");
    }

    if (config.signing) {
        useSigning(config).execute();
    }

    if (config.postscripts) {
        await useScripts(config, 'postscripts').execute();
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


const firstArg = process.argv[2];

if (firstArg === 'run') {
    runTaskCommand(process.argv.slice(3));
} else if (process.argv.includes('--help') || process.argv.includes('-h')) {
    (async () => {
        console.log(`help for fluttergen:
[no flags]       Run fluttergen with configuration from pubspec.yaml
run <task>       Run a built-in task (fluttergen run --list)
--profile <name> Apply a named profile from the config
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
