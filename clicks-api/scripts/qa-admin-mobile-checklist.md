# QA checklist — Admin mobile app (`clicks-admin`)

Scope: Flutter admin app + admin-api auth/FCM endpoints + tech-api socket/FCM dispatch push.

**PASS:** Ops dispatcher logs in on mobile, receives SOS via socket (foreground) and FCM (background/killed), claims/creates job; full admin reaches drawer modules.

## Prerequisites

- [ ] `clicks-admin-api` running (local `:5000` or staging/production)
- [ ] `clicks-customer-tech-api` running (socket + FCM)
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` set on tech-api (admin dispatch push)
- [ ] Firebase config in `clicks-admin/android/app/google-services.json`
- [ ] Test admin users:
  - Ops: Job Dispatcher role
  - Full: Admin or Super Admin role
- [ ] Customer app or Postman to trigger SOS / service request

## Build matrix

| # | State | Action | Expected |
|---|-------|--------|----------|
| M1 | Debug | `flutter run` against local admin-api | Login → home shell |
| M2 | Release | `flutter build apk --release --dart-define=ENV=production` | App launches, HTTPS only |
| M3 | Android 13+ | Deny then grant notification permission | FCM registers after grant |

## Auth & session

- [ ] Login with valid admin email/password → lands on main shell
- [ ] Invalid credentials → error message, no token stored
- [ ] Kill app → relaunch → splash validates `/api/auth/me`, stays logged in
- [ ] Deactivated admin → `/api/auth/me` returns 403 → forced to login
- [ ] Access token expiry → silent refresh via refresh token → request succeeds
- [ ] Logout → FCM token cleared, socket disconnected

## RBAC

- [ ] Job Dispatcher sees: dashboard, SOS, requests, jobs, leads, map, techs
- [ ] Job Dispatcher does **not** see drawer items: finance, partners, admin management
- [ ] Super Admin sees drawer modules (businesses, partners, finance, etc.)

## Realtime (foreground)

- [ ] Admin mobile + web admin both connected
- [ ] Customer creates SOS → mobile shows in-app notification within ~2s
- [ ] Tap **Create job** → navigates to new job form prefilled from SOS
- [ ] Another dispatcher claims SOS → first device shows "claimed by another dispatcher"
- [ ] Service request created → notification + service requests list refreshes

## FCM (background / killed)

- [ ] Admin logged in, FCM token saved (`PUT /api/auth/fcm-token`)
- [ ] App backgrounded → trigger SOS → system notification appears
- [ ] App killed → trigger SOS → system notification appears
- [ ] Tap notification → app opens to SOS tab

## Ops workflows

- [ ] SOS list loads, search works
- [ ] Claim SOS → status updates
- [ ] Create job from SOS → job appears in jobs list
- [ ] Jobs list/detail, call client (`tel:`) opens dialer
- [ ] Lead convert → creates job
- [ ] Live map shows online technicians (requires `GOOGLE_MAPS_API_KEY`)
- [ ] Technician detail loads

## Phase 2 (full admin)

- [ ] Vehicles, clients lists load
- [ ] Businesses, partners lists load (admin only)
- [ ] Finance overview cards load
- [ ] Admin management list loads
- [ ] Performance export opens CSV URL
- [ ] Support tickets load from tech-api `/api/contact-us`

## Web parity (ops-first alignment)

Compare mobile vs `clicks-interface` for the same admin user and backend:

- [ ] **Sidebar:** Persistent sidebar with same nav items, RBAC, and badge counts (SOS pending+in_call, service pending, open leads)
- [ ] **SOS:** Claim → job create with all required fields prefilled from SOS payload
- [ ] **Service request:** Pending row → **Add Lead** (not lead detail by SR id); lead form prefilled
- [ ] **Lead convert:** Same job created as web for identical convert input (location, dateTime, jobType, price, issue, technician)
- [ ] **Job create:** Full Add New Job validation (phone E.164, make/model, source, price, datetime)
- [ ] **Job detail:** Assign/reassign technician, cancel with reason, open in maps link
- [ ] **Live map:** REST poll ~8s + socket `joinLiveMap`; marker moves within 8s of tech location update; stale badge visible
- [ ] **Maps key:** Shared `VITE_GOOGLE_MAPS_API_KEY` via `scripts/read-maps-key.ps1`; map renders on Android + web
- [ ] **Design:** Helvetica-style typography, admin cards, status pills match web inbox tables

**Exit criteria:** Dispatcher completes a full shift on mobile without opening web for SOS → job, SR → lead, lead → convert, job assign/cancel, and live map monitoring.

## Regression

- [ ] Web admin (`clicks-interface`) still receives same socket events
- [ ] Business/partner apps unaffected by Admin `fcm_token` field

## Sign-off

| Role | Name | Date | Build |
|------|------|------|-------|
| Dispatch QA | | | |
| Full admin QA | | | |
| Release | | | |
