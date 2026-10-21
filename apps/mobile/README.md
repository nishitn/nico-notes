# nico notes for Android

Native React Native screens, built with Expo SDK 57, Expo Router and the existing Convex backend. Android is the primary target. The web client remains in `apps/web`; both clients use the same accounts, boards, visits, ratings and private photos.

The welcome screen uses the web's notes-with-heart mark directly from `apps/web/public/favicon.svg`. The launcher PNGs in `assets` are exports of that same vector, with a padded transparent foreground for Android adaptive and themed icons.

The white artwork is optically centered with a 1-unit rightward offset in the 64-unit SVG viewBox to balance the notepad's visual weight against the protruding heart. Keep that offset in launcher exports too (16 px in the 1024 px icon, 10 px in the adaptive foreground's 624 px artwork).

## Start on Android

Use Node 24, pnpm 10, JDK 17 and an Android SDK with platform/build-tools 36 and NDK 27.1.12297006. Install Android Studio and either create an emulator or enable USB debugging on your phone.

From the repository root:

```sh
pnpm install --frozen-lockfile
cp apps/mobile/.env.example apps/mobile/.env.local
```

Fill in `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CONVEX_SITE_URL` from the same deployment used by the web app. They correspond to `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` in `apps/web/.env.local`. Set `EXPO_PUBLIC_WEB_URL` to your web origin for shared web invitations. No OAuth client secret belongs in the mobile environment; public values are embedded in the app.

Android uses the native **Credential Manager** Google bottom sheet through the local Expo module in `modules/google-sign-in`. It opens only after tapping the Google button; app launch never prompts or automatically selects an account. The request includes all device Google accounts using `GetGoogleIdOption`, with auto-select disabled. If the sheet has no available credentials (including disabled sign-in prompts or missing device accounts), the explicit Google dialog is a fallback. Dismissing the sheet cancels sign-in without opening another prompt.

It sends the resulting Google ID token to Convex, which verifies its Google signature, issuer, audience, expiry, verified email and nonce before creating a normal Convex Auth session. Existing Google accounts are matched by Google's immutable subject, retaining their users and board data. No ID tokens are logged or persisted by the native module.

The app reads the public Web OAuth client ID from `photos.configuration`; Android needs no mobile client-ID variable or OAuth secret. Deploy the updated backend provider before using native sign-in. Both Android and iOS use the same `google-native` backend provider. Keep `SITE_URL` pointed at the web app.

In the **same Google Cloud project** as the existing Web OAuth client, create an OAuth client of type **Android** for:

- Package: `com.nishitnagar.notes`
- Debug SHA-1 in this checkout: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

Android OAuth clients and the Maps/Places Android key restrictions must use `com.nishitnagar.notes` with the appropriate signing SHA-1. Android uses the package/signing registration automatically; do not substitute its client ID for the Web client ID used as the server audience.

Register the appropriate signing SHA-1 for each release/Play App Signing build too. The Android client authorizes the installed app; the existing Web client ID remains the server audience. The existing Google web callback stays unchanged. Google Play services must be available on the device.

The new native module requires rebuilding and reinstalling the app; JavaScript hot reload alone is insufficient. Cancelling the chooser returns to the welcome screen without signing in or opening Chrome. Android sign-out clears the Credential Manager session as well as Convex authentication.

```sh
pnpm android
```

This generates the Android project, builds and installs a development app and starts Metro. Subsequent JavaScript-only work uses:

```sh
pnpm dev:mobile
```

Use an installed development build for Google sign-in; Expo Go does not contain the local Credential Manager module. `pnpm dev` starts the backend watcher and mobile server together. `pnpm dev:web` runs the retained web client.

Native projects are generated from `app.config.ts` and ignored in Git. After changing native plugins, permissions, scheme or a Maps key, regenerate and rebuild:

```sh
pnpm --filter @nico-notes/mobile exec expo prebuild --platform android --clean
pnpm android
```

## Start on iOS

