// noinspection JSUnusedLocalSymbols

import {FluttergenConfig} from "./yamlParser.ts";
import fs from "fs";
import {execSync} from "child_process";
import path from "path";
import {useYamlFile} from "fileHandler/useYamlFile.ts";
import {KnownError} from "./knownError.ts";
import {replaceInFile, useBuildGradle} from "fileHandler/useBuildGradle.ts";
import {usePlist} from "fileHandler/usePlist.ts";
import * as propFile from 'properties-file'
import {usePropertiesFile} from "fileHandler/usePropertiesFile.ts";
import {usePbxproj} from "fileHandler/usePbxproj.ts";
import {usePlaceholderReplacer} from "fileHandler/usePlaceholderReplacer.ts";

function parseRegexLiteral(value: string): RegExp | undefined {
    if (!value.startsWith('/')) return undefined;
    const lastSlash = value.lastIndexOf('/');
    if (lastSlash <= 0) return undefined;
    const pattern = value.slice(1, lastSlash);
    const flags = value.slice(lastSlash + 1);
    if (!/^[dgimsuvy]*$/.test(flags)) return undefined;
    try {
        return new RegExp(pattern, flags);
    } catch {
        throw new KnownError(`Invalid regular expression: ${value}`);
    }
}

function quoteArg(value: unknown): string {
    return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function execCommand(command: string, options: { cwd?: string } = {}) {
    console.log(`- Running command: ${command}`);
    execSync(command, {stdio: 'inherit', ...options});
}

function selectedMode(options: Record<string, any> = {}): string {
    if (!options.mode) return '';
    const mode = String(options.mode);
    if (!['debug', 'profile', 'release'].includes(mode)) {
        throw new KnownError(`Invalid build mode '${mode}'. Use debug, profile or release.`);
    }
    return ` --${mode}`;
}

function extraArgs(options: Record<string, any> = {}): string {
    if (!options.args) return '';
    const args = Array.isArray(options.args) ? options.args : [options.args];
    return ` ${args.join(' ')}`;
}

function buildFlags(options: Record<string, any> = {}): string {
    const flavor = options.flavor ? ` --flavor=${quoteArg(options.flavor)}` : '';
    const target = options.target ? ` -t ${quoteArg(options.target)}` : '';
    return `${selectedMode(options)}${flavor}${target}${extraArgs(options)}`;
}

function assertMacOnly(taskName: string) {
    if (process.platform !== 'darwin') {
        throw new KnownError(`'${taskName}' requires macOS.`);
    }
}

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
        pbxprojAddEntitlements: (projPath: string, entName: string, groupName: string, isCodeSign: boolean | number = 0) => {
            console.log(`- Adding entitlements file ${entName} to pbxproj at ${projPath}`);
            usePbxproj(projPath).addEntitlements(entName, groupName, isCodeSign);
        },
        propertiesSet: (filePath: string, key: string, value: string) => {
            console.log(`- Setting property '${key}' in ${filePath}`);
            usePropertiesFile(filePath).set(key, value);
        },
        appendToFile: (filePath: string, contentToAppend: string) => {
            console.log(`- Appending to file at ${filePath}`);
            fs.appendFileSync(filePath, contentToAppend);
        },
        replaceInFile: (filePath: string, stringOrRegex: string, newValue: string, type: any) => {
            console.log(`- Updating file at ${filePath}`);
            const regex = parseRegexLiteral(stringOrRegex);
            if (regex) {
                return replaceInFile(filePath, regex, newValue);
            }

            if (filePath.includes('android/app/build.gradle')) {
                return useBuildGradle('android/app').update(stringOrRegex, newValue, type);
            } else if (filePath.includes('android/build.gradle')) {
                return useBuildGradle('android').update(stringOrRegex, newValue, type);
            } else {
                replaceInFile(filePath, stringOrRegex, newValue);
            }
        },
        replacePlaceholdersInFile: (filePath: string, prefix: string, object: Record<string, any>) => {
            const replacer = usePlaceholderReplacer(filePath);
            replacer.replace(prefix, object);
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
            execCommand(command);
        },
        exec: (command: string) => {
            execCommand(command);
        },

        // ---------------------------------------------------------------
        // Built-in task library
        // ---------------------------------------------------------------

        flutter: {
            clean: () => execCommand('flutter clean'),
            pubGet: () => execCommand('flutter pub get'),
            analyze: () => execCommand('flutter analyze'),
            doctor: () => execCommand('flutter doctor'),
            test: (options: Record<string, any> = {}) => {
                const coverage = options.coverage ? ' --coverage' : '';
                const name = options.name ? ` --plain-name ${quoteArg(options.name)}` : '';
                execCommand(`flutter test${coverage}${name}${extraArgs(options)}`);
            },
            run: (options: Record<string, any> = {}) => {
                const device = options.device ? ` -d ${quoteArg(options.device)}` : '';
                const flavor = options.flavor ? ` --flavor=${quoteArg(options.flavor)}` : '';
                const target = options.target ? ` -t ${quoteArg(options.target)}` : '';
                execCommand(`flutter run${device}${selectedMode(options)}${flavor}${target}${extraArgs(options)}`);
            },
        },

        android: {
            clean: () => {
                const gradlew = process.platform === 'win32' ? 'gradlew.bat' : 'gradlew';
                if (!fs.existsSync(path.join('android', gradlew))) {
                    throw new KnownError(`Could not find android/${gradlew}.`);
                }
                execCommand(`${process.platform === 'win32' ? gradlew : `./${gradlew}`} clean`, {cwd: 'android'});
            },
        },

        ios: {
            pods: {
                install: () => {
                    assertMacOnly('ios.pods.install');
                    execCommand('pod install', {cwd: 'ios'});
                },
                update: () => {
                    assertMacOnly('ios.pods.update');
                    execCommand('pod update', {cwd: 'ios'});
                },
                deintegrate: () => {
                    assertMacOnly('ios.pods.deintegrate');
                    execCommand('pod deintegrate', {cwd: 'ios'});
                },
                reset: () => {
                    assertMacOnly('ios.pods.reset');
                    if (!fs.existsSync('ios')) {
                        throw new KnownError('Could not find the ios directory.');
                    }
                    execCommand('pod deintegrate', {cwd: 'ios'});
                    execCommand('pod cache clean --all', {cwd: 'ios'});
                    fs.rmSync(path.join('ios', 'Pods'), {recursive: true, force: true});
                    fs.rmSync(path.join('ios', 'Podfile.lock'), {force: true});
                    execCommand('pod install', {cwd: 'ios'});
                },
            },
        },

        build: {
            apk: (options: Record<string, any> = {}) => {
                const split = options.splitPerAbi ? ' --split-per-abi' : '';
                execCommand(`flutter build apk${buildFlags(options)}${split}`);
            },
            appBundle: (options: Record<string, any> = {}) => {
                execCommand(`flutter build appbundle${buildFlags(options)}`);
            },
            ipa: (options: Record<string, any> = {}) => {
                assertMacOnly('build.ipa');
                const exportOptions = options.exportOptionsMethod ? ` --export-method=${quoteArg(options.exportOptionsMethod)}` : '';
                execCommand(`flutter build ipa${buildFlags(options)}${exportOptions}`);
            },
        },

        install: {
            device: (options: Record<string, any> = {}) => {
                const device = options.device ? ` -d ${quoteArg(options.device)}` : '';
                execCommand(`flutter install${device}${selectedMode(options)}${extraArgs(options)}`);
            },
        },

        firebase: {
            configure: (options: Record<string, any> = {}) => {
                const args = ['flutterfire', 'configure'];
                if (options.yes !== false) args.push('--yes');
                if (options.project) args.push(`--project=${quoteArg(options.project)}`);
                if (options.account) args.push(`--account=${quoteArg(options.account)}`);
                if (options.platforms) {
                    const platforms = Array.isArray(options.platforms) ? options.platforms.join(',') : options.platforms;
                    args.push(`--platforms=${quoteArg(platforms)}`);
                }
                const command = `${args.join(' ')}${extraArgs(options)}`;
                try {
                    execCommand(command);
                } catch (error) {
                    console.error((error as Error).message);
                    throw new KnownError(
                        "firebase.configure failed. Is the FlutterFire CLI installed? Run 'dart pub global activate flutterfire_cli'."
                    );
                }
            },
        },

        git: {
            tag: (options: Record<string, any> = {}) => {
                const version = options.version ?? useYamlFile('./pubspec.yaml').get('version');
                if (!version) {
                    throw new KnownError('No version found in pubspec.yaml.');
                }
                const tagName = `${options.prefix ?? 'v'}${version}`;

                try {
                    execSync(`git rev-parse -q --verify refs/tags/${quoteArg(tagName)}`, {stdio: 'ignore'});
                    console.log(`- Tag ${tagName} already exists, skipping.`);
                    return;
                } catch {
                    // Tag does not exist yet.
                }

                const message = options.message ? ` -m ${quoteArg(options.message)}` : '';
                execCommand(`git tag${message} ${quoteArg(tagName)}`);

                if (options.push) {
                    execCommand(`git push origin ${quoteArg(tagName)}`);
                }
            },
        },
    }
}

