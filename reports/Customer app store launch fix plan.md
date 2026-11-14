# Customer app store launch: fix plan

Plan for closing the gaps in [Customer app store launch gaps.md](Customer%20app%20store%20launch%20gaps.md) so `clicks-user` can go on the App Store and Play Store. Written 13 November 2026 against the main working tree (`integration/customer-hardening`, `6e5afc0` plus 83 uncommitted files).

## Status, 13 November evening

The code side of Phases 0, 1, 2 and 4 is done on the local branch `release/customer-store-launch` (worktree `.claude/worktrees/store-launch`). Nothing is pushed or deployed.

| Phase | State |
|---|---|
| 0 One committed tree | Working tree committed as `09ac990` (tag `main-folder-2026-11-13`). QA fixes and international phones merged. API 453/453, app 57/57. **Not pushed: needs your go-ahead.** |
| 1 Push and packaging | Done in code: 1.3, 1.4, 1.5, 1.7. Waiting on you: 1.1 `google-services.json`, 1.2 APNs key and Push capability, 1.6 Railway variable. |
| 2 Store compliance | Done in code: 2.1 to 2.5, 2.7 (documents redacted), 2.8, 2.9. 2.6 answers are in `clicks-user/STORE_PRIVACY_ANSWERS.md`. Waiting on you: approve the policy wording, rotate the demo passwords, create the review account, a Mac archive. |
| 3 Production configuration | Yours. The admin App Settings page now has the support and on-call number fields (3.1). |
| 4 Defects | Done: 4.1 to 4.5 and 4.7. 4.6 waits for D5 and D6. |
| 5 Unanswered SOS | Not started: waits for D3. |
| 6 Device pass | Checklist written: `clicks-user/STORE_DEVICE_CHECKLIST.md`. |

### Re-audit and second round of fixes, 14 November

A full re-read of the app on 13 November found defects the first report did not have. They are fixed on the same branch (tip `9588843` plus a checklist update) and were checked in a browser against a local stack:

- Messages now appear above bottom sheets (errors raised behind a sheet were invisible).
- A "service now" request shows a card on Home; an SOS it blocks says why and offers to open it.
- An unpaid job (the payment-link case) and a job on hold or at the garage open on Home with a card instead of a page with no way back.
- Amounts: the in-progress screen follows price changes; Activity shows what was charged.
- In-app card stays hidden unless the server says it is on.
- Sign-up: "Send again" stays on the code screen, double taps send one code, a failed create returns to a step with a button, Arabic numerals work, emails and names accept `-`, `+` and `'`.
- Arabic: switching language rebuilds the app, dates and notifications follow the app's language, about 20 hard-coded English strings translated.
- A second booking for a different service in the same slot is no longer swallowed (server).
- iOS is iPhone-only. The minimum iOS stays 16.6 because the locked Google Maps SDK needs it.

Still open from the re-audit: the Terms & Conditions on production is placeholder text; the lock-screen notification text is English only; no Android adaptive icon; whether the login rate limit sees real customer IPs on production is unconfirmed.

A machine note: Windows ran System Restore on 14 November after three crashes and deleted 658 files from the release worktree. They were restored from git and nothing committed was lost, but unpushed work exists only on this machine.

Two notes on Phase 0:

- Some files in the main folder were edited at 17:01, after the last deploy I know of (about 16:00). The tag marks the folder as it was at 19:00, which may be slightly ahead of production.
- `feat/admin-membership-plans` is fully contained in the committed tree and can be deleted.

## What "ready to submit" means

A build is submitted only when all five are true:

1. It is built from a committed, tagged tree that contains the 13 November QA fixes.
2. Push notifications arrive on a locked iPhone and a locked Android phone during a real SOS.
3. The store listing tells the truth: privacy policy covers iOS and the 30-day deletion window, the deletion page is the customer one, and nothing in screenshots or copy promises card payment or membership while they are off.
4. A bad build can be seen (Sentry) and recalled (forced update), and the support number at the end of the SOS ladder has been test-called.
5. One full SOS has been run on a real phone of each platform from that exact build.

## What changed since the report

I checked the report's claims against the tree today. Three blockers are already gone, so they are not in this plan:

