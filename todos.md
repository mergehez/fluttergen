# fluttergen — Feature backlog

## Done

- [x] **Built-in task library (#2)**
  Namespaced tasks for common maintenance flows: `flutter.clean`, `flutter.pubGet`,
  `ios.pods.reset`, `android.clean`, `firebase.configure`, `build.apk`, `git.tag`, etc.
  Supported as bare entries, object entries with options, and via
  `fluttergen run <task> --key=value`.

- [x] **Declarative workflows (#1)**
  Named `workflows:` with typed steps and conditions.
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
  Steps: `run`, `delete`, `copy`, `yaml`, `plist`, `props`, `replace`, `generate`,
  `use`, and any built-in task. Conditions: `flag`, `platform`, `env`, `file`,
  `not`, `all`, `any`. Workflows support nesting with cycle detection and can be
  invoked by bare name.

- [x] **Profiles + signing/secrets (#3)**
  `profiles:` overrides merged with the base config, `--profile`/`FLUTTERGEN_PROFILE`,
  `.env` + `.env.<profile>` loading, `${VAR}` / `${VAR:-fallback}` expansion, and a
  `signing:` block that writes Android `key.properties` + `signing.gradle` and iOS
  team/entitlements in `project.pbxproj`.

- [x] **First-class release workflow (#4)**
  `release:` config and `fluttergen release` with patch/minor/major bumps, build-number
  sync to Android/iOS, git tags with templates, changelog entries, optional builds and
  `--dry-run`.

- [x] **Safe and selective execution (#5)**
  `--only`/`--skip` phases, `--platform`, `--dry-run`, `--diff`, `--backup`/`--restore`.
  Diffs redact sensitive files; dry runs revert all watched changes and skip scripts.

- [x] **JSON Schema for the config**
  `fluttergen schema` plus a generated `fluttergen.schema.json` for IDE autocomplete and
  config validation.

- [x] **`fluttergen doctor`**
  Checks runtime, config, asset dimensions, platforms, signing files and
  Flutter/Git/Android SDK/Xcode/CocoaPods availability.

- [x] **Permissions manager**
  `permissions.android` writes manifest permissions; `permissions.ios` writes usage
  descriptions (known aliases plus raw `NS*` keys).

## Tasks

All approved tasks are complete. See **Open ideas** below for unapproved follow-ups.

## Open ideas

- [ ] **Flutter flavors/targets** — per-flavor IDs, icons, splash, entitlements and env profile.
- [ ] **Deep links / universal links** — associated domains, URL schemes and Android intent filters.
- [ ] **Localization sync** — `InfoPlist.strings`, Android `strings.xml` and app names per locale.

## Rejected ideas

- **Config inheritance** — `extends`/`includes` and YAML anchors for multi-app/workspace setups.
- **Migration command** — import settings from `flutter_launcher_icons` and `flutter_native_splash`.
- **Watch mode** — `fluttergen --watch` to regenerate icons/splash when source images change.
- **Custom task plugins** — load project-local JS/TS actions without adding them to the core package.
- **Atomic writes / backup by default** — write via temp files and keep a rollback snapshot.
