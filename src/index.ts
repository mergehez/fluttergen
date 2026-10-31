#!/usr/bin/env node

import {getConfigurationOptionsForHelp, parsePubspecYamlFile} from "./yamlParser.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useInfoHandler} from "./useInfoHandler.ts";
import fs from "fs";
import path from "path";
import {getPredefinedScripts, useScripts} from "./useScripts.ts";
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

async function main() {

    const config = parsePubspecYamlFile('pubspec.yaml');
    // console.log("Parsed Fluttergen Configuration:", config);
    if (config.prescripts) {
        useScripts(config, 'prescripts').execute();
    }

    const imageGenerator = useImageGenerator(config);
    await imageGenerator.execute();

    if (config.info) {
        const namer = useInfoHandler(config.info)
        namer.execute();
    } else {
        console.log("No renaming configuration found, skipping renaming step.");
    }

    if (config.postscripts) {
        useScripts(config, 'postscripts').execute();
    }

    await warnIfNewerVersionAvailable();
    process.exit(0);
}


if (process.argv.includes('--help') || process.argv.includes('-h')) {
    (async () => {
        console.log(`help for fluttergen:
[no flags]       Run fluttergen with configuration from pubspec.yaml
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
