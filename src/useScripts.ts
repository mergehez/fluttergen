// noinspection JSUnusedLocalSymbols

import {FluttergenConfig} from "./yamlParser.ts";
import fs from "fs";
import {execSync} from "child_process";
import path from "path";
import {useYamlFile} from "fileHandler/useYamlFile.ts";
import {KnownError} from "./knownError.ts";
import {replaceInFile, useBuildGradle} from "fileHandler/useBuildGradle.ts";
import {usePlist} from "fileHandler/usePlist.ts";
import {usePropertiesFile} from "fileHandler/usePropertiesFile.ts";
import {loadEnvironment} from "./env.ts";
import {usePbxproj} from "fileHandler/usePbxproj.ts";
import {usePlaceholderReplacer} from "fileHandler/usePlaceholderReplacer.ts";
import {useImageGenerator} from "./useImageGenerator.ts";
import {useInfoHandler} from "./useInfoHandler.ts";

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

function asArrayValue<T>(value: T | T[]): T[] {
    return Array.isArray(value) ? value : [value];
}

function hostPlatformNames(): string[] {
    switch (process.platform) {
        case 'darwin':
            return ['darwin', 'macos', 'ios', 'unix'];
        case 'win32':
            return ['win32', 'windows'];
        case 'linux':
            return ['linux', 'unix'];
        default:
            return [process.platform];
    }
}

function evaluateCondition(condition: unknown): boolean {
    if (condition === undefined || condition === null) return true;
    if (typeof condition === 'boolean') return condition;
    if (typeof condition === 'string') return process.argv.includes(condition);
    if (Array.isArray(condition)) return condition.every(evaluateCondition);

    if (typeof condition === 'object') {
        const value = condition as Record<string, any>;

        if ('all' in value) return asArrayValue(value.all).every(evaluateCondition);
        if ('any' in value) return asArrayValue(value.any).some(evaluateCondition);
        if ('not' in value) return !evaluateCondition(value.not);

        if ('flag' in value) {
            return asArrayValue(value.flag).every(flag => process.argv.includes(String(flag)));
        }

        if ('platform' in value) {
            const current = hostPlatformNames();
            return asArrayValue(value.platform).some(platform => current.includes(String(platform).toLowerCase()));
        }

        if ('env' in value) {
            if (typeof value.env === 'string') {
                return Boolean(process.env[value.env]);
            }
            if (value.env && typeof value.env === 'object') {
                return Object.entries(value.env).every(([key, expected]) => {
                    const actual = process.env[key];
                    if (expected === true) return actual !== undefined && actual !== '';
                    if (expected === false) return actual === undefined || actual === '';
                    return actual === String(expected);
                });
            }
            return false;
        }

        if ('file' in value) {
            return asArrayValue(value.file).every(file => fs.existsSync(String(file)));
        }
    }

    throw new KnownError(`Unsupported workflow condition: ${JSON.stringify(condition)}`);
}

