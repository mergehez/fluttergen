# FlutterGen

[![NPM Version](https://img.shields.io/npm/v/fluttergen)](https://www.npmjs.com/package/fluttergen)
![NPM Downloads](https://img.shields.io/npm/d18m/fluttergen)

Flutter helper CLI tools for automating app configuration tasks including renaming, icon generation, and splash screen setup.

You'll need to have [Node.js](https://nodejs.org/) or [Bun](https://bun.sh/) installed to use this tool.

## Installation

```bash
bun add -g fluttergen
# or
npm install -g fluttergen
```

## Usage

Add a `fluttergen` configuration section to your Flutter project's `pubspec.yaml` file, then run:

```bash
bunx fluttergen
# or
npx fluttergen
```

The tool will automatically:

- Rename your app (iOS and Android)
- Generate app icons for iOS and Android (including dark mode variants)
- Generate Android notification icons
- Generate splash screens for iOS and Android (including dark mode variants)

## Configuration

Add the `fluttergen` section to your Flutter project's `pubspec.yaml`. Here's an example with all possible options:

```yaml
fluttergen:
  rename:
    appName: My Awesome App
    bundleIdentifier: com.my_company.my_app
    applicationId: com.my_company.my_app
  icon:
    androidName: app_icon
    iosName: AppIcon
    path: assets/icon.png
    pathDark: assets/icon_dark.png
    pathAndroidNotification: assets/notification_icon.png
    bgColor: '#018290'
    bgColorDark: '#00636E'
    borderRadius: 0.2
  splash:
    androidName: app_splash
    iosName: AppSplash
    path: assets/splash.png
    pathDark: assets/splash_dark.png
    bgColor: '#00636E'
    bgColorDark: '#001F24'
    borderRadius: 0.1
```

## Configuration Options

### `rename` (optional)

Renames your Flutter app for both iOS and Android platforms.

| Option             | Required | Description                                            |
|--------------------|----------|--------------------------------------------------------|
| `appName`          | ✓        | Display name of your app                               |
| `bundleIdentifier` | ✓        | iOS bundle identifier (e.g., `com.my_company.my_app`)  |
| `applicationId`    | ✓        | Android application ID (e.g., `com.my_company.my_app`) |

### `icon` (required)

Generates app icons for iOS and Android platforms.

| Option                    | Required | Description                                                                                                         |
|---------------------------|----------|---------------------------------------------------------------------------------------------------------------------|
| `path`                    | ✓        | Path to icon image file                                                                                             |
| `bgColor`                 | ✓        | Background color in hex format (e.g., `#018290`)                                                                    |
| `androidName`             |          | Android icon resource name  (Default: `ic_launcher`)                                                                |
| `iosName`                 |          | iOS icon asset name (Default: `AppIcon`)                                                                            |
| `pathDark`                |          | Path to dark mode icon image (Fallback: `path`)                                                                     |
| `pathAndroidNotification` |          | Path to Android notification icon. (Fallback: `path`)  To disable notification icon generation set this to `false`. |
| `bgColorDark`             |          | Dark mode background color in hex format. (Fallback: `bgColor`)                                                     |
| `borderRadius`            |          | Corner radius from 0.0 to 1.0 (0 = square, 1 = circle)                                                              |

### `splash` (required)

Generates splash screens for iOS and Android platforms.

| Option         | Required | Description                                                    |
|----------------|----------|----------------------------------------------------------------|
| `path`         | ✓        | Path to splash image file                                      |
| `bgColor`      | ✓        | Background color in hex format (e.g., `#00636E`)               |
| `androidName`  |          | Android splash resource name (Default: `splash_screen`)        |
| `iosName`      |          | iOS splash asset name (Default: `LaunchImage`)                 |
| `pathDark`     |          | Path to dark mode splash image (Fallback: `path`)              |
| `bgColorDark`  |          | Dark mode background color in hex format (Fallback: `bgColor`) |
| `borderRadius` |          | Corner radius from 0.0 to 1.0                                  |

## Contributing

Feel free to contribute to the project by creating issues or pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
Feel free to use, modify, and distribute this code as per the terms of the license.

