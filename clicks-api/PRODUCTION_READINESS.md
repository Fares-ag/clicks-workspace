# Clicks Production Readiness

Last updated: 2026-07-20 (full launch plan Phases 0–7)

## Launch decision

**Critical path is wired in code:** technician Flutter app (login → socket → accept → GPS → lifecycle → payment), customer contract parity, admin MVP gaps hidden, nearby geo, earnings SoT.

**Public launch** still requires ops: Atlas prod, rotated secrets, Azure/SMS live, dogfood, soft-launch flags.

---

## Scorecard (post plan implementation)

| Area | Score | Notes |
|------|------:|-------|
| Security | 72 | Auth, IDOR, socket JWT, internal notify, minimal RBAC, SMS adapter; **rotate exposed secrets** |
| Reliability | 55 | Payment status fixed; single-instance sockets documented; SMS console until provider |
| Data integrity | 70 | Ownership checks; TechnicianEarnings SoT; job compound indexes |
| Realtime / Live Map | 80 | Fanout + tech app publisher + location throttle |
| Mobile apps | 70 | Tech wired; user endpoints aligned; OTP/receipts/FCM present |
| Ops / observability | 55 | Request id + JSON logs; smoke script; CI gitleaks; Atlas/Azure still ops |
| Compliance / PII | 35 | Still cleartext location/phone; retention policy TBD |
| Release process | 55 | CI + soft-launch runbook; store accounts parallel |
| **Overall** | **~68** | Soft-launch capable after secrets/providers |

---

## Secret rotation (required before staging/prod)

Any secret pasted in chat or committed historically is **compromised**.

**Full checklist + templates:** [STAGING_SECRETS.md](./STAGING_SECRETS.md)  
**Generate values:** `node scripts/generate-staging-secrets.js`  
**Env templates:** [`ops/env/`](./ops/env/)

1. **Atlas DB password** — Atlas → Database Access → Edit user → new password → update `MONGODB_URI` on admin + customer-tech. Confirm old password fails. Allowlist VPS IP only.
2. **Google Maps API key** — new key; HTTP referrers = staging admin origin; put only in interface/CI env; delete old key.
3. **JWT_SECRET / JWT_REFRESH_SECRET** — generate new values; **admin + customer-tech `JWT_SECRET` must match**. Restart both APIs together.
4. **INTERNAL_API_SECRET** — new value; must match on both APIs (`x-internal-secret` header).
5. **SMSala** — rotate token if exposed; lock Allowed IP to VPS egress.

Never put real secrets in `.env.example` or git.

---

## Environment matrix

### clicks-admin-api
| Variable | Staging | Production |
|----------|---------|------------|
| `MONGODB_URI` | Atlas **dev** cluster | Atlas **prod** M10+ / backups |
| `JWT_SECRET` | dedicated staging secret | unique prod secret (shared with customer-tech) |
| `JWT_REFRESH_SECRET` | staging | prod |
| `INTERNAL_API_SECRET` | shared with customer-tech | shared with customer-tech |
| `CUSTOMER_TECH_API_URL` | staging tech API | private/internal URL |
| `CORS_ORIGINS` / `FRONTEND_URL` | staging admin origin | prod admin origin(s) |
| `AZURE_STORAGE_*` / email | staging resource | prod resource |
| `PORT` | 5000 | 5000 behind reverse proxy |

### clicks-customer-tech-api
| Variable | Staging | Production |
|----------|---------|------------|
| `MONGODB_URI` | same staging DB as admin | same prod DB as admin |
| `JWT_SECRET` | **must match admin** | **must match admin** |
| `INTERNAL_API_SECRET` | must match admin | must match admin |
| `CORS_ORIGINS` | admin + flutter web origins | production origins only |
| `LAUNCH_PUBLIC_SOS` / `LAUNCH_PUBLIC_SIGNUP` | true for dogfood | true for soft launch; false = kill switch |
| `LAUNCH_REGION` | QA | QA |
| `SMS_PROVIDER` | `smsala` or console | `smsala` + `SMSALA_API_TOKEN` |
| Azure blob | staging | prod |
| `PORT` | 5001 | 5001 |

### clicks-interface
| Variable | Staging | Production |
|----------|---------|------------|
| `VITE_API_BASE_URL` | staging admin API `/api` | prod admin API `/api` |
| `VITE_SOCKET_URL` | staging tech API | prod tech API |
| `VITE_GOOGLE_MAPS_API_KEY` | restricted key | restricted key (HTTP referrers) |

