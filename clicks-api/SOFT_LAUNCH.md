# Soft launch & go-live (Phase 7)

## Infra posture

- Soft launch: **1 VPS**, PM2×1, **no** `REDIS_URL`, Atlas M10+. See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) and [STAGING_DEPLOY.md](./STAGING_DEPLOY.md).
- Secrets: [STAGING_SECRETS.md](./STAGING_SECRETS.md).
- E2E gate: [STAGING_E2E.md](./STAGING_E2E.md) green before dogfood expand.
- Before multi-instance or public ~200k: set `REDIS_URL`, sticky nginx, Atlas M30+, load-test gate.

## Owners (fill before go-live)

| Role | Name | Contact |
|------|------|---------|
| On-call primary | REPLACE_ONCALL_PRIMARY | |
| On-call backup | REPLACE_ONCALL_BACKUP | |
| Deploy / VPS owner | REPLACE_DEPLOY_OWNER | |
| Atlas / secrets owner | REPLACE_SECRETS_OWNER | |

## Feature flags

On customer-tech-api staging/prod:

```bash
LAUNCH_PUBLIC_SOS=true          # set false for emergency kill-switch
LAUNCH_PUBLIC_SIGNUP=true       # restrict signup if needed
LAUNCH_REGION=QA
```

Customer/tech mobile builds: Qatar-only store listing / geo messaging as ops policy.

Kill switch: set `LAUNCH_PUBLIC_SOS=false` on customer-tech, `pm2 restart clicks-customer-tech-api`.

## Dogfood 48h checklist

Prereq: [STAGING_E2E.md](./STAGING_E2E.md) signed off.

| Hour | Check | Owner | Done |
|------|--------|-------|------|
| 0 | Staging health probes green; smoke-staging.js PASS | | [ ] |
| 0–4 | Staff techs online; Live Map lag &lt; ~2s | | [ ] |
| 0–24 | ≥3 full SOS paths (create→assign→accept→pay→rate) | | [ ] |
| 24 | Review PM2 restarts, 5xx, SMS delivery failures | | [ ] |
| 24–48 | Continue staff jobs; note crash-free sessions | | [ ] |
| 48 | Go / no-go for limited Doha cohort (≥5 techs) | | [ ] |

Metrics to watch: SOS accept time, Live Map lag, OTP success rate, API 5xx, PM2 restarts.

## Sequence

1. **Internal dogfood (48h)** — table above.
2. **Limited cohort** — ≥5 active techs in Doha; same monitors.
3. **Public expand** — open signup/SOS if metrics stable; enable Redis only before raising `TECH_API_INSTANCES`.

## Rollback

| Layer | Action |
|-------|--------|
| API | `cd $CLICKS_API_ROOT && git checkout <previous_sha> && pm2 restart all` |
| SOS kill | `LAUNCH_PUBLIC_SOS=false` + restart customer-tech |
| Mobile | previous store / TestFlight build |
| Data | Atlas PITR only for catastrophic corruption |

## Rollback drill (staging) — required once

| Step | Action | Actual time | Owner |
|------|--------|-------------|-------|
| 1 | Note current git SHA (revision A); health green | | REPLACE_DEPLOY_OWNER |
| 2 | Deploy revision B (empty commit or known change) | | |
| 3 | Confirm B healthy | | |
| 4 | Revert to A: `git checkout <A> && pm2 restart all` | | |
| 5 | Smoke: `node scripts/smoke-auth.js` + admin login | | |
| 6 | Record TTR (time to recover) | | |

Drill date: ________  TTR: ________  Pass: [ ]

## Go-live checklist

See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) — all items must be checked before public expand.
