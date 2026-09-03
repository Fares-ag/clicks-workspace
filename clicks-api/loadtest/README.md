# Clicks load test harness (staging only)

Measure p95/p99 against synthetic job volume — never guess at 1M scale.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed locally
- Staging API URLs and tokens (see `STAGING_SECRETS.md`)
- Node 18+ for seed/cleanup scripts

## Run order

1. **Seed** synthetic jobs (start with 100k, scale to 1M):

```bash
cd clicks-api
set JOBS=100000
set MONGODB_URI=<staging-uri>
node loadtest/seed-loadtest-data.js
```

2. **Run scenarios** (set `STAGING_*` env vars from `loadtest/config.js`):

```bash
k6 run loadtest/scenarios/admin-browse.js
k6 run loadtest/scenarios/dashboards.js
k6 run loadtest/scenarios/field-apps.js
k6 run loadtest/scenarios/sos-dispatch.js
```

3. **Cleanup** (only `loadtest:true` docs):

```bash
node loadtest/cleanup-loadtest-data.js
```

## Baseline table (fill after runs)

| Scenario | VUs | p50 | p95 | p99 | errors | Notes |
|----------|-----|-----|-----|-----|--------|-------|
| admin-browse | 5→30 | | | | | threshold p95 <800ms |
| dashboards | 20 | | | | | threshold p95 <500ms |
| field-apps | 50 | | | | | threshold p95 <600ms |
| sos-dispatch | 200 sockets | | | | | SOS→admin p95 <1.5s |

### Before vs after (Waves 1–3)

| Scenario | Before p95 | After p95 | Date |
|----------|------------|-----------|------|
| admin-browse @ 1M | Run on staging (pre-deploy baseline) | Run on staging (post Wave 3) | 2026-08-20 |

> Baseline numbers require staging access + `k6 run` — harness is ready; fill this table after seeding.

## M10 → M30 decision rule

Upgrade Atlas tier when **after** Wave 1–3 fixes:

- Sustained WiredTiger cache eviction under target VUs, **or**
- p95 breaches scenario thresholds at documented VU counts for two consecutive runs

Do not upgrade on a single spike — confirm with two runs and Atlas metrics.

## Production safety

`loadtest/config.js` throws if base URLs contain `production` or known prod Railway hostnames.