function funcsToDefinitionString(funcs: Record<string, any>): string {
    return collectFunctionPaths(funcs).map(functionPath => {
        let target: any = funcs;
        for (const part of functionPath.split('.')) {
            target = target?.[part];
        }
        const paramNames = typeof target === 'function'
            ? target.toString().match(/\(([^)]*)\)/)?.[1] ?? ''
            : '';
        return `${functionPath}(${paramNames})`;
    }).join('\n');
}

export function getPredefinedScripts() {
    return funcsToDefinitionString(getFunctions()).split('\n').map(line => `- ${line}`).join('\n');
}

function collectFunctionPaths(functions: Record<string, any>, prefix = ''): string[] {
    const paths: string[] = [];
    for (const [key, value] of Object.entries(functions)) {
        const current = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'function') {
            paths.push(current);
        } else if (value && typeof value === 'object') {
            paths.push(...collectFunctionPaths(value, current));
        }
    }
    return paths;
}

function callFunctionPath(functions: Record<string, any>, functionPath: string, params?: unknown) {
    let target: any = functions;
    for (const part of functionPath.split('.')) {
        target = target?.[part];
    }
    if (typeof target !== 'function') {
        throw new KnownError(`Unknown task '${functionPath}'.`);
    }
    if (params === undefined || params === null) {
        return target();
    }
    if (Array.isArray(params)) {
        return target(...params);
    }
    return target(params);
}

