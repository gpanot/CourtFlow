# CourtFlow Android Build Configuration

Reference extracted from the working **CourtFlow mobile** (`mobile/`) React Native + Expo Android build. Use this when aligning another project (e.g. Squadd) to the same toolchain.

**Stack:** Expo SDK 54, React Native 0.81.5, New Architecture enabled.

SDK versions are **not** hardcoded in project `build.gradle` files; they are injected by the `expo-root-project` plugin from `node_modules/react-native/gradle/libs.versions.toml`. Values below marked **resolved** were confirmed with `./gradlew :app:properties`.

---

## `android/build.gradle` (project root)

| Property | Value in file |
|----------|----------------|
| `compileSdkVersion` | Not set (via `rootProject.ext`) |
| `buildToolsVersion` | Not set |
| `minSdkVersion` | Not set |
| `targetSdkVersion` | Not set |
| `kotlinVersion` | Not set |

### Classpath dependencies (as written)

```gradle
classpath('com.android.tools.build:gradle')           // no version — resolved by RN/Expo
classpath('com.facebook.react:react-native-gradle-plugin')
classpath('org.jetbrains.kotlin:kotlin-gradle-plugin') // no version — resolved
classpath('com.google.gms:google-services:4.4.2')
```

### Plugins applied

- `expo-root-project`
- `com.facebook.react.rootproject`

### Resolved at build time

| Property | Value |
|----------|--------|
| `buildToolsVersion` | 36.0.0 |
| `minSdkVersion` | 24 |
| `compileSdkVersion` | 36 |
| `targetSdkVersion` | 36 |
| `ndkVersion` | 27.1.12297006 |
| `kotlinVersion` | 2.1.20 |
| AGP (`com.android.tools.build:gradle`) | 8.11.0 |

---

## `android/app/build.gradle`

| Property | Reference / value |
|----------|-------------------|
| `compileSdk` | `rootProject.ext.compileSdkVersion` → **36** |
| `buildToolsVersion` | `rootProject.ext.buildToolsVersion` → **36.0.0** |
| `minSdkVersion` | `rootProject.ext.minSdkVersion` → **24** |
| `targetSdkVersion` | `rootProject.ext.targetSdkVersion` → **36** |
| `ndkVersion` | `rootProject.ext.ndkVersion` → **27.1.12297006** |

### `compileOptions` / `kotlinOptions`

Not declared in `app/build.gradle`. Applied by React Native Gradle Plugin:

| Setting | Value |
|---------|--------|
| `sourceCompatibility` | Java 17 |
| `targetCompatibility` | Java 17 |
| Kotlin | `jvmToolchain(17)` (no explicit `jvmTarget` in app gradle) |

### `packagingOptions`

```gradle
packagingOptions {
    jniLibs {
        def enableLegacyPackaging = findProperty('expo.useLegacyPackaging') ?: 'false'
        useLegacyPackaging enableLegacyPackaging.toBoolean()
    }
}
```

Dynamic merges from `gradle.properties` keys `android.packagingOptions.pickFirsts`, `excludes`, `merges`, `doNotStrip`: **none configured**.

### `androidResources`

```gradle
ignoreAssetsPattern '!.svn:!.git:!.ds_store:!*.scc:!CVS:!thumbs.db:!picasa.ini:!*~'
```

### Other app config

| Field | Value |
|-------|--------|
| `namespace` | `com.courtpay.app` |
| `applicationId` | `com.courtpay.app` |
| `versionCode` | 34 |
| `versionName` | 34.0.0 |
| JSC flavor (if Hermes disabled) | `io.github.react-native-community:jsc-android:2026004.+` |
| Hermes | `hermesEnabled=true` in `gradle.properties` |

---

## `android/gradle/wrapper/gradle-wrapper.properties`

```
distributionUrl=https\://services.gradle.org/distributions/gradle-8.14.3-bin.zip
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

---

## `android/gradle.properties`

Non-empty, non-comment lines:

```properties
org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
android.useAndroidX=true
android.enablePngCrunchInReleaseBuilds=true
reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
newArchEnabled=true
hermesEnabled=true
edgeToEdgeEnabled=true
expo.gif.enabled=true
expo.webp.enabled=true
expo.webp.animated=false
EX_DEV_CLIENT_NETWORK_INSPECTOR=true
expo.useLegacyPackaging=false
expo.edgeToEdgeEnabled=true
```

---

## `mobile/package.json` — JS / native versions

| Package | `package.json` | Lockfile (if applicable) |
|---------|----------------|--------------------------|
| `expo` | ~54.0.33 | 54.0.33 |
| `react` | 19.1.0 | — |
| `react-native` | 0.81.5 | 0.81.5 |
| `react-native-reanimated` | — | **not used** |
| `react-native-gesture-handler` | — | **not used** |
| `react-native-screens` | ~4.16.0 | 4.16.0 |
| `react-native-safe-area-context` | ~5.6.0 | 5.6.2 |
| `react-native-svg` | 15.12.1 | 15.12.1 |
| `react-native-webview` | 13.15.0 | 13.15.0 |
| `react-native-tab-view` | ^4.3.0 | — |
| `react-native-qrcode-svg` | ^6.3.21 | — |
| `@react-native-community/datetimepicker` | 8.4.4 | 8.4.4 |
| `expo-dev-client` | ~6.0.20 | 6.0.20 |
| `expo-modules-core` | (transitive) | 3.0.29 |

### Expo modules with native code

| Package | Version |
|---------|---------|
| `expo-av` | ~16.0.8 |
| `expo-blur` | ~15.0.8 |
| `expo-camera` | ~17.0.10 |
| `expo-constants` | ~18.0.13 |
| `expo-device` | ~8.0.10 |
| `expo-file-system` | ~19.0.21 |
| `expo-image-manipulator` | ~14.0.8 |
| `expo-image-picker` | ~17.0.10 |
| `expo-notifications` | ~0.32.16 |
| `expo-secure-store` | ~15.0.8 |
| `expo-sharing` | ~14.0.8 |
| `expo-splash-screen` | ~31.0.13 |
| `expo-web-browser` | ~15.0.10 |

### `app.json` native-related flags

| Flag | Value |
|------|--------|
| `newArchEnabled` | true |
| `android.edgeToEdgeEnabled` | true |
| `android.package` | `com.courtpay.app` |

**Config plugins:** `@react-native-community/datetimepicker`, `expo-dev-client`, `expo-secure-store`, `expo-web-browser`, `expo-camera`, `expo-notifications`

---

## Version catalog source (`react-native/gradle/libs.versions.toml`)

Canonical pins for this RN/Expo stack:

```toml
minSdk = "24"
targetSdk = "36"
compileSdk = "36"
buildTools = "36.0.0"
ndkVersion = "27.1.12297006"
agp = "8.11.0"
kotlin = "2.1.20"
```

Gradle wrapper: **8.14.3**

---

## Applying to another project

1. Match **`expo`**, **`react-native`**, and lockfile versions first.
2. Copy **`gradle.properties`** lines (especially `newArchEnabled`, `hermesEnabled`, architectures).
3. Use **Gradle 8.14.3** and let Expo/RN resolve AGP/Kotlin unless you maintain a bare project without `expo-root-project`.
4. Do not pin SDK numbers in `build.gradle` unless you are off the Expo prebuild path — prefer the version catalog + `expoAutolinking.useExpoVersionCatalog()` pattern in `settings.gradle`.

---

*Generated from CourtFlow `mobile/android/` and `mobile/package.json`. Re-run `./gradlew :app:properties` in `mobile/android` after upgrading Expo or React Native to refresh resolved values.*
