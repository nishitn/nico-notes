# Date Notes

A private place for shared dates, visit photos, and each person's ratings. React + TypeScript + Vite+ on the frontend; Convex database, realtime functions, storage, and Google authentication on the backend.

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
pnpm --filter @date-notes/backend setup:auth
pnpm dev:web
```

Open [localhost:5173](http://localhost:5173). After initial configuration, `pnpm dev` runs both packages together. The frontend is local; its data lives in your Convex development deployment. Never put OAuth secrets or signing keys in a `VITE_` variable.

This workspace has already been connected to the `date-notes` project and its `opulent-partridge-532` development deployment. The frontend environment and development signing keys have been configured. **Google OAuth credentials still need to be supplied** before the two of you can sign in.

## Enable Google sign-in

1. Create a Web application OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/overview). Configure its consent screen and add both of your Google accounts as test users while the OAuth app is in testing.
2. Add `http://localhost:5173` as an authorized JavaScript origin.
3. Add your Convex HTTP actions callback URL as an authorized redirect URI. For the configured development deployment it is:

   ```text
   https://opulent-partridge-532.convex.site/api/auth/callback/google
   ```

4. In the [development deployment's environment settings](https://dashboard.convex.dev/d/opulent-partridge-532/settings/environment-variables), set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` to your OAuth client values. `SITE_URL` should be `http://localhost:5173`. The setup script configures `JWT_PRIVATE_KEY` and `JWKS` without printing them; it preserves existing keys.
5. Reload the app. The Google button becomes available when the required settings exist. Sign in, create a board, and use **Board settings → Create invitation link** to invite your partner. They explicitly accept after signing in with their own account.

Google OAuth is implemented through [Convex Auth](https://labs.convex.dev/auth/config/oauth/google), which is currently beta. No Google password is handled by Date Notes. There is no password, anonymous sign-in, or demo-account fallback in the application.

## What is included

- Private boards with a creator/owner and up to 20 members. Invite links expire after seven days; generating a replacement invalidates the previous link.
- Independent visits, even when returning to the same restaurant. Each visit has its own dishes, categories, notes, and photos.
- Board-specific type presets, such as Food or Trek, copied into visits. Changing or deleting a preset does not change past visits.
- Individual dish, category, and optional overall ratings from 1–10 in half-point increments. Each person can update or clear only their own rating. Averages exclude unrated people and never substitute for overall ratings.
- Up to 50 dishes, 50 categories, 2,000 submitted ratings, and 10 photos per visit; up to 50 reusable types per board. JPEG, PNG, and WebP images up to 10 MB each. Export HEIC photos to JPEG before uploading.
- Authenticated photo reads; no public storage URLs in the frontend API. Upload reservations belong to the signed-in user. MIME signatures and sizes are validated on the backend.
- Scheduled cleanup for board deletion, expired upload reservations, and unreferenced files older than a day.
- Desktop and mobile layouts, keyboard-accessible dialogs, loading and error states, and input preservation after failed saves.

Members can edit shared details, dishes, and types. Only owners manage membership and boards. The visit creator or owner can delete a visit; photo uploaders or owners can remove photos or edit captions. Removing someone preserves their historical contributions. Revoke a still-active invitation if you don't want that person to rejoin.

Boards, visits, and gallery data update reactively. Already viewed/downloaded photos cannot be recalled from another person's device when access is removed. The application does not offer public sharing, offline sync, maps, or special trip structures.

## Packages and commands

| Package            | Purpose                                           | Development        | Deployment/build      |
| ------------------ | ------------------------------------------------- | ------------------ | --------------------- |
| `apps/web`         | React SPA, Vite+, interface and responsive styles | `pnpm dev:web`     | `pnpm build`          |
| `packages/backend` | Convex functions, auth, database, storage         | `pnpm dev:backend` | `pnpm deploy:backend` |

The backend package exports `@date-notes/backend/api`, `@date-notes/backend/dataModel`, and `@date-notes/backend/shared`. Generated Convex bindings are included with source; regenerate them with `pnpm --filter @date-notes/backend codegen` after backend changes. Frontend calls use typed queries and mutations, not a separate REST server. The two authenticated HTTP endpoints handle photo bytes.

Theme tokens and responsive styles are in `apps/web/src/styles.css`. Epilogue and Plus Jakarta Sans are bundled locally. The supplied palette is used throughout, with darker shades for text and buttons.

## Validation

```sh
pnpm check       # Vite+ formatting/lint checks and both package type checks
pnpm test        # Convex integration tests, using an in-memory test backend
pnpm build      # Production SPA output in apps/web/dist
```

Browser tests exercise the real **development** backend, including two independent authenticated sessions, live shared ratings, photo uploads, board removal permissions, mobile forms, keyboard dismissal, and enlarged text:

```sh
pnpm --filter @date-notes/backend exec convex dev --once
pnpm exec playwright install chromium
pnpm test:e2e
```

The browser harness requires Convex CLI access and configured development signing keys. It rejects production deployments, temporarily enables internal-only fixture functions, creates four disposable users, and signs one-hour test tokens outside the browser. Teardown removes test accounts, schedules deletion of their boards, disables fixtures, and removes saved tokens. This verifies authenticated app behavior; **it does not verify Google's consent/redirect flow**. If a test process is forcibly killed, before starting another run clean up only the generated users via `testing:removeUsers`, using their IDs from ignored `test-results/users.json` while the fixture flag is enabled. Then remove `DATE_NOTES_E2E_ENABLED` from the development environment and delete the saved user/token JSON files.

Screenshots and test reports stay in ignored `test-results/`. They may contain temporary test data and should not be published.

## Deploy later

1. Create/select the production Convex deployment. Configure its own Google OAuth client settings, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS`. Development environment variables do not automatically carry into production. Generate a fresh signing-key pair for production using the official [Convex Auth setup](https://labs.convex.dev/auth/setup/manual).
2. Add the production Convex callback URI to Google and set `SITE_URL` to your frontend's HTTPS origin. If serving more than one trusted frontend origin, set the comma-separated `ALLOWED_ORIGINS` for photo requests accordingly.
3. Run `pnpm deploy:backend`. Set the frontend build environment to the production `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`, then run `pnpm build`.
4. Host `apps/web/dist` on a static host with HTTPS and an SPA fallback rewriting application routes to `/index.html`. Frontend hosting is intentionally not provisioned by this implementation.
5. Verify Google sign-in with both accounts, invitation acceptance, a shared rating, photo upload, and direct-link navigation on the final domain. Keep `DATE_NOTES_E2E_ENABLED` unset in production.

Development data is separate from production data. There is no automatic data migration or public publishing step.
