import fs from "fs";
import path from "path";
import {createTwoFilesPatch} from "diff";
import {KnownError} from "./knownError.ts";

const WATCHED_ROOTS = ['ios', 'android', 'assets', 'pubspec.yaml'];
const EXCLUDED_DIRS = new Set([
    '.git', '.gradle', '.dart_tool', '.symlinks', 'build', 'Pods', 'DerivedData',
    'node_modules', 'ephemeral', '.fluttergen',
]);
const BACKUP_DIR = path.join('.fluttergen', 'backup');
const BACKUP_MANIFEST = path.join('.fluttergen', 'backup-manifest.json');

type SnapshotEntry = { data: Buffer };
export type FileSnapshot = Map<string, SnapshotEntry>;

function walkDirectory(root: string, snapshot: FileSnapshot) {
    const entries = fs.readdirSync(root, {withFileTypes: true});
    for (const entry of entries) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        const fullPath = path.join(root, entry.name);

        if (entry.isSymbolicLink()) continue;

        if (entry.isDirectory()) {
            walkDirectory(fullPath, snapshot);
        } else if (entry.isFile()) {
            try {
                snapshot.set(fullPath, {data: fs.readFileSync(fullPath)});
            } catch {
                // Ignore unreadable files.
            }
        }
    }
}

export function takeSnapshot(): FileSnapshot {
    const snapshot: FileSnapshot = new Map();

    for (const root of WATCHED_ROOTS) {
        if (!fs.existsSync(root)) continue;
        const stat = fs.statSync(root);
        if (stat.isFile()) {
            snapshot.set(root, {data: fs.readFileSync(root)});
        } else if (stat.isDirectory()) {
            walkDirectory(root, snapshot);
        }
    }

    return snapshot;
}

function removeEmptyDirectories(root: string, removeRoot = false) {
    if (!fs.existsSync(root)) return;
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) return;

    for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
        if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
            removeEmptyDirectories(path.join(root, entry.name), true);
        }
    }

    if (removeRoot && fs.readdirSync(root).length === 0) {
        fs.rmdirSync(root);
    }
}

export function restoreSnapshot(snapshot: FileSnapshot) {
    const current = takeSnapshot();
    for (const file of current.keys()) {
        if (!snapshot.has(file)) {
            fs.rmSync(file, {force: true});
        }
    }

    for (const [file, entry] of snapshot) {
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, entry.data);
    }

    for (const root of WATCHED_ROOTS) {
        removeEmptyDirectories(root);
    }
}

function isText(data: Buffer): boolean {
    const sample = data.subarray(0, 8000);
    return !sample.includes(0);
}

const SENSITIVE_FILE = /(^|\/)(key\.properties|\.env(\..+)?)$/;

export function diffSnapshots(before: FileSnapshot, after: FileSnapshot): string {
    const files = [...new Set([...before.keys(), ...after.keys()])].sort();
    let output = '';

    for (const file of files) {
        const oldEntry = before.get(file);
        const newEntry = after.get(file);

        if (oldEntry && newEntry && oldEntry.data.equals(newEntry.data)) continue;

        if (SENSITIVE_FILE.test(file)) {
            output += `Sensitive file changed: ${file}\n`;
            continue;
        }

        if (oldEntry && newEntry) {
            if (isText(oldEntry.data) && isText(newEntry.data)) {
                output += createTwoFilesPatch(
                    `a/${file}`, `b/${file}`,
                    oldEntry.data.toString('utf-8'), newEntry.data.toString('utf-8'),
                    '', '', {context: 3}
                );
            } else {
                output += `Binary file changed: ${file}\n`;
            }
        } else if (!oldEntry && newEntry) {
            if (isText(newEntry.data)) {
                output += createTwoFilesPatch(
                    '/dev/null', `b/${file}`, '', newEntry.data.toString('utf-8'),
                    '', '', {context: 3}
                );
            } else {
                output += `Binary file added: ${file}\n`;
            }
        } else if (oldEntry && !newEntry) {
            if (isText(oldEntry.data)) {
                output += createTwoFilesPatch(
                    `a/${file}`, '/dev/null', oldEntry.data.toString('utf-8'), '',
                    '', '', {context: 3}
                );
            } else {
                output += `Binary file removed: ${file}\n`;
            }
        }
    }

    return output;
}

export function writeBackup(snapshot: FileSnapshot) {
    fs.rmSync(BACKUP_DIR, {recursive: true, force: true});
    fs.mkdirSync(BACKUP_DIR, {recursive: true});

    const files: string[] = [];
    for (const [file, entry] of snapshot) {
        const destination = path.join(BACKUP_DIR, file);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.writeFileSync(destination, entry.data);
        files.push(file);
    }

    fs.mkdirSync(path.dirname(BACKUP_MANIFEST), {recursive: true});
    fs.writeFileSync(BACKUP_MANIFEST, JSON.stringify({files}, null, 2));
    console.log(`- Backup created in ${BACKUP_DIR} (${files.length} files).`);
}

export function restoreBackup() {
    if (!fs.existsSync(BACKUP_MANIFEST)) {
        throw new KnownError(`No backup found at ${BACKUP_MANIFEST}. Run with --backup first.`);
    }

    const manifest = JSON.parse(fs.readFileSync(BACKUP_MANIFEST, 'utf-8')) as { files: string[] };
    const restored = new Set(manifest.files);

    const current = takeSnapshot();
    for (const file of current.keys()) {
        if (!restored.has(file)) {
            fs.rmSync(file, {force: true});
        }
    }

    for (const file of manifest.files) {
        const source = path.join(BACKUP_DIR, file);
        if (!fs.existsSync(source)) continue;
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.copyFileSync(source, file);
    }

    for (const root of WATCHED_ROOTS) {
        removeEmptyDirectories(root);
    }

    console.log(`- Restored ${manifest.files.length} files from ${BACKUP_DIR}.`);
}
