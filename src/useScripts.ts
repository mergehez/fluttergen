// noinspection JSUnusedLocalSymbols

import {FluttergenConfig} from "./yamlParser.ts";
import fs, {mkdirSync} from "fs";
import {execSync} from "child_process";
import path from "path";
import {useYamlFile} from "fileHandler/useYamlFile.ts";
import {KnownError} from "./knownError.ts";
import {replaceInFile, useBuildGradle} from "fileHandler/useBuildGradle.ts";
import {usePlist} from "fileHandler/usePlist.ts";
import * as propFile from 'properties-file'
import {usePropertiesFile} from "./usePropertiesFile.ts";
import {usePropertiesFile} from "fileHandler/usePropertiesFile.ts";

function getFunctions() {
    // noinspection JSUnusedGlobalSymbols
    return {
        copyFile: (source: string, destination: string) => {
            console.log(`- Copying file from ${source} to ${destination}`);
            const isDestDir = fs.existsSync(destination) && fs.lstatSync(destination).isDirectory();
            if (!isDestDir) {
                fs.mkdirSync(path.dirname(destination), {recursive: true});
                fs.copyFileSync(source, destination);
            } else {
                fs.mkdirSync(destination, {recursive: true});
                const destFilePath = `${destination}/${source.split('/').pop()}`;
                fs.copyFileSync(source, destFilePath);
            }
        },
        copyDirectory: (source: string, destination: string) => {
            console.log(`- Copying directory from ${source} to ${destination}`);
            fs.mkdirSync(destination, {recursive: true});
            fs.cpSync(source, destination, {recursive: true});
        },
        yamlAddToList: (filePath: string, keyPath: string, newValue: string, mkDir: boolean | number = 1) => useYamlFile(filePath).addToList(keyPath, newValue, mkDir),
        yamlSet: (filePath: string, keyPath: string, newValue: string) => useYamlFile(filePath).set(keyPath, newValue),
        plistAddToList: (filePath: string, keyPath: string, type: string, newValue: string) => usePlist(filePath).addToList(keyPath, type, newValue),
        plistGet: (filePath: string, keyPath: string) => usePlist(filePath).get(keyPath),
        // plistGetArray: (filePath: string, keyPath: string) => usePlist(filePath).getComplex(keyPath),
        // plistGetDict: (filePath: string, keyPath: string) => usePlist(filePath).getComplex(keyPath),
        plistSet: (filePath: string, keyPath: string, type: string, newValue: string) => usePlist(filePath).set(keyPath, type, newValue),
        plistInsert: (filePath: string, keyPath: string, type: string, newValue?: string) => usePlist(filePath).insert(keyPath, type, newValue),
        propertiesSet: (filePath: string, key: string, value: string) => {
            console.log(`- Setting property in ${filePath}: ${key}=${value}`);
            usePropertiesFile(filePath).set(key, value);
        },
        appendToFile: (filePath: string, contentToAppend: string) => {
            console.log(`- Appending to file at ${filePath}`);
            fs.appendFileSync(filePath, contentToAppend);
        },
        replaceInFile: (filePath: string, stringOrRegex: string, newValue: string, type: any) => {
            console.log(`- Updating file at ${filePath} - Replacing ${stringOrRegex} with ${newValue}`);
            const isRegex = stringOrRegex.startsWith('/') && stringOrRegex.endsWith('/');
            if (isRegex) {
                return replaceInFile(filePath, stringOrRegex, newValue);
            }

            if (filePath.includes('android/build.gradle')) {
                return useBuildGradle('android').update(stringOrRegex, newValue, type);
            } else if (filePath.includes('android/app/build.gradle')) {
                return useBuildGradle('android/app').update(stringOrRegex, newValue, type);
            } else {
                replaceInFile(filePath, stringOrRegex, newValue);
            }
        },
        versionUp: () => {
            const yaml = useYamlFile('./pubspec.yaml');
            const currentVersion = yaml.get('version');
            if (!currentVersion) {
                throw new KnownError(`No version found in pubspec.yaml`);
            }
            const [versionPart, buildPart] = currentVersion.split('+');
            const versionSegments = versionPart.split('.').map(seg => parseInt(seg, 10));
            if (versionSegments.length !== 3 || versionSegments.some(isNaN)) {
                throw new KnownError(`Invalid version format in pubspec.yaml: ${currentVersion}`);
            }
            versionSegments[versionSegments.length - 1] += 1;
            const newVersionPart = versionSegments.join('.');
            const newBuildPart = buildPart ? (parseInt(buildPart, 10) + 1).toString() : '1';
            const newVersion = `${newVersionPart}+${newBuildPart}`;
            yaml.set('version', newVersion);
            console.log(`- Version updated from ${currentVersion} to ${newVersion}`);
        },
        runCommand: (command: string) => {
            console.log(`- Running command: ${command}`);
            execSync(command, {stdio: 'inherit'});
        },
        exec: (command: string) => {
            console.log(`- Running command: ${command}`);
            execSync(command, {stdio: 'inherit'});
        }
    }
}

