# fluttergen — Feature backlog

## Done

- [x] **Built-in task library (#2)**
  Namespaced tasks for common maintenance flows: `flutter.clean`, `flutter.pubGet`,
  `ios.pods.reset`, `android.clean`, `firebase.configure`, `build.apk`, `git.tag`, etc.
  Supported as bare entries (`- flutter.clean`), object entries with options
  (`- build.apk: { mode: release }`), and via `fluttergen run <task> --key=value`.
  Documented in the README and covered by unit/CLI tests.

## Recommended features

- [ ] **1. Declarative `workflows` with typed steps and conditions**
  Replace JavaScript-like task strings and manual groups with a validated step schema.
  ```yaml
  workflows:
    clean:
      - run: flutter clean
      - delete: [android, ios]
      - run: flutter create . --platforms=android,ios
  prescripts:
    - use: clean
      when: { flag: --clean }
  ```
  Steps map to existing helpers (`run`, `copy`, `yaml`, `plist`, `props`, `replace`, `generate`).
  Conditions: `flag`, `platform`, `env`, `file`, `all`, `any`, `not`.

- [ ] **3. Profiles + signing/secrets**
  Per-environment config overrides with `--profile`, automatic `.env.<profile>` loading,
  `env.*` expansion everywhere, and a `signing:` block that writes Android
  `key.properties`/Gradle signing config and iOS team/entitlements.

- [ ] **4. First-class release workflow**
  `release:` block and `fluttergen release` for version bumping, build-number sync across
  pubspec/Android/iOS, git tagging, optional changelog and builds, with `--dry-run`.

- [ ] **5. Safe and selective execution**
  `--only`/`--skip`, `--platform`, `--dry-run`, `--diff`, `--backup`/`--restore`.
  Removes manual backup/restore groups and makes long pipelines safe to run.

## More ideas

- [ ] **Flutter flavors/targets** — per-flavor IDs, icons, splash, entitlements and env profile.
- [ ] **Config inheritance** — `extends`/`includes` and YAML anchors for multi-app/workspace setups.
- [ ] **`fluttergen doctor`** — validate config, required files, asset dimensions, Flutter/Xcode/Android SDK availability.
- [ ] **Permissions manager** — edit `AndroidManifest.xml` and add iOS usage descriptions in one place.
- [ ] **Deep links / universal links** — associated domains, URL schemes and Android intent filters.
- [ ] **Localization sync** — `InfoPlist.strings`, Android `strings.xml` and app names per locale.
- [ ] **Watch mode** — `fluttergen --watch` to regenerate icons/splash when source images change.
- [ ] **Migration command** — import settings from `flutter_launcher_icons` and `flutter_native_splash`.
- [ ] **JSON Schema for the config** — IDE autocomplete and validation in `pubspec.yaml`.
- [ ] **Custom task plugins** — load project-local JS/TS actions without adding them to the core package.
- [ ] **Atomic writes / backup by default** — write via temp files and keep a rollback snapshot.


## More ideas

- [ ] **Flutter flavors/targets** — per-flavor IDs, icons, splash, entitlements and env profile.
- [ ] **Config inheritance** — `extends`/`includes` and YAML anchors for multi-app/workspace setups.
- [ ] **`fluttergen doctor`** — validate config, required files, asset dimensions, Flutter/Xcode/Android SDK availability.
- [ ] **Permissions manager** — edit `AndroidManifest.xml` and add iOS usage descriptions in one place.
- [ ] **Deep links / universal links** — associated domains, URL schemes and Android intent filters.
- [ ] **Localization sync** — `InfoPlist.strings`, Android `strings.xml` and app names per locale.
- [ ] **Watch mode** — `fluttergen --watch` to regenerate icons/splash when source images change.
- [ ] **Migration command** — import settings from `flutter_launcher_icons` and `flutter_native_splash`.
- [ ] **JSON Schema for the config** — IDE autocomplete and validation in `pubspec.yaml`.
- [ ] **Custom task plugins** — load project-local JS/TS actions without adding them to the core package.
- [ ] **Atomic writes / backup by default** — write via temp files and keep a rollback snapshot.
