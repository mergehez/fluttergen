import * as z from "zod";
import {fluttergenConfigSchema} from "./yamlParser.ts";

export function getConfigJsonSchema(): Record<string, any> {
    const schema = z.toJSONSchema(fluttergenConfigSchema) as Record<string, any>;
    return {
        $id: "https://raw.githubusercontent.com/mergehez/fluttergen/main/fluttergen.schema.json",
        title: "fluttergen configuration",
        ...schema,
    };
}
