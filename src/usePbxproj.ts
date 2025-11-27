import * as fs from "fs";
import YAML, {LineCounter} from "yaml";
import {replaceInFile} from "./useBuildGradle.ts";

export function usePbxproj(path: string) {
    function update(key: string, newValue: string) {
        replaceInFile(path, new RegExp(`${key} = [^;]+;`, 'g'), `${key} = ${newValue};`);
    }


    return {
        update: update,
    }
}