function funcsToDefinitionString(funcs: Record<string, any>, prefix = ''): string {
    let actions: string[] = [];
    for (const action of Object.keys(funcs)) {
        const child = (funcs as any)[action];
        if (typeof child === 'object') {
            const childDefs = funcsToDefinitionString(child, `${action}.`);
            actions = actions.concat(childDefs);
        } else {
            const paramNames = (funcs as any)[action].toString().match(/\(([^)]*)\)/)?.[1];
            actions.push(`${action}(${paramNames})`);
        }
    }
    return actions.map(line => `${prefix}${line}`).join('\n');
}

export function getPredefinedScripts() {
    return funcsToDefinitionString(getFunctions()).split('\n').map(line => `- ${line}`).join('\n');
}

type Task = string

export function useScripts(config: FluttergenConfig, section: 'prescripts' | 'postscripts') {
    return {
        // noinspection JSUnusedGlobalSymbols
        execute: () => {
            const scripts = config[section];
            if (!scripts || scripts.length === 0)
                return;

            const normalizedTasks: Task[] = [];
            const groupedTasks: Record<string, Task[]> = {};
            for (const task of scripts) {
                if (typeof task !== 'string') {
                    if (task && typeof task === 'object') {
                        const keys = Object.keys(task);
                        if (keys.length === 1 && keys[0].startsWith('group:') && Array.isArray((task as any)[keys[0]])) {
                            const groupName = keys[0].slice(6);
                            if (!groupedTasks[groupName]) {
                                groupedTasks[groupName] = [];
                            }
                            groupedTasks[groupName].push(...(task as any)[keys[0]]);
                            continue;
                        }
                    }
                    throw new KnownError(`Scripts can only be defined as strings representing function calls. Invalid entry: ${JSON.stringify(task)}`);
                }
                normalizedTasks.push(task);
            }

            const predefinedFns = getFunctions();
            const env = fs.existsSync('.env') ? propFile.getProperties(fs.readFileSync('.env')) : undefined;
            console.log(`- Running tasks from '${section}' section`);


            function runTasks(tasks: Task[]) {
                for (let task of tasks) {
                    if (task) {
                        const params = config.variables;
                        const vars = config.variables;
                        const variables = config.variables;
                        const argv = process.argv;

                        function runGroup(groupName: string) {
                            const tasks = groupedTasks[groupName];
                            if (!tasks) {
                                throw new KnownError(`Task group '${groupName}' is not defined.`);
                            }
                            runTasks(tasks);
                        }

                        Object.keys(predefinedFns).forEach((key) => {
                            const fnVal = (predefinedFns as any)[key];
                            if (typeof fnVal === 'object') {
                                for (const innerKey in fnVal) {
                                    task = task.replace(`${key}.${innerKey}(`, `predefinedFns.${key}.${innerKey}(`);
                                }
                            } else {
                                task = task.replace(`${key}(`, `predefinedFns.${key}(`);
                            }
                        })
                        Object.keys(groupedTasks).forEach((key) => {
                            const groupCall = `${key}()`;
                            if (task.includes(groupCall)) {
                                task = task.replace(groupCall, `runGroup('${key}')`);
                            }
                        })
                        console.log(`- Executing task: ${task}`);
                        eval(task);
                    } else {
                        throw new KnownError(`Invalid task format, missing 'eval': ${JSON.stringify(task)}`);
                    }
                }
            }

            runTasks(normalizedTasks)
        }
    }
}