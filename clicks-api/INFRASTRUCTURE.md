# Infrastructure runbook (VPS-first)

Provider-agnostic Linux VPS (Hetzner, DigitalOcean, Linode, etc.). Azure is **not** required.

**Soft launch default:** 1 VPS, PM2 `instances: 1`, no Redis, Atlas M10+, SMSala.

**Start here for staging:** [STAGING_SECRETS.md](./STAGING_SECRETS.md) → [STAGING_DEPLOY.md](./STAGING_DEPLOY.md) → [STAGING_E2E.md](./STAGING_E2E.md) → [SOFT_LAUNCH.md](./SOFT_LAUNCH.md).

**Growth target:** ~200 concurrent SOS, ~100 online technicians, ~200k registered customers.

## Capacity ladder

| Stage | Concurrent SOS | Tech online | Compute | DB | Sockets |
|-------|----------------|-------------|---------|-----|---------|
| Soft launch | ~50 | 5–20 | 1× 2–4 vCPU / 4–8 GB | Atlas M10 | PM2×1, no Redis |
| Growth | ~200 | ~100 | 2 API nodes or 1 larger + Redis | Atlas M30 | `REDIS_URL` + sticky LB |
| Headroom | ~500 | 100+ | 2–3 API nodes + Redis HA | Atlas M40+ / dedicated | same + load test |

Registered users ≠ concurrency. Size for peak active SOS + GPS writes, not 200k sockets.

## Atlas (prod)

1. Paid cluster (M10+ soft launch; plan M30 before public ~200k).
2. DB user least privilege on `clicks` only.
3. IP allowlist = VPS egress IP(s).
4. Continuous backups / PITR.
5. URI only in server `.env` — never commit.
6. Rotate any password pasted in chat/history.

## Object storage & email

Current code still supports Azure Blob / Communication Email via env vars. You may keep those accounts **or** swap providers later — not required to use an Azure VM. Soft launch can proceed with SMSala + Atlas while Blob/Email are configured.

## SMS (SMSala)

Wired in `clicks-customer-tech-api/src/services/smsService.js`.

| Variable | Value |
|----------|--------|
| `SMS_PROVIDER` | `smsala` (staging/prod) or `console` (local) |
| `SMSALA_API_TOKEN` | From [SMSala ManageApi](https://dashboard.smsala.com/ManageApi) |
| `SMSALA_API_URL` | `https://api2.smsala.com/SendSmsV2` (default) |
| `SMSALA_SOURCE_ADDRESS` / `SMS_FROM` | Registered sender ID |
| `SMSALA_MESSAGE_TYPE` | `1` (default) |
| `SMSALA_MESSAGE_ENCODING` | `1` text; unicode if Arabic |

Restrict SMSala Allowed IP to the **VPS egress IP** (do not leave `0.0.0.0`).

## Redis Socket.IO (growth)

Opt-in in customer-tech-api: set `REDIS_URL` (e.g. `redis://127.0.0.1:6379`).

- Empty / unset → memory adapter (soft launch).
- Set → `@socket.io/redis-adapter` for multi-process emit fanout.
- **Do not** set `TECH_API_INSTANCES > 1` until `REDIS_URL` is live.
- Nginx must use **sticky sessions** (`ip_hash` or equivalent) for the tech API WebSocket path — in-process socket id maps in `sosSocketService` are not yet shared via Redis.

```bash
# On VPS (example)
sudo apt install redis-server   # or managed Redis
# In clicks-customer-tech-api/.env:
REDIS_URL=redis://127.0.0.1:6379
```

## TLS / Nginx

```nginx
upstream tech_api {
  ip_hash;  # sticky — required if TECH_API_INSTANCES > 1
  server 127.0.0.1:5001;
  # server 127.0.0.1:5002;  # only with Redis + multiple processes
}

server {
  listen 443 ssl http2;
  server_name admin-api.clicks.qa;
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Request-Id $request_id;
  }
}

server {
  listen 443 ssl http2;
  server_name tech-api.clicks.qa;
  location / {
    proxy_pass http://tech_api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

## PM2

[`ecosystem.config.js`](./ecosystem.config.js):

- `CLICKS_API_ROOT` — repo path on the server (default: directory containing the ecosystem file).
- Soft launch: leave `TECH_API_INSTANCES` unset (1, fork mode).
- Growth: set `REDIS_URL` on customer-tech, then `TECH_API_INSTANCES=2` when restarting PM2.

```bash
export CLICKS_API_ROOT=$HOME/clicks-api
cd $CLICKS_API_ROOT
pm2 startOrRestart ecosystem.config.js
pm2 save
```

## Deploy (CI)

[`.github/workflows/deploy-staging.yml`](./.github/workflows/deploy-staging.yml) SSHs to a staging VPS.

Secrets (names kept for compatibility — any SSH host works):

- `AZURE_VM_HOST`
- `AZURE_VM_USERNAME`
- `AZURE_VM_SSH_KEY`
- `AZURE_VM_PORT` (optional)

App path: `$HOME/clicks-api` or `CLICKS_API_ROOT` on the server.

## Staging smoke

```bash
ADMIN_URL=https://stg-admin-api.clicks.qa TECH_URL=https://stg-tech-api.clicks.qa node scripts/smoke-auth.js
```

## Health / uptime

- Probe `GET /api/health` on both APIs every 60s.
- Tech health includes `socketAdapter: memory|redis`.
- Alert on: 5xx rate, Mongo disconnect, PM2 restart loop, Redis down (if enabled).

## Load-test gate (before public 200k)

Exercise at least: N concurrent SOS creates + 100 technician `updateLocation` streams + admin Live Map subscribers. Fix whatever dies first (CPU, Mongo, SMS rate limits) before expanding signup.