- **Play signing files exist.** `android/key.properties` (written today) and `android/clicks-release.jks` are in the working tree and gitignored. The AAB script will not fail on them.
- **The iOS Firebase file exists.** `ios/Runner/GoogleService-Info.plist` is tracked and valid (bundle `com.roya.clicksUser`, project `clicks-customer`).
- **Target SDK is 36.** Flutter 3.44.6 on this machine defaults `targetSdkVersion` to 36.

Everything else in the report that this plan covers was confirmed in the code. Still missing or wrong: `google-services.json`, the Firebase and Sentry build defines, the push entitlement, the privacy manifest, the Android-only privacy page, the technician-only deletion page, the unused camera permission, and the unmerged fixes.

## Decisions needed from you

Work can start on everything else now. These six change what gets built; each has my recommendation.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Card payment inside the app (SkipCash) on at launch, or off? | **Off for 1.1.6.** It has never run on production. Customers still pay the ways they do today: cash, card on the technician's machine, Fawran transfer, or a payment link. Turn in-app card on in the next version after one production webhook test. This reverses the 7 November "card and membership live at launch" decision, so it needs your yes. (Corrected 13 November: this plan first called it "cash-only", which was wrong.) |
| D2 | Which finished branches ride in the first build? | **QA fixes: yes. International phone numbers and service areas: yes**, because their defaults leave Qatar-only behaviour unchanged. **Apple Pay: no**; it depends on card payment, SkipCash's answers and an Apple Merchant ID. |
| D3 | What happens to an SOS nobody answers? | **After 15 minutes, mark it missed:** tell the customer, show the call button, and let them raise a new SOS. It stays in the inbox, flagged, for dispatch to call back. Today it never ends and blocks the customer from a new SOS. Confirm the 15 minutes. |
| D4 | Which support number is real? | Open since 7 November: `+974 7091 9191` or `7009 0220`. I need the one a person answers at night, test-called. |
| D5 | Cancel fee | **Remove "(fee may apply)" for now.** There is no way to collect a fee in the app, and threatening one invites disputes. Bring it back when collection exists. |
| D6 | "Emergency" wording | **Soften it** in the store listing, the permission text and the Home headline ("Need roadside help?"), and keep the SOS button. Apple's rules say location must not be used to offer emergency services. |

## Phase 0: one committed tree (first, blocks everything)

Production is deployed from this working tree, which has 83 uncommitted files from several sessions, and five finished branches sit unpushed. Nothing can be built reliably until that is one history.

| Step | What | Who |
|---|---|---|
| 0.1 | Commit the working tree as it is deployed and tag it (as was done for `prod-2026-11-11`). Stage files explicitly; `clicks-api/scripts/qa-admin-mobile-smoke-results.json` holds a token and must stay out. | Me, with your go-ahead |
| 0.2 | Merge `fix/customer-qa-2026-11-13` (4 commits: cold-start socket, in-progress resync, logout, card button, overdue bookings, Activity refresh). | Me |
| 0.3 | Merge `feat/intl-phones-sos-coverage` if D2 is yes. Expect small conflicts in the two translation files and `sosSocketService.js`. | Me |
| 0.4 | Leave `feat/customer-apple-pay`, `scale/p1-*`, `scale/p2-*` and `scale/p3-runbook` unmerged. `feat/admin-membership-plans` looks already copied into the working tree by another session; compare and drop the branch if so. | Me |
| 0.5 | Run the API suite, the customer app tests and the analyzer on the merged tree. Push to GitHub. | Me; push needs your go-ahead |

Exit: one branch, pushed, tests green, a tag for what production runs.

## Phase 1: push notifications and packaging

Without this the app is silent on a locked phone during an SOS. That is the largest product risk in the report.

| Step | What | Who |
|---|---|---|
| 1.1 | Download `google-services.json` for `com.roya.clicks_user` from Firebase project `clicks-customer` into `clicks-user/android/app/`. It cannot be recreated from anything on this machine. | **You** |
| 1.2 | Upload an APNs auth key to that Firebase project, and enable the Push Notifications capability on the App ID `com.roya.clicksUser`. | **You** |
| 1.3 | Add `ios/Runner/Runner.entitlements` with `aps-environment` and point the three Runner build configurations at it. | Me (code); a Mac must confirm it signs |
| 1.4 | Fix `scripts/build-aab-production.ps1` and `BUILD.md`: read the Firebase API keys from `google-services.json` and `GoogleService-Info.plist` and pass `FIREBASE_ANDROID_API_KEY`, `FIREBASE_IOS_API_KEY` and `SENTRY_DSN`; refuse to build if any is missing. Today the script ships a build with push and crash reporting off. | Me |
| 1.5 | Add the same checks to an iOS build script, so an archive cannot be made without the keys. | Me |
| 1.6 | Confirm Railway has `FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON` on the tech API. Without it the server skips every customer push while reporting healthy. | **You** (or me, read-only, if you give access) |
| 1.7 | Stop asking for notification permission at app start. Ask after login, the first time it matters (when an SOS is raised). | Me |

