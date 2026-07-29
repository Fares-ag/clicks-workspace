# Local platform test (before VPS)

Test everything on your machine. No DigitalOcean required.

## Ports

| App | URL |
|-----|-----|
| Admin UI | http://localhost:3000 |
| Admin API | http://localhost:5000 |
| Tech/Customer API + sockets | http://localhost:5001 |
| Customer Flutter (Chrome) | http://localhost:8080 |
| Technician Flutter (Chrome) | http://localhost:8081 |

## Seed demo data (if platforms look empty)

```powershell
cd C:\Users\TS\Downloads\clicks-api
node scripts/seed-demo-data.js
```

Creates: admin, 2 techs (Live Map), customer, vehicles, sources, 4 jobs, FAQs.

## Seed logins (local/dev)

| Role | Credentials |
|------|-------------|
| Admin | `admin@clicks.local` / `Admin123!` |
| Tech Omar | `+97411111111` or `omar.tech@clicks.local` / `Tech123!` |
| Tech Sara | `+97422222222` / `Tech123!` |
| Customer | `customer@clicks.local` / `Customer123!` (phone `+97433333333`) |
| Business portal | `business@clicks.local` / `Business123!` (phone `+97444440001`, Al-Mana Showroom) |

Business portal seed only:

```powershell
cd C:\Users\TS\Downloads\clicks-api
node scripts/seed-business-portal.js
```

Or via Admin API (Super Admin): `POST /api/businesses` then `POST /api/businesses/:id/users`.

### Business portal showroom scenario

1. Install `clicks-business` APK (`ENV=production` → admin-api Railway).
2. Login as `business@clicks.local` / `Business123!`.
3. Tap **New Job** → submit walk-in customer details.
4. In admin Job Management, job shows **Business** tag (`Al-Mana Showroom`).
5. Ops assigns technician; business app job list/detail updates status.
6. Cut snapshot (`businessCutType` / `businessCutPercent`) stored on the job.

Business Flutter app talks to **Admin API** (`http://localhost:5000` locally / `https://clicks-admin-api-production.up.railway.app` in production).

## 1. Start backends + admin UI

Three terminals:

```powershell
cd C:\Users\TS\Downloads\clicks-api\clicks-admin-api
npm run dev

cd C:\Users\TS\Downloads\clicks-api\clicks-customer-tech-api
npm run dev

cd C:\Users\TS\Downloads\clicks-interface
npm run dev
```

Smoke:

```powershell
cd C:\Users\TS\Downloads\clicks-api
$env:ADMIN_URL="http://localhost:5000"
$env:TECH_URL="http://localhost:5001"
node scripts/smoke-auth.js

$env:ADMIN_EMAIL="admin@clicks.local"
$env:ADMIN_PASSWORD="Admin123!"
# optional: TECH_PHONE, TECH_PASSWORD, INTERNAL_API_SECRET from .env
node scripts/smoke-staging.js
```

## 2. Admin UI checklist

1. Open http://localhost:3000 (or :3002) → login as admin  
2. **Jobs** — list loads, no red console 404s on core paths  
3. **Live Map** — map tiles load (Maps key in `clicks-interface/.env`)  
4. **Technicians** — Omar/Sara visible  
5. **SOS Inbox** (`/sos`) — pending / in_call / recent expired SOS remain visible after the live modal countdown ends  
6. SOS broadcast window: `SOS_BROADCAST_SECONDS` on customer-tech-api (default 60; local example uses 120). Abandoned Create Job auto-expires after `SOS_IN_CALL_TIMEOUT_MINUTES` (default 15).  

## 3. Technician app

Always pass dart-defines (never rely on production defaults for local):

```powershell
cd C:\Users\TS\Downloads\clicks-technician
flutter run -d chrome --web-port=8081 `
  --dart-define=API_BASE_URL=http://localhost:5001 `
  --dart-define=SOCKET_URL=http://localhost:5001
