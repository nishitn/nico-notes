**nico notes — App Store readiness audit**

Audit date: 20 October 2026. Code baseline: `81141e3` (clean working tree at the start). Scope: the Expo/React Native app, React web client, shared Convex backend, photo service, tests, build configuration, and current Apple/Google submission requirements.

**Verdict: hold public submission.** The app has a useful product foundation, but missing account/privacy/safety flows and several reproducible-by-code data-loss/retry defects should be resolved before launch. Android is the primary implemented platform. Apple submission additionally needs a compliant alternative to Google-only login, functional iOS place search or explicit feature gating, and native iPhone/iPad verification.

This is an engineering and product audit, not a store approval guarantee. Findings were confirmed against source; automated checks and bundle exports were run. Screens were not operated on a device or simulator, so visual hierarchy, animation quality, keyboard overlap, screen-reader behavior, and precise touch sizes remain device-QA work. Store console settings, production configuration, signing, and privacy declarations were not inspected. No application source was changed.

**Answers to the requested questions**

| Question                                  | Assessment                                                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can frontend/backend consistency improve? | Yes. The mobile editor offers changes its mutation cannot save; retry behavior differs between web/mobile and cloud/local storage; rating summaries communicate a different meaning from detailed ratings; shared edits lack conflict handling. |
| Can UI/UX consistency improve?            | Yes. Align action colors, form fields, sheets, dismissal rules, destructive confirmations, progress/error feedback, and permission recovery. Preserve the existing warm brand and native menus.                                                 |
| Are obvious features missing?             | Account deletion, discoverable privacy/help/contact, and appropriate shared-content reporting/safety flows are launch requirements. Wishlist pagination and edit persistence are incomplete existing features.                                  |
| What features are worth considering?      | Finish wishlist editing/visited behavior and web continuity; add full-image viewing; consider journal export and faster historical date entry. These are separate from submission blockers.                                                     |
| Is a broad redesign necessary?            | No evidence supports one. First make the existing journeys reliable and accessible; then consolidate repeated components.                                                                                                                       |

**What already works well**

- A coherent private shared-journal concept: boards, repeat visits, individual ratings, photos, places, invitations, and wishlist.
- Central server-side membership/admin checks in [lib.ts](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/lib.ts:7). No confirmed cross-board authorization bypass was found in the reviewed paths.
- Native Google identity verification validates signed tokens, issuer, audience, expiry, verified email, and nonce: [googleIdentity.ts](/Users/nishitnagar/repos/nico-notes/packages/backend/googleIdentity.ts:24).
- Photos use authorized reads and upload ownership checks; cloud uploads enforce size and file signatures: [http.ts](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/http.ts:50). Mobile photo rendering deliberately disables persistent caching: [photos.tsx](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/photos.tsx:64).
- Loading/error boundaries, empty-board guidance, shared field labels, and accessible buttons already exist. The web client also has dialog focus handling, a skip link, focus styling, and reduced-motion support. Accessibility needs targeted completion, not replacement.

**Verification performed**

| Check                                                                                          | Result                    | Meaning                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                                                                    | PASS: 13 files, 126 tests | Existing helper/backend tests pass; they do not cover native journeys.                                                                                                           |
| `pnpm exec tsc --noEmit && pnpm -r typecheck`                                                  | PASS                      | Root, backend, web, and mobile TypeScript checks pass.                                                                                                                           |
| `pnpm check`                                                                                   | FAIL                      | Formatting issues in `apps/mobile/src/ScorePicker.tsx` and `apps/mobile/src/screens/Visits.tsx` stop the chained check. No fixes were applied.                                   |
| `pnpm exec vp lint`                                                                            | PASS with 12 warnings     | Includes unused code and hook warnings; this does not make `pnpm check` green.                                                                                                   |
| `pnpm build`                                                                                   | PASS                      | Android JavaScript/Hermes export and production web build complete. No signed APK/AAB is produced by this command.                                                               |
| `pnpm --filter @nico-notes/mobile exec expo export --platform ios --output-dir dist/ios-audit` | PASS                      | iOS JavaScript/Hermes export completes. It does not prove native compilation, signing, or functional native modules.                                                             |
| `node --test packages/backend/scripts/local-photos.test.mjs`                                   | INCONCLUSIVE              | The bundled Node 24.22.0 runtime aborts in `InternalCallbackScope::Close`; a retry without test isolation also aborts. This is not evidence of an application assertion failure. |
| `pnpm audit --prod --json`                                                                     | 3 high, 1 moderate        | All reported paths run through Expo tooling dependencies. Reachability and disposition are discussed in F25.                                                                     |
| Browser E2E                                                                                    | Not run                   | Setup changes the configured development backend and creates users; this audit avoided deployment/data changes.                                                                  |
| Signed native build / real devices / store validation                                          | Not run                   | Mandatory release evidence remains outstanding.                                                                                                                                  |

