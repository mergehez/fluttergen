# FlutterGen

[![NPM Version](https://img.shields.io/npm/v/fluttergen)](https://www.npmjs.com/package/fluttergen)
![NPM Downloads](https://img.shields.io/npm/d18m/fluttergen)

Flutter helper CLI tools for automating app configuration tasks including renaming, icon generation, and splash screen setup.

The tool replaces well-known flutter tools like [rename](https://pub.dev/packages/rename), [flutter_launcher_icons](https://pub.dev/packages/flutter_launcher_icons) and [flutter_native_splash](https://pub.dev/packages/flutter_native_splash).

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
  info:
    appName: My Awesome App
    bundleIdentifier: com.my_company.my_app
    applicationId: com.my_company.my_app
    iosDevelopmentTeam: ABCDE12345
    iosMinVersion: '13.0'
    androidMinSdkVersion: 21
    kotlinVersion: '1.9.10'
    gradleVersion: '8.14'
  icon:
    name:
      android: my_icon
      ios: MyIcon
    path: assets/icon.png
    bgColor: '#018290'
    borderRadius: 0.2
    padding: 0.05
  notificationIcon:
    path: assets/notification_icon.png
    tintColor: '#FFFFFF'
    padding: 0.1
  splash:
    name:
      android: splash_screen
      ios: LaunchImage
    path:
      light: assets/splash.png
      dark: assets/splash_dark.png
    bgColor:
      light: '#00636E'
      dark: '#001F24'
    padding: 0.1
    borderRadius: 0.1
```

## Configuration Options

### `info` (optional)

Configures your Flutter app metadata for both iOS and Android platforms.

| Option                 | Required | Description                                            |
|------------------------|----------|--------------------------------------------------------|
| `appName`              | ✓        | Display name of your app                               |
| `bundleIdentifier`     | ✓        | iOS bundle identifier (e.g., `com.my_company.my_app`)  |
| `applicationId`        | ✓        | Android application ID (e.g., `com.my_company.my_app`) |
| `iosDevelopmentTeam`   |          | iOS development team ID (e.g., `ABCDE12345`)           |
| `iosMinVersion`        |          | iOS minimum deployment target (e.g., `'13.0'`)         |
| `androidMinSdkVersion` |          | Android minimum SDK version (e.g., `21`)               |
| `ndkVersion`           |          | Android NDK version                                    |
| `gradleVersion`        |          | Gradle version (e.g., `'8.14'`)                        |

### `icon` (required)

Generates app icons for iOS and Android platforms.

| Option         | Required | Description                                                                                                          |
|----------------|----------|----------------------------------------------------------------------------------------------------------------------|
| `path`         | ✓        | Path to icon image file or object with `light` and `dark` properties                                                 |
| `bgColor`      | ✓        | Background color in hex format (e.g., `#018290`) or object with `light` and `dark` properties                        |
| `name`         |          | Icon name string or object with `android` and `ios` properties (Default: `{android: 'ic_launcher', ios: 'AppIcon'}`) |
| `borderRadius` |          | Corner radius from 0.0 to 1.0 (0 = square, 1 = circle)                                                               |
| `padding`      |          | Padding value or object with `android` and `ios` properties (Default: `0.16`)                                        |

### `notificationIcon` (optional)

Generates Android notification icons. Set to `false` to disable.

| Option      | Required | Description                                                     |
|-------------|----------|-----------------------------------------------------------------|
| `path`      |          | Path to notification icon image (Fallback: icon `path`)         |
| `tintColor` |          | Tint color in hex format (Default: `#FFFFFF`)                   |
| `name`      |          | Notification icon resource name (Fallback: icon `name.android`) |
| `padding`   |          | Padding value (Default: `0.0`)                                  |

### `splash` (required)

Generates splash screens for iOS and Android platforms.

| Option         | Required | Description                                                                                                                  |
|----------------|----------|------------------------------------------------------------------------------------------------------------------------------|
| `path`         | ✓        | Path to splash image file or object with `light` and `dark` properties                                                       |
| `bgColor`      | ✓        | Background color in hex format (e.g., `#00636E`) or object with `light` and `dark` properties                                |
| `name`         |          | Splash name string or object with `android` and `ios` properties (Default: `{android: 'splash_screen', ios: 'LaunchImage'}`) |
| `borderRadius` |          | Corner radius from 0.0 to 1.0                                                                                                |
| `padding`      |          | Padding value or object with `android` and `ios` properties (Default: `0.16`)                                                |

## Advanced Features

### Variables

Define reusable variables that can be referenced in scripts. Variables can be simple values or loaded from environment variables using the `.env` file.

```yaml
fluttergen:
  variables:
    myVar: "value"
    envVar: env.MY_ENV_VARIABLE  # Loads from .env file
    computed: 10 + 5  # Supports basic math expressions
```

### Prescripts & Postscripts

Execute custom scripts before and after the main fluttergen operations. These support various helper functions:

```yaml
fluttergen:
  prescripts:
    # Run shell commands
    - runCommand('flutter clean')
    - exec('echo "Alternative command syntax"')

    # Conditional execution
    - argv.includes('--clean') && runCommand('flutter clean')

    # Define command groups
    - group:myGroup:
        - runCommand('echo "Step 1"')
        - runCommand('echo "Step 2"')

    # Call groups as functions
    - myGroup()

    # Manipulate YAML files
    - yamlSet('pubspec.yaml', 'key', 'value')
    - yamlAddToList('pubspec.yaml', 'listKey', 'item')

    # Manipulate iOS plist files
    - plistSet('ios/Runner/Info.plist', 'CFBundleVersion', 'string', '1.0')
    - plistInsert('ios/Runner/Info.plist', 'nested.key', 'bool', true)
    - plistAddToList('ios/Runner/Info.plist', 'arrayKey', 'string', 'item')

    # Set properties files
    - propertiesSet('android/key.properties', 'keyAlias', env.KEY_ALIAS)

    # File operations
    - copyFile('source/path', 'dest/path')
    - copyDirectory('source/dir', 'dest/dir')
    - appendToFile('path/to/file', 'content to append')
    - replaceInFile('path/to/file', 'searchString', 'replacement', 'string')
    - replaceInFile('android/build.gradle', 'kotlinVersion', '1.9.10', 'string')

    # Version management
    - versionUp()  # Increments version in pubspec.yaml

  postscripts:
    - runCommand('echo "Configuration complete!"')
```

Available helper functions:

| Name             | Parameters                                | Description                                                                   |
|------------------|-------------------------------------------|-------------------------------------------------------------------------------|
| `appendToFile`   | `file, content`                           | Append content to a file                                                      |
| `copyDirectory`  | `src, dest`                               | Copy an entire directory recursively                                          |
| `copyFile`       | `src, dest`                               | Copy a single file                                                            |
| `exec`           | `cmd`                                     | Execute shell commands (alias for `runCommand`)                               |
| `plistAddToList` | `file, key, type, value`                  | Add items to plist arrays                                                     |
| `plistInsert`    | `file, nestedKey, type, value`            | Insert nested plist values (use `\\.` to escape dots in key names)            |
| `plistSet`       | `file, key, type, value`                  | Set plist values                                                              |
| `propertiesSet`  | `file, key, value`                        | Set properties file values (e.g., gradle.properties, .env)                    |
| `replaceInFile`  | `file, searchOrRegex, replacement, type?` | Replace content in a file (supports regex patterns with `/pattern/` syntax)   |
| `runCommand`     | `cmd`                                     | Execute shell commands                                                        |
| `versionUp`      | -                                         | Automatically increment version in pubspec.yaml (e.g., `1.0.0+1` → `1.0.1+2`) |
| `yamlAddToList`  | `file, key, value`                        | Add items to YAML lists                                                       |
| `yamlSet`        | `file, key, value`                        | Set YAML key-value pairs                                                      |

Available objects:

| Name        | Type                  | Description                                                     |
|-------------|-----------------------|-----------------------------------------------------------------|
| `argv`      | `string[]`            | Command-line arguments array (e.g., `argv.includes('--clean')`) |
| `config`    | `FluttergenConfig`    | The entire fluttergen configuration object                      |
| `env`       | `Record<string, any>` | Environment variables from `.env` file (e.g., `env.MY_VAR`)     |
| `params`    | `Record<string, any>` | Defined variables from `variables` section (alias for `vars`)   |
| `variables` | `Record<string, any>` | Defined variables from `variables` section (alias for `vars`)   |
| `vars`      | `Record<string, any>` | Defined variables from `variables` section                      |

## Contributing

Feel free to contribute to the project by creating issues or pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
Feel free to use, modify, and distribute this code as per the terms of the license.

