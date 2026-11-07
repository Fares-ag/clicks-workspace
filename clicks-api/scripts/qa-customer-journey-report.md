# Customer journey QA + business-logic report

Date: 2026-10-31. Scope: `clicks-user` + `clicks-customer-tech-api` + `clicks-shared`. Local stack: tech-api `:5001`, admin-api `:5000`, Mongo in Docker `clicks-mongo-qa`.

## Automated results

| Suite | Result |
|---|---|
| Shared unit tests (cancel policy, coverage, hours, dispatch window, garage resume, admin garage filter) | 13/13 pass |
| `customer-booking-rules.integration.test.js` | pass |
| `job-garage.integration.test.js` | 7/7 pass |
| `membership.integration.test.js` | pass |
| `skipcash.integration.test.js` | pass |
| `sos-e2e.integration.test.js` | pass |
| `scripts/qa-customer-intensive.js` against localhost | 11 pass, 0 fail, 1 warn (seed job not owned by QA customer) |

Live API probe on seeded `customer@clicks.local` / `+97433333333`:

- Session after assign: `session_kind=assigned`, `can_book_sos=false`
- Immediate booking while live: `409 LIVE_JOB_ACTIVE`
- `POST /api/jobs/:id/cancel-customer` from assigned: `200`, `cancel_fee_due=false`, then `can_book_sos=true`
- Admin send-to-garage: `on_hold` / `at_garage`; session `session_kind=at_garage`, `can_book_sos=false`
- NYC pin: `400 OUTSIDE_COVERAGE`

Flutter Chrome was not walked end-to-end in this pass (no Maps/key session). App wiring for garage card, cancel-with-fee, coverage/unpaid errors, and service-waiting → in-progress is in code.

## Working (already shipped, re-confirmed)

- OTP register / login / inactive+deleted login block
- SOS create (socket) + admin claim → `sosInCall` (e2e)
- Service request create/cancel, membership checkout + entitlement, SkipCash job pay
- Job history, profile, vehicles, launch flags

## Fixed in this pass

- Booking guards: live job and unpaid completed job block SOS and service requests
- Enriched `GET /api/jobs/customer/session` (`session_kind`, `live_job`, `unpaid_job`, `can_book_sos`)
- Qatar coverage bbox
- Customer job cancel with fee flag (`assigned`/`accepted` free; `en_route`/`arrived` fee; `in_progress` blocked)
- Garage send / ready / resume-blocked / admin list `?garage=at_garage`
- Admin SOS schedule → booking and close as not-a-job, plus `notify-outcome`
- After-hours stamp on SOS (does not block SOS). Dispatch window 06:00–22:00 QT on customer scheduled bookings only
- Customer app: garage banner, cancel on tracking, mapped error codes, waiting screen no longer dumps `in_progress` to home

## Still missing (business analysis — do not build yet unless product decides)

These are real roadside-assistance gaps. They were **not** in the existing test contracts.

1. **Upfront price** — customer commits with no estimate. `GET /api/jobs/:id/total` is mid-job only.
2. **ETA** — tracking is a moving pin. `/api/maps/directions` already returns duration; unused in the customer UI.
3. **Notification inbox** — `/api/notifications/customer` is still a stub. Missed pushes are lost.
4. **Receipt PDF** — download is 501.
5. **Pin / access notes** — no “I’m on the service road” field.
6. **Masked in-app call** — real numbers are exchanged.
7. **Cash selector in the customer app** — cash is technician-confirmed only.
8. **Cancel-fee collection** — we persist `cancel_fee_due` only; no SkipCash charge.
9. **After-hours SOS** — recommend keep 24/7. Stamp `after_hours` / `next_open_at` for dispatch; do not kill SOS at night.
10. **Hardcoded dispatch phones** in the Flutter app (`70090220`, `+97444444444`).

## Recommendation

Ship the rules implemented here (guards, cancel, coverage, garage, session). Treat items 1–2 (price + ETA) as the next customer-anxiety pair; treat 8 as a finance decision before collecting late-cancel fees.
