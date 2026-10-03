# Clicks — Load & Scalability Audit ("Will it still be fast at 1,000,000 jobs?")

**Date:** 20 August 2026 · **Tree:** current working tree (post Round-2 fixes)
**Method:** Static trace of every hot-path query against the actual schema indexes, plus request-volume modeling from the real polling cadences and socket throttles in the code. The sandbox cannot run a MongoDB binary, so numbers below are **modeled from MongoDB's documented execution behavior, not measured** — the load-test harness in Prompt 10 exists precisely to turn them into measurements on staging. Every code claim is verified with file references. No code was modified.

> **Verdict in one line:** At today's data volume Clicks feels fast because every inefficient query is scanning a small collection. **At 1M jobs, the platform degrades in five specific, predictable places — the admin jobs search, the dashboards, the unbounded mobile history endpoints, the per-request `countDocuments`, and response payload weight — and none of them are architecture problems: all are fixable with indexes, projections, pagination discipline, and one materialized stats document.** The realtime layer scales further than the REST layer. There is also one security-adjacent finding (full technician docs, password hash included, serialized into job lists) that the payload work must fix at the same time.

---

## 1. Capacity model (the load we're designing for)

Assumptions for "Qatar at full scale," deliberately generous: **1,000,000 accumulated jobs** (≈1,400/day for 2 years), ~2 KB average job document (≈2 GB collection + indexes ≈ 0.5 GB), **500–1,000 technicians online at peak**, 20–40 concurrent admin/dispatcher sessions, 200 business-portal users with tabs open, 5,000 DAU customers.

Standing request load derived from the code's own cadences:

| Source | Cadence (verified) | At scale |
|---|---|---|
| Technician GPS write | ≤1 per 3s per socket (`LOCATION_THROTTLE_MS`, sosSocketService) | 1,000 techs → ~330 tiny writes/s — fine for Atlas, but see fanout |
| Admin Live-Map fanout | every location update → `adminNamespace.emit` to ALL admins | 330/s × 30 admins ≈ **10,000 socket messages/s from one Node process** |
| Admin sidebar badges | 15 s + 30 s polls per admin session (AdminSidebar.jsx) | 30 admins → ~4 req/s of count queries |
| Business portal | 20–30 s polling per open tab (Jobs 25 s, JobDetail 20 s, Dashboard 30 s) | 200 tabs → ~10 req/s, each hitting Job queries |
| Finance dashboard | 30 s poll | minor count, but each hit runs 4 aggregates + 3 counts |
| Admin dashboard | on load + refetches | **~25 parallel collection operations per view** (dashboardController lines 93–166) |

The write path is comfortable. **The read path is where 1M jobs bites.**

---

## 2. Findings (ranked by user-visible impact at 1M jobs)

### LOAD-1 (CRITICAL) — Admin jobs search: unanchored 5-field `$regex $or`, fired per keystroke
`clicks-admin-api/src/controllers/jobController.js:32-40` builds `$or` of five case-insensitive, **unanchored** `$regex` clauses (clientName, clientMobileNumber, issue, location, businessName). Case-insensitive unanchored regex cannot use any B-tree index — every search is a **full collection scan** (all 1M docs, decompressed, regex-tested five times each), followed by `countDocuments(query)` which runs the **same full scan again**. The client (`clicks-interface/src/pages/JobManagement/Jobs.jsx:185,322`) feeds the search box into the RTK query with **no debounce** — typing "ahmed" fires 5 queries = **10 full-collection scans** in ~2 seconds. Modeled at 1M×2 KB: multiple seconds per scan on an M10, and a handful of concurrent dispatchers typing takes the whole cluster's cache with them — this single box is the most likely "the platform is slow" ticket generator. Leads search has the identical pattern (`leadController.js:23-25`), mitigated only by the smaller collection.

### LOAD-2 (CRITICAL) — Unfiltered jobs list can't use any index for its sort
The default admin jobs view (`getJobs` with no status filter) runs `Job.find({}).sort({createdAt:-1}).skip().limit(40)`. **There is no `{createdAt:-1}` index** — verified against the Job schema's index list (compound indexes all prefix on `job_status`/`customer_id`/`business_id`; a sort can only use an index whose prefix matches the filter). Mongo falls back to a top-k in-memory sort, which still **examines all 1M documents** on every page-1 load of the flagship screen. With the status filter set, the `{job_status, assignedTechnician, createdAt}` index only helps partially (sort needs the full prefix; `assignedTechnician` is skipped, so it scans all docs of that status). `skip((page-1)*limit)` adds the classic deep-page tax: page 2,000 walks and discards 80,000 docs.