Install Xcode and an iOS Simulator runtime. In the **same Google Cloud project** as the existing Web OAuth client, open [Google Cloud credentials](https://console.cloud.google.com/apis/credentials) and create an OAuth client ID with application type **iOS** and bundle ID **`com.nishitnagar.notes`**. Copy the iOS client ID into `apps/mobile/.env.local`:

```sh
GOOGLE_IOS_CLIENT_ID=YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
```

Use the exact value Google gives you, including its numeric prefix. This is public build configuration, not a secret. The existing Web client ID remains the backend token audience and is loaded from `photos.configuration`; do not replace it with the iOS client ID. No Firebase project, Google client secret, or `GoogleService-Info.plist` is required. For EAS builds, configure `GOOGLE_IOS_CLIENT_ID` in the corresponding EAS environment too.

From the repository root, regenerate the native configuration and build:

```sh
pnpm --filter @nico-notes/mobile exec expo prebuild --platform ios
pnpm ios
```

`app.config.ts` embeds `GIDClientID` and registers its reversed URL scheme for Google's callback, while retaining `niconotes` invitation links. The local Expo module installs Google Sign-In SDK 9.0.0, handles its callback through an Expo app delegate subscriber, and returns the ID token plus a fresh cryptographic nonce to the existing backend verifier. The SDK starts authentication directly with Google, so iOS no longer opens the Convex authentication domain. Google's own consent/account chooser or an iOS prompt naming Google may still appear. See [Google's iOS setup guide](https://developers.google.com/identity/sign-in/ios/start-integrating).

Sign-in starts only after tapping the button. Cancelling returns to the welcome screen without a browser fallback or backend sign-in. The module clears Google's cached credentials after each attempt; the app session stays in Convex Auth's secure storage. Sign-out clears native Google state too. Existing Google accounts keep the same boards and data.

Changing the iOS client ID or adding the module requires rebuilding the native app; Metro reload and Expo Go cannot install it. A build without `GOOGLE_IOS_CLIENT_ID` reports a configuration error when sign-in is tapped, without falling back to the Convex browser flow. After the first native build, run `pnpm dev:mobile` and press `i` for JavaScript-only work.

Manually verify on Simulator/device: sign in to an existing account, cancel sign-in, sign out and sign in again, relaunch with the saved app session, and open an invitation link while signed out. Confirm the authentication prompt no longer names `convex.site` and the existing account still has its boards. An iOS OAuth client must be configured before completing this live check.

## Navigation

The signed-in journal uses Expo Router with platform-native Home, Notifications, and Settings tabs. On Expo SDK 57 the import is `expo-router/unstable-native-tabs`; the stable `expo-router/native-tabs` path belongs to SDK 58 and later. Routes live in `src/app`, with detail screens and forms in the root stack and the three tabs in `(tabs)`. Existing screens receive Router's native-stack navigation through `RouterScreen.tsx`. Shared board selection and the unread notification badge live in `JournalContext.tsx`.

Native tabs own the bottom safe area; tab screens use the native screens safe-area view, without an extra app-level bottom inset. iOS uses SF Symbols and the system tab appearance; Android uses Material symbols and the platform tab bar. The beige background and rust selection color follow the app theme where the platform permits. Visits and Wishlist open as stack screens, and Android Back returns to Home from the other tabs. Invitation links and Google callbacks retain their existing `niconotes` scheme.

After pulling the Router migration, regenerate the native projects and rebuild the development apps once (`pnpm --filter @nico-notes/mobile exec expo prebuild`, then `pnpm ios` / `pnpm android`). Restart Metro with `pnpm dev:mobile --clear` after the dependency change. Subsequent JavaScript-only edits still use Fast Refresh.

The board picker uses Expo UI's native Compose `DropdownMenu` on Android, with the brand's seed color, a white surface, and wider menu rows. iOS uses Expo's `MenuView` system menu. Expo handles anchoring, animation, and dismissal; selected boards show a checkmark. Adding Expo UI requires rebuilding the development client. The floating action button uses React Native Paper's Material 3 components and built-in animations, themed to the app's warm palette.

The Android menu has 12 dp corners and a 4 dp shadow. `patches/@expo__ui@57.0.25.patch` exposes the documented `cornerRadius` option missing from this installed release, forwarding it to Compose's native menu shape. Expo autolinking builds only `expo-ui` from source so the patch is included in the APK; rebuild the development client after changing it.

## Photos and places

All embedded maps use Google Maps on Android and iOS, including the board map, place details, visit editor, and visit preview.

For iOS, enable **Maps SDK for iOS** in Google Cloud. Create a separate API key with **iOS apps** application restrictions for bundle ID **`com.nishitnagar.notes`**, restrict its API access to **Maps SDK for iOS**, and set `GOOGLE_MAPS_IOS_API_KEY` in `apps/mobile/.env.local`. Android- or website-restricted keys cannot substitute for this key. Set the same value in the corresponding EAS build environment. See [Google's iOS key setup](https://developers.google.com/maps/documentation/ios-sdk/get-api-key).

Regenerate and rebuild after adding or changing the iOS key:

```sh
pnpm --filter @nico-notes/mobile exec expo prebuild --platform ios
pnpm ios
```

The Expo Maps plugin links the Google Maps iOS SDK and initializes it at app startup. Without the platform's key, embedded maps stay hidden while saved lists and external Google Maps directions remain available. Google Places search and live place details currently use the Android-only local Places module.

The Android camera and system photo picker upload JPEGs through the same authenticated photo endpoints as the web app. Images are resized to at most 2400 pixels wide and checked against the 10 MB limit. Photos are added on the saved visit screen, where failed uploads can be retried. Viewing uses authorization headers and disables persistent image caching. All images use private Convex Storage at `EXPO_PUBLIC_CONVEX_SITE_URL`; the Mac has no image-storage role.

For the embedded map, enable **Maps SDK for Android** and set `GOOGLE_MAPS_ANDROID_API_KEY` before building. Restrict that key to `com.nishitnagar.notes` and the signing certificate SHA-1 for each build you use. The browser Maps key is not a substitute. Without this key, places and external Maps directions still work; the embedded map is hidden. Native place search mirrors the web dashboard: saved places, up to five Google Places results within 10 km of the foreground location, and a manual-add fallback. Enable **Places API (New)** in the same Google Cloud project and allow it alongside Maps SDK for Android in the Android key’s API restrictions. This search uses the local `modules/google-places` Expo module with the native Places SDK; rebuilding the development client is required after adding or changing the module. It uses the Android-restricted key already embedded in the native manifest, and does not embed the web key or a server credential. New-place selections carry their Google place ID, address and coordinates into the visit form. Google Places search has separate usage-based billing from the native map.

The native map opens around the current foreground location with an approximately 10 km radius. The crosshairs button requests a location fix and restores that view. Each place has its own marker; crowded markers become smaller dots as you zoom out and grow as you zoom in, including in fullscreen. Selection opens a bottom drawer, and dismissing it clears the highlighted pin. If location is denied or unavailable, the map stays browsable around a saved place.

Place markers use bundled native image textures rather than custom view snapshots. Regenerate their density variants with `node apps/mobile/scripts/generate-map-markers.mjs` from the repository root. Keep marker keys and `zIndex` stable across size and selection changes: changing the Fabric child order can leave duplicate Google Maps markers behind on Android. Fullscreen map instances discard queued camera events from the previous instance.

Boards, visits and places paginate explicitly. Visit search applies to loaded history. Saved-place search automatically loads remaining place pages, and selecting a search result focuses its map pin even when it is outside the nearby viewport. Use the load-more button to add more places to the map when browsing without a search. Existing boards' place linking starts when the Places screen opens.

## APK and Play Store builds

`eas.json` includes development, preview APK and production AAB profiles. After installing the EAS CLI, signing in to your Expo account, and linking your own project with `eas init`, run from `apps/mobile`:

```sh
eas build --platform android --profile preview
# Play Store artifact:
eas build --platform android --profile production
```

Configure the same public backend URLs and Maps build key in the EAS environment; ignored `.env.local` files are not uploaded. `preview` creates an installable standalone APK. `production` creates an AAB for Google Play. No store submission occurs automatically. A local release build also needs your Android signing configuration before distribution.

## Local Play Store uploads

Expo cloud builds are optional. This checkout can create a signed release AAB locally:

```sh
# First release only: explicitly create the private upload key.
ANDROID_VERSION_CODE=1 pnpm build:android:store --init-key
# Later releases: use a new, unused version code and the same key.
ANDROID_VERSION_CODE=2 pnpm build:android:store
```

Run from the repository root with JDK 17 and the Android SDK installed. The command loads the mobile production environment, validates configuration, regenerates Android, excludes the development overlay permission, and signs the release with a dedicated upload key. It does not upload or publish automatically and does not require `EXPO_PROJECT_ID`. EAS builds still require a linked Expo project.

Artifacts appear at `.release/android/nico-notes-VERSION_CODE.aab`. The persistent upload key is `.release/android/upload.p12`; its credentials are `.release/android/signing.json`. The directory and credentials have owner-only permissions and are ignored by Git. Back up both privately outside the Mac before relying on this release process. Never send the private key/passwords to testers or commit them. Keep using the same upload key for updates, or follow Google’s upload-key reset process if necessary.

Google Play re-signs installed apps with the app-signing key. Register that public signing certificate’s SHA-1 for `com.nishitnagar.notes` in an Android OAuth client and the existing Android Maps/Places key restrictions. The upload key and debug key have different fingerprints; they do not authorize the Play-installed app. Keep the existing Web OAuth client as the backend server audience.

The first internal tester is the owner’s Google account. Internal tests are distributed by the Play opt-in link; they do not count toward the separate closed-test requirement for production access on applicable new personal accounts.

## Verification

```sh
pnpm check
pnpm test
pnpm build
```

`build:android` exports the Android JavaScript/Hermes bundle; it does not compile an APK. `pnpm android` compiles and installs a development build. For a compile-only debug check after prebuild, run `./gradlew :app:assembleDebug` inside `apps/mobile/android`.

Manually verify on a device: Google sign-in and cancellation; sign-out and relaunch; invitation links while signed out; joining and admin approval; board and visit editing; ratings and permissions; camera/gallery uploads and retry; photo captions and deletion; denied camera/location permissions; Maps directions; hardware Back; and long lists with pagination. Network access is required for realtime Convex data. Complete the iOS authentication checks above after creating the iOS OAuth client.

## Production and Maps policy

Production is `https://striped-ant-274.convex.cloud`, with HTTP actions at `https://striped-ant-274.convex.site`. The ignored client environment contains these URLs after the production cutover. The backend's default development target is intentionally separate.

Google-selected places persist only the Google place ID. Their names, addresses, coordinates and provider attribution load live in memory; manual journal entries remain stored normally. This release adds native `fetchPlace` to the Google Places module, so it requires rebuilding/installing the Android app. Register the production web callback in Google Cloud, and register the eventual Play signing certificate before store testing. Policy acceptance version is `2026-10-21`.