```

1. Login: phone `+97411111111` (or `97411111111`) / `Tech123!`  
2. If application status is Pending, wait for Approved (seeded Omar is Approved) → Home  
3. Go **Online** (allow Chrome location when prompted; login must not depend on GPS)  
4. Pull-to-refresh home; accept assigned/new jobs; En route → Arrived → Start → Complete → Payment  
5. Confirm Live Map marker updates in admin  

### Soft-launch checklist (tech fulfill path)

Omar expertise must include the job type (`Tires` / `Engines` / `Gearbox`). Assign only works when Omar is **Online** (or On Job).

| Step | Expect |
|------|--------|
| Splash with valid token | Revalidates session; Approved → Home (not stale cache alone) |
| Online toggle | Works even if GPS denied; yellow banner if Live Map won't update |
| Admin assigns Tires/Engines/Gearbox job | Tech gets job via socket and/or ≤25s session poll |
| Accept / Reject | Reject asks for a reason; card shows issue, location, customer, phone, price |
| En route → Arrived → Start → Complete | Buttons show loading; REST-first — UI never stuck if socket confirm drops |
| Payment | Shows price; choose cash / card / wallet; then clears active job |
| Kill tab / refresh mid-job | Splash → Home with same active job from session |
| Logout | Socket disconnected + cache cleared; re-login clean (no ghost JWT socket) |
| History | Read-only past completed/cancelled from `GET` tech jobs (if present) |

Stuck customer SOS locally: `node scripts/clear-stuck-sos.js`  
Do **not** set `REDIS_URL` or `TECH_API_INSTANCES>1` for soft launch.

### Tech app — intentionally thin / skipped

| Item | Why |
|------|-----|
| FAQ / Privacy / Terms | Wired via `GET /api/content/*` (Settings) |
| Navigate | Opens Google Maps search from job `location` string (no lat/lng on Job) |
| Earnings weekly bars | Shown when `performance.earningsData` has points; else empty hint |
| Photo / voice on Complete | **Skipped** — `POST /api/jobs/:id/complete` has no media fields |
| Tech notification inbox | **Skipped** — only customer notification stubs exist |
| Contact Us | **Skipped** — `/api/contact-us` is customer-auth only |
| Chat / Stripe | Post-MVP per `MVP_SCOPE.md` |

## 4. Customer app

```powershell
cd C:\Users\TS\Downloads\clicks-user
flutter run -d chrome --web-port=8080 `
  --dart-define=API_BASE_URL=http://localhost:5001 `
  --dart-define=SOCKET_URL=http://localhost:5001
```

Seeded login: phone `+97433333333` / `Customer123!` (or email `customer@clicks.local` if login supports it — prefer phone).

1. Login (or register + OTP — OTP printed in API terminal when `SMS_PROVIDER=console`)  
2. Vehicles → SOS → track technician on map  
3. Tech fulfills job (section 3) → customer rates → Activity → receipt (`GET /api/receipts/job/:id`)  
4. Forgot/change password, logout, FCM token save (best-effort on web)  

## 5. Full SOS path (local E2E)

1. `node scripts/seed-demo-data.js`  
2. Admin + both APIs running; CORS includes Flutter web ports you use (8080/8081/8082)  
3. Customer SOS **or** admin assign job to Omar  
4. Tech: Online → accept → lifecycle → payment  
5. Customer: rate + open receipt from history  
6. Leave `REDIS_URL` empty; do not set `TECH_API_INSTANCES>1`  

## 6. Pass / fail

Use the same flow as [STAGING_E2E.md](./STAGING_E2E.md) but with `localhost` URLs.

When local E2E is green → then buy the Droplet and follow [STAGING_DEPLOY.md](./STAGING_DEPLOY.md).

## Notes

- SMS on local may be `console` or SMSala — check `clicks-customer-tech-api/.env` (`SMS_PROVIDER`). Console = OTP printed in API terminal.  
- Chrome geolocation for tech GPS can be flaky; use a real phone later for Live Map confidence.  
- Leave `REDIS_URL` empty.  
- Admin UI may bind to **3002** if 3000 is busy — update CORS accordingly and restart APIs.
