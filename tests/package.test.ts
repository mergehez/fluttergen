import {describe, expect, test} from 'bun:test';
import fs from 'fs';
import path from 'path';
import {builtinModules} from 'module';
import {spawnSync} from 'child_process';

const root = path.resolve(import.meta.dir, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const distPath = path.join(root, packageJson.bin.fluttergen);
const hasDist = fs.existsSync(distPath);
const bundleTest = hasDist ? test : test.skip;

describe('packaging', () => {
    test('package metadata points at the built entrypoint', () => {
        expect(packageJson.bin.fluttergen).toBe('dist/index.cjs');
        expect(packageJson.files).toContain('dist');
        expect(packageJson.engines?.node).toBeDefined();
    });

    bundleTest('bundle has a shebang and only declared runtime dependencies', () => {
        const content = fs.readFileSync(distPath, 'utf-8');
        expect(content.startsWith('#!/usr/bin/env node')).toBe(true);

        const requires = [...content.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]);
        const external = [...new Set(requires)]
            .filter(name => !name.startsWith('node:') && !builtinModules.includes(name));

        for (const name of external) {
            const packageName = name.startsWith('@')
                ? name.split('/').slice(0, 2).join('/')
                : name.split('/')[0];
            expect(
                packageJson.dependencies[packageName],
                `'${packageName}' is required by the bundle but missing from dependencies`
            ).toBeDefined();
        }
    });

    bundleTest('bundle runs the version command', () => {
        const result = spawnSync(process.execPath, [distPath, '--version'], {
            encoding: 'utf-8',
            env: {...process.env, FLUTTERGEN_NO_UPDATE_CHECK: '1'},
        });

        expect(result.status).toBe(0);
        expect(result.stdout).toContain(packageJson.version);
    });

    bundleTest('npm pack includes the CLI entrypoint', () => {
        if (spawnSync('npm', ['--version'], {encoding: 'utf-8'}).status !== 0) {
            return; // npm is not available; the bundle checks above still ran
        }

        const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
            cwd: root,
            encoding: 'utf-8',
        });
        expect(result.status).toBe(0);

        const jsonStart = result.stdout.indexOf('[');
        expect(jsonStart).toBeGreaterThanOrEqual(0);
        const data = JSON.parse(result.stdout.slice(jsonStart));
        const files = data[0].files.map((file: any) => file.path);

        expect(files).toContain('dist/index.cjs');
        expect(files).toContain('package.json');
        expect(files.some((file: string) => file.startsWith('src/'))).toBe(false);
    });
});
