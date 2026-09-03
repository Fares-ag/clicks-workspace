# Clicks Admin — Mobile

Flutter admin app for dispatch and operations. Connects to:

- **REST:** `https://admin-api.clicks.qa/api` — same as [clicks-interface](../clicks-interface) (`VITE_API_BASE_URL`)
- **Realtime:** `https://tech-api.clicks.qa` Socket.IO `/admin` — same as web (`VITE_SOCKET_URL`)
- **FCM:** background SOS / service-request alerts when app is killed

## Features

### Phase 1 (ops dispatch)

- Dashboard KPIs
- SOS inbox + claim + create job
- Service requests
- Jobs list / detail / create
- Leads + convert to job
- Live map (online technicians)
- Technicians browse + detail
- Real-time notification queue (socket)
- RBAC-aware navigation (ops vs full admin)

### Phase 2 (full admin)

Accessible from drawer for Super Admin / Admin roles:

- Vehicles, clients, support tickets
- Businesses, partners, finance overview, finance users
- Admin management, performance export, sources, heat map, vehicle makes

## Quick start

```powershell
cd clicks-admin
flutter pub get
flutter run
```

See [BUILD.md](BUILD.md) for production builds and Firebase setup.

## Architecture

```
lib/
├── core/          api, auth/RBAC, socket, FCM, routing
├── features/      splash, auth, main shell, ops screens, phase2 modules
└── main.dart
```

Application ID: `com.roya.clicks_admin`