Build artifacts were written only to standard ignored output/cache locations. No install, deployment, store submission, commit, or source fix was performed.

**Prioritized findings**

P0 = submission blocker or missing release evidence. P1 = resolve before public launch because it affects user data, trust, or basic access. P2 = production hardening or polish; sequence according to expected usage. Priority reflects impact, effort, confidence, and dependencies rather than a raw severity score.

Effort includes appropriate regression coverage: S = hours, M = roughly 1–3 days, L = multiple days. Estimates are coarse and are not additive delivery commitments. Risk is the risk of implementing the fix. H/M confidence distinguishes confirmed code behavior from release-impact assumptions.

| ID  | Priority       | Finding / category                                                | Impact                                                            | Effort                          | Fix risk    | Confidence                           |
| --- | -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- | ----------- | ------------------------------------ |
| F01 | P0             | Account deletion absent — privacy                                 | Users cannot remove their account/data                            | L                               | High        | H                                    |
| F02 | P0             | Privacy, terms and help surfaces absent — release/UX              | Missing disclosure and support path                               | M                               | Low         | H in app; console unknown            |
| F03 | P0             | Shared-content safety incomplete — safety                         | No user/content reporting or service-level abuse response         | L                               | Medium      | H absence; M review outcome          |
| F04 | P0, Apple      | Google-only primary login — authentication                        | Likely incompatible with Apple's login rule for this app          | L                               | High        | H implementation; H policy inference |
| F05 | P0, Apple      | Exposed iOS place search has no iOS implementation — completeness | Search fails with Android-specific advice                         | S gate / L implement            | Medium      | H                                    |
| F06 | P0             | Signed release/device/store evidence missing — QA/release         | Bundle success cannot establish store readiness                   | M–L                             | Medium      | H evidence gap                       |
| F07 | P1             | Partial photo failure can duplicate visits — correctness          | Retry creates another saved visit                                 | M                               | Medium      | H                                    |
| F08 | P1             | Mobile type/dish edits silently ignored — API/UI contract         | Save does not persist offered changes                             | M                               | Medium      | H                                    |
| F09 | P1             | Manual place selection retains previous identity — correctness    | A new name can remain linked to the old place                     | S–M                             | Medium      | H                                    |
| F10 | P1             | Generic Clear removes group ratings for admins — destructive UX   | Accidental loss of other members' ratings                         | S                               | Low–Medium  | H                                    |
| F11 | P1             | Realtime updates reset rating drafts — collaboration              | Unsaved input can disappear                                       | M                               | Medium      | H code; timing untested              |
| F12 | P1             | Board deletion leaves owned records — data lifecycle              | Wishlist data and excess metadata survive deletion                | M                               | Medium      | H                                    |
| F13 | P1             | Photo retry cannot reconcile committed success — reliability      | Expired-ticket loop or duplicate photo                            | M                               | Medium      | H                                    |
| F14 | P1             | Wishlist stops at 50 entries — completeness                       | Older entries unreachable; misleading empty/count states          | S–M                             | Low         | H                                    |
| F15 | P1             | Forms/sheets lack dirty-navigation protection — UX                | Back/dismiss/refresh can lose drafts                              | M                               | Medium      | H                                    |
| F16 | P1             | Stale visit saves overwrite collaborators — consistency           | Concurrent edits silently replace newer fields                    | M                               | Medium      | H mechanism                          |
| F17 | P1             | Dish average presented as overall rating — information design     | Summary misrepresents what was rated                              | S                               | Low         | H                                    |
| F18 | P1             | Contrast and keyboard-access gaps — accessibility                 | Important actions harder or impossible to use                     | M                               | Low         | H code/ratios; device QA pending     |
| F19 | P2             | Join request outcomes are incomplete — onboarding                 | Users cannot reliably understand rejection/approval               | M                               | Low         | H                                    |
| F20 | P2             | Error recovery and diagnostics diverge — operations/UX            | Wrong recovery advice and difficult support                       | M                               | Low         | H                                    |
| F21 | P2             | Summary/map paths scan complete histories — performance           | Read cost and latency grow with history                           | M                               | Medium      | H structure; scale unmeasured        |
| F22 | P2             | Shared interaction patterns drift — design/architecture           | Inconsistent scope, busy states and implementation-heavy settings | L                               | Medium–High | H                                    |
| F23 | P2             | Permission requests/recovery lack context — UX/privacy            | Premature prompt; manual settings recovery                        | S–M                             | Low         | H                                    |
| F24 | P1             | Release checks lack a complete enforced baseline — QA/DX          | Native regressions can pass helper/web checks                     | M–L                             | Low         | H repository evidence                |
| F25 | P2 investigate | Expo tooling advisories need disposition — dependencies           | Known build-tool risk is unresolved                               | S triage / variable remediation | Medium      | H inventory; M reachability          |