/**
 * Namespaced built-in tasks available without writing function calls.
 */
export function getBuiltInTaskNames(): string[] {
    return collectFunctionPaths(getFunctions())
        .filter(name => name.includes('.'))
        .sort();
}

/**
 * Runs a built-in task by name, e.g. `build.apk` or `ios.pods.reset`.
 */
export function runBuiltInTask(taskName: string, params?: unknown) {
    return callFunctionPath(getFunctions(), taskName, params);
}

type Task = string | Record<string, any>

export function useScripts(config: FluttergenConfig, section: 'prescripts' | 'postscripts') {
    return {
        // noinspection JSUnusedGlobalSymbols
        execute: () => {
            const scripts = config[section];
            if (!scripts || scripts.length === 0)
                return;

            const tasks: Task[] = [];
            const groupedTasks: Record<string, Task[]> = {};
            for (const task of scripts) {
                if (typeof task === 'string') {
                    tasks.push(task);
                    continue;
                }

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
                    // A single-key object can invoke a built-in task with options.
                    tasks.push(task);
                    continue;
                }

                throw new KnownError(
                    `Scripts must be strings representing function calls, built-in task names, or group definitions. Invalid entry: ${JSON.stringify(task)}`
                );
            }

            const predefinedFns = getFunctions();
            const functionPaths = collectFunctionPaths(predefinedFns);
            const builtInPaths = new Set(functionPaths);
            const env = fs.existsSync('.env') ? propFile.getProperties(fs.readFileSync('.env')) : undefined;
            console.log(`- Running tasks from '${section}' section`);

            function runTasks(tasksToRun: Task[]) {
                for (const task of tasksToRun) {
                    const params = config.variables;
                    const vars = config.variables;
                    const variables = config.variables;
                    const argv = process.argv;

                    function runGroup(groupName: string) {
                        const groupTasks = groupedTasks[groupName];
                        if (!groupTasks) {
                            throw new KnownError(`Task group '${groupName}' is not defined.`);
                        }
                        runTasks(groupTasks);
                    }

                    if (typeof task === 'object' && task !== null) {
                        const keys = Object.keys(task);
                        if (keys.length !== 1) {
                            throw new KnownError(`Built-in task entries must have exactly one key: ${JSON.stringify(task)}`);
                        }
                        const [taskName] = keys;
                        if (!builtInPaths.has(taskName)) {
                            throw new KnownError(`Unknown built-in task '${taskName}'.`);
                        }
                        console.log(`- Executing built-in task: ${taskName}`);
                        callFunctionPath(predefinedFns, taskName, (task as any)[taskName]);
                        continue;
                    }

                    let expression = task.trim();
                    if (!expression) {
                        throw new KnownError(`Invalid task format: ${JSON.stringify(task)}`);
                    }

                    // Bare built-in names (e.g. `flutter.clean` or `versionUp`) run without eval.
                    if (builtInPaths.has(expression)) {
                        console.log(`- Executing built-in task: ${expression}`);
                        callFunctionPath(predefinedFns, expression);
                        continue;
                    }

                    // Rewrite helper calls (including nested namespaces) to the local registry.
                    for (const functionPath of functionPaths) {
                        expression = expression.replaceAll(`${functionPath}(`, `predefinedFns.${functionPath}(`);
                    }
                    for (const groupName of Object.keys(groupedTasks)) {
                        expression = expression.replaceAll(`${groupName}()`, `runGroup('${groupName}')`);
                    }

                    console.log(`- Executing task: ${expression}`);
                    eval(expression);
                }
            }

            runTasks(tasks)
        }
    }
}