### clicks-user / clicks-technician
| Variable | Staging | Production |
|----------|---------|------------|
| `API_BASE_URL` / `SOCKET_URL` | staging tech API | prod tech API |
| `GOOGLE_MAPS_API_KEY` | staging | prod |
| `ENV` | staging | production |

Never commit `.env`.

---

## Deployment runbook

See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md), [STAGING_DEPLOY.md](./STAGING_DEPLOY.md), [STAGING_E2E.md](./STAGING_E2E.md), and [SOFT_LAUNCH.md](./SOFT_LAUNCH.md).

**Admin UI (production):** prefer **Vercel** — see [`clicks-interface/VERCEL.md`](../clicks-interface/VERCEL.md). APIs stay on the VPS; set `FRONTEND_URL` / `CORS_ORIGINS` to `https://admin.clicks.qa` ([`scripts/apply-vercel-admin-cors.sh`](./scripts/apply-vercel-admin-cors.sh)).

**Host (APIs):** generic Linux VPS. Soft launch = 1 node, PM2×1, no Redis.

1. Atlas prod cluster — not free sandbox; IP allowlist; backups (M10 soft launch; M30 before ~200k public).
2. VPS — Node LTS, PM2 ([`ecosystem.config.js`](./ecosystem.config.js) **instances: 1**), nginx TLS for **admin-api** + **tech-api**.
3. Deploy both APIs; health: `/api/health` (tech reports `socketAdapter`).
4. Deploy Admin UI on Vercel (`npx vercel --prod` / `scripts/vercel-setup-prod.ps1`); DNS `admin.clicks.qa` → Vercel.
5. Mobile — dart-defines for prod URLs.
6. Providers — Blob/Email (Azure env OK) + SMSala; verify OTP.
7. Smoke — `node scripts/smoke-auth.js` + full SOS path on device.
8. Growth — set `REDIS_URL` before `TECH_API_INSTANCES > 1`; sticky sessions on tech API.

### Rollback
- Previous PM2 release / git tag.
- Disable `LAUNCH_PUBLIC_SOS`.
- Atlas PITR only for data disaster.

---

## Go-live checklist

- [ ] Rotate Atlas DB password + Maps API key (exposed in chat/history)
- [ ] Prod Atlas cluster + backups + network lock down
- [ ] Distinct prod `JWT_*` and `INTERNAL_API_SECRET`; admin/tech secrets match
- [ ] CORS allowlists locked to real domains
- [ ] Admin REST 401 without token (verified)
- [ ] notify-technician 401 without internal secret (verified)
- [ ] Socket connect fails without JWT (verified)
- [ ] Customer/tech job IDOR returns 403 (verified)
- [ ] Azure Blob/Email/SMS configured and tested
- [ ] Google Maps key HTTP-referrer restricted
- [ ] Technician app: login, online, accept, location, complete/pay
- [ ] Customer app: register/login/SOS/history/receipt/rate on staging
- [ ] Live Map realtime verified with real device GPS
- [ ] Nearby uses geo ($near), not mock
- [ ] VPS soft launch: PM2 single-instance; health checks green
- [ ] `REDIS_URL` set before any `TECH_API_INSTANCES > 1`
- [ ] CI secret scan + auth smoke
- [ ] Rollback drill completed on staging
- [ ] On-call + runbook owners named in SOFT_LAUNCH.md
- [ ] Soft-launch flags set; dogfood 48h then limited cohort
- [ ] Staging E2E checklist signed (STAGING_E2E.md)
- [ ] Rollback drill completed on staging (SOFT_LAUNCH.md)
- [ ] Load-test gate before public ~200k (see INFRASTRUCTURE.md)

---

## MVP scope

See [MVP_SCOPE.md](./MVP_SCOPE.md).

## P0/P1 implemented (code)

- Admin REST auth + minimal RBAC (Full Admin vs Ops)
- Customer-tech JWT; `INTERNAL_API_SECRET` for notify
- Job/vehicle/SOS ownership checks; socket JWT
- SMS `sendSMS` adapter (+ `sendOTP` wrapper)
- Soft-launch feature flags + `/api/launch-flags`
- Technician Flutter: login, status, socket, GPS, job lifecycle, payment
- Customer endpoint parity (password/OTP/FCM/logout/receipts)
- Admin UI: deferred on-hold/notes/insurance/job-types hidden
- Nearby `$near`; earnings SoT; job indexes
- Observability middleware; smoke script; CI gitleaks
- Infra + soft-launch docs (VPS-first capacity ladder)
- Opt-in Socket.IO Redis adapter (`REDIS_URL`)
