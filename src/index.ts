#!/usr/bin/env node

import {parsePubspecYamlFile} from "./yaml_parser.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useNamer} from "./useNamer.ts";
import fs from "fs";
import path from "path";

function currentVersion() {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = fs.readFileSync(pkgPath);
    const packageJson = JSON.parse(pkg.toString());
    return packageJson.version;
}

async function warnIfNewerVersionAvailable() {
    const curr = currentVersion();
    try {
        const res = await fetch('https://registry.npmjs.org/fluttergen/latest');
        const data = await res.json();
        const latest = data.version;
        if (latest !== curr) {
            console.log();
            console.warn(`A newer version of fluttergen is available (${latest}). You are using version ${curr}. Consider updating to the latest version.`);
        }
    } catch (err) {
        // Ignore errors
    }
}

if (process.argv.includes('--version') || process.argv.includes('-v')) {
    (async () => {
        console.log(`fluttergen current version ${currentVersion()}`);
        await warnIfNewerVersionAvailable();
        process.exit(0);
    })().catch(e => {
        console.error("Error during execution:", e);
        process.exit(1);
    });
}

async function main() {

    const config = parsePubspecYamlFile('pubspec.yaml');
    console.log("Parsed Fluttergen Configuration:", config);

    const imageGenerator = useImageGenerator(config);
    await imageGenerator.execute();

    if (config.rename) {
        const namer = useNamer(config.rename)
        namer.execute();
    } else {
        console.log("No renaming configuration found, skipping renaming step.");
    }

    await warnIfNewerVersionAvailable();
    process.exit(0);
}

main().catch(e => {
    console.error("Error during execution:", e);
    process.exit(1);
});
