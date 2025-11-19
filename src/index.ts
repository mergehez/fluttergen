#!/usr/bin/env bun

import {parsePubspecYamlFile} from "./yaml_parser.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useNamer} from "./useNamer.ts";

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
