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

## Technician activity log (retention & volume)

The technician app writes an append-only trail to `technicianactivitylogs`
(logins including failed attempts, availability, job steps, device and location
events). The admin portal reads it at **Technician Logs** (full admins only).

Knobs — set on the **customer-tech API** service:

| Env var | Default | What it does |
|---------|---------|--------------|
| `TECHNICIAN_ACTIVITY_LOG_TTL_DAYS` | `180` | TTL index on `at`. `0` keeps rows forever (watch disk). |
| `TECHNICIAN_ACTIVITY_LOG_LOCATION` | `true` | `false` stops recording GPS pings entirely. |
| `TECHNICIAN_ACTIVITY_LOCATION_MIN_INTERVAL_MS` | `300000` (5 min) | Throttle per technician for `location.updated`. Lower = finer trail, more rows. |

Volume: every event is one small document. Job/auth events are a handful per
technician per day; location is the only high-rate source, which is why it is
throttled in-process rather than written on every fix (the app pings every few
seconds while online). At the 5-minute default a technician online 10h/day adds
roughly 120 location rows/day.

Changing the TTL only affects new index builds — drop and recreate the `at_1`
TTL index on an existing collection if you change the retention window.

## Object storage & email

Current code still supports Azure Blob / Communication Email via env vars. You may keep those accounts **or** swap providers later — not required to use an Azure VM. Soft launch can proceed with SMSala + Atlas while Blob/Email are configured.

## SMS (SMSala)

Wired in `clicks-customer-tech-api/src/services/smsService.js`.

| Variable | Value |
|----------|--------|
| `SMS_PROVIDER` | `smsala` (staging/prod) or `console` (local) |
| `SMSALA_API_TOKEN` | From [SMSala ManageApi](https://dashboard.smsala.com/ManageApi) |
| `SMSALA_API_URL` | `https://api2.smsala.com/SendSmsV2` (default) |
| `SMSALA_SOURCE_ADDRESS` / `SMS_FROM` | Approved sender ID (Qatar account: `Sanad RSA` — `Clicks` is rejected) |
| `SMSALA_MESSAGE_TYPE` | `1` Promotional / `2` Transactional / `3` OTP (use `3` for OTPs) |
| `SMSALA_MESSAGE_ENCODING` | `1` text; unicode if Arabic |

Restrict SMSala Allowed IP to the **VPS egress IP** (do not leave `0.0.0.0`).

## Redis (growth)

Opt-in via `REDIS_URL` (e.g. `redis://127.0.0.1:6379`). Shared client: `clicks-shared/utils/redisClient.js`.

- Empty / unset → in-process (soft launch). Socket.IO uses the memory adapter; dashboard counts use a process `Map`.
- Set on **customer-tech-api** → `@socket.io/redis-adapter` for multi-process emit fanout, plus shared auth/OTP rate limits.
- Set on **admin-api** (same URL) → shared dashboard count cache and login rate limits across instances. `/api/health` returns 503 if Redis is configured but unreachable.
- **Do not** set `TECH_API_INSTANCES > 1` until `REDIS_URL` is live on customer-tech-api.
- Nginx must use **sticky sessions** (`ip_hash` or equivalent) for the tech API WebSocket path — in-process socket id maps in `sosSocketService` are not yet shared via Redis.

```bash
# On VPS (example)
sudo apt install redis-server   # or managed Redis
# In clicks-customer-tech-api/.env and clicks-admin-api/.env:
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
