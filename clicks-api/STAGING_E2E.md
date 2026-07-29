# Staging smoke + E2E checklist

Do **not** enable `REDIS_URL` or `TECH_API_INSTANCES>1` until this checklist is green on single-node staging.

## A. Automated auth smoke

```bash
cd clicks-api
ADMIN_URL=https://stg-admin-api.clicks.qa \
TECH_URL=https://stg-tech-api.clicks.qa \
node scripts/smoke-auth.js
```

Optional with credentials (login + live-map):

```bash
ADMIN_URL=https://stg-admin-api.clicks.qa \
TECH_URL=https://stg-tech-api.clicks.qa \
ADMIN_EMAIL=admin@clicks.local \
ADMIN_PASSWORD='...' \
TECH_PHONE='974...' \
TECH_PASSWORD='...' \
INTERNAL_API_SECRET='...' \
node scripts/smoke-staging.js
```

## B. Manual E2E (full SOS path)

### B1. Admin
- [ ] Open `https://stg-admin.clicks.qa` — login works
- [ ] Jobs list loads (no console 401/404 on critical paths)
- [ ] Live Map loads tiles (Maps key OK); no empty-key error
- [ ] Unauthenticated `GET /api/jobs` → 401
- [ ] Unauthenticated `GET /api/technicians/live-map` → 401

### B2. Technician app
- [ ] Login with staging tech account
- [ ] Toggle Online — `PATCH /api/technicians/status` succeeds
- [ ] Socket connects to `stg-tech-api` (`/technician` + JWT)
- [ ] Within ~2s, Live Map marker moves when GPS updates

### B3. Customer → fulfill
- [ ] Customer register/login (OTP via SMSala if enabled)
- [ ] Create SOS (or admin creates job from SOS)
- [ ] Admin assigns technician
- [ ] Tech receives `newJobAssigned` / sees job
- [ ] Tech Accept → En route → Arrived → Start → Complete
- [ ] Tech Confirm payment (`paymentReceived` / payment_status paid)
- [ ] Customer can rate
- [ ] Receipt fetch `GET /api/receipts/job/:id` (or admin receipt) works if receipt exists

### B4. Notify secret
- [ ] `POST /api/sos/notify-technician` without secret → 401
- [ ] With `x-internal-api-secret` / configured header + valid job → 200

### B5. Flags
- [ ] `GET /api/launch-flags` → `publicSos` / `publicSignup` true for dogfood
- [ ] Tech health → `"socketAdapter":"memory"`

## Sign-off

| Field | Value |
|-------|--------|
| Date | |
| Staging URLs | |
| Tester | |
| Smoke script | PASS / FAIL |
| Full SOS path | PASS / FAIL |
| Notes | |

When signed off → proceed to [SOFT_LAUNCH.md](./SOFT_LAUNCH.md) dogfood.