function copyPath(source: string, destination: string) {
    if (!fs.existsSync(source)) {
        throw new KnownError(`Copy source not found: ${source}`);
    }

    if (fs.statSync(source).isDirectory()) {
        fs.mkdirSync(destination, {recursive: true});
        fs.cpSync(source, destination, {recursive: true});
        return;
    }

    const isDestinationDir = fs.existsSync(destination) && fs.statSync(destination).isDirectory();
    const targetPath = isDestinationDir ? path.join(destination, path.basename(source)) : destination;
    fs.mkdirSync(path.dirname(targetPath), {recursive: true});
    fs.copyFileSync(source, targetPath);
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

const workflowActions = new Set(['run', 'delete', 'copy', 'yaml', 'plist', 'props', 'replace', 'generate']);

export function useScripts(config: FluttergenConfig, section: 'prescripts' | 'postscripts') {
    return {
        // noinspection JSUnusedGlobalSymbols
        execute: async () => {
            const scripts = config[section];
            if (!scripts || scripts.length === 0)
                return;

            const workflows = config.workflows ?? {};
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
                    tasks.push(task);
                    continue;
                }

                throw new KnownError(
                    `Scripts must be strings, built-in task names, workflow steps, or group definitions. Invalid entry: ${JSON.stringify(task)}`
                );
            }

            const predefinedFns = getFunctions();
            const functionPaths = collectFunctionPaths(predefinedFns);
            const builtInPaths = new Set(functionPaths);
            const env = loadEnvironment(config.profile);
            const workflowStack: string[] = [];
            console.log(`- Running tasks from '${section}' section`);

            async function runWorkflow(workflowName: string) {
                const steps = workflows[workflowName];
                if (!Array.isArray(steps)) {
                    throw new KnownError(`Workflow '${workflowName}' is not defined.`);
                }
                if (workflowStack.includes(workflowName)) {
                    throw new KnownError(`Circular workflow reference: ${[...workflowStack, workflowName].join(' -> ')}`);
                }

                console.log(`- Running workflow '${workflowName}'`);
                workflowStack.push(workflowName);
                try {
                    await runTasks(steps as Task[]);
                } finally {
                    workflowStack.pop();
                }
            }

            async function runWorkflowAction(action: string, value: any) {
                switch (action) {
                    case 'run': {
                        for (const command of asArrayValue(value)) {
                            if (typeof command === 'string') {
                                execCommand(command);
                            } else if (command && typeof command === 'object' && typeof command.command === 'string') {
                                execCommand(command.command, {cwd: command.cwd});
                            } else {
                                throw new KnownError(`Invalid 'run' step: ${JSON.stringify(command)}`);
                            }
                        }
                        return;
                    }

                    case 'delete': {
                        for (const target of asArrayValue(value)) {
                            if (typeof target !== 'string' || !target.trim()) {
                                throw new KnownError(`Invalid 'delete' step: ${JSON.stringify(target)}`);
                            }
                            const resolved = path.resolve(target);
                            if (resolved === path.parse(resolved).root || resolved === path.resolve('.')) {
                                throw new KnownError(`Refusing to delete '${target}'.`);
                            }
                            console.log(`- Deleting ${target}`);
                            fs.rmSync(resolved, {recursive: true, force: true});
                        }
                        return;
                    }

                    case 'copy': {
                        const isSinglePair = Array.isArray(value)
                            && value.length === 2
                            && value.every(item => typeof item === 'string');
                        const items = isSinglePair ? [value] : asArrayValue(value);

                        for (const item of items) {
                            let source: string | undefined;
                            let destination: string | undefined;

                            if (Array.isArray(item)) {
                                [source, destination] = item;
                            } else if (item && typeof item === 'object') {
                                source = item.from;
                                destination = item.to;
                            }

                            if (!source || !destination) {
                                throw new KnownError(`Invalid 'copy' step: ${JSON.stringify(item)}`);
                            }
                            console.log(`- Copying ${source} -> ${destination}`);
                            copyPath(source, destination);
                        }
                        return;
                    }

                    case 'yaml': {
                        if (!value || typeof value !== 'object' || !value.file || !value.key) {
                            throw new KnownError(`Invalid 'yaml' step: ${JSON.stringify(value)}`);
                        }
                        if ('add' in value) {
                            for (const item of asArrayValue(value.add)) {
                                useYamlFile(value.file).addToList(value.key, String(item));
                            }
                        } else if ('value' in value) {
                            useYamlFile(value.file).set(value.key, value.value);
                        } else {
                            throw new KnownError(`'yaml' step requires 'value' or 'add': ${JSON.stringify(value)}`);
                        }
                        return;
                    }

                    case 'plist': {
                        if (!value || typeof value !== 'object' || !value.file || !value.key || !value.type) {
                            throw new KnownError(`Invalid 'plist' step: ${JSON.stringify(value)}`);
                        }
                        if ('add' in value) {
                            for (const item of asArrayValue(value.add)) {
                                usePlist(value.file).addToList(value.key, value.type, String(item));
                            }
                        } else if (value.insert) {
                            usePlist(value.file).insert(value.key, value.type, value.value);
                        } else {
                            usePlist(value.file).set(value.key, value.type, value.value);
                        }
                        return;
                    }

                    case 'props': {
                        if (!value || typeof value !== 'object' || !value.file || !value.key || !('value' in value)) {
                            throw new KnownError(`Invalid 'props' step: ${JSON.stringify(value)}`);
                        }
                        usePropertiesFile(value.file).set(value.key, String(value.value));
                        return;
                    }

                    case 'replace': {
                        if (!value || typeof value !== 'object' || !value.file || value.from === undefined || value.to === undefined) {
                            throw new KnownError(`Invalid 'replace' step: ${JSON.stringify(value)}`);
                        }
                        const regexLiteral = parseRegexLiteral(String(value.from));
                        let search: string | RegExp = value.flags
                            ? new RegExp(String(value.from), String(value.flags))
                            : String(value.from);
                        if (regexLiteral) {
                            search = regexLiteral;
                        }
                        replaceInFile(value.file, search, String(value.to));
                        return;
                    }

                    case 'generate': {
                        if (value === false) return;
                        await useImageGenerator(config).execute();
                        const includeInfo = !(value && typeof value === 'object' && value.info === false);
                        if (config.info && includeInfo) {
                            useInfoHandler(config.info).execute();
                        }
                        return;
                    }

                    default:
                        throw new KnownError(`Unsupported workflow step '${action}'.`);
                }
            }

            async function runTasks(tasksToRun: Task[]) {
                for (const task of tasksToRun) {
                    const params = config.variables;
                    const vars = config.variables;
                    const variables = config.variables;
                    const argv = process.argv;

                    async function runGroup(groupName: string) {
                        const groupTasks = groupedTasks[groupName];
                        if (!groupTasks) {
                            throw new KnownError(`Task group '${groupName}' is not defined.`);
                        }
                        await runTasks(groupTasks);
                    }

                    if (typeof task === 'object' && task !== null) {
                        if ('when' in task && !evaluateCondition((task as any).when)) {
                            console.log(`- Skipping step (condition not met): ${JSON.stringify(task)}`);
                            continue;
                        }

                        const entries = Object.entries(task).filter(([key]) => key !== 'when');
                        if (entries.length !== 1) {
                            throw new KnownError(`Workflow steps must have exactly one action key: ${JSON.stringify(task)}`);
                        }

                        const [action, value] = entries[0];

                        if (action === 'use') {
                            for (const workflowName of asArrayValue(value)) {
                                await runWorkflow(String(workflowName));
                            }
                            continue;
                        }

                        if (workflowActions.has(action)) {
                            console.log(`- Executing step: ${action}`);
                            await runWorkflowAction(action, value);
                            continue;
                        }

                        if (builtInPaths.has(action)) {
                            console.log(`- Executing built-in task: ${action}`);
                            await callFunctionPath(predefinedFns, action, value);
                            continue;
                        }

                        throw new KnownError(`Unknown workflow step '${action}'.`);
                    }

                    let expression = task.trim();
                    if (!expression) {
                        throw new KnownError(`Invalid task format: ${JSON.stringify(task)}`);
                    }

                    // Bare built-in names (e.g. `flutter.clean` or `versionUp`) run without eval.
                    if (builtInPaths.has(expression)) {
                        console.log(`- Executing built-in task: ${expression}`);
                        await callFunctionPath(predefinedFns, expression);
                        continue;
                    }

                    // Bare workflow names (e.g. `clean`) run the matching workflow.
                    if (Object.prototype.hasOwnProperty.call(workflows, expression)) {
                        await runWorkflow(expression);
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
                    await eval(expression);
                }
            }

            await runTasks(tasks)
        }
    }
}