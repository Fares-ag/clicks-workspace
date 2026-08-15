# Partner Management + Partner App QA checklist

Scope: Admin Partner Management (`clicks-interface`) + acquisition partner app (`clicks-partner`) + admin-api `/api/partners/*` and `/api/partner/*`.

Out of scope: Business Management / `clicks-business*` (dealership portal). No self-serve partner apply/OTP/KYC — partners are admin-provisioned.

---

## Pass / fail (Phase 0)

**PASS:** Admin can create a partner, partner logs into the app, a Google-attributed keyless/tire job accrues to the partner, capped/frozen partner can request a withdrawal, admin can approve and mark paid.

**FAIL:** Accrual missing despite matching job, withdrawal allowed while `active`, duplicate earning on same job, partner sees another partner's data, or inactive partner can log in.

---

## Setup

### Environment

- [ ] Admin logged into `clicks-interface` with **full-admin** role
- [ ] `clicks-admin-api` running and reachable from browser + partner app
- [ ] Partner app API base matches admin-api ([`app_config.dart`](../clicks-partner/lib/core/config/app_config.dart); default staging `http://10.0.2.2:5000` on Android emulator)
- [ ] Device/emulator for `clicks-partner` (Android preferred for FCM accrual push)

### Seed QA partner

Safe to re-run (upserts by email). Creates partner + Google sub-source.

```bash
cd clicks-api
node scripts/seed-partner.js
```

| Field | Value |
|-------|-------|
| Name | Demo Partner |
| Email | partner@clicks.local |
| Phone | +97455550001 |
| Password | Partner123! |
| Investment | 10,000 QAR |
| Profit / period | 4,000 QAR |
| Period 1 cap | 14,000 QAR (investment + period × profit) |
| Period length | 2 months |
| Initial status | active |

Alternatively, create a fresh partner from Admin → Partner Management → Add partner (use a unique name for accrual tests).

### Accrual prerequisites (Google subSource = partner name)

Partner earnings credit **only** when **all** of the following are true on job completion:

1. Job status is `completed`
2. Job type is `keyless_car_opening` or `tire_change`
3. Source main name is **Google**
4. Job `subSource` matches partner **name** (case-insensitive)
5. Partner is `isActive: true` and status `active`
6. Remaining room under period cap (partial credit if job price exceeds remaining)

Creating a partner (admin UI or `seed-partner.js`) calls `ensureGoogleSourceWithSubSource(name)`, which adds a Google sub-source with the same name as the partner. Jobs must use that sub-source at completion time.

**QA job tip:** Complete a small-price Google + matching subSource keyless or tire job via admin Jobs or customer-tech flow. Note partner name and subSource must match exactly (case-insensitive).

### Status reference

| Status | Meaning |
|--------|---------|
| `active` | Accruing from attributed completed jobs |
| `capped` | Accrued ≥ period cap; accrual paused |
| `frozen` | Period ended with accrued < cap; accrual paused |
| `inactive` | Account off; no login, no accrual |

Withdrawals are allowed only when status is `capped` or `frozen`, and only one `pending` withdrawal at a time.

---

## Recommended execution order

1. Setup + seed → Phase A (create/login) + Phase F (auth)
2. Phase C (accrual happy path + negatives)
3. Drive to `capped` or `frozen` → Phase E (withdrawals) + Phase D (next period)
4. Phase B (terms/inactive) + Phase F (profile) + Phase G (permissions)

---

## Phase 2 — Server (automated)

```bash
cd clicks-api
node scripts/seed-partner.js
node scripts/qa-partner.js
```

Results file: `scripts/qa-partner-results.json`

---

## Phase A — Admin list and create

Pages: [`Partners.jsx`](../clicks-interface/src/pages/PartnerManagement/Partners.jsx) → `/partners`

| ID | Case | Steps | Pass if |
|----|------|-------|---------|
| A1 | List + filter | Open `/partners`; toggle status filter | Table loads; filters all / active / capped / frozen / inactive work |
| A2 | Search | Search by name, email, phone | Only matching rows shown |
| A3 | Create with defaults | Add partner: name, phone, email, password ≥6, defaults for investment/profit/cap/months | Created `active`, period 1, cap ≈ investment + profit; row appears in list |
| A4 | Duplicate name | Create partner with same name as existing (different casing OK) | 409 / clear “name already exists” error |
| A5 | Short password | Password &lt; 6 characters | Rejected with validation error |
| A6 | App login | Log into `clicks-partner` with new credentials | Login succeeds; home/dashboard loads |

- [x] A1
- [x] A2
- [x] A3
- [x] A4
- [x] A5
- [x] A6

---

## Phase B — Admin details and terms

Page: [`PartnerDetails.jsx`](../clicks-interface/src/pages/PartnerManagement/PartnerDetails.jsx) → `/partners/:id`

| ID | Case | Steps | Pass if |
|----|------|-------|---------|
| B1 | Detail view | Open partner detail | Stats, accrued/cap progress, earnings table, withdrawals section render |
| B2 | Edit terms | PATCH investment, profit, cap, months, period #, dates; try “Use formula cap” | Saves; end date after start; formula cap recalculates |
| B3 | Inactive | Set status inactive | Partner cannot log in; completing attributed job does not accrue |
| B4 | Reactivate | Set back to active (if not hard-inactive path) | Status refresh may show capped/frozen if cap/dates warrant |

