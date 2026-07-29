# Staging secret rotation

Do this **before** pointing any public hostname at the APIs. Secrets pasted in chat or old local `.env` files are compromised.

## Generate new shared secrets (local machine)

```bash
cd clicks-api
node scripts/generate-staging-secrets.js
```

Copy the printed values into **both** API `.env` files on the VPS (never commit them).

Rules:
- `JWT_SECRET` — **identical** on admin-api and customer-tech-api
- `JWT_REFRESH_SECRET` — admin-api only (can differ from JWT_SECRET)
- `INTERNAL_API_SECRET` — **identical** on both APIs

After changing JWT secrets, restart both APIs together (`pm2 restart all`). All existing sessions invalidate.

## 1. MongoDB Atlas password

1. Atlas → Database Access → edit DB user → Edit Password → Autogenerate.
2. Network Access → add **staging VPS egress IP** only (remove `0.0.0.0/0` if present).
3. Prefer a **staging** cluster or DB name `clicks_staging` separate from local/dev.
4. Soft launch: **M10+** with backups enabled.
5. Update `MONGODB_URI` on both APIs on the VPS.
6. Confirm old password fails: `mongosh` / Compass with old URI → auth error.
7. Confirm new URI: both `/api/health` OK and admin login works.

## 2. Google Maps API key

1. Google Cloud Console → APIs & Services → Credentials.
2. Create a **new** browser key (do not reuse the chat-exposed key).
3. Application restriction: **HTTP referrers**
   - `https://stg-admin.clicks.qa/*`
   - `https://stg-admin.clicks.qa`
   - (add localhost only for local debug, remove for staging)
4. API restriction: Maps JavaScript API (+ whatever Live Map needs).
5. Put key only in interface env / CI secret `VITE_GOOGLE_MAPS_API_KEY`.
6. Delete or disable the old key after staging Live Map works.

## 3. SMSala

1. [ManageApi](https://dashboard.smsala.com/ManageApi) → rotate API token if it was pasted in chat.
2. Allowed IP → staging VPS public IP (not `0.0.0.0`).
3. Set registered `SMSALA_SOURCE_ADDRESS` / `SMS_FROM`.
4. On customer-tech: `SMS_PROVIDER=smsala` + token in `.env` only.

## 4. Staging env files (templates)

Safe templates (placeholders only) live under [`ops/env/`](./ops/env/):

| Copy on VPS to | Template |
|----------------|----------|
| `clicks-admin-api/.env` | [`ops/env/admin-api.env.staging.example`](./ops/env/admin-api.env.staging.example) |
| `clicks-customer-tech-api/.env` | [`ops/env/customer-tech-api.env.staging.example`](./ops/env/customer-tech-api.env.staging.example) |
| Interface build env | [`ops/env/interface.env.staging.example`](./ops/env/interface.env.staging.example) |

Replace every `REPLACE_*` and host placeholder with real staging values. Never commit filled `.env` files.

## Verification after rotation

```bash
ADMIN_URL=https://stg-admin-api.clicks.qa TECH_URL=https://stg-tech-api.clicks.qa node scripts/smoke-auth.js
```

- Unauth admin routes → 401
- notify without secret → 401
- Health → 200; tech health shows `"socketAdapter":"memory"` (no Redis on soft launch)
