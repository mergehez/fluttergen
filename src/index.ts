#!/usr/bin/env node

import {parsePubspecYamlFile} from "./yaml_parser.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useNamer} from "./useNamer.ts";
import fs from "fs";
import path from "path";

if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = fs.readFileSync(pkgPath);
    const packageJson = JSON.parse(pkg.toString());
    console.log(`fluttergen version ${packageJson.version}`);
    process.exit(0);
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
}

main().catch(e => {
    console.error("Error during execution:", e);
    process.exit(1);
});