Evidence, remediation direction, and acceptance conditions follow. These are audit recommendations, not changes already made.

**F01 — Implement account deletion across identity and owned data**

Evidence: [mobile account](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Boards.tsx:145) provides display-name editing and sign-out only; [web account](/Users/nishitnagar/repos/nico-notes/apps/web/src/Account.tsx:47) has the same limit. Production backend functions have no account-deletion workflow. Deleting a board or leaving one is not account deletion.

Add a clear Delete account action, confirmation/reauthentication where appropriate, session revocation, resumable cleanup, and a documented treatment of contributions to shared boards. Handle sole admins through transfer or board deletion without trapping users indefinitely. Include both photo storage providers. Apple requires an in-app initiation path for accounts created in the app; Google also requires an external deletion-request path. See [Apple account deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/) and [Google account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Acceptance: a normal member and a sole admin can complete deletion; old sessions lose access; associated data is handled according to the disclosed policy; interrupted jobs resume safely; the public deletion URL works without an installed app. Historical attribution after ordinary board removal is a separate intentional behavior and must not be confused with account deletion.

**F02 — Add discoverable privacy, terms, support and version information**

Evidence: [Welcome](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Welcome.tsx:24), [account](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Boards.tsx:145), and [settings](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/JournalScreen.tsx:542) have no privacy, terms, contact/help, or app-version links. No policy documents/routes were found in the tracked app source. Existing policies hosted elsewhere and store metadata remain unverified.

Publish policy/help pages and link them before sign-in and from account settings. Describe Google identity, shared profile information, notes, ratings, photos, saved coordinates, device location used for search, processors, optional local storage, retention, deletion, and contact details. Build a verified data inventory for App Privacy/Data safety answers rather than guessing from requested permissions. Privacy links must be accessible in-app and in store metadata under [Apple's privacy rules](https://developer.apple.com/app-store/review/guidelines/#privacy) and [Google's User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en).

Acceptance: all links work signed in and signed out; the policy matches actual production services and both storage providers; support identifies the release version without exposing user content.

**F03 — Complete safety handling for shared user content**

Evidence: visits, notes, photos and ratings are shared among members ([schema](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/schema.ts:83)); the app has admin removal/board leave controls ([settings](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Settings.tsx:142)), but no content/user reports, user blocking model, moderation workflow, or terms acceptance was found.

Private boards still expose user-generated content to other users. Define a proportionate safety design: accepted content rules, report content/user actions, an operator response queue, published contact, filtering/moderation appropriate to the product, and protection against abusive users. Admin removal alone does not help a member reporting the admin. Treat this as a high submission risk, while confirming the exact design appropriate to private-group usage. See [Apple guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content) and [Google UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en).

Acceptance: a non-admin can report an abusive admin/content and protect themselves; reports are acknowledged, reviewed and resolved; enforcement is server-side and cannot be bypassed through the other client.

**F04 — Resolve Google-only login before Apple submission**

Evidence: [auth providers](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/auth.ts:8) support Google browser/native flows only; [mobile Login](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/App.tsx:72) exposes Google only. This is a general private journal, with no evident exception in the reviewed product scope.

Apple guideline 4.8 requires a qualifying equivalent alternative for this use of third-party login. Sign in with Apple is the straightforward candidate; confirm the applicable exception/design before submission. This is a policy inference from the app's login model, not a past rejection. See [Apple Login Services](https://developer.apple.com/app-store/review/guidelines/#login-services).

Acceptance: the alternative works in release builds, handles private-relay email and returning users, and avoids creating duplicate journals when an existing user links another provider. Never automatically merge accounts solely because an unverified email matches. Account deletion must cover all providers.

**F05 — Implement or honestly gate iOS place search**

Evidence: [Google Places module registration](/Users/nishitnagar/repos/nico-notes/apps/mobile/modules/google-places/expo-module.config.json:2) declares Android only. Its [wrapper](/Users/nishitnagar/repos/nico-notes/apps/mobile/modules/google-places/index.ts:15) throws an Android-build instruction when absent. Shared [search logic](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/usePlaceSearch.ts:30) is exposed while iOS maps are enabled ([BoardPlaces](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/BoardPlaces.tsx:110)).

Add a supported iOS provider or hide unavailable search while preserving saved-place/manual entry and accurate copy. Acceptance: an iPhone user can complete the advertised add-place/add-visit journey; unavailable functionality never recommends installing Android. A successful iOS JavaScript export does not resolve this issue.

**F06 — Produce release evidence for each advertised platform**

Evidence: [mobile README](/Users/nishitnagar/repos/nico-notes/apps/mobile/README.md:94) distinguishes bundle export from native compilation and explicitly says iOS was not device-tested. [package scripts](/Users/nishitnagar/repos/nico-notes/apps/mobile/package.json:10) export Android only. [app config](/Users/nishitnagar/repos/nico-notes/apps/mobile/app.config.ts:23) enables iPad support. [EAS profiles](/Users/nishitnagar/repos/nico-notes/apps/mobile/eas.json:3) provide a starting point but do not prove credentials, production environments, or store validation.

Create signed production artifacts and test installs through TestFlight/Play testing with the intended backend, release OAuth configuration and restricted Maps keys. Either validate iPad layouts or explicitly decide supported devices. Validate the final generated permissions/privacy manifests and third-party SDK declarations; absence of a hand-authored privacy manifest in source alone is not proof the generated app lacks one.

Acceptance: store artifact validation succeeds; the device matrix below passes; reviewers can access a populated sample board and all relevant roles without waiting for the developer to approve them. Verify account/provider production status and service availability. These console facts are currently unknown, not proven misconfigured.

As of the audit date, Apple uploads require iOS/iPadOS 26 SDK or later under the April 2026 requirement ([Apple SDK notice](https://developer.apple.com/news/?id=ueeok6yw)); new Google Play phone apps/updates must target API 36 or higher under the August 2026 requirement ([Android requirements](https://developer.android.com/google/play/requirements/target-sdk)). Inspect the artifact's actual values. Also validate native-library page-size compatibility and any account-specific testing/verification requirements shown in the store console.

**F07 — Preserve a saved visit through partial upload failure**

Evidence: [Visits.tsx](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:2035) creates the visit, keeps its ID only in the save call, uploads photos, and only then calls `onDone`. A failed photo throws after the visit already exists. Retrying invokes create again. The web editor already remembers the saved visit and removes successful uploads from its pending list ([web Visit](/Users/nishitnagar/repos/nico-notes/apps/web/src/Visit.tsx:128)).

Keep the saved visit ID and each photo's completion state; show “Visit saved; some photos need retry” and retry only incomplete work. Acceptance: fail photo two of three, retry, and observe exactly one visit with exactly three photos. Also test a dropped response and an edit retry. Coordinate with F13 rather than creating a second upload protocol.

**F08 — Align the edit form with the mutation contract**

Evidence: mobile [type pills](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:2504) and [dish controls](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:2605) appear in edit mode. Dishes start empty at line 1787. Existing saves omit type/dishes at [line 2048](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:2048); [backend update](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/visits.ts:333) accepts neither.

Either hide unsupported controls in edit mode and direct users to existing dish management, or implement an explicit edit contract. Define what a type change does to historical category snapshots; presets intentionally do not rewrite history. Acceptance: every visible edit persists after reopening, existing dishes are represented accurately, and changing dish visibility does not falsely imply a changed type.

**F09 — Reset place identity when choosing manual entry**

Evidence: [chooseManual](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1986) changes the title but leaves `placeId`, `googlePlaceId`, address and coordinates intact. [create](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/visits.ts:283) trusts a supplied same-board place ID; canonical linking then retains that association. Also, [selectSaved](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1930) leaves the previous location in UI state when the next saved place has none, although server canonicalization can correct that case.

Represent place selection as one coherent value; clear inherited identity/address/location for a genuinely new manual place and explicitly clear unpinned selections. Acceptance: select pinned A, then manual C, save and confirm C is not linked to A; switch to unpinned B and verify no stale pin is presented. Do not claim the saved-B case always corrupts persisted coordinates—the backend can normalize it.

**F10 — Make rating deletion scope explicit**

Evidence: [SingleRatingModal](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1122) gives admins all members; [handleClear](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1168) clears every such member; the [button](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1293) says only “Clear” / “Clear rating,” without confirmation.

Prefer a Clear action next to each member's rating. If bulk removal remains, label it “Clear everyone's ratings” and confirm scope. Acceptance: clearing one member preserves everyone else's ratings; bulk clear requires explicit intent. Admin entry on behalf of members is intentional and is not itself a defect.

**F11 — Preserve dirty rating drafts during reactive updates**

Evidence: both [food-by-food](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:897) and [single-item](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1131) effects reconstruct all drafts when reactive ratings/member inputs change.

Initialize by item/open identity, merge server changes into clean fields only, and define same-field conflict handling. Acceptance: user A types a note while B rates another item; A's input survives. Admin multi-member entry and partial multi-mutation saves need the same check. Runtime reproduction should confirm exact timing before implementation.

**F12 — Finish board deletion before removing its parent**

Evidence: [cleanup.board](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/cleanup.ts:47) drains places, then deletes four metadata tables with a single `take(100)` and deletes the board. It never processes wishlist, which is board-owned in [schema](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/schema.ts:151). The [existing test](/Users/nishitnagar/repos/nico-notes/packages/backend/tests/app.test.ts:541) checks board/visit deletion, not all dependents.

Drain every board-owned table in bounded, resumable batches. Preserve immediate access revocation while cleanup runs. Acceptance: a board containing wishlist entries and more than 100 historical join requests leaves no dependent records; cloud files are deleted and local files are queued for authorized deletion. Repeat/retry cleanup safely. Resolve this before reusing cleanup for F01.

**F13 — Make photo completion idempotent across uncertain responses**

Evidence: [native uploader](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/photos.tsx:215) retains a ticket for retry and calls `uploadProvider`; [cloud completion](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/photos.ts:92) deletes the ticket, so [preflight](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/photos.ts:164) rejects a retry after server success. The local service has completion lookup, but this client preflight can prevent reaching it.

Retain authorized operation-to-result reconciliation for a bounded time. A retry of an already-completed upload should return the same photo, not require a new reservation. Acceptance: drop the success response after commit and retry; both providers yield one photo and useful success feedback. Retain ownership checks, expiry cleanup, size limits and private reads.

**F14 — Complete wishlist pagination and states**

Evidence: [query](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/JournalScreen.tsx:65) loads 50; [renderWishlist](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/JournalScreen.tsx:339) filters that page and has no load-more control. The [empty state](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/JournalScreen.tsx:473) always says the wishlist is empty, including loading/no-match cases; the count is only the loaded length.

Add explicit pagination or a server-backed searchable list, separate first-load/empty/no-match/error/end states, and truthful count language. Acceptance: seed at least 51 entries, reach/find the oldest, and distinguish “No matching places” from “Your wishlist is empty.”

**F15 — Protect unfinished work on navigation/dismissal**

Evidence: rating sheets dismiss directly via [backdrop/system Back](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:953) and [single-sheet backdrop](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1187). Web [Back](/Users/nishitnagar/repos/nico-notes/apps/web/src/Visit.tsx:142) and [Cancel](/Users/nishitnagar/repos/nico-notes/apps/web/src/Visit.tsx:327) navigate directly while drafts live in component state. No common dirty-navigation guard was found.

Offer Stay/Discard and Save where safe, and prevent accidental dismissal during saving/uploading. Apply the same rule to visit, board, wishlist and rating forms. Acceptance: device Back, swipe/back gesture, outside tap, board change, internal links, and web refresh cannot silently discard significant work. Full offline synchronization is not required to solve this.

**F16 — Detect stale shared edits**

Evidence: [mobile form](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1762) and [web form](/Users/nishitnagar/repos/nico-notes/apps/web/src/Visit.tsx:102) take local snapshots; [update](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/visits.ts:333) patches full editable fields without a revision condition. Two individually atomic mutations can still overwrite a stale form's newer server values.

Use revision conflict detection or carefully scoped dirty-field updates. Preserve the user's draft and explain conflicts. Acceptance: two members edit different fields and retain both changes, or the second receives an actionable conflict; simultaneous same-field changes are never silently mistaken for a successful merge.

**F17 — Tell users which score they are seeing**

Evidence: [mobile VisitCard](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/VisitCard.tsx:81) and [web VisitCard](/Users/nishitnagar/repos/nico-notes/apps/web/src/BoardDashboard.tsx:103) use overall-or-dish-average. Web labels the result “Visit rating” at line 122. This conflicts with the README's explicit separation of dish averages and overall ratings.

Show overall only or label a fallback “Dish average,” consistently across cards and details. Acceptance: a dish-only rating never implies an overall rating, and unrated members are not counted as zero. This is a presentation change; do not rewrite stored ratings.

**F18 — Complete accessible colors, controls and web search selection**

Evidence: [Paper theme](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/App.tsx:236) uses coral for primary actions, while [custom buttons](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/ui.tsx:245) use darker rust. [Navigation](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/JournalScreen.tsx:721) uses coral; [score clear/pills](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/ScorePicker.tsx:241) lack consistent minimum target sizing. Web [saved-place preview rows](/Users/nishitnagar/repos/nico-notes/apps/web/src/BoardDashboard.tsx:483) and [new-place rows](/Users/nishitnagar/repos/nico-notes/apps/web/src/BoardDashboard.tsx:529) are clickable divs without keyboard equivalents; their separate Add visit links are accessible.

Calculated sRGB token contrast: coral `#E06D53` against paper `#FFFDF9` is about 3.19:1; coral against pale coral `#FDEEE9` is about 2.87:1; rust against paper is about 6.31:1. The first two are insufficient for ordinary small-text contrast targets. Use dedicated accessible action/text tokens while retaining decorative coral. Make preview actions real keyboard-operable controls without nesting buttons/links. Acceptance: keyboard users can preview results; supported text scaling, VoiceOver/TalkBack, focus, disabled/selected states, and platform touch-target sizes pass device checks. Exact rendered measurements remain unverified.

**F19 — Give invitations a complete outcome**

Evidence: [myOutgoingRequests](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/boards.ts:609) declares accepted/rejected responses but queries pending only. [mobile Join](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Boards.tsx:118) stores a static waiting message after submission.

Subscribe to request outcome and show Pending, Approved/Open board, Rejected, and Retry where allowed. Acceptance: approval updates the open join screen; rejection produces an understandable outcome instead of disappearing from the list. Notifications can follow later; correct in-app status is the immediate need.

**F20 — Standardize safe errors and useful recovery**

Evidence: [mobile message](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/ui.tsx:301) exposes arbitrary Error messages; [web message](/Users/nishitnagar/repos/nico-notes/apps/web/src/ui.tsx:16) sanitizes Convex transport diagnostics. Cloud [upload catch](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/http.ts:89) turns thrown errors into 403; [local photo catch](/Users/nishitnagar/repos/nico-notes/packages/backend/scripts/local-photos.mjs:158) collapses failures to 503. Explicit size/type validation already has better status handling.

Use stable error codes for expired reservation, access loss, validation, connectivity and service failure; map them consistently to Retry, Sign in, Open settings or Contact support. Add scrubbed crash/error reporting and release identifiers: no reporting integration was found in the reviewed clients/manifests. Acceptance: simulated failures produce correct user actions and useful operator diagnostics without notes, photos, tokens or precise locations in logs. Avoid showing backend stack/transport details to users.

**F21 — Bound summary and map reads**

Evidence: [board summaries](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/boards.ts:156) collect every visit for each of up to 100 boards to count them. Web [dashboard](/Users/nishitnagar/repos/nico-notes/apps/web/src/BoardDashboard.tsx:244) and [Places](/Users/nishitnagar/repos/nico-notes/apps/web/src/Boards.tsx:371) immediately load all visit-metadata pages. Mobile already uses the place-oriented model in [BoardPlaces](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/BoardPlaces.tsx:68).

Use maintained/verified aggregates and paginated place queries; preserve accurate totals and legacy backfill behavior. For large search, use a server-backed strategy rather than loading an entire history. Acceptance: measure reads, latency and memory on representative large boards, document a budget, and ensure initial board/map load does not scale with all historical visits. This is an architectural growth risk, not a measured current outage.

**F22 — Consolidate interaction rules and simplify storage settings**

Evidence: [ui primitives](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/ui.tsx:219) coexist with extensive one-off fields/sheets/actions in the 3,929-line [Visits screen](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1). Shared [confirmation](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/ui.tsx:325) always says “This cannot be undone,” including [Leave board](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Settings.tsx:224), even though rejoining can be requested. [Photo settings](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Settings.tsx:205) expose “Convex” and “Mac mini” directly to every board admin.

After regression protection, extract consistent form/sheet/confirmation/progress patterns. Use action-specific consequences and names, not generic Confirm. For public users, make managed storage the normal path; gate self-hosted storage behind availability checks and explain availability/backup consequences in user terms. Retain the intentional self-hosting capability for appropriate users. Acceptance: equivalent actions share spacing, labels, loading, keyboard and dismissal behavior; unsupported local storage cannot be selected into a broken upload experience. Avoid a large prelaunch rewrite without tests.

**F23 — Request permissions when users understand the purpose**

Evidence: [JournalScreen](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/JournalScreen.tsx:69) requests location unconditionally on mount; [location hook](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/useCurrentLocation.ts:6) requests permission; map components also own location requests. [camera denial](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1793) instructs users to change settings without an action to open them.

Ask after a nearby/map/current-location action, reuse a shared location state, and offer Open Settings when permission is permanently denied. Clarify that device location used for nearby results is distinct from a saved venue pin. Acceptance: first-time users can create/join a board without an unexplained prompt; denial, approximate-only, disabled services and later permission recovery all work. Saved/manual entry remains available.

**F24 — Establish an enforceable release gate**

Evidence: [check script](/Users/nishitnagar/repos/nico-notes/package.json:15) fails on current formatting; [test config](/Users/nishitnagar/repos/nico-notes/vite.config.ts:10) includes `.test.ts` files but excludes the local photo `.test.mjs` suite. [Playwright](/Users/nishitnagar/repos/nico-notes/playwright.config.ts:14) targets a browser, including mobile-sized viewports; it does not exercise native controls. No tracked CI workflow or native journey suite was found. External CI configuration is unknown.

Restore a green check, add the photo-service test to a supported verification command after diagnosing the runtime failure, and automate critical native journeys. Preserve the meaningful backend security tests. Acceptance: one documented release gate covers check, unit/backend tests, photo service, browser journeys, native compilation and a signed-device smoke matrix. Each F07–F16 fix needs a targeted regression before any broad form refactor.

**F25 — Triage the actual dependency advisories**

Evidence: the read-only production-dependency audit reports three high advisories through Expo tooling: `node-forge@1.4.0` ([lockfile](/Users/nishitnagar/repos/nico-notes/pnpm-lock.yaml:3095)), `braces@3.0.3` ([lockfile](/Users/nishitnagar/repos/nico-notes/pnpm-lock.yaml:2062)), and `source-map-js@1.2.1` ([lockfile](/Users/nishitnagar/repos/nico-notes/pnpm-lock.yaml:3546)). One moderate `uuid` advisory was also reported. “Production dependency” here includes CLI/build tooling installed under Expo; it does not establish that the shipped mobile runtime or authentication service is vulnerable.

Triage the high items against actual usage: node-forge is imported by Expo iOS certificate tooling; braces is reached through Metro's file-map matching; source-map-js is reached through PostCSS tooling. Exploit prerequisites and vulnerable-method execution were not established. The audit offered a source-map-js fix at 1.2.2 or later and no patched version for the other two at audit time. Follow upstream compatibility guidance, constrain untrusted build inputs, and record mitigation/acceptance for unresolved paths. Do not apply arbitrary major-version overrides or claim a runtime auth vulnerability. Advisory references: [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Acceptance: rerun the registry audit at release; fix applicable reachable paths or document why the release build is protected. This finding remains investigation/hardening, not a confirmed attack against the app.

**Feature options — product decisions, separate from defects**

1. **Finish wishlist lifecycle and client continuity (M, high grounding).** [WishlistForm](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/WishlistForm.tsx:14) only adds; cards offer delete/log/maps, but [Log visit](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/JournalScreen.tsx:438) passes no wishlist ID. Web [routes](/Users/nishitnagar/repos/nico-notes/apps/web/src/App.tsx:251) have no wishlist feature. Add editing, an explicit visited/keep/remove decision after successful logging, and minimum web parity or clearly communicate mobile-only scope. Automatic removal should not erase a recommendation the group wanted to retain.
2. **Add a full-image viewer (M, high grounding).** Saved photos are rendered in fixed-height, cover-cropped [images](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/photos.tsx:64) inside [photo cards](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/photos.tsx:129). Offer full-image fit, pinch zoom, paging and readable captions. Preserve authenticated loading and deliberate cache policy; do not turn photos into public URLs.
3. **Offer journal export (M–L, medium grounding).** The core value is personal memories stored across [visits/photos/ratings](/Users/nishitnagar/repos/nico-notes/packages/backend/convex/schema.ts:83), while [account](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Boards.tsx:145) provides no portability action. An authorized board/account export would improve trust and backup usability. Decide whose shared contributions are included, format, large-file handling and expiry before building; this is a product option, not an asserted universal store requirement.
4. **Improve historical date entry (S–M, high grounding).** The custom picker advances [month by month](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:1609), while the app explicitly supports historical and undated visits. Add year/month selection or an accessible native date control, retaining “date not recorded.” This reduces work for users importing old memories; test locale/timezone behavior.

**Recommended interaction contract**

| Area                | Target behavior across frontend/backend                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Save visit          | Persist once; separate visit success from photo progress; retry incomplete work.          |
| Edit shared data    | Every visible field persists; preserve dirty values and identify conflicts.               |
| Rate                | Explain overall/dish/category; identify whose score is edited; make clear scope explicit. |
| Search              | Saved/nearby/manual choices behave predictably; show complete/loading/no-match states.    |
| Destructive actions | Name the affected record/person/group and consequences; confirm broader deletion.         |
| Feedback            | Common validation/error codes, safe copy, actionable recovery, honest success state.      |
| Settings            | Separate personal account, board management, support/privacy and advanced hosting.        |
| Permissions         | Ask in context; support denial and recovery without blocking manual journeys.             |

**Release acceptance matrix**

| Journey / condition    | Required evidence                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fresh install and auth | Release OAuth/provider configuration; cancellation; sign-out; token refresh; relaunch; network loss during callback; Apple alternative if shipping iOS.                                                |
| New user               | Understand create vs join, create first board/visit, useful empty states, no unavoidable permission prompts.                                                                                           |
| Invites                | Cold/warm link while signed out; code entry; expired/revoked link; pending/accepted/rejected; no developer intervention needed for reviewer access.                                                    |
| Roles                  | Member/admin/removed member; last-admin leave/delete; unauthorized actions rejected on server; ordinary removal distinguished from account deletion.                                                   |
| Visit editing          | Type/dish changes, manual-place transition, backdated/undated visits, two-client concurrent edits, safe navigation during save.                                                                        |
| Ratings                | 0.5 increments, clear one vs all, unrated averages, draft survival while another member edits.                                                                                                         |
| Photos                 | Camera/system picker/limited access; supported conversion; 10-photo/10-MB limits; failure on photo two; dropped success response; access revoked; both enabled storage providers.                      |
| Lists/maps             | 51+ wishlist entries; multiple pages of places/visits/boards; no-match state; denied/approximate location; large history; unavailable Places/config fallback.                                          |
| Accessibility          | VoiceOver/TalkBack, keyboard on web, large text/display size, contrast, focus order, modal focus, actionable control labels and touch targets.                                                         |
| Devices                | Supported Android minimum/current OS, small phone, large display; iPhone and iPad if advertised; keyboard open/closed, safe areas and system Back.                                                     |
| Privacy/safety         | In-app and web account-deletion path, policy/help links, reports and response workflow, session revocation, complete dependent-data cleanup.                                                           |
| Production operations  | Isolated production configuration, backup/restore procedure (cloud data and any local photos), cleanup failure visibility, service availability, error monitoring, Maps usage/billing alerts.          |
| Store package/listing  | Signed artifact, SDK/target compliance, final permissions/SDK privacy review, accurate screenshots and age/content rating, privacy declarations, support/deletion URLs and review access instructions. |

Do not request notifications or tracking permission merely to fill out the checklist. No payments or tracking integration was found that would justify adding billing, subscriptions or an ATT prompt for this release. Reassess if the business model changes.

**Execution order and dependencies**

1. Restore the verification baseline (F24); add focused regressions around the current save/edit/rating/deletion behavior.
2. Fix low-effort trust defects first: explicit clear scope and rating labels (F10/F17), wishlist completeness (F14), then save/edit/place/retry correctness (F07–F09/F13).
3. Fix board cleanup (F12), define retention/shared-data ownership, then implement full account deletion (F01). Privacy/support inventory (F02) can proceed alongside these, but its final wording must match implemented behavior.
4. Preserve drafts and resolve collaborative edits (F11/F15/F16); complete shared-content safety (F03).
5. For Apple, complete login/provider design (F04) and iOS capability gating/implementation (F05). These can run alongside backend correctness work, with coordinated identity/deletion tests.
6. Complete accessibility and recovery (F18–F20/F23), triage tooling advisories (F25), and measure performance (F21). Consolidate components (F22) after characterization coverage, not before.
7. Produce signed release artifacts and complete the matrix (F06). Finish store metadata/privacy answers from those artifacts and the real production data flows. Recheck current policies at submission.

Implementation plans have not been generated for every item; this report is the requested deliverable. The highest-value first plan set is F24, F07/F13 together, F08/F09 together, F12, and the F01/F02 account/privacy workflow. Each requires its own scoped acceptance tests before broad refactoring.

**Considered and rejected / limits**

- Offline sync, public social sharing, trip structures, dynamic rewrites of historical presets, and dark mode are not treated as missing launch requirements. Several are explicitly outside current product intent.
- Admin rating on behalf of members, shared-detail editing, optional local storage, preserved former-member attribution, and read-only imported ratings are intentional choices. Their UI should explain them, but their existence is not an authorization defect.
- The punctuation difference between auth storage namespaces in E2E and the configured provider is normalized by Convex Auth; it was not reported as a bug.
- A cropped native-map thumbnail ([styles](/Users/nishitnagar/repos/nico-notes/apps/mobile/src/screens/Visits.tsx:2931)) warrants visual attribution review. No provider-terms violation is asserted without rendered inspection and applicable terms verification.
- No exhaustive penetration test, secrets/history scan, backend load test, third-party native binary audit, production backup restore, legal-jurisdiction review, or live store-console review was performed. Lack of evidence for a deployment feature is not proof that it is absent outside this repository.
- Source review cannot certify the visual polish or usability of screens on real devices. Obtain that evidence before marking the UI/UX audit complete for release.
