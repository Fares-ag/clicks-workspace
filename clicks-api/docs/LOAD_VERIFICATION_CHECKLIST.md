# Load Audit Verification Checklist

Static trace of the current tree against [CLICKS_LOAD_SCALABILITY_AUDIT.md](../../CLICKS_LOAD_SCALABILITY_AUDIT.md).  
Verified: 20 August 2026.

## Audit drift notes

| Claim in audit | Actual in code |
|----------------|----------------|
| Admin jobs default limit 40 | Default `limit = 10` in `jobController.getJobs` |
| Lead search at lines 23–25 | Search block at `leadController.js` ~94–98 |
| No `createdAt:-1` anywhere | Present inside compound indexes; **no standalone** `{createdAt:-1}` |

## LOAD findings — evidence

| ID | Severity | Status | Evidence |
|----|----------|--------|----------|
| LOAD-1 | CRITICAL | Confirmed | `jobController.js:32-39` — 5-field unanchored `$regex $or`; `Jobs.jsx` no debounce |
| LOAD-2 | CRITICAL | Confirmed | `Job.js:140-146` — no standalone `{createdAt:-1}` for unfiltered admin sort |
| LOAD-3 | HIGH | Confirmed | `dashboardController.js:92-142` — 13 Job counts + aggregations; all list endpoints pair `countDocuments` |
| LOAD-4 | HIGH | Confirmed | Revenue `$or` on `paid_at`/`completed_at` in dashboardController |
| LOAD-5 | HIGH | Confirmed | Tech API `getJobs`/`getCustomerJobs` — no limit, no pagination |
| LOAD-6 | HIGH + security | Confirmed | Full `populate("assignedTechnician")`; `Technician.js` password not `select:false`; no compression |
| LOAD-7 | MEDIUM | Confirmed | Business web 20–30s polls; no 304/watermark |
| LOAD-8 | MEDIUM | Confirmed | `sosSocketService.js` — `adminNamespace.emit` per location update |
| LOAD-9 | MEDIUM | Confirmed | List endpoints lack `.lean()` and field projections |
| LOAD-10 | LOW/MEDIUM | Confirmed | `OutboxEvent.js` — no TTL on sent events; no job archival |

## Polling cadences (verified)

| Surface | Interval | File |
|---------|----------|------|
| Admin sidebar SOS/service | 15s | `AdminSidebar.jsx` |
| Admin sidebar leads | 30s | `AdminSidebar.jsx` |
| Admin Jobs search | immediate | `Jobs.jsx` |
| Business Jobs | 25s | `Jobs.jsx` (web) |
| Business JobDetail | 20s | `JobDetail.jsx` |
| Business Dashboard | 30s | `Dashboard.jsx` |
| Finance Dashboard | 30s | `Dashboard.jsx` |
| Tech location writes | ≥3s | `LOCATION_THROTTLE_MS` in `sosSocketService.js` |

## What is already correct (do not re-fix)

- Job compound indexes for filtered paths
- 2dsphere on jobs/technicians/SOS
- Outbox claim query index `{status, next_attempt_at, type}`
- Location throttle 3s
- Socket rooms + Redis horizontal scale path
- SOS point reads by `_id`

## Remediation verification gates

Each prompt must pass its acceptance criteria before the wave is marked complete. See [PERFORMANCE.md](./PERFORMANCE.md) for house rules and CI guardrails.