### LOAD-3 (HIGH) — `countDocuments` on every list load and every poll
Every list endpoint pairs its query with `countDocuments(query)` (admin jobs:64, leads:35, business listJobs, finance:40-42). Unindexed counts are full scans; even indexed counts walk the whole matching index range (counting 800k completed jobs touches 800k index entries). The admin dashboard alone fires **13 `countDocuments` + 3 aggregations over Job** per load (dashboardController:93-142), and business/finance dashboards repeat the pattern **on their 30 s polls**. At 1M jobs this makes the counts collectively more expensive than the data queries they decorate.

### LOAD-4 (HIGH) — Dashboard revenue aggregations scan all completed jobs, and can't use an index
`dashboardController:109-142`: total revenue = `$match {job_status ∈ COMPLETED}` + `$sum $price` → walks ~80% of the collection every dashboard view. The today/yesterday revenue pipelines `$match` on an **`$or` of `paid_at` / `completed_at` ranges — neither field has a usable index for this shape** (the only index containing `completed_at` is prefixed by `job_status, finance_status`, and `$or` on two different fields defeats it). Modeled: three near-full scans per dashboard open, per admin. The heat-map endpoint (`jobHeatmapController:277-281`) runs **four parallel aggregations** per view — it at least has the 2dsphere index, but its stats facet inherits the same full-range behavior.

### LOAD-5 (HIGH) — Unbounded mobile endpoints: the app downloads a technician's entire career
`clicks-customer-tech-api/src/controllers/jobController.js:190` (`getJobs`) and `:204` (`getCustomerJobs`) have **no limit, no pagination, no projection**: `Job.find({assignedTechnician: id})` returns every job the technician ever did — full documents, on app open, over mobile data. A two-year technician with 3,000 jobs pulls ~6 MB+ of JSON per refresh (before the populate chains at lines 940-990, which multiply it). Same for long-tenure customers. Additionally `getCustomerJobs` sorts by `dateTime` while the customer index is `{customer_id, createdAt}` → in-memory sort on top. This is the finding your field users will feel first, because it worsens linearly for your *best* technicians.

### LOAD-6 (HIGH, also security) — Full `populate("assignedTechnician")` in job lists — password hash included
`getJobs`/`getJobById` populate the **entire Technician document** into every job row (jobController.js:52) — and the Technician schema has no `select:false` on `password`, `workPermitFront/Back`, `drivingLicense*` (verified, Technician.js:25-55). So the admin jobs list response carries, per row: a bcrypt **password hash** and the technician's identity-document URLs, ×40 rows, ×every page view. That's both a payload-weight problem (tens of KB per row before gzip — and **neither API uses compression middleware at all**, verified by grep) and an excessive-data-exposure finding that must be fixed together with the performance work. Several other populates in both APIs correctly use field selections — this is the notable exception, plus the `customer_vehicle_id` double-populate chains.

### LOAD-7 (MEDIUM) — Poll-storm architecture on the business portal
200 open business tabs = ~10 req/s forever, each request re-running its Job list + counts (businessPortalController:360-380) even when nothing changed. The queries themselves are well-indexed (`{business_id, createdAt}`), so this is not a database emergency — it's wasted compute and a latency floor that grows with tenant count. No ETag/`updatedAt` watermark, no 304s, no push.

### LOAD-8 (MEDIUM) — Live-Map fanout is O(techs × admins) with no batching or viewport filter
Every technician location write is immediately broadcast to every admin socket (`emitAdminTechnicianLocation` → `adminNamespace.emit`). At 1,000 online techs × 30 admins that's ~10k msgs/s emitted from the single tech-api process — CPU and event-loop pressure well before memory. No batching (e.g., coalesce to one bulk frame per 2 s), no viewport/region filtering, and every update also triggers a `Technician.findByIdAndUpdate` (fine) plus stale-set bookkeeping. The rooms refactor made this *horizontally scalable*; batching would make it *cheap*.

### LOAD-9 (MEDIUM) — No `lean()`, no projections on list reads
Effectively all list endpoints hydrate full Mongoose documents (change-tracking overhead, ~2-3× memory/CPU vs `.lean()`) and select every field. At 40-row pages this is tolerable; at the dashboards' recent-lists + the unbounded endpoints of LOAD-5 it compounds. One-line fixes with large aggregate effect.