- [x] B1
- [x] B2
- [x] B3
- [x] B4

---

## Phase C — Accrual end-to-end

Service: [`partnerService.js`](../clicks-shared/services/partnerService.js)

| ID | Case | Steps | Pass if |
|----|------|-------|---------|
| C1 | Happy path | Complete Google job, matching subSource, keyless/tire, partner `active` | `PartnerEarning` created; accrued increases; job has `partner_id`; admin earnings + app recent earnings update |
| C2 | Idempotent | Re-trigger complete on same job (or attempt double credit) | No second earning for same job |
| C3 | Negative gates | Try wrong job type, non-Google source, wrong subSource, inactive partner | No credit in each case |
| C4 | Partial cap | Job price &gt; remaining cap room | Partial credit only; status becomes `capped` when cap reached |
| C5 | Frozen | Set period end in past with accrued &lt; cap; refresh list/detail | Status becomes `frozen` |
| C6 | FCM (optional) | Partner logged in on device with FCM token; accrue | Push notification received on accrual |

- [x] C1
- [x] C2
- [x] C3
- [x] C4
- [x] C5
- [ ] C6

---

## Phase D — Period advance

| ID | Case | Steps | Pass if |
|----|------|-------|---------|
| D1 | Start next period | From `capped` or `frozen`, use Start next period | Period # increments; new cap/dates; status moves toward `active` per API |
| D2 | Block while active | Partner still `active` | Button hidden or API rejects |

- [x] D1
- [x] D2

---

## Phase E — Withdrawals (app + admin)

App: [`home_screen.dart`](../clicks-partner/lib/features/home/home_screen.dart)  
API: `/api/partner/withdrawals`, admin PATCH `/api/partners/:id/withdrawals/:withdrawalId`

| ID | Case | Steps | Pass if |
|----|------|-------|---------|
| E1 | While active | Open app home while partner `active` | Withdraw UI hidden/disabled or POST rejected |
| E2 | Request | Partner `capped` or `frozen`; submit earnings / investment / both | Correct amounts shown; creates `pending` withdrawal |
| E3 | Duplicate pending | Submit second request while one pending | 409 “already have a pending withdrawal” |
| E4 | Approve → pay | Admin approve, then mark paid | Status transitions; app reflects cleared/open state |
| E5 | Reject | Admin reject pending | Partner can submit again |
| E6 | Pay from pending | Admin mark paid directly from pending | Allowed; status `paid` |

- [x] E1
- [x] E2
- [x] E3
- [x] E4
- [x] E5
- [x] E6

---

## Phase F — Partner app auth and profile

Screens: login, home, profile in `clicks-partner/lib/features/`

| ID | Case | Steps | Pass if |
|----|------|-------|---------|
| F1 | Login | Email + password | Dashboard shows stats, days left, recent earnings |
| F2 | Bad creds / inactive | Wrong password; or inactive account | Clear error; no token stored |
| F3 | Change password | Profile → change password | Old password fails; new works |
| F4 | Update contact | Change phone/email in profile | Persists on `/api/partner/me` and admin detail |
| F5 | Session | Logout; reopen app | Token cleared; routes to login |
| F6 | i18n (optional) | Toggle EN/AR | Critical labels readable |

- [x] F1
- [x] F2
- [x] F3
- [x] F4
- [ ] F5
- [ ] F6

---

## Phase G — Permissions and isolation

| ID | Case | Steps | Pass if |
|----|------|-------|---------|
| G1 | Non–full-admin | Call `GET /api/partners` without full-admin role | 403 |
| G2 | Partner JWT on admin | Partner token on `/api/partners/:id` | 403 |
| G3 | Cross-partner data | Partner A token on Partner B ids (if exposed) | Only own `/api/partner/*` data returned |

- [x] G1
- [x] G2
- [x] G3

---

## Latest run (2026-08-15)

| Check | Result |
|-------|--------|
| Date | 2026-08-15 |
| Admin API | `http://localhost:5000` |
| Automated script | **42 PASS / 0 FAIL** (`node scripts/qa-partner.js`) |
| Phase 0 | **PASS** |
| Seed partner | PASS (`Demo Partner`, partner@clicks.local) |
| A Admin create/list | PASS (A1–A6) |
| B Admin terms | PASS (B1–B4, incl. reactivate after fix) |
| C Accrual happy path | PASS (500 QAR credited, job linked) |
| C Accrual negatives | PASS (wrong type/source/subSource/inactive) |
| C Partial cap / frozen | PASS (550 partial cap; frozen on past period end) |
| E Withdrawals | PASS (E1–E6 via API) |
| D Next period | PASS (period 2 from capped; blocked while active) |
| F App auth/profile | PASS F1–F4 via portal API; F5/F6 manual skip |
| G Permissions | PASS (403 for dispatcher + partner on admin routes) |
| C6 FCM | SKIP (needs device) |

**Notes:** B4 fixed in `partnerController.updatePartner` — explicit `status: "active"` now reactivates from `inactive`, then `refreshPeriodStatus` runs as before.

**Follow-ups:** Manual smoke on `clicks-interface` Partner Management UI and `clicks-partner` Flutter app (F5 session, F6 i18n, C6 FCM).
