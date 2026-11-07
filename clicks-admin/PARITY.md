# Admin mobile ↔ web parity

Track alignment with `clicks-interface`.

## Done

| Area | Notes |
|------|--------|
| Jobs list | On-hold filter, hold reason, advanced filter sheet (status/type/source/origin/payment/dates), stats strip, historical import |
| Job detail | Edit, reassign + reasons, hold return date, source lock, repairs/receipt, reassignment history, hold metadata, estimate edit, delete (full admin), socket refresh |
| Dashboard | KPIs + on-hold; revenue + charts (earnings/completion/performance) for full admin only |
| Heat map | Viewport fetch, date/time/status/type filters, nearby drill-down |
| Finance | Read-only overview: buckets, search, dates, pagination, row → job |
| Technician logs | Filters + authenticated CSV export |
| Performance | Table + CSV export |
| CRUD | Admins, businesses, partners, sources, vehicle makes/models, finance users |
| Details | Client (vehicles/jobs), vehicle assign tech, technician approve/settle/recent jobs |
| Nav | Technician logs, calls, vehicle models |

## Remaining / release

| Item | Status |
|------|--------|
| Device FCM + maps + dispatch loop | Manual — release APK built 2026-10-15 (`app-release.apk` 61.7MB). Walk [`qa-admin-mobile-full.md`](../clicks-api/scripts/qa-admin-mobile-full.md) on physical Android. See [`qa-admin-mobile-report.md`](../clicks-api/scripts/qa-admin-mobile-report.md). |
| Static wiring | `clicks-api/scripts/qa-admin-mobile-static.js` |
| Live API smoke | `clicks-api/scripts/qa-admin-mobile-smoke.js` |
| Defect / sign-off log | [`qa-admin-mobile-report.md`](../clicks-api/scripts/qa-admin-mobile-report.md) |
| Calls module | Placeholder (same as web sample page) |
| Finance portal audit writes | Out of scope (web admin is also read-only) |
