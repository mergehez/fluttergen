# FlutterGen

[![NPM Version](https://img.shields.io/npm/v/fluttergen)](https://www.npmjs.com/package/fluttergen)
![NPM Downloads](https://img.shields.io/npm/d18m/fluttergen)

Flutter helper CLI tools for automating app configuration tasks including renaming, icon generation, and splash screen setup.

The tool replaces well-known flutter tools like [rename](https://pub.dev/packages/rename), [flutter_launcher_icons](https://pub.dev/packages/flutter_launcher_icons) and [flutter_native_splash](https://pub.dev/packages/flutter_native_splash).

You'll need [Node.js](https://nodejs.org/) (18+) or [Bun](https://bun.sh/) installed to use this tool.

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

Set `FLUTTERGEN_NO_UPDATE_CHECK=1` to skip the npm update check (handy for CI or offline environments).

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
    envVar: env.MY_ENV_VARIABLE  # Loads from .env (or the process environment)
    computed: 10 + 5  # Supports basic arithmetic (+ - * / % and parentheses)
```

Variable expressions are evaluated by a small built-in arithmetic parser, not `eval`.
Only values that clearly look like expressions are evaluated, so values such as
`2024-01-01` or `my-app` are kept as plain strings.

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
| `plistGet`       | `file, key`                               | Get a plist value                                                             |
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

### Workflows

Define reusable workflows instead of writing long task strings or duplicating groups:

```yaml
fluttergen:
  workflows:
    clean:
      - run: flutter clean
      - delete: [android, ios]
      - run: flutter create . --platforms=android,ios
      - flutter.pubGet

    prepare:
      - use: clean
      - build.apk: { mode: release }
        when: { flag: --build }

  prescripts:
    - use: prepare
    - run: echo "ready"
      when: { platform: darwin }
```

Supported step types: `run`, `delete`, `copy`, `yaml`, `plist`, `props`, `replace`,
`generate`, `use`, and any built-in task. Workflows can be called by name
(`- use: clean`) or used directly as a bare entry (`- clean`).

Conditions use `when`:

- `flag`: command-line flag, e.g. `{ flag: --build }`
- `platform`: host OS (`macos`/`ios`, `linux`, `windows`, `unix`)
- `env`: variable name or `{ KEY: value }` map
- `file`: path(s) that must exist
- `not`, `all`, `any` for composition

A `generate` step runs icon/splash generation and (when `info` is configured) the
rename step. It is useful in postscripts or custom workflows; when used in a
prescript it runs in addition to the default generation.

### Profiles and signing

Keep one config and switch environments with `--profile`:

```yaml
fluttergen:
  info:
    appName: '${APP_NAME}'
    bundleIdentifier: com.example.${APP_SUFFIX}
    applicationId: com.example.${APP_SUFFIX}
  profiles:
    dev:
      info:
        appName: My App Dev
        applicationId: com.example.app.dev
      icon:
        path: assets/icon-dev.png
    prod:
      info:
        appName: My App
        applicationId: com.example.app

  signing:
    android:
      storeFile: ${KS_FILE}
      storePassword: ${KS_STORE_PASSWORD}
      keyAlias: ${KS_ALIAS}
      keyPassword: ${KS_KEY_PASSWORD}
    ios:
      team: ${APPLE_TEAM}
      entitlements:
        aps-environment: development
        com.apple.developer.associated-domains:
          - applinks:example.com
```

```bash
fluttergen --profile prod
# or
FLUTTERGEN_PROFILE=prod fluttergen
```

Profiles merge over the base config (objects deep-merge, arrays replace). Environment
files are loaded in order `.env`, `.env.<profile>`, then the process environment;
`${VAR}` and `${VAR:-fallback}` are expanded in config values. Scripts and workflows
are left untouched, so their JS template literals keep working; they can read the
merged environment through the `env` object.

The `signing` block writes:

- `android/key.properties` with the configured credentials.
- `android/signing.gradle` and applies it from `android/app/build.gradle(.kts)`.
- iOS `DEVELOPMENT_TEAM`, plus an entitlements plist added to `project.pbxproj`
  with code signing enabled.

Keep secret values in `.env.*` files or CI variables, never in `pubspec.yaml`.

### Built-in tasks

Common Flutter/iOS/Android maintenance flows are built in, so you don't need to
define a group or write shell commands. Use them bare, as calls, or with options:

```yaml
fluttergen:
  prescripts:
    - flutter.clean
    - ios.pods.reset
    - firebase.configure: { project: env.FIREBASE_ID }
    - build.apk: { mode: release, flavor: prod }
```

They can also be run directly from the CLI:

```bash
fluttergen run --list
fluttergen run flutter.clean
fluttergen run ios.pods.reset
fluttergen run build.apk --mode=release --flavor=prod
```

| Task | Description |
|------|-------------|
| `flutter.clean` | `flutter clean` |
| `flutter.pubGet` | `flutter pub get` |
| `flutter.analyze` | `flutter analyze` |
| `flutter.doctor` | `flutter doctor` |
| `flutter.test` | `flutter test` |
| `flutter.run` | `flutter run` |
| `android.clean` | `./gradlew clean` in `android/` |
| `ios.pods.install` | `pod install` |
| `ios.pods.update` | `pod update` |
| `ios.pods.deintegrate` | `pod deintegrate` |
| `ios.pods.reset` | deintegrate, clear cache, remove `Pods`/`Podfile.lock`, install |
| `build.apk` | `flutter build apk` |
| `build.appBundle` | `flutter build appbundle` |
| `build.ipa` | `flutter build ipa` |
| `install.device` | `flutter install` |
| `firebase.configure` | `flutterfire configure` |
| `git.tag` | tag the current pubspec version |

Common options: `mode` (`debug`/`profile`/`release`), `flavor`, `target`, `device`,
`args`, and task-specific flags. iOS tasks and `build.ipa` require macOS.

## Contributing

Feel free to contribute to the project by creating issues or pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
Feel free to use, modify, and distribute this code as per the terms of the license.

