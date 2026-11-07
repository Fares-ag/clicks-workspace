# QA Report — Clicks Admin mobile (`clicks-admin`)

**Date:** 2026-10-15  
**Workspace HEAD:** `65f5385` (2026-10-14) plus this QA pass (uncommitted)  
**Flutter:** 3.44.6 / Dart 3.12.2 (`C:\Users\TS\flutter\bin\flutter.bat`)  
**Automation:** `qa-admin-mobile-static.js` · `qa-admin-mobile-smoke.js` · `flutter analyze` · `flutter test`

## Environment

| Layer | Target | Notes |
|-------|--------|-------|
| Staging admin API | `https://stg-admin-api.clicks.qa` | **ENOTFOUND** from this machine — skipped |
| Live admin API | `https://clicks-admin-api-production.up.railway.app` | `/api/health` 200 — smoke ran here |
| Live tech / sockets | `https://clicks-tech-api-production.up.railway.app` | not exercised (no device) |
| Super Admin | `admin@clicks.local` | login 200, role Super Admin |
| Job Dispatcher | `qa-job-dispatcher@clicks.local` | login 200, role Job Dispatcher |
| Device | Physical Android 13+ | **Not available in this agent run** |

Do not treat this report as Play-track sign-off. Device FCM, maps render, and drawer/deep-link UI still need a human pass on a **signed release APK**.

---

## Executive summary

| Area | Verdict | Evidence |
|------|---------|----------|
| Layer 0 — build gate | **PASS** | `flutter pub get` after `file_picker` ^13.1.0; `flutter test` **15/15**; `flutter analyze --no-fatal-infos` **0 errors** (30 Flutter 3.33 deprecation infos). **Release APK built:** `clicks-admin/build/app/outputs/flutter-apk/app-release.apk` (61.7MB, 2026-10-15). ENV fail-closed verified. Static **158/158**. |
| Layer 1 — API smoke | **PASS 81/81** | Dispatcher **403** on every full-admin prefix; Super Admin **200** on every mobile GET. Tagged QA job created, filtered, reassigned, held, resumed, **deleted**. Results: `qa-admin-mobile-smoke-results.json`. |
| Layer 2 — two-role matrix | **API + code PASS; device BLOCKED** | Router `_shell` calls `AdminRoles.canAccessPath`. Dispatcher cannot reach `/finance` etc. in the role helper (unit test). Physical drawer / typed-path check not run. |
| Layer 3 — features | **API subset PASS; device BLOCKED** | Auth, jobs, reassign, hold/resume, finance summary, heatmap/nearby, lists. SOS overlay, FCM killed, maps tiles, CRUD forms: human. |
| Layer 4 — edges | **P1s found and fixed** | Dropdown crash, vehicle-config nav hidden, `file_picker` 13 API, `pub get` win32 clash. Remaining: device-only (airplane, Android 13 notify, maps key). |
| Layer 5 — ship | **Not signed off** | P0 = 0 in code/API. Internal Play track waits on device FCM + release APK install. |

---

## Defect log

| ID | Severity | Area | Repro | Expected | Actual | Status |
|----|----------|------|-------|----------|--------|--------|
| QA-1 | P1 | Nav / vehicle config | Super Admin opens drawer or `canAccessModule('vehicle-makes')` | Vehicle Makes/Models reachable | Not in `kAdminNavItems` → `canAccessModule` returned false → drawer filtered them out | **Fixed** — added nav items + Vehicles “Vehicle config” button (web parity) |
| QA-2 | P1 | Job edit / assign | Open edit job or assign when source/tech list empty or assigned tech is a Map | No crash | `DropdownButtonFormField` value not in items; `assignedTechnician.toString()` on a Map | **Fixed** — `safeDropdownValue` + `assignedTechnicianId` |
| QA-3 | P1 | Layer 0 deps | `flutter pub get` on Flutter 3.44 | Resolves | `file_picker` ^8 vs `flutter_secure_storage` win32 5/6 clash | **Fixed** — `file_picker: ^13.1.0` + import API (`FilePicker.pickFiles` / `readAsBytes`) |
| QA-4 | P1 | Analyze | `flutter analyze` | 0 errors | `AdminLabeledField` missing import on edit job; file_picker 13 getters gone | **Fixed** |
| QA-5 | P2 | Analyze | Dropdowns | `initialValue` on Flutter 3.33+ | 20+ `deprecated_member_use` on `value:` | Open — non-blocking infos |
| QA-6 | P2 | Dio | Any 403 | Stay logged in unless `/auth/me` | Interceptor clears session on **any** 403 | Open — not hit on dispatcher happy path (earnings charts gated). Watch if a list ever 403s. |
| QA-7 | ENV | Staging | Smoke default URL | `stg-admin-api.clicks.qa` | DNS ENOTFOUND — fell back to Railway prod | Open — infra, not app |
| QA-8 | — | Device | Release APK + FCM + maps + two-role UI | Human pass | Agent has no physical Android | **BLOCKED** — run `qa-admin-mobile-full.md` |

