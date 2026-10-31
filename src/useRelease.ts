import fs from "fs";
import {execSync} from "child_process";
import {FluttergenConfig, ReleaseConfig} from "./yamlParser.ts";
import {KnownError} from "./knownError.ts";
import {useYamlFile} from "fileHandler/useYamlFile.ts";
import {useBuildGradle} from "fileHandler/useBuildGradle.ts";
import {usePlist} from "fileHandler/usePlist.ts";
import {runBuiltInTask} from "./useScripts.ts";

export type ReleaseOptions = {
    bump?: ReleaseConfig['bump'];
    syncBuildNumber?: boolean;
    tag?: boolean;
    push?: boolean;
    build?: string[];
    dryRun?: boolean;
}

export type VersionInfo = {
    major: number;
    minor: number;
    patch: number;
    build?: number;
}

export type ReleaseResult = {
    previousVersion: string;
    version: string;
    versionName: string;
    build?: number;
    dryRun: boolean;
}

export function parseVersionString(version: string): VersionInfo {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?$/.exec(version.trim());
    if (!match) {
        throw new KnownError(`Invalid version format in pubspec.yaml: ${version}`);
    }
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        build: match[4] !== undefined ? parseInt(match[4], 10) : undefined,
    };
}

export function bumpVersion(version: string, bump: ReleaseConfig['bump'], syncBuildNumber: boolean): {
    version: string;
    versionName: string;
    build?: number;
} {
    const current = parseVersionString(version);
    let {major, minor, patch} = current;

    if (bump === 'major') {
        major += 1;
        minor = 0;
        patch = 0;
    } else if (bump === 'minor') {
        minor += 1;
        patch = 0;
    } else if (bump === 'patch') {
        patch += 1;
    }

    const build = syncBuildNumber
        ? (current.build !== undefined ? current.build + 1 : 1)
        : current.build;
    const versionName = `${major}.${minor}.${patch}`;
    const nextVersion = build !== undefined ? `${versionName}+${build}` : versionName;

    return {version: nextVersion, versionName, build};
}

