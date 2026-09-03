# Railway production deploy (clicks-admin-api + clicks-tech-api)

Both APIs deploy from the **`clicks-api/`** directory on Railway project **`melodious-achievement`**. They share source code but must **never** share a single `railway.toml` or Dockerfile.

## One-time service settings (Railway dashboard)

| Service | Source root | Config-as-code path | Dockerfile (via config) |
|---------|-------------|---------------------|-------------------------|
| `clicks-admin-api` | `clicks-api` | `railway.admin.toml` | `Dockerfile.admin-api` |
| `clicks-tech-api` | `clicks-api` | `railway.tech.toml` | `Dockerfile.tech-api` |

If config-as-code is missing or wrong, Railway falls back to **Railpack** on `clicks-api/package.json` (test workspace only — **no `start` script**) and the deploy fails with:

```text
No start command detected
```

## Preflight (run before every manual deploy)

From `clicks-api/`:

```bash
node scripts/check-railway-deploy.js
node scripts/check-shared-deps.js
```

## Deploy paths

**Preferred:** GitHub Actions [`.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml) — tag `v*` on `main` or `workflow_dispatch`.

**Manual (logged-in laptop):**

```powershell
cd clicks-api
node scripts/check-railway-deploy.js
node scripts/check-shared-deps.js
railway link -p melodious-achievement
railway up --service clicks-admin-api -c
railway up --service clicks-tech-api -c
```

Use `-c` (CI mode) to stream build logs and confirm Docker builds succeed before exiting.

## Common failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `No start command detected` | Service not using `railway.*.toml` | Set config-as-code path in dashboard |
| `Cannot find module 'axios'` (tech-api) | `clicks-shared` requires a package not listed in that service's `package.json` | Run `node scripts/check-shared-deps.js`, add deps to **both** APIs |
| Health check timeout | MongoDB down or bootstrap crash | `railway logs --service <name> --latest --deployment` |
| `statsRefresher` E11000 | Stale `platformstats` race (non-fatal) | Fixed in `statsRefresher.js`; redeploy admin-api |

## Do not

- Add `clicks-api/railway.toml` (CI rejects it; both services would build the same image).
- Run `npm install` inside `clicks-shared/` (creates a second `mongoose` instance → query timeouts).
- Swap config files at deploy time (race between the two services).
