import fs from "fs";
import path from "path";
import plist from "plist";
import {AndroidSigningConfig, FluttergenConfig, IosSigningConfig} from "./yamlParser.ts";
import {KnownError} from "./knownError.ts";
import {usePropertiesFile} from "fileHandler/usePropertiesFile.ts";
import {usePbxproj} from "fileHandler/usePbxproj.ts";

const GRADLE_MARKER = '// fluttergen: signing';

const signingGradle = `${GRADLE_MARKER}
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile keystoreProperties['storeFile'] ? file(keystoreProperties['storeFile']) : null
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`;

function writeIfChanged(filePath: string, content: string) {
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8') === content) {
        return false;
    }
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, content);
    return true;
}

function applyAndroidSigning(signing: AndroidSigningConfig) {
    if (!fs.existsSync('android/app')) {
        console.log('- Android project not found, skipping signing setup.');
        return;
    }

    const storeFile = signing.storeFile ?? signing.keystore;
    const properties: Array<[string, string | undefined]> = [
        ['storeFile', storeFile],
        ['storePassword', signing.storePassword],
        ['keyAlias', signing.keyAlias],
        ['keyPassword', signing.keyPassword],
    ];

    let wroteProperties = false;
    for (const [key, value] of properties) {
        if (value !== undefined && value !== '') {
            usePropertiesFile('android/key.properties').set(key, value);
            wroteProperties = true;
        }
    }
    if (wroteProperties) {
        console.log('- Android signing credentials written to key.properties.');
    }

    if (writeIfChanged(path.join('android', 'signing.gradle'), signingGradle)) {
        console.log('- Android signing.gradle written.');
    }

    const ktsPath = path.join('android', 'app', 'build.gradle.kts');
    const groovyPath = path.join('android', 'app', 'build.gradle');
    const buildFile = fs.existsSync(ktsPath) ? ktsPath : fs.existsSync(groovyPath) ? groovyPath : undefined;

    if (!buildFile) {
        console.warn('- Could not find android/app/build.gradle(.kts), signing config was not applied.');
        return;
    }

    const content = fs.readFileSync(buildFile, 'utf-8');
    if (content.includes('signing.gradle')) {
        return;
    }

    const applyLine = buildFile.endsWith('.kts')
        ? `apply(from = "signing.gradle")`
        : `apply from: "signing.gradle"`;
    const separator = content.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(buildFile, `${content}${separator}\n${GRADLE_MARKER}\n${applyLine}\n`);
    console.log(`- Android signing config applied in ${buildFile}.`);
}

function applyIosSigning(signing: IosSigningConfig) {
    const pbxprojPath = './ios/Runner.xcodeproj/project.pbxproj';
    const hasProject = fs.existsSync(pbxprojPath);

    if (signing.team) {
        if (!hasProject) {
            console.warn('- iOS project not found, skipping development team update.');
        } else {
            const content = fs.readFileSync(pbxprojPath, 'utf-8');
            const updated = content.replace(/(DEVELOPMENT_TEAM = )[^;]+;/g, `$1${signing.team};`);
            if (updated !== content) {
                fs.writeFileSync(pbxprojPath, updated);
                console.log(`- iOS Development Team updated to ${signing.team}.`);
            } else if (!content.includes(`DEVELOPMENT_TEAM = ${signing.team};`)) {
                console.warn('- No DEVELOPMENT_TEAM setting found in project.pbxproj.');
            }
        }
    }

    const entitlements = signing.entitlements;
    if (!entitlements || Object.keys(entitlements).length === 0) {
        return;
    }

    if (!fs.existsSync('ios/Runner')) {
        console.warn('- iOS Runner directory not found, skipping entitlements.');
        return;
    }

    const fileName = path.basename(signing.entitlementsFile ?? 'Runner.entitlements');
    if (!fileName.endsWith('.entitlements')) {
        throw new KnownError(`Entitlements file must end with .entitlements: ${fileName}`);
    }

    const filePath = path.join('ios', 'Runner', fileName);
    let values = entitlements;
    if (fs.existsSync(filePath)) {
        try {
            const existing = plist.parse(fs.readFileSync(filePath, 'utf-8'));
            if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
                values = {...existing, ...entitlements};
            }
        } catch {
            // Replace unparsable entitlements instead of failing the whole run.
        }
    }
    fs.writeFileSync(filePath, plist.build(values));
    console.log(`- iOS entitlements written to ${filePath}.`);

    if (!hasProject) {
        console.warn('- iOS project not found, entitlements were not added to project.pbxproj.');
        return;
    }

    usePbxproj(pbxprojPath).addEntitlements(fileName, 'Runner', true);
    console.log(`- iOS entitlements ${fileName} added to project.pbxproj.`);
}

export function useSigning(config: FluttergenConfig) {
    return {
        execute: (options: { platform?: 'ios' | 'android' | 'all' } = {}) => {
            if (!config.signing) return;
            const platform = options.platform ?? 'all';
            if (config.signing.android && platform !== 'ios') {
                applyAndroidSigning(config.signing.android);
            }
            if (config.signing.ios && platform !== 'android') {
                applyIosSigning(config.signing.ios);
            }
        },
    }
}
