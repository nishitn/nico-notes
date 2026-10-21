# Production cutover — 21 October 2026

Production: `striped-ant-274` ([dashboard](https://dashboard.convex.dev/d/striped-ant-274)). Development/rollback source: `opulent-partridge-532`. This document records the current change; the earlier RELEASE.md is historical.

## Storage and data

Only Convex accepts new image uploads. Existing data was exported as a complete ZIP with file storage, preserving document IDs, creation times and all foreign keys. Before import, production had no tables or environment variables. Source inventory: 2 users, 1 board, 2 memberships, 24 visits (including 1 planned visit), 22 places, 57 dishes, 6 categories, 103 ratings, 1 wishlist reference and 5 images. There were no locally stored photos or pending local uploads.

Use full-snapshot import with file storage, never separate table imports or copied public image URLs. The internal `releaseMigrations:convexOnlyAndPlaceReferences` migration processes bounded pages: boards use Convex, Google Places snapshots are removed, place IDs and journal content remain. It is restricted to operator deployment access; no client can invoke it. No personal notes, ratings, dishes or images are removed by this migration.

The legacy local-file schema/read/cleanup endpoints remain for old data compatibility, but new local uploads are rejected and the production environment has no local-photo secret. Caddy and the startup script no longer route or start a local photo service.

## Authentication and clients

The production environment has the existing Google client ID/secret, fresh production JWT signing keys, SITE_URL for the public website and the operator moderator allowlist. Credentials are transferred through private temporary files and are never committed or printed. E2E fixture flags and local-photo credentials are not copied.

Required Google web redirect: `https://striped-ant-274.convex.site/api/auth/callback/google`. The old development redirect can remain for development. The production callback must be saved in the `niconotes-web` client under project `nishitnagar`. Native Google sign-in uses the same server audience and does not depend on this web redirect.

Web and Android client URL configuration switches together to production. Backend `.env.local` retains the development selection; deploy production only explicitly. Tokens from the old backend must not be treated as valid production JWTs; users sign in again. Keep `NICO_NOTES_E2E_ENABLED` unset in production.

The initial production JWKS value contained escaped JSON quotes and caused an authentication-provider discovery failure. It was corrected to a JSON object matching the production signing key. Validate both public well-known endpoints as JSON and test authenticated WebSocket queries as well as HTTP reads after changing signing configuration. React Native's development error overlay can retain an earlier failure after authentication recovers; dismiss it to inspect the current screen.

## Maps and policies

Website hosting now uses the free Cloudflare Pages project `nico-notes`: `notes.nishitnagar.com` points to `nico-notes.pages.dev`. This is a static Direct Upload deployment with no Functions or paid bindings. Redeploy using `pnpm deploy:web`; Git pushes alone do not publish it. Convex authentication origins and Google callback URLs stay unchanged because the custom hostname stays unchanged. The Mac hosting process and tunnel are no longer required. The prior CNAME target, retained for intentional rollback, is `56ce7293-affc-4922-8c5e-41553c920a79.cfargotunnel.com`.

Google place references are stored as IDs only. Google names, addresses, coordinates and attributions load via client SDKs and a bounded, expiring memory cache, without database or disk persistence. Manual names and pins remain journal data. Failed lookups show a neutral label, not an old cached SDK response. API usage is billable under the Google Cloud project's existing setup.

Privacy, Terms/community rules, Help and Delete-account pages are public before authentication. They identify Nishit Nagar and the support email; describe Convex-only images, Cloudflare website delivery, Google SDK data, optional permissions, access controls, deletion and retention; and link provider policies. They do not claim a legal certification, an uptime SLA, end-to-end encryption or a fixed provider-backup retention period. New terms version `2026-10-21.1` requires renewed acceptance.

## Operator responsibilities

Monitor support email and the authenticated moderation queue. Aim to finish verified privacy/deletion requests within 30 days and communicate delays. Review resolved support/safety records and remove them when no longer needed. Provider backups and logs follow the providers' schedules; keep recovery copies access-restricted and reapply deletion requests after any restore. Do not re-import a pre-deletion snapshot over current production data.

The temporary migration snapshot contains personal data and auth records. Keep it private until verification, then remove temporary local snapshot copies. Development remains available as a rollback source for this cutover; plan its retirement after acceptance, and honor any deletion request across retained copies. No ongoing automatic backup schedule is claimed to be configured.

## Verification and rollback

Run `pnpm check`, `pnpm test`, `pnpm build`, the native Android compilation and `pnpm test:navigation`. Verify production inventory and SHA-256 image hashes against the export, check schema/function push success, public policy URLs, Google sign-in, shared reads and authenticated image access. Do not run the E2E fixture setup against production.

Before accepting live writes, rollback can point clients back to the original development URLs. After production receives real writes, a rollback needs reconciliation; blindly restoring the original snapshot would lose changes. The production import and source development data are distinct copies.

Development access was not retired: automatic approval review rejected the proposed persistent retirement flag. Old installed clients can still target development until rebuilt; the hosted website and new client builds target production. No retirement flag was set.

## Internal deletion recovery

Ordinary deletion archives content and preserves associated images. Archived records and descendants of an archived board/visit are excluded from normal reads, writes and image delivery. There is no Trash screen or customer restore API. This preserves deletion history, not every earlier edit. Retained images continue to use Convex storage.

Account deletion immediately closes access and revokes sessions. A disclosed 30-day support recovery window follows; the half-hourly cleanup job starts permanent erasure after that window. Signing in does not cancel deletion. Verified requests for earlier permanent erasure can be processed by the operator. Permanent erasure also removes archived personal contributions and retained profile images.

Recovery functions are internal and require Convex deployment access. Verify the requester’s identity, current board access and consent before recovery. Use a ticket reference rather than personal information in the reason. Recovery checks parent records, current blocking rules, limits and conflicting newer data. A recovered account must sign in afresh.

From `packages/backend`, inspect deletion batches with:

```sh
pnpm exec convex run --prod recovery:list '{"paginationOpts":{"cursor":null,"numItems":50}}'
pnpm exec convex run --prod recovery:restore '{"deletionId":"REPLACE_ID","reason":"Verified support ticket 123"}'
pnpm exec convex run --prod recovery:restoreAccount '{"userId":"REPLACE_ID","reason":"Verified support ticket 123"}'
pnpm exec convex run --prod recovery:restoreProfilePhoto '{"fileId":"REPLACE_ID","reason":"Verified support ticket 123"}'
```

For an explicitly verified request to erase sooner, after account deletion has been requested:

```sh
pnpm exec convex run --prod recovery:eraseAccountNow '{"userId":"REPLACE_ID","confirmation":"ERASE PERSONAL DATA","reason":"Verified erasure ticket 123"}'
```

That last operation starts irreversible personal-data cleanup. Never recover data erased for privacy reasons or restore old snapshots over current production.

## Android internal test — 21 October 2026

The first local release bundle is version 1.0.0, version code 1, package `com.nishitnagar.notes`, target API 36, minimum API 24. It embeds only the production Convex URLs and the public website origin. The signed artifact is `.release/android/nico-notes-1.aab`; its SHA-256 is `43327e66c0b0b5803378ff8890202fd97cd2c173a27694d8654556556e366491`.

The owner approved adding the Google Play app-signing identity to Google OAuth and the existing Android Maps/Places key. OAuth client `niconotes-android-prod` uses Play SHA-1 `A1:BB:19:06:70:45:CE:10:C8:30:01:95:1B:13:F8:FF:F6:90:60:2F`. The same package/certificate pair is allowed on `niconotes-maps-android`, retaining its two-API restriction (Maps SDK for Android and Places API New). Existing development and Web OAuth registrations remain. The new Android client is a platform identity; do not replace the backend’s Web OAuth client ID with it.

Play app-signing SHA-256: `CA:A7:E3:CE:8F:8E:10:84:68:00:B2:E1:D7:C7:12:D1:66:C4:2F:A0:F9:A6:08:71:E6:2F:60:32:3A:D1:28:80`. The local upload signing certificate is separate; upload key SHA-256: `5D:04:58:F1:83:EC:F6:88:4F:5D:93:4A:37:FD:0A:C1:DA:E5:D8:B9:9A:0F:E0:20:77:06:84:8A:B7:B2:19:62`. Back up `.release/android/upload.p12` and `.release/android/signing.json` privately.

Verification: 205 tests pass, formatting/lint/type checks pass, native release compilation succeeds. Bundletool validates the AAB; its signer matches the dedicated upload key. All 48 included 64-bit ELF libraries support 16 KB load alignment; bundle configuration requests 16 KB native packaging, and an APK generated from the bundle passes `zipalign -c -P 16 4`. The final manifest is not debuggable, has no audio recording, background-location or development overlay permission, and limits legacy external-storage permissions to API 32. Actual Play installation, sign-in and map rendering still need the owner’s device check.

Published successfully to Play’s internal testing track on 21 October 2026 at 11:23 IST. Console status: **Active**, **Available to internal testers**. Selected email list: `nico notes internal testers`, one user (`nishit.nagar1@gmail.com`). Opt-in link: https://play.google.com/apps/internaltest/4701633072845081000 . Play may temporarily show `com.nishitnagar.notes (unreviewed)` until the store setup and first review are complete. This is an internal test release, not a public production rollout.

## Google-only review access — 21 October 2026

The owner chose Google-only authentication with a separate Google review account. The password provider, alternate welcome-screen form and password-account provisioning script have been removed. Production accepts only Google web OAuth and verified native Google ID tokens.

The operator-only `reviewer:retirePasswordAccount` migration suspends only the legacy `play-reviewer` identity and schedules normal session revocation. It refuses to act if that identity has a linked Google provider account. Suspension immediately denies existing-token access through the normal authorization checks. Fictional demo records are preserved. This migration ran on production successfully; a read-only check confirmed suspension and zero remaining legacy sessions. The old password file remains a private retired operator record; the current `.release/reviewer/play-console.txt` explicitly rejects that old identity.

The owner created `nicotech.review@gmail.com` directly in Google, including its password, verification and Google terms. Its ordinary Google OAuth login into Nico Notes was verified in the browser. Nico Notes terms were accepted with the owner's explicit approval. The account has its own private **App Review** board (renamed by the owner from **Play Store review**) and a fictional **Coffee with friends** visit, sample notes, rating categories, an 8/10 overall rating and a Cappuccino dish rated 8.5/10. It has no membership in the owner's personal boards.

The supplied Google password and ordinary Android account-selection instructions are saved in Play Console **Sign-in details**, replacing the retired app-password credentials. Optional testing on Google/trusted-partner devices remains disabled. The Google password was not written to the workspace; `.release/reviewer/google-review.json` contains only account/board metadata. Anyone holding the Google password can access that whole test Google account, so keep it limited to review-related information. Google may still request account-security verification on a new device or location; test reviewer access without depending on a code or approval from the owner.

Android now starts `GetSignInWithGoogleOption` directly when the Google button is tapped. The previous `GetGoogleIdOption` bottom sheet could offer only device accounts, leaving no way to add an account from the displayed sheet. Google's explicit button flow supports account addition. The nonce, server audience and backend Google token verification remain unchanged. The saved Play instructions also provide the device Settings > Accounts > Add account > Google path when the review identity is not listed.

The signed replacement is `.release/android/nico-notes-3.aab`, version 1.0.0, version code 3, SHA-256 `b0f08e67c20dd75e8d66d8fde174e9e7867491e3337dfc0590e4f4bd71ed5332`. It uses the existing upload key and production backend. The unpublished email-form experiment was overwritten locally and was never uploaded. Build 3 was published to the existing internal testing track on **21 October 2026 at 12:38 IST**. Play Console confirms **Active**, latest release **1.0.0 (3) - Google sign-in**, **Available to internal testers**. The tester list and opt-in link are unchanged. No public production rollout or full app-review submission was performed. Saved app-content declarations still need the normal Publishing overview review submission when the rest of the app is ready.

Verification: 208 tests pass, including retired-provider rejection, legacy identity suspension/session revocation, preservation of demo data and protection of Google-linked identities. Formatting, lint and type checks pass; the production backend push and native release compilation succeed. Bundletool validates the final AAB, which contains the production URL and no alternate login UI. Play reported no blocking errors and no lost device support; its only warning concerns the optional deobfuscation file. Google browser login, demo-board creation, visit creation and persisted ratings were exercised through the real UI. The corrected Android picker still needs a check after updating the Play-installed app.
