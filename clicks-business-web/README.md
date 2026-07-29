# Clicks Business Portal (Web)

Partner web portal for dealership / business staff to create and track roadside assistance jobs. Same features as the Flutter **clicks-business** app; branding and stack match the admin **clicks-interface**.

## Stack

- Vite 6 + React 18
- Redux Toolkit + RTK Query
- React Router 6
- Ant Design 5 (reset CSS) + Clicks design tokens (`#981F1F`, Helvetica Neue)

## Features

- Login (email **or** phone + password) → `POST /api/business/auth/login`
- Dashboard: analytics (period chips), open / in-progress / completed counts, job list
- New Job form (vehicle catalog, Qatar phone rules, geolocation)
- Job detail with ~20s polling and call-technician link

## Local development

```bash
cd clicks-business-web
npm install
npm run dev
```

Dev server: **http://localhost:3001**  
API calls use Vite proxy `/api` → Admin API (see `vite.config.mjs`). No CORS setup needed for local.

Demo credentials (if seeded): `business@clicks.local` / `Business123!`

## Production env

Copy [`.env.example`](./.env.example):

```bash
VITE_API_BASE_URL=https://admin-api.clicks.qa/api
```

Build:

```bash
npm run build
npm run preview
```

## Deploy (Vercel)

Suggested domain: **business.clicks.qa**

1. Link this repo in Vercel (`vercel.json` already configures SPA rewrites).
2. Set `VITE_API_BASE_URL=https://admin-api.clicks.qa/api` for Production.
3. Deploy: `npx vercel --prod`

### CORS (required for production)

Admin API reads allowed origins from `CORS_ORIGINS` (comma-separated). Add the business portal origin alongside the admin UI, for example:

```
CORS_ORIGINS=https://admin.clicks.qa,https://business.clicks.qa
```

Localhost is already allowed by the admin-api CORS helper during development.