**Severity:** P0 ship-blocker (crash, data loss, RBAC leak, SOS/FCM dead). P1 workflow broken. P2 polish.

---

## Layer 0

```
flutter pub get          PASS (after QA-3)
flutter analyze          0 errors / 30 infos (`--no-fatal-infos`)
flutter test             15/15 PASS
node qa-admin-mobile-static.js   158/158 PASS
flutter build apk --release --dart-define=ENV=production
                         PASS  61.7MB  clicks-admin/build/app/outputs/flutter-apk/app-release.apk
```

`fl_chart` 0.70.2 resolved. Release still **fails closed** without `ENV` (`app_config.dart`) and without `android/key.properties` (Gradle).

---

## Layer 1 — live matrix (Railway)

Dispatcher **allow (200):** dashboard summary + job-completion, SOS, SR, jobs, leads, technicians, live-map, sources GET, vehicle-makes/models GET, customers, vehicles, job by id, repairs, receipt 404.

Dispatcher **deny (403):** earnings, technician-performance, earnings-by-date, heatmap, nearby, finance-overview, technician-activity, performance, admins, businesses, partners, finance-users, POST sources, POST jobs/import, DELETE jobs.

Super Admin **200** on all of the above (receipt 404 = empty job, accepted).

Feature job `6ad063a30ed0284222d0a073`: create → filter → reassign → hold → on_hold list → resume → **deleted**.

---

## Layer 2–4 (code + API vs device)

| Case | Result | Notes |
|------|--------|-------|
| L2-DISP-NAV | CODE PASS / DEVICE BLOCKED | `filterNavItems` + drawer `isFullAdmin` |
| L2-DISP-DENY `/finance` | CODE PASS / DEVICE BLOCKED | `_shell` access-denied copy |
| L2-DASH-CHARTS | CODE PASS | `isFullAdmin` before `DashboardCharts` |
| A1–A5 auth API | PASS | login / invalid 401 / me / refresh |
| A6 logout FCM | BLOCKED | device |
| D1–D3 SOS / FCM | BLOCKED | device + customer app |
| D5 reassign / hold / resume | API PASS | hold only from accepted+ (matches UI) |
| D6 on-hold reassign disabled | CODE PASS | `canReassignJob` returns false for `on_hold` |
| D7 filter query params | CODE + API PASS | `job_filters.toQuery` + list `?status=assigned&jobOrigin=dispatch` |
| D8 import / delete | API PASS | import 400 without file; delete cleaned QA job |
| M1–M2 maps tiles | API PASS / render BLOCKED | heatmap + nearby 200; tiles need key + device |
| F1 finance | API PASS | summary `pendingComputed` present |
| F2–F12 CRUD / calls | LISTS PASS / FORMS BLOCKED | GET 200; create/edit UI not tapped |
| E1 dropdown | **Fixed** (QA-2) | |
| E2 chip vs sheet | CODE REVIEW | chip writes `_filters.status`; extraFilters + chip merge — chip wins when set; advanced sheet updates same `_filters` |
| E3 Qatar date | UNIT PASS | `QatarDate` does not UTC-shift calendar day |
| E7 source lock | CODE PASS | edit disables source + omits from PUT |
| E5 / E6 / E8 / E9 | BLOCKED | device |

---

## Sign-off

Internal Play track only after **P0 = 0** and a human device pass.

| Role | Name | Date | Build SHA / APK date | Verdict |
|------|------|------|----------------------|---------|
| Dispatch QA (API) | agent | 2026-10-15 | `65f5385` + QA fixes / `app-release.apk` 61.7MB | API green; device FCM pending |
| Full-admin QA (API) | agent | 2026-10-15 | same | API green; CRUD UI pending |
| Release | agent | 2026-10-15 | `app-release.apk` 2026-10-15 05:30 UTC | Built; not installed on a phone |

**Human next steps**

1. Install the release APK from this pass on Android 13+.
2. Walk [`qa-admin-mobile-full.md`](./qa-admin-mobile-full.md) as Job Dispatcher and Super Admin (especially D1–D3, L2-DISP-DENY typed `/finance`, M1–M2, E9).
3. Attach screenshots / job ids; flip BLOCKED rows to PASS/FAIL.
4. Upload to Play **internal** only when P0 remains 0.