### LOAD-10 (LOW/MEDIUM) — Growth hygiene: collections that only ever grow
`OutboxEvent` keeps `sent` events forever (no TTL — verified; only Notification has a TTL, and only if Round-3 Prompt 6 lands), `AdminAuditLog`/`FinanceAuditLog` grow unbounded (correct for audit, but need an archive plan), and there is **no data-lifecycle policy for jobs** (a 5-year-old completed job sits in the same working set as today's dispatch board). Also `morgan` removal (done) helps log volume; Mongo connection pools are at driver defaults (fine on Railway's 1–2 instances; revisit before >5 instances against an M10's connection cap).

### What is already right (don't re-fix)
Job compound indexes for the *filtered* paths; `PartnerEarning`/`TechnicianEarningEntry` unique indexes; 2dsphere on jobs + technicians + SOS; `$near` for nearby-tech; the 3 s location write throttle; the outbox claim query is fully covered by its `{status, next_attempt_at, type}` index; leads list caps `limit` at 100; socket rooms + Redis path enable horizontal scale-out of the realtime layer; SOS-critical paths are all point reads by `_id` (immune to collection growth).

---

## 3. What breaks when — modeled degradation timeline

| Jobs in DB | Admin jobs list (no filter) | Search keystroke | Dashboard load | Tech app history | SOS dispatch path |
|---|---|---|---|---|---|
| 10k (today-ish) | fast | ~instant | fast | fine | fast |
| 100k | noticeable (top-k scan ~100k docs) | 0.5–2 s ×2 scans | 1–3 s | MBs, slow on 4G | **unaffected** |
| 500k | 1–3 s/page | multi-second, cluster-cache pressure | 5 s+, polls stack | 10 MB+/open for veterans | unaffected |
| 1M | 3 s+/page, deep pages worse | **10 s+; concurrent searches degrade everything else** | 10 s+; polling dashboards keep cluster hot | app-open failures/timeouts | unaffected until cluster-wide cache thrash from the above spills over |

The through-line: **SOS and job lifecycle stay fast** (point reads/writes by id) right up until the *list/search/dashboard* workloads exhaust the Atlas cache and drag the whole cluster — which is exactly how "million rows" kills platforms: sideways.

---

## 4. Remediation plan

**Tier 1 — Quick wins (days, ~80% of the risk):** add the missing indexes (`{createdAt:-1}`; `{paid_at:-1}` + `{job_status, completed_at}` for revenue windows); debounce admin search (400 ms) and make server search anchored/prefix on indexed fields + a normalized phone-digest field; cap and paginate the mobile history endpoints; `.lean()` + explicit field projections + populate selects everywhere (killing the password-hash leak); add `compression()` to both APIs; replace per-request counts with cached/estimated counts.
**Tier 2 — Structural (weeks):** materialized dashboard stats (periodic aggregation into a stats doc; dashboards read one doc); cursor (range) pagination for jobs/leads; business-portal conditional polling (watermark/304) or socket push; Live-Map batched fanout.
**Tier 3 — Scale prep:** data lifecycle (archive completed jobs >18 months to a cold collection; TTL sent outbox events), Atlas M10→M30 trigger at sustained cache-pressure, k6 load-test suite as a CI-triggerable gate against staging, and (already possible) second tech-api instance via Redis + sticky sessions when socket CPU says so.

Everything in Tiers 1–2 is in the prompts below.

---

# PART B — CURSOR COMPOSER 2.5 PROMPTS (Performance Round)

Run in order; one per session; review diffs; commit separately. Prompts 1–6 are Tier 1.

---

## Prompt 1 — Missing indexes for the hot sorts and revenue windows

```
You are working in the Clicks roadside-assistance monorepo. Fix missing MongoDB indexes that force
collection scans at scale. Schema: clicks-api/clicks-shared/models/Job.js (index list at lines
140-146).

CONTEXT
- The admin jobs list default view runs Job.find({}).sort({createdAt:-1}).skip().limit() — there is
  NO {createdAt:-1} index, so Mongo top-k-scans the whole collection (existing compound indexes are
  prefixed by job_status/customer_id/business_id and cannot serve a bare createdAt sort).
- Dashboard revenue pipelines (clicks-admin-api/src/controllers/dashboardController.js:109-142)
  $match on paid_at ranges and completed_at ranges (via $or) — neither field is usably indexed.
- getCustomerJobs (clicks-customer-tech-api jobController ~:204) sorts {customer_id} results by
  dateTime, but the customer index is {customer_id, createdAt} → in-memory sort.

TASK
1. In Job.js add: JobSchema.index({ createdAt: -1 });
   JobSchema.index({ job_status: 1, paid_at: -1 }); JobSchema.index({ job_status: 1, completed_at: -1 });
   JobSchema.index({ customer_id: 1, dateTime: -1 });
2. Split the dashboard today/yesterday revenue $or into two indexed sub-aggregations (one matching
   {job_status ∈ COMPLETED, paid_at: range}, one matching {job_status ∈ COMPLETED, paid_at:
   {$exists:false}, completed_at: range}) and sum the two results in JS — same output shape, each
   branch index-covered. Keep response fields byte-identical.
3. Add a short comment on each new index naming the query it serves (grep-able provenance).
4. Check clicks-shared/models/Lead.js and SOSRequest.js against their list queries the same way;
   add {createdAt:-1} on Lead if its unfiltered list sort needs it (leadController sorts createdAt
   with optional status filter — the existing {status, createdAt} covers the filtered case only).

ACCEPTANCE
- explain()-style reasoning in your summary: for each changed query, name the index it now uses.
- No query result shapes change. Note in the summary that Atlas builds these indexes online but the
  build itself should be done off-peak once data is large.
```

---

## Prompt 2 — Kill the regex table-scan search (server + client)

```
You are working in the Clicks roadside-assistance monorepo. The admin jobs search is the worst
query in the system at scale: clicks-admin-api/src/controllers/jobController.js:32-40 builds an $or
of five case-insensitive UNANCHORED $regex clauses (unindexable → full collection scan), then
countDocuments repeats the scan; and clicks-interface/src/pages/JobManagement/Jobs.jsx feeds the
search box into useGetJobsQuery with NO debounce — every keystroke = two full scans. Leads has the
same server pattern (leadController.js:23-25).

TASK — server (admin-api):
1. Add a normalized search-digest field to Job: search_phone (clientMobileNumber digits-only) and
   search_name (clientName lowercased, trimmed). Set them in a pre-save hook AND in every code path
   that writes these fields via findOneAndUpdate/updateOne (grep all write sites — createJobRecord,
   importJobs, controllers). Index: {search_phone: 1}, {search_name: 1}.
   Provide scripts/backfill-search-fields.js (follow the existing backfill-* script pattern) to
   populate existing docs in batches of 1000 with progress logging.
2. Rewrite the search branch in getJobs:
   - If the search term is ≥4 digits after stripping non-digits → prefix match on search_phone
     ({search_phone: new RegExp("^" + escaped)}) — anchored prefix regex on an indexed field IS
     index-served.
   - Else → anchored prefix on search_name (lowercase the term), $or with an anchored prefix on
     businessName only if that field is commonly searched (keep it, add {businessName:1} index).
   - Drop `issue` and `location` from the quick search (unanchorable free text); note in the
     summary that full free-text search should later be Atlas Search — leave a TODO.
   - Escape user input for regex injection (RegExp special chars) — write a small escapeRegex util.
3. Apply the same treatment to leadController.getLeads (clientMobileNumber digits prefix +
   clientName prefix; drop `inquiry` from quick search).

TASK — client (clicks-interface):
4. Debounce the search input 400ms before it reaches useGetJobsQuery (local state for the input,
   debounced state for the query arg — keep the URL-param sync working). Same on the Leads page if
   it has a live search box.

TASK — tests:
5. Integration: digits query matches regardless of stored formatting (+974 5551 2345 vs 55512345);
   name prefix matches case-insensitively; a term with regex metacharacters ("a+b(") returns 200
   and matches literally, never throws.

ACCEPTANCE: no unanchored $regex remains in jobs/leads search paths; every search branch names the
index it uses; typing in the admin search fires at most ~2 requests/second.
```

---

## Prompt 3 — Bound and paginate the mobile history endpoints

```
You are working in the Clicks roadside-assistance monorepo. Two tech-api endpoints return a user's
ENTIRE job history unbounded — full documents, no limit, no pagination:
clicks-api/clicks-customer-tech-api/src/controllers/jobController.js — getJobs (~line 180:
Job.find(filter) with no limit) and getCustomerJobs (~line 197: Job.find(filter).sort({dateTime:-1})
unbounded). A technician with 3,000 career jobs downloads all of them on app open, over mobile data.

TASK — server:
1. Both endpoints: add pagination — query params page (default 1) & limit (default 20, hard cap
   50, coerce via clicks-shared/utils/coerce num()); .sort({createdAt:-1}) for the technician list,
   keep dateTime sort for customer (Prompt 1 adds its index); .skip/.limit; return {jobs, total,
   page, has_more} where total comes from countDocuments ONLY on page 1 (subsequent pages return
   total: null — client keeps the page-1 value).
2. Add .lean() and an explicit .select() of only the fields the list UIs render — inspect the
   Flutter job-list models (clicks-technician job model / clicks-user activity model) and select
   exactly those fields plus _id; keep the detail endpoints (getJobById, activity-detail) full.
   Trim the populate chains on the customer history to selected fields only.
3. BACKWARD COMPATIBILITY: mobile apps in the field call these without params — defaults must
   return the FIRST page (newest 20) rather than everything. That changes behaviour for old app
   builds (they'll see 20 rows). Confirm in the Flutter code that the history screens don't rely on
   receiving all rows for anything other than display (search for local filtering over the full
   list); report what you find before finalising the cap.

TASK — Flutter (clicks-technician history/activity screen, clicks-user activity screen):
4. Implement infinite scroll: load page 1, fetch next page when the user nears the end, spinner row
   while loading, stop at has_more=false. Guard emits/setState per codebase convention.

TASK — tests:
5. Integration: default call returns 20 newest with has_more; page walking is stable (no dupes/
   gaps with static data); limit>50 clamps; total only on page 1.

ACCEPTANCE: no endpoint on the tech API returns unbounded job lists; app-open payload for a
3,000-job technician drops from the full career to one page of selected fields.
```

---

## Prompt 4 — Payload diet: lean, projections, populate selects, gzip — and stop shipping the password hash

```
You are working in the Clicks roadside-assistance monorepo. Job list responses hydrate full
Mongoose documents and populate the ENTIRE Technician document into every row —
clicks-admin-api/src/controllers/jobController.js:52 .populate("assignedTechnician") with no field
selection, and the Technician schema (clicks-shared/models/Technician.js) does NOT hide password or
identity-document fields. So every admin jobs page ships, per row: the technician's bcrypt password
hash and workPermit/drivingLicense document URLs. Neither API uses HTTP compression (verified — no
compression middleware anywhere).

TASK
1. Schema safety net: in Technician.js set select: false on password. Then grep BOTH APIs for every
   place that legitimately reads technician.password (login/comparePassword paths in
   technicianController and any admin verify path) and add .select("+password") there explicitly.
   Do the same audit for Admin, Customer, BusinessUser, FinanceUser, Partner models (BusinessUser/
   FinanceUser/Partner login controllers included) — password select:false everywhere + explicit
   +password at the compare sites.
2. Trim the job list populates: in admin getJobs, populate assignedTechnician with select
   "firstName lastName phone profilePicture currentStatus" (mirror the selective populate already
   used at jobController.js:284) and source with "mainSourceName"; keep getJobById richer but
   STILL exclude password and document-image fields.
3. Add .lean() to read-only list queries in: admin getJobs, leads getLeads, finance listJobs,
   business listJobs, dashboard recent-lists, and the tech-api history endpoints (if Prompt 3 not
   yet merged, add it there too). Do NOT lean anything that later calls .save() or instance
   methods — check each site before converting and list the ones you deliberately skipped.
4. Add compression middleware to both createApp.js files (npm i compression in both APIs):
   app.use(compression()) early in the chain, default settings (it skips small/incompressible
   responses automatically).

TASK — tests:
5. Integration: the jobs list response contains NO "password" key anywhere in the JSON (deep
   scan assertion); technician login still works (explicit +password path); a business/finance/
   partner login still works.

ACCEPTANCE: no credential or identity-document field ever leaves the API in a list response; list
endpoints are lean + projected; responses are gzip-compressed. State the rough payload reduction
for a 40-row jobs page in your summary.
```

---

## Prompt 5 — Count strategy: stop paying a full scan for a number nobody reads precisely

```
You are working in the Clicks roadside-assistance monorepo. Nearly every list endpoint runs
countDocuments(query) alongside the data query (admin jobs:64, business listJobs, finance
dashboard:40-42, admin dashboard fires 13 of them at lines 93-108 of dashboardController.js), and
the business/finance dashboards REPEAT these counts on 20-30s polls. At 1M jobs, counts become the
dominant cost.

TASK
1. Create clicks-api/clicks-shared/utils/cachedCount.js: cachedCount(model, query, {ttlMs=30000,
   key}) — an in-process Map cache of count results keyed by a stable serialization of the query
   (or an explicit key), with TTL. Include a clearCountCache() for tests. This is per-instance
   cache; note in a comment that slight cross-instance drift is acceptable for dashboard numbers.
2. Admin dashboard (dashboardController getDashboardSummary): route all 13 Job/Technician/SOS/
   Vehicle/Customer countDocuments through cachedCount with 30s TTL. For the unfiltered total
   ({}) use model.estimatedDocumentCount() (metadata read, O(1)) instead of countDocuments.
3. Business + finance dashboards: same treatment (their pollers currently re-run every count each
   cycle; with 30s TTL a poll storm collapses to one real count per query per instance per 30s).
4. List endpoints (admin jobs, leads, business jobs, finance jobs): keep counts EXACT when a
   filter/search is active but cache them 15s; for the unfiltered first page use
   estimatedDocumentCount. Return counts in the same response fields as today.
5. Do NOT cache anything that feeds financial writes or the finance audit itself — display-only.

TASK — tests:
6. Unit-test cachedCount (TTL expiry, distinct queries distinct keys); integration: dashboard
   summary returns the same shape; two rapid calls hit the cache (spy on countDocuments call count).

ACCEPTANCE: a 30s business/finance/admin dashboard poll cycle triggers at most one real count per
distinct query per instance; unfiltered totals are O(1); response shapes unchanged.
```

---

## Prompt 6 — Materialized dashboard stats (one document instead of 25 collection passes)

```
You are working in the Clicks roadside-assistance monorepo. The admin dashboard summary runs ~25
parallel collection operations per view (clicks-admin-api/src/controllers/dashboardController.js:
93-166), including revenue aggregations that scan all completed jobs (lines 109-142). With Prompt 5
caching counts, the aggregations remain the heavy part. Materialize them.

TASK
1. clicks-shared/models/PlatformStats.js: { key (unique, e.g. "dashboard_summary"), value (Mixed),
   computed_at }. Export from models index.
2. clicks-api/clicks-admin-api/src/services/statsRefresher.js on the established worker pattern
   (interval + unref + stop function + SIGTERM hook in index.js, like outboxWorker): every 60s
   (env STATS_REFRESH_MS) compute the dashboard aggregates that scan large ranges — total revenue,
   today/yesterday revenue (using the Prompt 1 split indexed pipelines), any other Job.aggregate in
   getDashboardSummary — and upsert them into PlatformStats. Multi-instance safe: claim with a
   findOneAndUpdate on computed_at older than the interval (same discipline as the outbox claim) so
   only one instance computes per cycle.
3. getDashboardSummary: read the aggregates from PlatformStats (fall back to computing inline once
   if the doc is missing/stale >5 min, then upsert), keep the cheap/fresh bits (online technician
   counts, pending SOS — these must stay live) as direct queries via cachedCount. Add
   stats_computed_at to the response so the UI can show "as of 12:03:40".
4. clicks-interface Dashboard: display the as-of timestamp subtly near the revenue tiles.

TASK — tests:
5. Integration: refresher computes and upserts; summary serves from the doc (spy: no Job.aggregate
   during a warm read); stale fallback path computes inline; two workers, one claim.

ACCEPTANCE: a dashboard view costs a handful of point reads + cached counts; the heavy scans run
once per minute per cluster regardless of how many admins are watching; revenue numbers carry an
as-of timestamp.
```

---

## Prompt 7 — Live-Map fanout batching + business-portal conditional polling

```
You are working in the Clicks roadside-assistance monorepo. Two standing-load reductions:

PART A — Live-Map batching. In clicks-api/clicks-customer-tech-api/src/services/sosSocketService.js
every technician location write immediately does adminNamespace.emit("technicianLocationUpdate",
...) — at 1,000 online techs (≤1 update/3s each) × 30 admins that's ~10k socket messages/s from one
process.
1. Replace per-update admin emits with a coalescing buffer: emitAdminTechnicianLocation pushes into
   a Map keyed by technician_id (latest wins); a 2s interval (env ADMIN_MAP_BATCH_MS, unref, stop
   hook) flushes one adminNamespace.emit("technicianLocationBatch", {updates:[...], ts}) when the
   buffer is non-empty. Keep emitting the EXISTING technicianLocationUpdate event too, behind env
   ADMIN_MAP_LEGACY_EVENTS=true default, so the deployed admin UI keeps working — flip the default
   to false after the UI ships. Presence events (online/offline/stale) stay immediate — they're
   rare and meaningful.
2. clicks-interface (AdminLayout/LiveMap): subscribe to technicianLocationBatch and apply the batch
   to marker state in one setState/dispatch; keep the old handler for back-compat during rollout.
   Customer-facing per-job locationUpdate relays are untouched (one customer per job — cheap).

PART B — Business portal conditional polling. The portal polls Jobs/Dashboard/JobDetail every
20-30s (clicks-business-web pages) and the server recomputes full responses every time.
3. Add a watermark: business listJobs/dashboard responses include as_of (server now) and accept
   ?if_changed_since=<iso>. Implementation: a cheap freshness probe per business — the max of
   (latest Job.updatedAt for business_id, latest Lead.updatedAt for business_id) via two indexed
   point queries ({business_id:1, updatedAt:-1} indexes — add them to Job and Lead schemas). If
   nothing is newer than if_changed_since, return 304 with no body. RTK on the client: pass the
   last as_of, treat 304 as "keep cached data" (structural sharing already avoids re-render churn;
   ensure the baseQuery doesn't treat 304 as an error).

TASK — tests:
4. Integration (socket helper from the reconnect suite): two rapid location updates for the same
   tech produce ONE batched admin frame containing only the latest coords; presence events still
   arrive immediately. Business: second poll with current watermark → 304; after a job update → 200
   with data.

ACCEPTANCE: admin map traffic scales with time (1 frame per 2s) instead of techs×admins; idle
business tabs cost two index point-reads per poll instead of full list recomputation.
```

---

## Prompt 8 — Data lifecycle: TTLs, archival, and growth guards

```
You are working in the Clicks roadside-assistance monorepo. Several collections only ever grow, and
old completed jobs share the working set with today's dispatch board.

TASK
1. OutboxEvent (clicks-shared/models/OutboxEvent.js): TTL on delivered events — add
   sent_at (set it in markSent) and a TTL index expiring docs 30 days after sent_at
   ({sent_at: 1}, {expireAfterSeconds: 2592000}). "failed" and "pending" events are NOT expired
   (no sent_at). Update outboxWorker.markSent accordingly.
2. Notification model (if present from the notifications feature): confirm the 90-day TTL exists;
   add it if missing.
3. Job archival (cold collection, no deletes):
   - clicks-shared/models/JobArchive.js — same schema shape as Job (reuse the schema object,
     different collection "jobarchives"; keep the indexes minimal: {createdAt:-1},
     {customer_id:1, createdAt:-1}, {assignedTechnician:1, createdAt:-1}, legacy_id sparse).
   - scripts/archive-old-jobs.js (existing backfill-script conventions, dry-run flag default ON):
     move jobs with job_status in [completed, cancelled], completed_at/cancelled/createdAt older
     than ARCHIVE_MONTHS (default 18), AND finance_status "audited" (never archive unaudited
     financials) — insert into JobArchive then delete the original, in batches of 500 inside a
     session-per-batch, logging counts. Refuse to run without --confirm unless dry-run.
   - Read paths: admin getJobById falls back to JobArchive when not found in Job (read-only,
     flagged archived: true in the response); the mobile history endpoints do NOT query the
     archive (page 1 recency makes it irrelevant); finance history endpoint may read it read-only.
     Document in the script header that archived jobs are excluded from dashboards by design.
4. Growth guards: add a size note to AdminAuditLog/FinanceAuditLog models (no TTL — audit data;
   comment that export-and-prune is a future ops task), and include outbox failed-count +
   collection stats (estimatedDocumentCount for jobs, jobarchives, outboxevents, notifications) in
   the system-status endpoint if it exists (Round-3 Prompt 12) — else skip.

TASK — tests:
5. Integration: markSent sets sent_at; archive script dry-run reports candidates without moving;
   real run moves only audited+old jobs and getJobById still resolves an archived id with
   archived:true; unaudited old jobs are never moved.

ACCEPTANCE: delivered outbox events self-expire; the hot Job collection stops growing without
bound (audited history moves cold but stays readable); nothing financial is archived before audit.
```

---

## Prompt 9 — k6 load-test suite + capacity gate (measure, don't guess)

```
You are working in the Clicks roadside-assistance monorepo. All performance work so far is
statically reasoned — build the measurement harness so regressions and Atlas sizing are decided by
numbers. Target: STAGING ONLY (the staging VPS deployment from STAGING_DEPLOY.md), never
production. Use k6 (plain JS, no runner install needed in repo — document `k6 run`).

TASK
1. Create loadtest/ at clicks-api root:
   - loadtest/config.js — BASE_ADMIN, BASE_TECH, tokens via env (STAGING_ADMIN_TOKEN etc.); refuse
     to run (throw) if any base URL contains "production" or the prod Railway hostnames.
   - loadtest/seed-loadtest-data.js — a Node script (mongoose, reusing clicks-shared models)
     that bulk-inserts synthetic jobs into the STAGING DB: N jobs (env JOBS=1000000) in batches of
     5,000 with realistic field distributions (80% completed over 2 years, statuses spread, Doha
     bbox coordinates, phone digits, ~30 distinct businesses, ~200 technicians), marker field
     loadtest:true for cleanup, plus loadtest/cleanup-loadtest-data.js deleting only marked docs.
   - loadtest/scenarios/admin-browse.js — k6: ramp 5→30 VUs, 5 min: jobs list p.1-5, status
     filters, search terms (name prefixes + phone digits), job detail. Thresholds: p95<800ms,
     error rate <1%.
   - loadtest/scenarios/dashboards.js — 20 VUs hammering admin/business/finance dashboard
     endpoints at their real poll cadences. Threshold p95<500ms.
   - loadtest/scenarios/field-apps.js — 50 VUs: technician session, history page 1, customer
     active/history. Threshold p95<600ms.
   - loadtest/scenarios/sos-dispatch.js — the one that matters: k6 ws + http mix — connect
     customer/technician sockets (JWT auth handshake per sosSocketService namespaces), createSOS,
     measure time-to-admin-broadcast and location-update relay latency under 200 concurrent
     technician socket VUs emitting updateLocation every 3s. Threshold: SOS create→admin event
     p95 < 1.5s.
2. loadtest/README.md: exact run order (seed → scenarios → cleanup), the env vars, expected
   baseline table to fill in, and the M10→M30 decision rule (sustained cache eviction / p95 breach
   at target VUs).
3. Wire a MANUAL GitHub Actions workflow .github/workflows/loadtest.yml (workflow_dispatch only,
   inputs: scenario, VUs) running k6 via grafana/k6-action against staging secrets. Never on push.

ACCEPTANCE: one command seeds a million-job staging dataset and one command per scenario produces
p95/p99 numbers against it; production URLs are structurally impossible to target; cleanup removes
exactly the synthetic data.
```

---

## Prompt 10 — Guardrails so the fast paths stay fast

```
You are working in the Clicks roadside-assistance monorepo. Lock in the performance work with
regression guards.

TASK
1. Query-shape tests: add clicks-api/tests/integration/query-guards.integration.test.js using
   mongoose query middleware — in the test setup, register a pre('find'/'aggregate'/'countDocuments')
   hook on the Job model that records invocations. Assert:
   - admin getJobs (no filter) issues exactly one find with a limit ≤ 50 and one count;
   - the search path never issues a query containing an unanchored $regex on issue/location
     (inspect the recorded filter objects);
   - tech-api history endpoints always carry a limit;
   - dashboard summary (warm PlatformStats) issues zero Job.aggregate calls.
2. Payload guards: extend the existing no-password-key response test to a helper
   assertNoSensitiveKeys(body) (password, workPermitFront/Back, drivingLicenseFront/Back) applied
   to jobs list, job detail, technician list, and business/finance job responses.
3. A lightweight perf lint: scripts/check-query-hygiene.mjs (plain Node, no deps) that greps
   src/**/controllers for `$regex` without a leading `^` in the pattern literal and for
   `.find(` calls followed within the same statement chain by neither `.limit(` nor a comment
   `// unbounded-ok:` — exits 1 listing offenders. Add it to ci.yml next to check-status-labels.
   Annotate the deliberate unbounded internal queries (outbox claim etc.) with the marker comment.
4. Document the rules in clicks-api/docs/PERFORMANCE.md: every list endpoint is paginated + capped
   + lean + projected; every new query names its index in a comment; counts are cached or
   estimated; searches are anchored on indexed fields; no populate without a select.

ACCEPTANCE: CI fails if someone reintroduces an unanchored regex search, an unbounded controller
find, or a credential field in a list response; PERFORMANCE.md states the house rules.
```

---

## Order & grouping

| Wave | Prompts | Impact |
|---|---|---|
| 1 | 1, 2 | Kills the two collection-scan generators (sort + search) |
| 2 | 3, 4 | Mobile payloads bounded; password-hash leak closed; gzip on |
| 3 | 5, 6 | Dashboards go from ~25 passes to point reads |
| 4 | 7 | Standing load (map fanout, poll storm) flattened |
| 5 | 8 | Growth stops compounding |
| 6 | 9, 10 | Measure at 1M and lock it in |

**Infra notes that are yours, not Composer's:** build the new indexes off-peak once data is real; run Prompt 9's seed+scenarios on staging before and after Waves 1–3 to get the actual before/after; move Atlas M10→M30 only when the measured numbers say so (sustained cache eviction or p95 breach at target load — the k6 README encodes the rule); Redis + sticky sessions + a second tech-api instance remain the socket-CPU relief valve, already unlocked by the rooms refactor.
