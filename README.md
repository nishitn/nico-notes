# nico notes

A private place for shared visits, visit photos, and each person's ratings. The primary Android client uses React Native + Expo in `apps/mobile`. The existing React + TypeScript + Vite+ web client remains in `apps/web`. Both share the Convex database, realtime functions and Google authentication. All profile and journal images use Convex Storage; journal photo reads require authentication. The website is hosted on Cloudflare Pages; the app uses Convex directly and does not require a running Mac server.

App URL: [notes.nishitnagar.com](https://notes.nishitnagar.com).

The Android/web release-hardening changes and outstanding store setup are tracked in [release fixes](plans/2026-10-20-release-fixes.md). Privacy, terms, help and external account-deletion instructions are available at `/privacy`, `/terms`, `/help` and `/delete-account` without signing in. Support contact: `nishit.nagar1@gmail.com`.

## Android app

See [the Android setup and build guide](apps/mobile/README.md) for environment variables, Google sign-in, native Maps configuration, APK/AAB builds and device checks.

```sh
pnpm install --frozen-lockfile
cp apps/mobile/.env.example apps/mobile/.env.local
# Fill in the existing Convex deployment's public URLs, then:
pnpm android
```

`pnpm dev:mobile` starts Metro for an installed development build. `pnpm dev` runs the backend and mobile server together. `pnpm build:android` validates the Android bundle; `pnpm build:web` builds the retained website. `pnpm build` builds both clients. Android uses the native Credential Manager account chooser. Its backend token-verification provider must be deployed, and Google Cloud must have an Android OAuth client for the package and signing certificate; see the Android guide.

## iOS app

See [the iOS setup guide](apps/mobile/README.md#start-on-ios). Create a Google OAuth client of type **iOS** for **`com.nishitnagar.notes`** in the same project as the Web client, set `GOOGLE_IOS_CLIENT_ID` in `apps/mobile/.env.local`, then run `pnpm --filter @nico-notes/mobile exec expo prebuild --platform ios` and `pnpm ios`. iOS uses Google's native sign-in SDK and the existing backend token verifier, so authentication no longer opens the Convex domain.

## Run locally

Requirements: Node.js 24 and pnpm 10 (or the Vite+ runtime). From the repository root:

```sh
pnpm install
pnpm dev:backend
```

Choose a **development** Convex deployment. Its configuration is saved in `packages/backend/.env.local`. In a second terminal, copy `apps/web/.env.example` to `apps/web/.env.local`, then fill in the deployment's two public URLs:

```dotenv
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
```

```sh
pnpm --filter @nico-notes/backend setup:auth
pnpm dev:web
```

Open [localhost:5173](http://localhost:5173). After initial configuration, run `pnpm dev:web` and `pnpm dev:backend` in separate terminals for web development. `pnpm dev` starts the backend and Android client. A client connects to the deployment in its own environment file. The hosted/release clients use production; select development URLs explicitly for development. Never put OAuth secrets or signing keys in a `VITE_` variable.

This workspace has already been connected to the existing `opulent-partridge-532` development deployment. The frontend environment and development signing keys have been configured. **Google OAuth credentials still need to be supplied** before the two of you can sign in.

## Run on another computer

Install Node.js 24 and pnpm 10.33.3, then copy this repository (including `.git` if you want its history), or clone it after configuring a Git remote and pushing. Install dependencies with `pnpm install --frozen-lockfile`; do not copy `node_modules` or build output.

To use the existing backend and data, securely copy `apps/web/.env.local` and `packages/backend/.env.local` from this computer to the same paths. These files are ignored by Git. The frontend file contains the Convex URLs and browser Maps key. Google OAuth credentials and signing keys already configured on the Convex deployment stay there; do not regenerate them for a computer move.

Run `pnpm dev:web` and open `http://localhost:5173` to use the existing deployed backend. To work on backend code too, run `pnpm dev:backend`, authenticate with the Convex account that has project access, and select the existing development deployment. This syncs backend code to that deployment. After setup, `pnpm dev` runs the backend and mobile server; use `pnpm dev:web` for the website. A new Convex deployment has separate data and needs its own authentication setup.

The public website is deployed to the Cloudflare Pages project `nico-notes`, with `notes.nishitnagar.com` pointing to `nico-notes.pages.dev`. Convex hosts authentication, the backend and images. No always-on Mac, Caddy or Cloudflare Tunnel is needed for production. If the public hostname changes, update Convex `SITE_URL`/`ALLOWED_ORIGINS`, Google OAuth origins, Maps key referrers and mobile web links. The OAuth callback stays the same when the Convex deployment stays the same.

## Deploy the website to Cloudflare Pages

Use the production values in `apps/web/.env.local`, then run `pnpm deploy:web`. This builds `apps/web/dist` and uploads only that static output using the official Wrangler CLI. Authenticate Wrangler to the Cloudflare account containing `nishitnagar.com` first (`pnpm dlx wrangler@4.151.3 login`). OAuth secrets, JWT private keys and Convex deployment credentials remain in Convex and must never be added to frontend build variables.

This is a Direct Upload Pages project: repository pushes do not automatically deploy it. Alternatively, build with `pnpm build:web`, ZIP the contents of `apps/web/dist` with `index.html` at the archive root, and upload that ZIP as a production deployment in the Pages dashboard. Do not upload the repository, environment files, migration snapshots or test reports. Pages supplies the SPA fallback because this build has no top-level `404.html`; `public/_headers` adds static-response security headers.

The site uses static hosting only, with no Pages Functions or paid Workers bindings. Static asset requests are free and unlimited under [Cloudflare's current pricing](https://developers.cloudflare.com/pages/functions/pricing/); Free-plan file/build limits still apply. Convex, Google Maps/Places and domain registration have their own plans and charges. After each deployment, verify direct navigation to `/privacy`, `/terms`, `/help` and `/delete-account`, Google sign-in and private photo access on the custom domain.

## Optional Mac hosting for rollback

`pnpm start` remains available for an intentional rollback: it builds the website, starts Caddy on port 8080 and starts the configured Cloudflare Tunnel. Production DNS now targets Pages, so starting this command does not switch public hosting back. A rollback also needs the `notes` CNAME changed to the retained tunnel target. Keep the terminal running during Mac hosting; Ctrl+C stops its services. Set `CLOUDFLARED_CONFIG` if the tunnel configuration is not in `~/.cloudflared/config.yml`.

## Photo storage

All new uploads, including profile pictures, use Convex Storage. Photo reads and journal uploads go to the Convex HTTPS actions and check current access. There is no local-storage option or photo-service dependency in the website hosting path. The old local-file schema and cleanup endpoints remain for compatibility only; new local uploads are rejected. The production migration verifies that every existing image has a Convex storage ID before cutover.

## Production and development

Production uses `striped-ant-274`; development uses `opulent-partridge-532`. The clients' ignored `.env.local` files point to production after cutover. Backend `.env.local` continues to identify the development deployment, so `convex dev` never silently edits production. Use explicit `--prod` for production CLI reads/migrations and `pnpm deploy:backend` for an authorized production code deploy. To work with development data in a client, explicitly override both client Convex URLs with the development deployment's URLs and rebuild/restart that client.

See [the production cutover record](packages/backend/PRODUCTION.md) for migration verification, authentication, storage and rollback details. Production needs its own JWT signing keys; browser Google login needs its production callback registered in Google Cloud. Users must sign in to the production app again. Development is retained as a temporary rollback source and receives no production writes.

## Enable Google sign-in

1. Create a Web application OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/overview). Configure its consent screen and add both of your Google accounts as test users while the OAuth app is in testing.
2. Add `https://notes.nishitnagar.com` and `http://localhost:5173` as authorized JavaScript origins.
3. Add your Convex HTTP actions callback URL as an authorized redirect URI. For production it is:

   ```text
   https://striped-ant-274.convex.site/api/auth/callback/google
   ```

4. In the [production deployment's environment settings](https://dashboard.convex.dev/d/striped-ant-274/settings/environment-variables), set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` to your OAuth client values. Set `SITE_URL=https://notes.nishitnagar.com` and `ALLOWED_ORIGINS=http://localhost:5173` to support both the hosted app and local development. The setup script configures `JWT_PRIVATE_KEY` and `JWKS` without printing them; it preserves existing keys.
5. Reload the app. The Google button becomes available when the required settings exist. Sign in, create a board, and use **Board Settings → Create invitation link** to invite your partner. Members can share invites too. Invitees request to join after signing in, and a board admin approves or rejects each request.

Google OAuth is implemented through [Convex Auth](https://labs.convex.dev/auth/config/oauth/google), which is currently beta. No Google password is handled by nico notes. There is no password, anonymous sign-in, or demo-account fallback in the application.

Browser sessions and the last-used board preference use the `nico-notes` namespace. Sign in again after upgrading or moving to the new domain; boards, visits, and photos stay in the existing backend.

## What is included

- Private boards with one or more admins and up to 20 members. Invite links expire after seven days. Members can create or copy the active link; only admins can revoke links or regenerate the board code.
- Independent visits, even when returning to the same restaurant. Each visit has its own dishes, categories, notes, and photos.
- Board-specific type presets, such as Food or Trek, copied into visits. Changing or deleting a preset does not change past visits.
- Individual dish, category, and optional overall ratings from 1–10 in half-point increments. Each person can update or clear only their own rating. Averages exclude unrated people and never substitute for overall ratings.
- Up to 50 dishes, 50 categories, 2,000 submitted ratings, and 10 photos per visit; up to 50 reusable types per board. JPEG, PNG, and WebP images up to 10 MB each. Export HEIC photos to JPEG before uploading.
- Authenticated journal photo reads; no public journal-photo storage URLs in the frontend API. Upload reservations belong to the signed-in user. MIME signatures and sizes are validated on the backend.
- Internal soft deletion with owner-assisted recovery and no Trash UI. Account deletion has a disclosed 30-day recovery window before permanent cleanup. See [operator recovery instructions](packages/backend/PRODUCTION.md#internal-deletion-recovery).
- Scheduled cleanup for expired upload reservations, orphan files and account erasure.
- A board Notifications tab on Android and web with live change history, member names, timestamps, unread indicators, and per-member read state. History starts when this feature is deployed; earlier changes are not reconstructed.
- Desktop and mobile layouts, keyboard-accessible dialogs, loading and error states, and input preservation after failed saves.

Members can edit shared details, dishes, and types. Admins manage membership and boards, promote other members, and can enter ratings on behalf of any current member. Every board must retain at least one admin. The visit creator or admin can delete a visit; photo uploaders or admins can remove photos or edit captions. Removing someone preserves their historical contributions. Removed members must request access again and receive admin approval before rejoining.

Boards, visits, and gallery data update reactively. Already viewed/downloaded photos cannot be recalled from another person's device when access is removed. The application does not offer public sharing, offline sync, or special trip structures.

## Packages and commands

| Package            | Purpose                                           | Development        | Deployment/build      |
| ------------------ | ------------------------------------------------- | ------------------ | --------------------- |
| `apps/web`         | React SPA, Vite+, interface and responsive styles | `pnpm dev:web`     | `pnpm build`          |
| `packages/backend` | Convex functions, auth, database, storage         | `pnpm dev:backend` | `pnpm deploy:backend` |

The backend package exports `@nico-notes/backend/api`, `@nico-notes/backend/dataModel`, and `@nico-notes/backend/shared`. Generated Convex bindings are included with source; regenerate them with `pnpm --filter @nico-notes/backend codegen` after backend changes. Frontend calls use typed queries and mutations, not a separate REST server. Convex HTTP actions handle cloud photo uploads and reads. The Mac does not handle journal image uploads or reads.

Theme tokens and responsive styles are in `apps/web/src/styles.css`. Epilogue and Plus Jakarta Sans are bundled locally. The supplied palette is used throughout, with darker shades for text and buttons.

## Validation

```sh
pnpm check       # Vite+ formatting/lint checks and both package type checks
pnpm test        # Convex integration tests, using an in-memory test backend
pnpm build      # Production SPA output in apps/web/dist
```

Browser tests exercise the real **development** backend, including two independent authenticated sessions, live shared ratings, photo uploads, board removal permissions, mobile forms, keyboard dismissal, and enlarged text:

```sh
pnpm --filter @nico-notes/backend exec convex dev --once
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser harness requires Convex CLI access and configured development signing keys. It rejects production deployments, temporarily enables internal-only fixture functions, creates four disposable users, and signs one-hour test tokens outside the browser. Teardown removes test accounts, schedules deletion of their boards, disables fixtures, and removes saved tokens. This verifies authenticated app behavior; **it does not verify Google's consent/redirect flow**. If a test process is forcibly killed, before starting another run clean up only the generated users via `testing:removeUsers`, using their IDs from ignored `test-results/users.json` while the fixture flag is enabled. Then remove `NICO_NOTES_E2E_ENABLED` from the development environment and delete the saved user/token JSON files.

Screenshots and test reports stay in ignored `test-results/`. They may contain temporary test data and should not be published.

## Deploy later

1. Create/select the production Convex deployment. Configure its own Google OAuth client settings, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS`. Development environment variables do not automatically carry into production. Generate a fresh signing-key pair for production using the official [Convex Auth setup](https://labs.convex.dev/auth/setup/manual).
2. Add the production Convex callback URI to Google and set `SITE_URL=https://notes.nishitnagar.com`. If serving more than one trusted frontend origin, set the comma-separated `ALLOWED_ORIGINS` for redirects and photo requests accordingly.
3. Run `pnpm deploy:backend`. Set the frontend build environment to the production `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`, then run `pnpm build`.
4. Run `pnpm deploy:web` to publish `apps/web/dist` to the existing Cloudflare Pages project. The custom domain stays `notes.nishitnagar.com`.
5. Verify Google sign-in with both accounts, member invitations and admin approval, a shared rating, photo upload, and direct-link navigation on the final domain. Keep `NICO_NOTES_E2E_ENABLED` unset in production.

Development data is separate from production data. There is no automatic data migration or public publishing step.

## Maps and imported Bangalore notes

Boards use Google Maps with saved-place markers, clustering, and Google Places search. The board map requests browser location and frames a 10 km radius around the user. Nearby place search is restricted to that radius; saved visits remain accessible everywhere. Selecting a saved place moves to that place; “Show all saved pins” explicitly fits the full collection. If location is unavailable, the map uses the first saved pin (or Bangalore for an empty board). Coordinates are kept in memory and are not saved to the account.

Set `VITE_GOOGLE_MAPS_API_KEY` in `apps/web/.env.local`, enable **Maps JavaScript API** and **Places API (New)** in the same Google Cloud project, and enable billing. Restrict the browser key to those APIs and your app’s HTTP referrers (`http://localhost:5173/*` and `https://notes.nishitnagar.com/*`). Restart the frontend after changing environment values. Optionally set `VITE_GOOGLE_MAPS_MAP_ID` to your own JavaScript map ID; local development defaults to `DEMO_MAP_ID`. See [Google’s setup guide](https://developers.google.com/maps/documentation/javascript/get-api-key). Browser location requires HTTPS or localhost and the user’s permission. Without a configured key the app shows a map-unavailable state while saved lists and manual coordinate entry remain usable.

Google Maps links open a coordinate or venue search. In the visit editor, use **Set map pin** to tap a location, use the location button to center nearby, or paste coordinates/a full Google Maps URL. A short sharing URL must first be opened in Google Maps to obtain coordinates.

Search uses **Places API (New)**, not the legacy **Places API**. If the map loads but search reports `PERMISSION_DENIED` with `Places.SearchText ... blocked`, enable Places API (New) in the project's API Library and allow it in the key's API restrictions. Keep Maps JavaScript API and the website restrictions. Allow up to five minutes for changes to apply, then use **Try again** in the search results. Without device location, search uses Google's default location bias; include a city or area in the query to be specific. Selecting **Add visit** on a result pre-fills the venue name, address, and map pin.

The user-provided dataset in `packages/backend/imports/bangalore.ts` contains 22 visits across 21 places. Verified pin coordinates carry source URLs in the fixture; ambiguous branches remain unpinned with search links. Dates were not supplied and stay blank (“Date not recorded”). Mansi’s 8.59 is represented as 8.5 with the original value in the note. Uttari Betta’s unattributed Photos 10/10 remains a note rather than being assigned to either person. Missing scores stay unrated.

The operator-only `importNotes:bangalore` mutation imports into Nishit’s board, once per import key. Re-running skips existing visits and scores, and only fills newly verified missing locations. It is not callable from a browser. Nishit’s ratings belong to his real account; Mansi’s are explicitly attributed historical ratings marked “From your notes,” without an invented user or login. They are read-only until a future explicit account-linking step; she can join the board normally via invitation. Do not import them again as new personal scores when linking accounts.

```sh
pnpm --filter @nico-notes/backend exec convex run importNotes:bangalore '{"boardId":"YOUR_BOARD_ID"}'
```

## Places and visit numbering

Places belong to a board. Visits match a Google Maps Place ID first, then a normalized name and address. Different known Google IDs remain separate even when their labels match. A place owns its address and pin; visit documents keep copies so board cards and maps read them directly. Editing place details updates those copies. Choosing another place for a visit moves that visit. Edit a visit’s place details to correct its address or pin.

Visit numbers are per place, ordered by visit date and then creation order. Undated visits sort first. Backdating, moving, and deleting visits recalculates the numbers. Atomic updates support up to 2,000 visits per place per board and reject changes above that limit rather than leaving partial numbering.

Existing visits link automatically in scheduled batches when a member opens the board or its places pages. After deploying the new schema and functions, an operator can also run the idempotent backfill (no public migration endpoint):

```sh
# Current configured deployment; all boards
pnpm --filter @nico-notes/backend exec convex run places:backfill '{}'
# Or one board
pnpm --filter @nico-notes/backend exec convex run places:backfill '{"boardId":"BOARD_ID"}'
```

The backfill schedules bounded work and can be rerun. Run it only after deployment is explicitly authorized.

Deployments containing legacy place records with `key` instead of `matchKey` first need a lookup-key migration. Temporarily make `places.matchKey` optional, deploy, then run `migrations:placeMatchKeys` with `{"cursor":null}`. Pass each returned `nextCursor` into the next call until it is null. Restore the required validator and deploy again. The mutation only fills normalized lookup keys; it preserves every original ID, field and visit link. The optional legacy metadata fields remain accepted by the schema.

Sign-in redirects accept root-relative paths or legacy absolute URLs with exactly the `SITE_URL` origin. `ALLOWED_ORIGINS` continues to control photo CORS; it does not expand sign-in redirect destinations.

## Google Maps content

Google place IDs are durable references. Google-supplied names, addresses, coordinates and attributions are fetched live by the Android Places SDK or Maps JavaScript Places library and projected into client views. The bounded in-memory cache expires after five minutes; it is never written to Convex, browser local storage or device files. Saved Google places show a neutral label if live details cannot load. Manually entered places and pins are journal data and stay saved. Lookup requests may incur Google Maps Platform usage charges.

Google attribution and provider links accompany Places content. Public Terms and Privacy pages link Google's policies. The Android native Places module changed, so install a fresh native build; Metro/JavaScript reload alone cannot add the new lookup method. Recheck API key restrictions and SDK disclosures when changing Google dependencies.