Exit: a release build on each platform registers a push token, and "technician assigned" appears on a locked phone.

## Phase 2: store compliance

Small edits, but each one is a likely rejection if skipped.

| Step | What | Who |
|---|---|---|
| 2.1 | Rewrite `clicks-interface/public/privacy-policy.html`: cover iOS (`com.roya.clicksUser`) as well as Android, state the 30-day deactivate-then-anonymise window, and list what is collected (precise location while in use, phone, name, email, device push ID, crash logs). Use `https://admin.clicks.qa/privacy-policy.html` as the listing URL. | Me (draft); **you or counsel** approve the wording |
| 2.2 | Make a customer account-deletion page. The current one says "Delete your Sanad Technician account" and files the request under the technician app. | Me |
| 2.3 | Remove the unused `CAMERA` permission and `image_picker`, the camera and photo-library usage strings, and the two "Always" location strings. The app only uses location while in use. | Me |
| 2.4 | Add `ITSAppUsesNonExemptEncryption = false` and `CFBundleLocalizations` (en, ar) to `Info.plist`; translate the location permission text into Arabic. | Me |
| 2.5 | Add an app-level `PrivacyInfo.xcprivacy`. Archive once on a Mac and read Xcode's privacy report for third-party SDK manifests. | Me (file); **a Mac** for the archive |
| 2.6 | Fill Play's Data safety form and Apple's App Privacy labels. I will write the exact answers from the code so they match the binary. | Me (answers); **you** enter them |
| 2.7 | Create a dedicated App Review demo account, and take passwords out of the repo's markdown files (`CLICKS_PRODUCTION_READINESS_AUDIT.md`, `clicks-api/LOCAL_TEST.md`, and the 13 November QA report). Rotate any that were real. | Me (redact); **you** (rotate, create account) |
| 2.8 | Make Delete Account easier to find: one tap from Settings, not two sheets deep. | Me |
| 2.9 | Bundle a copy of the privacy policy in the app as a fallback when the API is unreachable. | Me |

Exit: `qa-play-store-compliance.js` passes, and the listing URLs show customer-app content.

## Phase 3: production configuration and clean-up

No code. These are settings and data on production; I will not change production without your say-so.

| Step | What | Who |
|---|---|---|
| 3.1 | Set the support number and the on-call numbers (D4), then test-call both. Set them as `SUPPORT_PHONE` and `ONCALL_PHONE` on Railway, or in the admin: the API already accepts both, and I can add the two fields to the web App Settings page in Phase 0. | **You** |
| 3.2 | Confirm `LAUNCH_PUBLIC_SIGNUP` on production, and register one real Qatar number end to end. Sign-up has not been tested on production because it sends a real SMS. | **You**, with me checking the result |
| 3.3 | Close the pending SOS `#2147A7A5` from 8 November, and cancel the demo account's two old bookings (28 October, 11 November). | **You** in the admin (or me, on request) |
| 3.4 | Exclude or reverse the QA job `6af6fea8…6d9d` (QAR 150 cash, reference `QA-LIFECYCLE`) in finance. | **You** |
| 3.5 | Verify on Atlas that the index `uniq_active_sos_per_customer` exists (production runs with auto-index off). | Me, read-only, if you give access |
| 3.6 | Forced update: leave the minimum version empty for 1.1.6. Prepare 1.1.7, and the day the listings are live set `APP_STORE_URL_*` so a recall is possible. | Me (prepare); **you** (set) |

## Phase 4: defects the report found beyond the QA branch

All small and all in the customer app. They ship in the same build.

