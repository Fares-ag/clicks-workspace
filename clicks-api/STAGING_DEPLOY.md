# Staging deploy — one VPS

Soft launch / staging on a **single** Linux VPS. Do **not** set `REDIS_URL` or `TECH_API_INSTANCES>1` until [STAGING_E2E.md](./STAGING_E2E.md) is green.

Hostnames below are examples — replace with your DNS.

| Service | Example hostname | Upstream |
|---------|------------------|----------|
| Admin UI | `stg-admin.clicks.qa` | static (nginx) |
| Admin API | `stg-admin-api.clicks.qa` | `127.0.0.1:5000` |
| Tech API + sockets | `stg-tech-api.clicks.qa` | `127.0.0.1:5001` |

Suggested size: **2–4 vCPU / 4–8 GB RAM / 40+ GB SSD** (Ubuntu 22.04+).

---

## 0. Before the VPS

1. Complete [STAGING_SECRETS.md](./STAGING_SECRETS.md) (Atlas user, Maps key, JWT, SMSala).
2. Atlas: staging DB + **VPS IP allowlisted**.
3. DNS A records for the three hostnames → VPS public IP.
4. You will need: VPS IP, SSH user, domain DNS access. Provide those when ready to cut over.

---

## 1. Bootstrap the server

```bash
# As root or sudo user
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git build-essential curl ufw

# Node 20 LTS via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
npm install -g pm2

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Confirm public egress IP (use for Atlas + SMSala allowlists)
curl -4 ifconfig.me && echo
```

---

## 2. Clone APIs and env files

```bash
export CLICKS_API_ROOT=$HOME/clicks-api
git clone <YOUR_CLICKS_API_GIT_URL> "$CLICKS_API_ROOT"
cd "$CLICKS_API_ROOT"
git checkout staging   # or main — match CI branch

# Install deps
cd clicks-shared && npm ci --omit=dev || npm install --omit=dev
cd ../clicks-admin-api && npm ci --omit=dev || npm install --omit=dev
cd ../clicks-customer-tech-api && npm ci --omit=dev || npm install --omit=dev
cd "$CLICKS_API_ROOT"

# Env from templates (fill secrets on the server only)
cp ops/env/admin-api.env.staging.example clicks-admin-api/.env
cp ops/env/customer-tech-api.env.staging.example clicks-customer-tech-api/.env
nano clicks-admin-api/.env
nano clicks-customer-tech-api/.env
# Ensure JWT_SECRET and INTERNAL_API_SECRET match; REDIS_URL empty
```

Generate secrets on your laptop if needed:

```bash
node scripts/generate-staging-secrets.js
```

---

## 3. PM2 (instances = 1)

```bash
cd "$CLICKS_API_ROOT"
export CLICKS_API_ROOT
# Do NOT export TECH_API_INSTANCES>1 or REDIS_URL for soft launch
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # follow the printed systemd command

pm2 status
curl -s http://127.0.0.1:5000/api/health
curl -s http://127.0.0.1:5001/api/health
# Expect socketAdapter: memory on tech health
```

---

## 4. Nginx + TLS

Install certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/clicks-staging`:

```nginx
server {
  listen 80;
  server_name stg-admin-api.clicks.qa;
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
  }
}

server {
  listen 80;
  server_name stg-tech-api.clicks.qa;
  location / {
    proxy_pass http://127.0.0.1:5001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name stg-admin.clicks.qa;
  root /var/www/clicks-admin;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/clicks-staging /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx \
  -d stg-admin-api.clicks.qa \
  -d stg-tech-api.clicks.qa \
  -d stg-admin.clicks.qa
```

---

## 5. Admin UI static build

On CI or a trusted machine (with Maps key in env, not in git):

```bash
cd clicks-interface
cp ../clicks-api/ops/env/interface.env.staging.example .env.staging
# edit .env.staging — real Maps key + staging URLs
npm ci
npm run build -- --mode staging
# upload dist/ to VPS:
rsync -avz --delete dist/ user@VPS_IP:/var/www/clicks-admin/
```

On VPS:

```bash
sudo mkdir -p /var/www/clicks-admin
sudo chown -R $USER:$USER /var/www/clicks-admin
```

---

## 6. SMSala + Atlas lock-down

1. Atlas Network Access → only VPS egress IP.
2. SMSala Allowed IP → same IP.
3. Confirm OTP on a real +974 number (or staging test number).

---

## 7. Health probes

External uptime (UptimeRobot / Better Stack / cron):

- `GET https://stg-admin-api.clicks.qa/api/health` every 60s
- `GET https://stg-tech-api.clicks.qa/api/health` every 60s

Alert on non-200 or `"status"` ≠ `"ok"`.

Local smoke:

```bash
ADMIN_URL=https://stg-admin-api.clicks.qa \
TECH_URL=https://stg-tech-api.clicks.qa \
node scripts/smoke-auth.js
```

Full path: [STAGING_E2E.md](./STAGING_E2E.md).

---

## 8. Admin UI on Vercel (production path)

Production Admin UI should be hosted on **Vercel** (APIs remain on this VPS). See [`clicks-interface/VERCEL.md`](../clicks-interface/VERCEL.md).

After cutover, ensure production API env includes:

```
FRONTEND_URL=https://admin.clicks.qa
CORS_ORIGINS=https://admin.clicks.qa
```

Apply helper: [`scripts/apply-vercel-admin-cors.sh`](./scripts/apply-vercel-admin-cors.sh).

Staging may keep nginx static UI until you create a separate Vercel staging project.

## 9. GitHub Actions deploy

Workflow: [`.github/workflows/deploy-staging.yml`](./.github/workflows/deploy-staging.yml).

Set repository secrets (names kept for compatibility — any SSH VPS):

| Secret | Value |
|--------|--------|
| `AZURE_VM_HOST` | VPS public IP or hostname |
| `AZURE_VM_USERNAME` | SSH user |
| `AZURE_VM_SSH_KEY` | private key (PEM) |
| `AZURE_VM_PORT` | `22` (optional) |

Filled `.env` files on the VPS stay local: they are gitignored, and the workflow uses `git clean -fd` (not `-fdx`), so ignored `.env` files are **not** deleted on deploy. Never commit secrets.

Optional: set `CLICKS_API_ROOT` in the SSH user’s shell profile if the repo is not at `$HOME/clicks-api`.

---

## 9. Mobile apps (staging)

```bash
# Technician
flutter run --dart-define=ENV=staging \
  --dart-define=API_BASE_URL=https://stg-tech-api.clicks.qa \
  --dart-define=SOCKET_URL=https://stg-tech-api.clicks.qa

# Customer (same tech API base)
flutter run --dart-define=ENV=staging \
  --dart-define=API_BASE_URL=https://stg-tech-api.clicks.qa \
  --dart-define=SOCKET_URL=https://stg-tech-api.clicks.qa
```

---

## Soft-launch constraints

- `REDIS_URL=` (empty)
- `TECH_API_INSTANCES` unset or `1`
- PM2 customer-tech `instances: 1`
- Growth steps only after E2E green — see [INFRASTRUCTURE.md](./INFRASTRUCTURE.md)
