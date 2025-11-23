#!/usr/bin/env node

import {parsePubspecYamlFile} from "./yaml_parser.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useNamer} from "./useNamer.ts";
import packageJson from '../package.json' with {type: "json"};

if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(`fluttergen version ${packageJson.version}`);
    process.exit(0);
}

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