| Step | What | Where |
|---|---|---|
| 4.1 | Call Dispatch and Call Technician do nothing when the in-progress screen is reached from the in-call screen. | `in_call_screen.dart:197` |
| 4.2 | Settings shows "null null" before the profile loads; the in-progress screen shows "Welcome," with no name after a cold start. | `settings_screen.dart:71`, `session_resume.dart:226` |
| 4.3 | Raw English exception text shown to the customer in Contact Us, receipts and Activity. | `activity_details_screen.dart:141`, `contact_us_screen.dart:67`, `contact_support_sheet.dart:57` |
| 4.4 | Activity has no Retry when it fails to load. | `activity_screen.dart` |
| 4.5 | Location denied: add an "Open Settings" button. Today the map quietly centres on a hard-coded point in Doha. | `sos_cubit.dart:571` |
| 4.6 | Remove "(fee may apply)" (D5) and soften the "emergency" copy (D6), in English and Arabic. | translations, `technician_tracking_screen.dart` |
| 4.7 | Arabic layout sweep of the SOS path only: left/right alignments, chevrons, the hard-coded "SELECT DATE RANGE" and English month names. | SOS, tracking, in-progress, Activity |

Not in this phase: the Arabic font, Dynamic Type, haptics, VoiceOver labels and a permission primer. They are polish for the first update.

## Phase 5: an SOS nobody answers (D3)

Today an unanswered SOS never ends. The escalation ladder (re-push at 2 minutes, SMS to on-call at 5, "please call us" at 8) runs, but the request stays pending forever and the customer cannot raise another.

- Add a last rung to the existing escalation sweeper: at 15 minutes with no claim, mark the SOS `missed`, notify the customer with the call button, and free them to try again.
- Keep it visible in the admin inbox as missed, so dispatch calls the customer back.
- This uses the existing `expired`-style status handling and the sweeper's lease; it does not touch the claim or job rules.
- Tests: missed after the limit, not while claimed, customer can create a new SOS, dispatcher still sees it.

This is the one item that changes SOS behaviour, so it waits for your answer on D3.

## Phase 6: prove it on real phones, then submit

| Step | What | Who |
|---|---|---|
| 6.1 | Build the release AAB and IPA from the tagged tree with the fixed scripts. Check the AAB in Play's App Bundle Explorer for 16 KB page-size warnings. | Me (AAB); **a Mac** (IPA) |
| 6.2 | Device pass on one iPhone and one Android phone: sign-up with OTP, login, logout, SOS with location allowed and denied, push on a locked screen at each stage, tracking, cash payment, rating, receipt PDF, cold start during a job, Arabic. | **You or a tester**, from a checklist I will write |
| 6.3 | Screenshots at the stores' sizes from that build, with no card or membership screens if D1 is cash-only. | **You**, or me from an emulator |
| 6.4 | Submit to Play internal testing and TestFlight first, then production as a staged rollout. | **You** |

## Order and size

| Phase | Depends on | Size |
|---|---|---|
| 0 One committed tree | Your go-ahead | Half a day |
| 1 Push and packaging | Phase 0; steps 1.1, 1.2, 1.6 from you | 1 day of code, plus your Firebase steps |
| 2 Store compliance | Phase 0 | 1–2 days |
| 3 Production configuration | D4 | Your time; under an hour once the number is known |
| 4 Defects | Phase 0; D5, D6 | 1–2 days |
| 5 Unanswered SOS | D3 | 1 day |
| 6 Device pass and submit | Phases 1–5; a Mac and two phones | 1–2 days, then store review time |

Phases 1, 2, 4 and 5 can run in parallel after Phase 0. The sizes are my estimates for the code work, not commitments; the device pass and store review are the parts I cannot shorten.

## What I cannot do from this machine

- **Build or sign iOS.** This is a Windows machine. Every iOS item (entitlements, privacy manifest, archive) needs a Mac to confirm.
- **Create Firebase or Apple credentials.** `google-services.json`, the APNs key and the App ID capabilities come from your accounts.
- **Test push, GPS prompts or the PDF viewer.** Those need real phones.

## After 1.1.6 (not blockers)

In this order: card payment on with a production webhook test, then Apple Pay; membership, with copy that SOS and towing are never covered; cancel-fee collection; a customer refund request; a land outline for coverage instead of a rectangle; a "no technician available" screen. Chat, wallet, saved cards, promo codes and dark mode come after those.
