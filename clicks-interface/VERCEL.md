# Deploy Admin UI on Vercel

APIs and Socket.IO stay on the VPS. Only this Vite SPA runs on Vercel.

```
Browser → https://admin.clicks.qa (Vercel)
        → https://admin-api.clicks.qa/api (VPS)
        → https://tech-api.clicks.qa (VPS sockets / Live Map)
```

## 1. Repo config

[`vercel.json`](./vercel.json) sets Vite output (`dist`) and SPA rewrites so React Router deep links work.

## 2. Vercel project

```bash
cd clicks-interface
npx vercel login
npx vercel link          # create/link project
npx vercel env pull      # optional
```

### Production environment variables

Set in Vercel → Project → Settings → Environment Variables (Production), or:

```bash
npx vercel env add VITE_API_BASE_URL production
# value: https://admin-api.clicks.qa/api

npx vercel env add VITE_SOCKET_URL production
# value: https://tech-api.clicks.qa

npx vercel env add VITE_GOOGLE_MAPS_API_KEY production
# value: <browser-restricted Maps key>

npx vercel env add VITE_NODE_ENV production
# value: production

npx vercel env add VITE_APP_NAME production
# value: Clicks Interface
```

Template: [`../clicks-api/ops/env/interface.env.production.example`](../clicks-api/ops/env/interface.env.production.example)

### Deploy

```bash
npx vercel --prod
```

## 3. Custom domain `admin.clicks.qa`

**Live now (Vercel production alias):** https://clicks-interface.vercel.app  

Domain `admin.clicks.qa` is attached to the Vercel project but DNS still points at Cloudflare. Cut over:

1. In Cloudflare DNS for `clicks.qa`, set **CNAME** (or A) for `admin`:
   - Recommended CNAME: `admin` → `2f397947087c10de.vercel-dns-017.com.`  
     (Proxy **DNS only** / grey cloud — disable Cloudflare proxy for this record)
   - Or A: `admin` → `76.76.21.21`
2. Optional one-click: open Vercel’s [Cloudflare Domain Connect apply URL](https://vercel.com/api/v9/projects/prj_4xqoxvpwQVQ4deHvUAH33vZBx0Ww/domains/admin.clicks.qa/domain-connect/apply?teamId=team_l3FoAZLKwVioXSX0uBL1Shoa)
3. Then run: `vercel domains verify admin.clicks.qa`
4. Wait for TLS **Valid**

Until cutover, use https://clicks-interface.vercel.app for testing.

## 4. VPS CORS (required)

On **admin-api** production `.env`:

```
FRONTEND_URL=https://admin.clicks.qa
CORS_ORIGINS=https://admin.clicks.qa
```

On **customer-tech-api** production `.env` (Live Map):

```
CORS_ORIGINS=https://admin.clicks.qa
```

Then:

```bash
pm2 restart clicks-admin-api clicks-customer-tech-api
# or: pm2 restart all
```

Examples: [`ops/env/admin-api.env.production.example`](../clicks-api/ops/env/admin-api.env.production.example), [`ops/env/customer-tech-api.env.production.example`](../clicks-api/ops/env/customer-tech-api.env.production.example).

Helper script (run on the VPS): [`../clicks-api/scripts/apply-vercel-admin-cors.sh`](../clicks-api/scripts/apply-vercel-admin-cors.sh)

## 5. Google Maps HTTP referrers

In Google Cloud Console → Credentials → your browser Maps key:

- `https://admin.clicks.qa`
- `https://admin.clicks.qa/*`
- Optional while testing: `https://*.vercel.app/*`

API restriction: **Maps JavaScript API**.

## 6. Smoke checklist

- [ ] https://admin.clicks.qa loads
- [ ] Admin login works
- [ ] Jobs list loads (no CORS errors in DevTools)
- [ ] Live Map tiles + technician markers (socket to tech-api)

Technician APK is unchanged (`https://tech-api.clicks.qa`).

<!-- redeploy 2026-07-22T01:34:39.5284625+03:00 -->
