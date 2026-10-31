import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import sharp from 'sharp';
import {cleanupTempDirs, inTempDir, writeFixture} from './helpers.ts';
import {collectDoctorReport, printDoctorReport} from '../src/useDoctor.ts';

afterEach(cleanupTempDirs);

async function writeImages() {
    fs.mkdirSync('assets', {recursive: true});
    await sharp({create: {width: 64, height: 64, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 1}}})
        .png().toFile('assets/icon.png');
    await sharp({create: {width: 64, height: 64, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 1}}})
        .png().toFile('assets/splash.png');
}

const config = `fluttergen:
  icon:
    path: assets/icon.png
    bgColor: '#018290'
  splash:
    path: assets/splash.png
    bgColor: '#00636E'
`;

describe('collectDoctorReport', () => {
    test('reports a missing pubspec', async () => {
        await inTempDir(async () => {
            const report = await collectDoctorReport({skipCommands: true});
            expect(report.errors).toBe(1);
            expect(report.checks.find(check => check.name === 'pubspec.yaml')?.status).toBe('error');
        });
    });

    test('validates the config and asset files', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', config);
            await writeImages();

            const report = await collectDoctorReport({skipCommands: true});
            expect(report.errors).toBe(0);
            expect(report.checks.find(check => check.name === 'pubspec.yaml')?.status).toBe('ok');
            expect(report.checks.find(check => check.name === 'icon.light')?.status).toBe('warn');
            expect(report.checks.find(check => check.name === 'splash.light')?.status).toBe('ok');
            expect(report.checks.find(check => check.name === 'platforms')?.status).toBe('warn');
        });
    });

    test('reports invalid configurations', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', 'fluttergen:\n  icon:\n    path: icon.png\n');

            const report = await collectDoctorReport({skipCommands: true});
            expect(report.errors).toBe(1);
            expect(report.checks.find(check => check.name === 'fluttergen config')?.status).toBe('error');
        });
    });

    test('warns about missing signing files', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', config + `  signing:
    android:
      storePassword: test
`);
            await writeImages();

            const report = await collectDoctorReport({skipCommands: true});
            expect(report.checks.find(check => check.name === 'android signing')?.status).toBe('warn');
        });
    });

    test('prints a summary', async () => {
        await inTempDir(async () => {
            writeFixture('pubspec.yaml', config);
            await writeImages();
            const report = await collectDoctorReport({skipCommands: true});

            printDoctorReport(report);
            expect(report.checks.length).toBeGreaterThan(0);
        });
    });
});
