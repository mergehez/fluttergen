import {afterEach, describe, expect, test} from 'bun:test';
import fs from 'fs';
import {cleanupTempDirs, inTempDir, plistFixture, writeFixture} from './helpers.ts';
import {usePermissions} from '../src/usePermissions.ts';
import {usePlist} from '../src/fileHandler/usePlist.ts';

afterEach(cleanupTempDirs);

const manifest = `<manifest
        xmlns:android="http://schemas.android.com/apk/res/android">
    <application
            android:name="\${applicationName}">
    </application>
</manifest>
`;

function permissionsConfig(permissions: any) {
    return {permissions, variables: {}, workflows: {}, prescripts: [], postscripts: []} as any;
}

describe('usePermissions', () => {
    test('adds Android permissions without duplicates', async () => {
        await inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
            const config = permissionsConfig({android: ['CAMERA', 'android.permission.INTERNET']});

            usePermissions(config).execute();
            usePermissions(config).execute();

            const content = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8');
            expect(content).toContain('<uses-permission android:name="android.permission.CAMERA"/>');
            expect(content).toContain('<uses-permission android:name="android.permission.INTERNET"/>');
            expect(content.match(/android\.permission\.CAMERA/g)).toHaveLength(1);
            expect(content.indexOf('android.permission.CAMERA')).toBeLessThan(content.indexOf('<application'));
        });
    });

    test('writes iOS usage descriptions and supports raw keys', async () => {
        await inTempDir(() => {
            writeFixture('ios/Runner/Info.plist', plistFixture);
            const config = permissionsConfig({
                ios: {
                    camera: 'We need the camera for scanning.',
                    photoLibrary: true,
                    'NSFooUsageDescription': 'Raw key reason.',
                    siri: false,
                },
            });

            usePermissions(config).execute();

            const plist = usePlist('ios/Runner/Info.plist');
            expect(plist.getSimple('NSCameraUsageDescription')).toBe('We need the camera for scanning.');
            expect(plist.getSimple('NSPhotoLibraryUsageDescription')).toContain('photo library');
            expect(plist.getSimple('NSFooUsageDescription')).toBe('Raw key reason.');
            expect(() => plist.getSimple('NSSiriUsageDescription')).toThrow();
        });
    });

    test('rejects unknown iOS permission names', async () => {
        await inTempDir(() => {
            writeFixture('ios/Runner/Info.plist', plistFixture);

            expect(() => usePermissions(permissionsConfig({
                ios: {notARealPermission: true},
            })).execute()).toThrow(/Unknown iOS permission/);
        });
    });

    test('respects the platform filter and missing projects', async () => {
        await inTempDir(() => {
            writeFixture('android/app/src/main/AndroidManifest.xml', manifest);
            writeFixture('ios/Runner/Info.plist', plistFixture);

            usePermissions(permissionsConfig({
                android: ['CAMERA'],
                ios: {camera: 'Reason'},
            })).execute({platform: 'ios'});

            expect(fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8'))
                .not.toContain('android.permission.CAMERA');
            expect(usePlist('ios/Runner/Info.plist').getSimple('NSCameraUsageDescription')).toBe('Reason');
        });

        await inTempDir(() => {
            expect(() => usePermissions(permissionsConfig({
                android: ['CAMERA'],
                ios: {camera: 'Reason'},
            })).execute()).not.toThrow();
        });
    });
});
