# nico notes for Android

Native React Native screens, built with Expo SDK 57, React Navigation and the existing Convex backend. Android is the primary target. The web client remains in `apps/web`; both clients use the same accounts, boards, visits, ratings and private photos.

The welcome screen uses the web's notes-with-heart mark directly from `apps/web/public/favicon.svg`. The launcher PNGs in `assets` are exports of that same vector, with a padded transparent foreground for Android adaptive and themed icons.

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

The app reads the public Web OAuth client ID from `photos.configuration`; no mobile client-ID variable or OAuth secret is needed. Deploy the updated backend provider before using native sign-in. iOS continues to use the browser auth session and the exact `niconotes://auth` redirect. Keep `SITE_URL` pointed at the web app.

In the **same Google Cloud project** as the existing Web OAuth client, create an OAuth client of type **Android** for:

- Package: `com.nishitnagar.niconotes`
- Debug SHA-1 in this checkout: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

The registered debug Android client is `223684856447-i6qu5fnm084js3rmq8t76qgk9ad0f1s4.apps.googleusercontent.com`. Its package and SHA-1 match this checkout. Android uses this registration automatically; do not substitute its client ID for the Web client ID used as the server audience.

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

## Navigation

The signed-in journal shares the welcome screen's logo and wordmark. The top-right Material dropdown shows the selected board name and includes paginated switching, create, and join actions. The standard Material bottom navigation has Home (recent visits), Visits (searchable, paginated history), and More (account, places, and board settings). Home has a separate floating New button above the navigation, opening actions for a new visit or board. Android Back closes an open menu or returns to Home before leaving the journal.

Navigation, menus, and the floating action button use React Native Paper's Material 3 components and built-in animations, themed to the app's warm palette.

## Photos and places

The Android camera and system photo picker upload JPEGs through the same authenticated photo endpoints as the web app. Images are resized to at most 2400 pixels wide and checked against the 10 MB limit. Photos are added on the saved visit screen, where failed uploads can be retried. Viewing uses authorization headers and disables persistent image caching. Local-storage boards require `EXPO_PUBLIC_PHOTO_API_URL` to be a reachable HTTPS origin serving `/photos/*`, such as the existing hosted app. Device `localhost` points at the phone, not the Mac mini.

For the embedded map, enable **Maps SDK for Android** and set `GOOGLE_MAPS_ANDROID_API_KEY` before building. Restrict that key to `com.nishitnagar.niconotes` and the signing certificate SHA-1 for each build you use. The browser Maps key is not a substitute. Without this key, places and external Maps directions still work; the embedded map is hidden. Address entry is manual, with optional foreground GPS capture. Browser Places autocomplete is retained in the web client.

Boards, visits and places paginate explicitly. Search applies to loaded records; use the load-more button to search older records or add more places to the map. Existing boards' place linking starts when the Places screen opens.

## APK and Play Store builds

`eas.json` includes development, preview APK and production AAB profiles. After installing the EAS CLI, signing in to your Expo account, and linking your own project with `eas init`, run from `apps/mobile`:

```sh
eas build --platform android --profile preview
# Play Store artifact:
eas build --platform android --profile production
```

Configure the same public backend URLs and Maps build key in the EAS environment; ignored `.env.local` files are not uploaded. `preview` creates an installable standalone APK. `production` creates an AAB for Google Play. No store submission occurs automatically. A local release build also needs your Android signing configuration before distribution.

## Verification

```sh
pnpm check
pnpm test
pnpm build
```

`build:android` exports the Android JavaScript/Hermes bundle; it does not compile an APK. `pnpm android` compiles and installs a development build. For a compile-only debug check after prebuild, run `./gradlew :app:assembleDebug` inside `apps/mobile/android`.

Manually verify on a device: Google sign-in and cancellation; sign-out and relaunch; invitation links while signed out; joining and admin approval; board and visit editing; ratings and permissions; camera/gallery uploads and retry; photo captions and deletion; denied camera/location permissions; Maps directions; hardware Back; and long lists with pagination. Network access is required for realtime Convex data. iOS has a launch command but has not been device-tested in this migration.
