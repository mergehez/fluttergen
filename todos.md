# fluttergen — Review Findings / TODO

Status legend: `[x]` fixed · `[~]` partially fixed / follow-up needed · `[ ]` open

Verified with `tsc --noEmit`, `bun buildx`, and a full `bun testx` run on a freshly generated Flutter project.

## Critical / High

- [x] **1. `variables` values were `eval`'d**
  `src/yamlParser.ts` now uses a small recursive-descent arithmetic parser (no `eval`).
  Values are only evaluated when they clearly look like expressions (`+ * / % ( )` or a spaced `-`);
  `2024-01-01` and `my-app` stay plain strings. Verified: `10 + 5 * 2` → `20`,
  `2024-01-01` stays a string.

- [x] **2. `variables: { x: env.FOO }` was broken**
  `src/yamlParser.ts` now parses `.env` with `dotenv` and also falls back to `process.env`.
  Verified: `env.DEV_ACCOUNT` resolves correctly.

- [x] **3. `androidMinSdkVersion` was a no-op on modern Flutter**
  `src/useInfoHandler.ts` now edits `android/app` and tries `minSdk` (modern) then
  `minSdkVersion` (legacy). `useBuildGradle.update()` returns success and warns on misses.
  Verified: `minSdk = 21` written to `app/build.gradle.kts`.

- [x] **4. Bundle-ID replacement clobbered the test target**
  `RunnerTests` now keeps `<newId>.RunnerTests`. Verified in `project.pbxproj`.

- [x] **5. Custom iOS icon name was generated but never built**
  `src/useImageGenerator.ts` now updates `ASSETCATALOG_COMPILER_APPICON_NAME` in
  `project.pbxproj` in addition to `CFBundleIconName`. Verified: setting is `MyIcon`.

- [x] **6. `gradleVersion` built malformed URLs**
  Explicit `-all`/`-bin` suffixes are preserved; otherwise `-all` is appended.
  Verified: `8.14` → `gradle-8.14-all.zip`; `8.14-bin` no longer becomes `-bin-all.zip`.

- [x] **7. `plistInsert` dot-escaping was unreliable / non-portable**
  `src/fileHandler/usePlist.ts` was rewritten on top of the pure-JS `plist` package
  (no `plutil`, works on any OS). `\.` in key paths is handled by the parser.
  Verified: `key1.key2.key3\.com.key4` inserts a literal `key3.com` key, and
  `Info.plist` passes `plutil -lint`.

- [x] **8. `esbuild` was undeclared and missing from `bun.lock`**
  Added to devDependencies; `bun.lock` updated; build verified from a clean install.

## Medium

- [x] **9. `notificationIcon.name` and `tintColor` were ignored**
  Both are now honoured. Verified: `custom_notif.png` generated and
  `notification_accent_color` became `#ff8800`.

- [x] **10. Regex support in `replaceInFile` was a no-op**
  `/pattern/flags` is now parsed into a real `RegExp`. Verified: `/foo/g` replaced
  both occurrences in a file.

- [x] **11. The tool assumed both iOS and Android exist**
  Generation/info steps are guarded by project presence, and plist handling no longer
  shells out to `plutil`. Verified: iOS-only and Android-only fixture projects both exit 0
  without creating the missing platform folder.

- [x] **12. `project.pbxproj` got `undefined` values**
  `usePbxproj` strips `key = undefined;` before writing, checks the entitlements file
  exists, and the group lookup now handles both `_comment` and `name`/`path` entries.
  Verified: 0 occurrences of `= undefined;` after a run.

- [x] **13. Shell/XML escaping and secret leakage**
  Plist handling no longer uses the shell; manifest attributes are XML-escaped;
  `propertiesSet`, `plist*`, `replaceInFile` and placeholder replacement no longer log
  values. Note: `prescripts`/`postscripts` still execute configured JS via `eval` by design.

- [x] **14. Config validation UX**
  Zod issues are converted to a concise `KnownError` and the config dump was removed.
  Verified: `Error: Invalid 'fluttergen' configuration in pubspec.yaml: - splash: ...`.

- [x] **15. Version check was blocking and noisy**
  Adds a 1.5s timeout, checks `res.ok`, and only warns when the registry version is
  actually newer.

- [x] **16. `tools:replace` was clobbered and applied unconditionally**
  `ensureApplicationLabel()` merges into an existing `tools:replace` list and is only
  called when app info is configured.

- [x] **17. Fragile manifest editing**
  Missing `</application>` now warns instead of crashing; noisy metadata log removed;
  inserted metadata formatting fixed.

## Low / clean-up

- [x] **18.** Duplicate `--version` branch removed (`src/index.ts`).
- [x] **19.** `kotlinVersion` removed from the README example and test pubspec
  (it was never supported).
- [x] **20.** `dotenv` is now used; `prompts`/`@types/prompts` and the leftover `vite`
  override removed; broken `buildOld` script removed; `color-name` declared directly.
- [x] **21.** `testx` now creates a fallback `.env`, so it can run from a clean clone.
  Added a Bun unit test suite (`tests/core.test.ts`, `bun test:unit`) covering the
  variables parser, colors, plist key paths, Gradle updates and version normalization.
  The integration test still requires the Flutter SDK.
- [x] **22.** `buildx` now prints the build error; stale comment removed; target bumped
  to Node 18 (matches `fetch`/`AbortSignal` usage).
- [x] **23.** Transparent iOS icon backgrounds emit a warning. This is intentional:
  forcing a background color would silently change the user's branding.
- [x] **24.** Reading and writing the same `assets/icon-512x512.png` is now rejected
  globally in `resizeImage`. Stale, unreferenced icon files are intentionally left in
  place: deleting unknown image files could destroy user assets.
- [x] **25.** `values-v31` stub no longer hard-codes a drawable; added a proper
  `values-night-v31` stub.
- [x] **26.** Android `colors.xml` / `styles.xml` are now edited surgically, so comments
  and formatting are preserved. `xml2js` and `useXmlParser` were removed in the process.
  Verified with comments injected into a real project.
- [x] **27.** `hexToRgba` now validates hex digits instead of producing `NaN`.
- [x] **28.** `useYamlFile.get` returns `undefined` for scalar intermediate paths.
- [x] **29.** `useIosContentsJson.deleteOldFiles` now only removes generated image files
  (png/jpg/gif/webp/pdf) and keeps unrelated files.
- [x] **30.** `publishx` uses `npm version patch --no-git-tag-version` so a failed
  publish cannot leave a git commit/tag behind. `testx` remains destructive by design.

## Follow-ups worth considering

- Binary `.plist` files are not supported (Flutter projects use XML plists).
- Clean up stale, unreferenced icon sets/files when an icon name changes
  (currently left in place on purpose to avoid deleting user assets).
- `testx` still requires the Flutter SDK and a network connection.
