# nico notes

A private place for shared visits, visit photos, and each person's ratings. React + TypeScript + Vite+ on the frontend; Convex database, realtime functions and Google authentication on the backend. New photo files use Convex Storage by default. Board admins can opt into local storage on the Mac mini later.

App URL: [notes.nishitnagar.com](https://notes.nishitnagar.com).

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

Open [localhost:5173](http://localhost:5173). After initial configuration, `pnpm dev` runs both packages together. The frontend is local; its data lives in your Convex development deployment. Never put OAuth secrets or signing keys in a `VITE_` variable.

This workspace has already been connected to the existing `opulent-partridge-532` development deployment. The frontend environment and development signing keys have been configured. **Google OAuth credentials still need to be supplied** before the two of you can sign in.

## Run on another computer

Install Node.js 24 and pnpm 10.33.3, then copy this repository (including `.git` if you want its history), or clone it after configuring a Git remote and pushing. Install dependencies with `pnpm install --frozen-lockfile`; do not copy `node_modules` or build output.

To use the existing backend and data, securely copy `apps/web/.env.local` and `packages/backend/.env.local` from this computer to the same paths. These files are ignored by Git. The frontend file contains the Convex URLs and browser Maps key. Google OAuth credentials and signing keys already configured on the Convex deployment stay there; do not regenerate them for a computer move.

Run `pnpm dev:web` and open `http://localhost:5173` to use the existing deployed backend. To work on backend code too, run `pnpm dev:backend`, authenticate with the Convex account that has project access, and select the existing development deployment. This syncs backend code to that deployment. After setup, `pnpm dev` runs both packages. A new Convex deployment has separate data and needs its own authentication setup.

To move the hosted app, also install Caddy and cloudflared, securely transfer `~/.cloudflared/config.yml` and its referenced tunnel credentials, and update machine-specific credential paths. Keep ingress pointed at `http://localhost:8080`. Stop the old host's tunnel before starting `pnpm start` on the new host. The startup script uses Unix process groups; use macOS, Linux, or WSL for this hosting workflow. If the public hostname changes, update the tunnel/DNS, Convex `SITE_URL`/`ALLOWED_ORIGINS`, Google OAuth origins, and Maps key referrers. The OAuth callback stays the same when the Convex deployment stays the same.

If any photos use local storage, also copy the complete photo directory (normally `~/pics/notes`) and `packages/backend/.env.photos.local`. Update its `PHOTO_STORAGE_DIR` to the new absolute path while preserving `LOCAL_PHOTO_SECRET`, then run `pnpm start --local-photos`. Switching new uploads to Convex does not migrate older local files. Convex-hosted photos and database records need no copying when reusing the same deployment.

## Start everything on the Mac mini

From this repository, run:

```sh
pnpm start
```

This builds the web app, starts Caddy, then runs the Cloudflare tunnel from `~/.cloudflared/config.yml`. Configure its ingress hostname as `notes.nishitnagar.com`, pointing to `http://localhost:8080`. Caddy serves the built app on port 8080 and forwards `/photos/*` to the photo service on port 8788. Its static root is relative to the repository, so run Caddy from the repository root.

Keep this terminal open. Press **Ctrl+C** to stop the processes this command started. Convex photos do not require the local photo service. To also start it for existing local photos or boards using local storage, run `pnpm start --local-photos`; an already-running photo service is reused and stays running. Stop separately launched Caddy and Cloudflare processes before using this command; it reports occupied ports without killing existing processes. If one of the managed services fails, the others started here are stopped too. This command does not deploy or test the Convex backend.

Set `CLOUDFLARED_CONFIG` if your tunnel configuration is in a different file.

## Photo storage

New uploads use Convex Storage, including on existing boards without a storage preference. Uploads and reads go directly to authenticated Convex HTTP actions at `VITE_CONVEX_SITE_URL`; each request checks current board membership. No public download URLs are exposed. Set `SITE_URL` to the hosted app origin and `ALLOWED_ORIGINS` to additional origins, such as local development; both are accepted for photo requests.

Admins can change **Board Settings → Photo storage → Store new photos in** for each board. Members cannot change this setting. The choice applies to new upload reservations; existing photos continue to read from their original storage and are not moved or deleted.

### Optional local storage on the Mac mini

After setup and selecting **Local storage (Mac mini)** in Board Settings, new pictures are stored in `~/pics/notes` as private JPEG, PNG, or WebP files with a `nico-notes-` prefix. Files saved under an earlier brand prefix remain readable and are included in authorized cleanup by their unique disk key. For these local files, Convex keeps their visit, uploader, caption, and disk key. Convex-hosted photos remain readable directly from Convex.

One-time setup (configures the currently selected backend, never prints the service secret):

```sh
pnpm --filter @nico-notes/backend setup:photos --configure-backend
```

Keep the photo service running on the Mac mini alongside the app, then select local storage in Board Settings:

```sh
pnpm photos
```

The service listens on `127.0.0.1:8788`. Vite dev and preview proxy `/photos` to it, so phones accessing this app through the Mac mini use the same folder. Any other frontend host must also proxy `/photos` to this service securely. The Mac mini photo service must be online for local photo uploads and viewing. The service's credential and folder are stored in ignored `packages/backend/.env.photos.local`; never expose that credential through a `VITE_` variable.

The New visit form includes an optional picture picker below notes. It previews the selected file, uploads after saving the visit, and lets failed uploads retry without creating another visit. Each request verifies current board access. Photo and visit deletion queue disk cleanup, processed every minute while the service runs. Incomplete uploads whose registration never succeeds may leave a file on disk; the service never scans or deletes unrelated files in this folder.

Back up `~/pics/notes` with your Mac backups. Nothing migrates or deletes existing cloud photos automatically.

## Enable Google sign-in

1. Create a Web application OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/overview). Configure its consent screen and add both of your Google accounts as test users while the OAuth app is in testing.
2. Add `https://notes.nishitnagar.com` and `http://localhost:5173` as authorized JavaScript origins.
3. Add your Convex HTTP actions callback URL as an authorized redirect URI. For the configured development deployment it is:

   ```text
   https://opulent-partridge-532.convex.site/api/auth/callback/google
   ```

4. In the [development deployment's environment settings](https://dashboard.convex.dev/d/opulent-partridge-532/settings/environment-variables), set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` to your OAuth client values. Set `SITE_URL=https://notes.nishitnagar.com` and `ALLOWED_ORIGINS=http://localhost:5173` to support both the hosted app and local development. The setup script configures `JWT_PRIVATE_KEY` and `JWKS` without printing them; it preserves existing keys.
5. Reload the app. The Google button becomes available when the required settings exist. Sign in, create a board, and use **Board Settings → Create invitation link** to invite your partner. Members can share invites too. Invitees request to join after signing in, and a board admin approves or rejects each request.

Google OAuth is implemented through [Convex Auth](https://labs.convex.dev/auth/config/oauth/google), which is currently beta. No Google password is handled by nico notes. There is no password, anonymous sign-in, or demo-account fallback in the application.

Browser sessions and the last-used board preference use the `nico-notes` namespace. Sign in again after upgrading or moving to the new domain; boards, visits, and photos stay in the existing backend.

## What is included

- Private boards with one or more admins and up to 20 members. Invite links expire after seven days. Members can create or copy the active link; only admins can revoke links or regenerate the board code.
- Independent visits, even when returning to the same restaurant. Each visit has its own dishes, categories, notes, and photos.
- Board-specific type presets, such as Food or Trek, copied into visits. Changing or deleting a preset does not change past visits.
- Individual dish, category, and optional overall ratings from 1–10 in half-point increments. Each person can update or clear only their own rating. Averages exclude unrated people and never substitute for overall ratings.
- Up to 50 dishes, 50 categories, 2,000 submitted ratings, and 10 photos per visit; up to 50 reusable types per board. JPEG, PNG, and WebP images up to 10 MB each. Export HEIC photos to JPEG before uploading.
- Authenticated photo reads; no public storage URLs in the frontend API. Upload reservations belong to the signed-in user. MIME signatures and sizes are validated on the backend.
- Scheduled cleanup for board deletion, expired upload reservations, and unreferenced files older than a day.
- Desktop and mobile layouts, keyboard-accessible dialogs, loading and error states, and input preservation after failed saves.

Members can edit shared details, dishes, and types. Admins manage membership and boards, promote other members, and can enter ratings on behalf of any current member. Every board must retain at least one admin. The visit creator or admin can delete a visit; photo uploaders or admins can remove photos or edit captions. Removing someone preserves their historical contributions. Removed members must request access again and receive admin approval before rejoining.

Boards, visits, and gallery data update reactively. Already viewed/downloaded photos cannot be recalled from another person's device when access is removed. The application does not offer public sharing, offline sync, or special trip structures.

## Packages and commands

| Package            | Purpose                                           | Development        | Deployment/build      |
| ------------------ | ------------------------------------------------- | ------------------ | --------------------- |
| `apps/web`         | React SPA, Vite+, interface and responsive styles | `pnpm dev:web`     | `pnpm build`          |
| `packages/backend` | Convex functions, auth, database, storage         | `pnpm dev:backend` | `pnpm deploy:backend` |

The backend package exports `@nico-notes/backend/api`, `@nico-notes/backend/dataModel`, and `@nico-notes/backend/shared`. Generated Convex bindings are included with source; regenerate them with `pnpm --filter @nico-notes/backend codegen` after backend changes. Frontend calls use typed queries and mutations, not a separate REST server. Convex HTTP actions handle cloud photo uploads and reads. The optional local photo service handles bytes only for local storage and authorizes requests with Convex.

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
4. Host `apps/web/dist` on a static host with HTTPS and an SPA fallback rewriting application routes to `/index.html`. Frontend hosting is intentionally not provisioned by this implementation.
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