function quoteShell(value: string): string {
    return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function writeChangelog(version: string, changelog: string | boolean) {
    const entry = typeof changelog === 'string' ? changelog : `Release ${version}`;
    const date = new Date().toISOString().slice(0, 10);
    const section = `## ${version} (${date})\n\n- ${entry}\n`;

    if (!fs.existsSync('CHANGELOG.md')) {
        fs.writeFileSync('CHANGELOG.md', `# Changelog\n\n${section}\n`);
        console.log('- CHANGELOG.md created.');
        return;
    }

    const content = fs.readFileSync('CHANGELOG.md', 'utf-8');
    if (content.startsWith('# ')) {
        const firstNewline = content.indexOf('\n');
        const header = firstNewline === -1 ? content : content.slice(0, firstNewline + 1);
        const rest = firstNewline === -1 ? '' : content.slice(firstNewline + 1).replace(/^\n+/, '');
        fs.writeFileSync('CHANGELOG.md', `${header}\n${section}\n${rest}`);
    } else {
        fs.writeFileSync('CHANGELOG.md', `${section}\n${content}`);
    }
    console.log(`- CHANGELOG.md updated for ${version}.`);
}

function createTag(template: string, version: string, versionName: string, build: number | undefined, push: boolean) {
    const tagName = template
        .replaceAll('{version}', version)
        .replaceAll('{versionName}', versionName)
        .replaceAll('{build}', build !== undefined ? String(build) : '');

    try {
        const insideRepo = execSync('git rev-parse --is-inside-work-tree', {encoding: 'utf-8'})
            .trim() === 'true';
        if (!insideRepo) {
            console.warn('- Not a git repository, skipping tag creation.');
            return;
        }
    } catch {
        console.warn('- Not a git repository, skipping tag creation.');
        return;
    }

    try {
        execSync(`git rev-parse -q --verify refs/tags/${quoteShell(tagName)}`, {stdio: 'ignore'});
        console.log(`- Tag ${tagName} already exists, skipping.`);
        return;
    } catch {
        // Tag does not exist yet.
    }

    execSync(`git tag ${quoteShell(tagName)}`, {stdio: 'inherit'});
    console.log(`- Git tag ${tagName} created.`);

    if (push) {
        execSync(`git push origin ${quoteShell(tagName)}`, {stdio: 'inherit'});
        console.log(`- Git tag ${tagName} pushed.`);
    }
}

function syncAndroid(versionName: string, build: number | undefined) {
    if (!fs.existsSync('./android/app/build.gradle.kts') && !fs.existsSync('./android/app/build.gradle')) {
        return;
    }
    const gradle = useBuildGradle('android/app');
    gradle.update('versionName', versionName, 'string');
    if (build !== undefined) {
        gradle.update('versionCode', build, 'int');
    }
    console.log(`- Android version synced to ${versionName} (${build ?? 'unchanged'}).`);
}

function syncIos(versionName: string, build: number | undefined) {
    if (!fs.existsSync('./ios/Runner/Info.plist')) {
        return;
    }
    const plist = usePlist('./ios/Runner/Info.plist');
    plist.set('CFBundleShortVersionString', 'string', versionName);
    if (build !== undefined) {
        plist.set('CFBundleVersion', 'string', String(build));
    }
    console.log(`- iOS version synced to ${versionName} (${build ?? 'unchanged'}).`);
}

export function runRelease(config: FluttergenConfig, options: ReleaseOptions = {}): ReleaseResult {
    const release = config.release ?? {};
    const previousVersion = useYamlFile('./pubspec.yaml').get('version');
    if (!previousVersion) {
        throw new KnownError('No version found in pubspec.yaml.');
    }

    const bump = options.bump ?? release.bump ?? 'patch';
    const syncBuildNumber = options.syncBuildNumber ?? release.syncBuildNumber ?? true;
    const next = bumpVersion(previousVersion, bump, syncBuildNumber);
    const dryRun = Boolean(options.dryRun);

    console.log(`- Release: ${previousVersion} -> ${next.version} (bump: ${bump === false ? 'none' : bump})`);
    if (next.build !== undefined) {
        console.log(`- Build number: ${next.build}`);
    }
    if (dryRun) {
        console.log('- Dry run: no files will be changed, no tags or builds will run.');
        return {
            previousVersion,
            version: next.version,
            versionName: next.versionName,
            build: next.build,
            dryRun,
        };
    }

    useYamlFile('./pubspec.yaml').set('version', next.version);
    syncAndroid(next.versionName, next.build);
    syncIos(next.versionName, next.build);

    if (release.changelog) {
        writeChangelog(next.version, release.changelog);
    }

    const tagOption = options.tag === undefined ? release.tag : options.tag;
    if (tagOption) {
        const template = typeof tagOption === 'string' ? tagOption : 'v{version}';
        createTag(template, next.version, next.versionName, next.build, Boolean(options.push));
    }

    const buildTargets = options.build
        ?? (Array.isArray(release.build) ? release.build : release.build ? [release.build] : []);
    for (const target of buildTargets) {
        const normalized = target.toLowerCase().replaceAll('-', '');
        if (normalized === 'apk') {
            runBuiltInTask('build.apk', {mode: 'release'});
        } else if (normalized === 'appbundle' || normalized === 'bundle' || normalized === 'aab') {
            runBuiltInTask('build.appBundle', {mode: 'release'});
        } else if (normalized === 'ipa' || normalized === 'ios') {
            runBuiltInTask('build.ipa', {mode: 'release'});
        } else {
            throw new KnownError(`Unknown release build target '${target}'. Use apk, appbundle or ipa.`);
        }
    }

    console.log(`- Released ${next.version}.`);
    return {
        previousVersion,
        version: next.version,
        versionName: next.versionName,
        build: next.build,
        dryRun,
    };
}
