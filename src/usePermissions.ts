import fs from "fs";
import {FluttergenConfig, PermissionsConfig} from "./yamlParser.ts";
import {KnownError} from "./knownError.ts";
import {useAndroidManifest} from "fileHandler/useAndroidManifest.ts";
import {usePlist} from "fileHandler/usePlist.ts";

const IOS_PERMISSIONS: Record<string, { key: string; description: string }> = {
    camera: {key: 'NSCameraUsageDescription', description: 'This app needs access to the camera.'},
    photoLibrary: {key: 'NSPhotoLibraryUsageDescription', description: 'This app needs access to your photo library.'},
    photoLibraryAdd: {key: 'NSPhotoLibraryAddUsageDescription', description: 'This app needs permission to save photos.'},
    microphone: {key: 'NSMicrophoneUsageDescription', description: 'This app needs access to the microphone.'},
    locationWhenInUse: {key: 'NSLocationWhenInUseUsageDescription', description: 'This app needs your location while in use.'},
    locationAlways: {key: 'NSLocationAlwaysAndWhenInUseUsageDescription', description: 'This app needs your location in the background.'},
    contacts: {key: 'NSContactsUsageDescription', description: 'This app needs access to your contacts.'},
    calendars: {key: 'NSCalendarsUsageDescription', description: 'This app needs access to your calendar.'},
    reminders: {key: 'NSRemindersUsageDescription', description: 'This app needs access to your reminders.'},
    bluetooth: {key: 'NSBluetoothAlwaysUsageDescription', description: 'This app needs access to Bluetooth.'},
    tracking: {key: 'NSUserTrackingUsageDescription', description: 'This app uses tracking to provide personalized content.'},
    faceID: {key: 'NSFaceIDUsageDescription', description: 'This app uses Face ID for authentication.'},
    motion: {key: 'NSMotionUsageDescription', description: 'This app needs access to motion data.'},
    healthShare: {key: 'NSHealthShareUsageDescription', description: 'This app reads health data.'},
    healthUpdate: {key: 'NSHealthUpdateUsageDescription', description: 'This app writes health data.'},
    siri: {key: 'NSSiriUsageDescription', description: 'This app integrates with Siri.'},
    speechRecognition: {key: 'NSSpeechRecognitionUsageDescription', description: 'This app uses speech recognition.'},
};

function applyAndroidPermissions(permissions: string[]) {
    if (!fs.existsSync('./android/app/src/main/AndroidManifest.xml')) {
        console.warn('- AndroidManifest.xml not found, skipping Android permissions.');
        return;
    }

    const manifest = useAndroidManifest();
    if (!manifest) return;

    let added = 0;
    for (const permission of permissions) {
        if (manifest.ensurePermission(permission)) {
            added++;
        }
    }
    console.log(`- Android permissions updated (${added} added).`);
}

function applyIosPermissions(permissions: PermissionsConfig['ios']) {
    if (!permissions) return;

    const plistPath = './ios/Runner/Info.plist';
    if (!fs.existsSync(plistPath)) {
        console.warn('- iOS Info.plist not found, skipping iOS permissions.');
        return;
    }

    const plist = usePlist(plistPath);
    let updated = 0;

    for (const [name, value] of Object.entries(permissions)) {
        if (value === false) continue;

        const known = IOS_PERMISSIONS[name];
        const key = known?.key ?? (name.startsWith('NS') ? name : undefined);
        if (!key) {
            throw new KnownError(
                `Unknown iOS permission '${name}'. Use a known name or a raw Info.plist key starting with 'NS'.`
            );
        }

        const description = typeof value === 'string'
            ? value
            : known?.description ?? 'This app needs this permission.';
        plist.set(key, 'string', description);
        updated++;
    }

    console.log(`- iOS usage descriptions updated (${updated} written).`);
}

export function usePermissions(config: FluttergenConfig) {
    return {
        execute: (options: { platform?: 'ios' | 'android' | 'all' } = {}) => {
            if (!config.permissions) return;
            const platform = options.platform ?? 'all';
            if (config.permissions.android?.length && platform !== 'ios') {
                applyAndroidPermissions(config.permissions.android);
            }
            if (config.permissions.ios && platform !== 'android') {
                applyIosPermissions(config.permissions.ios);
            }
        },
    }
}
