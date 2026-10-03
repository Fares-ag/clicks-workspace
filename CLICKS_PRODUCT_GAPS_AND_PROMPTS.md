# Clicks — Persona Walkthroughs, Missing Capabilities & Cursor Prompts (Round 3)

Two parts. **Part A** walks the product as three real users — a stranded customer, a dealership
service manager, and an admin dispatcher — using what the code actually implements today (every
claim below was verified against the current tree). **Part B** turns the highest-value gaps into
ready-to-paste Cursor Composer 2.5 prompts.

---

# PART A — WALKING THE FLOWS

## A1. The Customer (clicks-user) — "It's 41°C on the Doha Expressway and my car just died"

**What works today (verified):** OTP registration/login, SOS with resilient sockets, live
technician position on a map, technician arrival → repair → signature → receipt, rating a
completed job, job history, support tickets, full Arabic, account deletion.

**Walking the flow, where it breaks:**

1. **I press SOS. Then... how much will this cost?** There is no upfront price signal anywhere in
   the customer flow. `GET /api/jobs/:id/total` exists but only *mid-job* after repairs are logged.
   A stranded customer commits to a service with zero price expectation — the #1 driver of
   cancellations, disputes, and one-star reviews in this category.
2. **A technician is assigned. When will he arrive?** The tracking screen shows a moving dot, but
   no ETA. The maps proxy (`/api/maps/directions`) already returns duration — it is simply never
   surfaced as "Ahmed is 12 minutes away." Under stress, a dot without a number reads as "no idea."
3. **I found help another way / my cousin showed up. I want to cancel.** **I can't.** Verified:
   `POST /api/jobs/:id/cancel` is technician-only; customers can cancel a *pending SOS*
   (`cancelSOS`) but once a job exists there is no customer cancellation path at all. The customer's
   only options are calling the call center or simply not being there when the technician arrives —
   which burns technician time and earnings.
4. **What happened while my phone was in my pocket?** The notification "inbox" endpoints
   (`/api/notifications/customer`, `/unread-count`) are **stubs returning empty lists** (verified —
   inline handlers). Push notifications fire and vanish; there is no persistent history, so a missed
   push is information lost forever.
5. **My battery dies every summer — can I book for tomorrow morning?** The data model supports it
   (`ServiceRequest.timing: "scheduled"`, `scheduled_for`, an index on it) but the customer flow
   never offers a date/time; nothing reminds anyone when the slot arrives. Scheduled service is a
   model field, not a feature.
6. **Payment.** `payment_method` supports cash/card/wallet/fawran, but "payment" is the technician
   tapping a button — there is no actual card/wallet capture, no customer-side payment
   confirmation, no dispute trail. Acceptable for a cash-first soft launch; a liability at scale
   (technician says paid, customer says otherwise — only the signature protects you).
7. **Smaller gaps:** no way to adjust the pin / describe access ("I'm on the service road, behind
   the truck"); no in-app call/chat masking (customer and technician exchange real phone numbers);
   no tipping; no post-cancel rebooking shortcut.

## A2. The Dealer (clicks-business / clicks-business-web) — "I'm a service manager at a dealership with 3 stranded customers a day"

**What works today (verified):** login, dashboard KPIs, analytics, vehicle catalog dropdowns,
create request, list jobs with status, job detail with technician phone.

**Walking the flow, where it breaks:**

1. **I "create a job"… except I don't.** Verified: `POST /api/business/jobs` calls
   **`createLead`** — the dealer's submission is a *lead* that an admin must notice (popup) and
   manually convert. Nothing in the portal UI tells the dealer this. So the dealer sees "submitted"
   and expects a technician is coming, while in reality the request sits in an admin queue. If the
   admin is busy, the dealer's customer waits with no feedback. **This is the single biggest
   expectation mismatch in the product.** Either make dealer submissions real jobs with an SLA, or
   show the pipeline honestly ("Received → Confirmed by Clicks → Technician assigned").
2. **My service advisor typo'd the plate. Let me fix it — or cancel.** There is no edit and no
   cancel. The portal is create-and-watch: `GET` routes plus `createLead` are literally the entire
   authenticated surface (verified above). The dealer's only recourse is a phone call.
3. **I only find out things changed if I'm staring at the screen.** The portal polls every 20–30s
   with no push, no email, no sound. A dealer who closes the tab learns nothing until reopening it.
   No end-of-day summary either.
4. **My GM wants last month's numbers.** No export of any kind — no CSV, no statement, no invoice.
   For a B2B relationship there is no billing artifact at all.
5. **I want my night-shift advisor to have his own login.** BusinessUser exists as a model, but
   there is no self-service user management — no invite, no deactivate, no roles. Every account
   change goes through Clicks admins (`/api/businesses/:id/*` is admin-only, verified).
6. **Smaller gaps:** no ETA/status timeline per job; no proof-of-service (completion photos are
   collected from technicians but never shown to the business); the Flutter business app still has
   no push and no Arabic.

## A3. The Admin (clicks-interface) — "I'm the dispatcher on the 2 a.m. shift"

**What works today (verified):** SOS inbox with claim, live map with presence/staleness, job & lead
CRUD with field locking, lead→job conversion, business-job popup (now durable via outbox), partner/
business/finance-user management, vehicle catalog, performance, heat map, audit log with query API,
role-gated everything.

**Walking the flow, where it breaks:**

1. **An SOS lands. Who's closest?** The dispatcher looks at the live map, eyeballs distances, then
   creates/edits a job and picks a technician from a dropdown. `findNearbyTechnicians` ($near)
   exists on the tech API — but the admin flow never uses it. No ranked "3 nearest available
   technicians, 4/7/11 min away, one-click assign." At thousands of jobs/day this eyeballing is the
   throughput ceiling.
2. **Reassignment is an edit, not an action.** Changing `assignedTechnician` happens through the
   generic job-update path. Verified: the new-assignment branch notifies the *new* technician — but
   there is no explicit reassign flow that also tells the *old* technician to stand down, records a
   reason, or guards against reassigning an `in_progress` job. Night-shift reality: technician's van
   breaks, dispatcher must bounce the job — today that's an edit-form gamble.
3. **A technician signs up. Who approves him?** Approval status gates technician login on the tech
   API, but there are **no approval endpoints in the admin routes** (verified — technicians.js has
   CRUD, no approve/reject/suspend) and no pending-applications queue in the UI. Approval currently
   means a developer editing MongoDB — precisely the "ops can't run the platform without a
   developer" smell the audits keep flagging.
4. **The popup I missed while grabbing coffee.** Business jobs, SOS events, and service requests
   arrive as socket popups + sounds. The outbox now guarantees *delivery to the namespace* — but if
   no admin is connected, the event plays to an empty room. There is no persistent admin
   notification inbox with read/unread, so "what came in overnight?" has no answer other than
   scanning list pages.
5. **Nobody is watching the clock.** No SLA timers: nothing flags "SOS unclaimed for 5 minutes,"
   "job assigned but not accepted for 10," "in_progress for 4 hours." At 2 a.m. the system depends
   entirely on a human noticing a row hasn't changed.
6. **Kill switches are an env-var deploy.** `LAUNCH_PUBLIC_SOS` / `LAUNCH_PUBLIC_SIGNUP` require a
   Railway variable change + restart. In an incident, the person who can flip them is a developer
   with Railway access, not the on-duty ops lead.
7. **Smaller gaps:** no CSV export on jobs/leads; no bulk actions; support tickets have an update
   endpoint (on the tech API, admin-role) but no admin inbox UI; no customer-block action; no
   system-health/status page consuming the (now real) health endpoints.

## A4. Priority view of the gaps

| Rank | Gap | Persona | Why it's first-order |
|---|---|---|---|
| 1 | Customer job cancellation | Customer | Trapped users burn technician hours; no clean state today |
| 2 | Dealer lead-vs-job honesty + edit/cancel | Dealer | Silent expectation mismatch with the paying B2B side |
| 3 | Nearest-technician dispatch assist | Admin | Direct throughput/SLA lever; data already exists ($near) |
| 4 | ETA surfaced to customer (and dealer) | Customer | Biggest anxiety reducer; directions API already proxied |
| 5 | Technician approval workflow | Admin | Removes developer-DB-edit from a core ops task |
| 6 | Persistent notifications (customer + admin inbox) | All | Stub endpoints today; missed events are lost |
| 7 | SLA timers & escalation | Admin | The 2 a.m. safety net |
| 8 | First-class reassignment | Admin | Nightly reality; today an unsafe generic edit |
| 9 | Upfront price estimate | Customer | Cancellation/dispute driver |
| 10 | Business self-service users, exports, email digests | Dealer | B2B table stakes |
| 11 | Scheduled service end-to-end | Customer/Admin | Model exists; feature doesn't |
| 12 | Ops-controlled kill switches + health page | Admin | Incident response without a developer |

Deliberately **not** prompted below (bigger product decisions first): real payment capture
(card/wallet/fawran integration), in-app chat/number masking, tipping, invoicing/billing engine,
customer subscriptions. Decide the business model details before building.

---

# PART B — CURSOR COMPOSER 2.5 PROMPTS

Same rules as before: one prompt per Composer session, review the diff, commit each separately.
These are FEATURES, so each prompt includes API + portal/app surfaces + tests. Run in order.

---

## Prompt 1 — Customer job cancellation (end-to-end)

```
You are working in the Clicks roadside-assistance monorepo (Qatar). Customers currently have NO way
to cancel a job: POST /api/jobs/:id/cancel is technician-only (cancelJobByTechnician in
clicks-api/clicks-customer-tech-api/src/controllers/jobController.js), and cancelSOS only covers a
pending SOS before a job exists. A customer whose problem resolved itself simply doesn't show up,
wasting the technician's trip.

TASK — backend (clicks-customer-tech-api):
1. Add POST /api/jobs/:id/cancel-by-customer (authenticate(["customer"])) in jobRoutes.js →
   cancelJobByCustomer in jobController.js:
   - Ownership via the existing assertJobAccess (customer owns the job).
   - Allowed ONLY from statuses: assigned, accepted, en_route, arrived. Reject in_progress (400
     "Work has already started — please contact support"), completed, cancelled (idempotent 200 if
     already cancelled by this customer).
   - Use the same atomic CAS pattern as markCompleted: findOneAndUpdate({_id, job_status: {$in:
     [...allowed]}}, {$set: {job_status:"cancelled", cancelled_at, cancelled_by:"customer",
     cancel_reason}}). Require cancel_reason from a fixed enum (resolved_myself, wait_too_long,
     found_other_help, wrong_location, price_concern, other) + optional free text (500 chars).
     Check the Job schema for existing cancel fields (cancel_reason exists — reuse; add
     cancelled_by/cancelled_at if missing).
   - After cancel: notify the assigned technician via socket (emitToUser on the technician
     namespace — follow the jobCancelled event shape already emitted by adminCancelJob in
     sosSocketService.js) AND FCM (fcmService); set the technician back to "Online" via
     setTechnicianStatus + presence notify (mirror what markCompleted does); increment
     weekly_earnings jobs_cancelled on TechnicianEarnings (the bucket field exists) WITHOUT
     touching money fields; write no TechnicianEarningEntry.
   - If the job was linked to an SOS (sos_id), mark the SOSRequest cancelled too.
2. Wire an AdminAuditLog-equivalent trail: this API has no recordAudit helper — emit an
   adminNamespace socket event jobCancelledByCustomer so dispatchers see it live, and ensure the
   cancel fields make it into the admin job detail response.

TASK — customer app (clicks-user):
3. On the active-job/tracking screens, add a "Cancel request" action visible only in the allowed
   statuses; confirmation sheet with the reason enum (localised — add keys to BOTH
   assets/translations/en.json and ar.json with real Arabic); call the new endpoint; on success
   return to home with a confirmation; handle the 400 in_progress case with the support-contact
   message. Guard emits with isClosed per the codebase pattern.

TASK — tests:
4. Integration test (clicks-api/tests/integration/customer-cancel.integration.test.js, existing
   helpers): cancel from assigned succeeds and sets fields; cancel from in_progress 400s; double
   cancel is idempotent; technician earnings money fields unchanged; a concurrent cancel vs
   technician start (Promise.all) resolves to exactly one winner via the CAS.

ACCEPTANCE: a customer can cleanly cancel pre-start with a reason; technician + admins are
notified; no earnings are credited; all transitions are race-safe and covered by tests.
```

---

## Prompt 2 — Dealer truth: lead pipeline transparency + edit/cancel before dispatch

```
You are working in the Clicks roadside-assistance monorepo. The business portal misleads dealers:
POST /api/business/jobs actually calls createLead (verified in clicks-api/clicks-admin-api/src/
routes/businessPortal.js:51-52 → businessPortalController.createLead) — the submission is a LEAD
awaiting manual admin conversion, but the portal presents it as a created job with no pipeline
visibility. Dealers also cannot edit or cancel anything after submitting.

TASK — backend (clicks-admin-api, /api/business/*, authenticateBusiness):
1. Pipeline visibility: extend the business jobs/list + detail responses to expose the true stage.
   Look at how leads and jobs are linked (Lead model, converted job reference, source attribution)
   and return stage: "received" (lead, unconverted) | "confirmed" (converted to job, unassigned) |
   "assigned" | "en_route" | "arrived" | "in_progress" | "completed" | "cancelled", plus timestamps
   for each transition where available. The list endpoint must merge unconverted leads and
   converted jobs into one coherent "requests" view for the business (it may already do this —
   inspect listJobs and align).
2. Edit: PATCH /api/business/requests/:id — allowed ONLY while stage is "received" (still a lead):
   editable fields limited to vehicle fields, plate, contact name/phone, location, notes (use
   pick() from clicks-shared/utils/coerce.js). 409 once converted.
3. Cancel: POST /api/business/requests/:id/cancel — allowed while "received" (cancels the lead,
   with reason) or "confirmed"/"assigned" (cancels the job via the same guarded transition rules as
   admin cancel; NOT once in_progress). Notify admins via the existing internal-notify path
   (x-internal-secret → tech-api → adminNamespace) with a businessRequestCancelled event; enqueue
   the outbox event on failure exactly like createLead's popup does.
4. Every business mutation writes an AdminAuditLog row (reuse recordAudit with the business user as
   actor — extend the helper to accept actor_type: "business_user").

TASK — business web (clicks-business-web):
5. Jobs list + detail: render the stage as a horizontal status timeline (Received → Confirmed →
   Assigned → En route → Arrived → In progress → Completed) using jobStatusLabels for the job
   stages; show "Awaiting Clicks confirmation" copy on "received" so expectations are honest.
6. Add Edit (only when received) and Cancel (per rules) actions with confirmation dialogs and the
   reason picker; reflect 409s with a clear "already confirmed — call us to change" message.

TASK — tests:
7. Integration tests: business can edit a lead but not a converted job (409); cancel per stage
   rules; another business's request id returns 404/403 (tenant isolation preserved); audit rows
   written with the business actor.

ACCEPTANCE: dealers see the true pipeline stage of every request, can fix mistakes before
confirmation, can cancel before work starts, and every action is audited and tenant-scoped.
```

---

## Prompt 3 — Dispatch assist: nearest available technicians + one-click assign

```
You are working in the Clicks roadside-assistance monorepo. Dispatchers currently eyeball the Live
Map to pick a technician. The data for ranked suggestions already exists: Technician has a 2dsphere
currentLocation, lastLocationAt staleness, currentStatus (Online / On Job / Offline), and the tech
API already implements findNearbyTechnicians with $near (clicks-api/clicks-customer-tech-api/src/
controllers/jobController.js). Build dispatch assist into the ADMIN side.

TASK — backend (clicks-admin-api):
1. GET /api/jobs/:id/suggested-technicians (authenticateToken + requireOps): resolve the job's
   coordinates (reuse clicks-shared/utils/resolveJobLocation.js), then query Technician with $near,
   filtered to currentStatus "Online", location fresh (lastLocationAt within TECH_LOCATION_STALE_MS
   default 60s — read the same env the socket service uses), limit 5. Return distance_meters
   (computed via clicks-shared/utils/geoDistance.js), minutes estimate (distance / 40km/h fallback;
   if GOOGLE_MAPS_API_KEY is set server-side, optionally batch a Distance Matrix call — make this
   an enhancement flag, not a requirement), name, phone, vehicle, active-job count.
   Also GET /api/sos/:id/suggested-technicians with the same shape for the SOS inbox.
2. POST /api/jobs/:id/assign (authenticateToken + requireOps): atomic assignment — CAS on the job
   ({assignedTechnician: null or missing} + status in assignable set → set assignedTechnician,
   job_status "assigned"); 409 if already assigned (tell the caller who has it). Notify the
   technician through the existing internal-notify → tech-api path (socket + FCM), write a
   recordAudit row ("job.assign"), and enqueue the outbox event if the notify fails (existing
   pattern in businessPortalController).

TASK — admin web (clicks-interface):
3. In the job detail / edit modal and the SOS inbox row: a "Suggest technicians" panel listing the
   5 ranked results (name, distance, ETA, status chip, stale-location warning) with an Assign
   button per row calling the new endpoint; optimistic UI + RTK tag invalidation; surface the 409
   ("already taken by X") gracefully. Reuse existing modal/list styling.

TASK — tests:
4. Integration: suggestions exclude Offline and stale-location technicians and sort by distance
   (seed 3 techs at known coordinates using the geo helpers from the socket tests); concurrent
   assign of two admins → exactly one 200, one 409; audit row written.

ACCEPTANCE: a dispatcher claims an SOS or opens a job and assigns the nearest fresh-location online
technician in two clicks, race-safe, audited, with the technician notified.
```

---

## Prompt 4 — Surface the ETA to the customer (and dealer)

```
You are working in the Clicks roadside-assistance monorepo. The customer tracking screen shows the
technician's moving position but never an ETA, even though the tech API already proxies Google
Directions (GET /api/maps/directions, server-side key, authenticated for technician/customer —
clicks-api/clicks-customer-tech-api/src/controllers/mapsController.js returns duration).

TASK — backend:
1. Inspect mapsController.directions and ensure the response exposes duration_seconds and
   distance_meters at the top level (add if buried in the raw Google payload; do not break existing
   consumers — additive only). Add basic in-memory memoization per (origin-rounded-to-3-decimals,
   destination) for 30s to control Maps API spend during 3s location updates.
2. In sosSocketService.js, when relaying locationUpdate to the customer for an active job, include
   the technician's coordinates (already sent) — no server ETA computation here; the client asks
   the directions proxy at a sane cadence.

TASK — customer app (clicks-user):
3. On technician_tracking_screen.dart: on jobAssigned/en_route, and then at most every 45 seconds
   or when the technician has moved >300m (compute from the socket updates), call the directions
   proxy from tech position → job location and render "≈ N min away" prominently, with the last-
   updated moment; show "Arriving now" under 2 minutes; hide ETA once status is arrived. Localise
   (en + real Arabic). Guard emits/setState per codebase convention; do not add a new polling timer
   that survives screen dispose.
4. Push context: when the technician goes en_route, the existing FCM notification should include
   the initial ETA in its body — wire the directions lookup into the en-route notify on the server
   (best-effort try/catch; never block the transition on Maps).

TASK — business web (clicks-business-web):
5. On JobDetail for stage en_route, show the same ETA line (poll the admin API — add a thin
   GET /api/business/requests/:id/eta that server-side calls the tech API internal directions
   lookup, so the business portal never needs the Maps key or tech-api access).

TASK — tests:
6. Integration: the /eta business endpoint is tenant-scoped and returns 404 for another business's
   job; directions memoization returns cached within the window (mock axios per setupMocks).

ACCEPTANCE: customers see a live "minutes away" that updates as the technician moves; dealers see
it per job; Maps spend is bounded by memoization + client cadence rules.
```

---

## Prompt 5 — Technician approval workflow (admin-operable, no more DB edits)

```
You are working in the Clicks roadside-assistance monorepo. Technician approval currently gates
login on the tech API, but the admin API exposes NO approval endpoints (verified: routes/
technicians.js is CRUD only) and the admin UI has no pending queue — approving a technician means a
developer editing MongoDB.

TASK — investigate first:
1. Read clicks-api/clicks-shared/models/Technician.js and the tech-api login/registration
   (technicianController.js) to establish the exact approval field(s) and states the login check
   uses (approval status / verified flag). Use THOSE fields — do not invent parallel ones.

TASK — backend (clicks-admin-api):
2. GET /api/technicians/pending (authenticateToken + requireOps): technicians in the
   awaiting-approval state, newest first, with registration documents/photo fields included.
3. POST /api/technicians/:id/approve, /:id/reject (body: reason, required), /:id/suspend and
   /:id/reinstate (requireFullAdmin for reject/suspend/reinstate; requireOps may approve) — each:
   validate the current state transition, update the model's real fields, recordAudit
   ("technician.approve" etc. with reason), and notify the technician: FCM via the tech-api
   internal-notify path if a token exists, and SMS via the existing smsService adapter (approval
   granted / rejected with reason) — both best-effort try/catch.
4. Ensure a suspended technician: fails login (verify the tech-api check covers the suspended
   state — extend it if it only checks the pending state), is force-disconnected from the
   technician socket namespace on suspension (emit a forceLogout event through the internal notify
   and disconnect their sockets server-side), and is excluded from dispatch suggestions (Prompt 3's
   filter) and findNearbyTechnicians.

TASK — admin web (clicks-interface):
5. A "Pending approval" tab/badge on the Technicians page listing applicants with their documents;
   Approve / Reject (reason dialog) actions; suspended state visible with Reinstate. Role-gate the
   destructive actions to full admin in the UI to match the API.

TASK — tests:
6. Integration: pending technician cannot log in; approve → can log in; suspend → login blocked AND
   excluded from suggestions; reject requires a reason; every transition writes an audit row; ops
   role can approve but gets 403 on suspend.

ACCEPTANCE: the entire technician lifecycle (apply → approve/reject → suspend/reinstate) is
operable from the admin UI with notifications and a complete audit trail, and a suspended
technician is genuinely locked out of app, sockets, and dispatch.
```

---

## Prompt 6 — Persistent notifications: real inbox for customers + admins

```
You are working in the Clicks roadside-assistance monorepo. The notification endpoints are stubs:
clicks-api/clicks-customer-tech-api/src/routes/notificationRoutes.js returns hardcoded empty lists
for /customer and /technician (verified — inline handlers). Push notifications vanish once
dismissed, and admin popups play to an empty room if no dispatcher is connected. Build persistent
notifications.

TASK — model (clicks-shared):
1. models/Notification.js: recipient_type ("customer"|"technician"|"admin"), recipient_id
   (ObjectId, index; null for admin-broadcast), type (string event key), title, body, data (Mixed —
   ids only, no PII beyond what the apps already display), read (bool, default false), created_at.
   Compound indexes: {recipient_type, recipient_id, created_at:-1} and {recipient_type,
   recipient_id, read}. A TTL index expiring documents after 90 days. Export from models/index.js.

TASK — write path:
2. In clicks-customer-tech-api/src/services/fcmService.js: at the point(s) where a push is sent to
   a customer or technician, also insert a Notification row (best-effort try/catch — never fail the
   push on a DB error). Cover the SOS/job lifecycle notifies routed through sosSocketService's
   notify helpers too — centralise in one recordNotification(recipientType, recipientId, type,
   title, body, data) helper used by both.
3. Admin events: where sosSocketService emits adminNamespace broadcasts for newSOSRequest,
   newBusinessJob/Lead, newServiceRequest, sosCancelled, jobCancelledByCustomer — also insert an
   admin-broadcast Notification row via the same helper.

TASK — read path:
4. Replace the stub notificationRoutes handlers: GET /customer and /technician return the caller's
   rows (paginated, newest first), /unread-count returns the count, POST /mark-read marks ids (or
   all) read — scoped strictly to req.user.id. Same three for admins on the ADMIN API
   (clicks-admin-api: /api/notifications, requireOps; admin rows are broadcast so read-state is
   per-admin — add a read_by: [adminId] array instead of the boolean for recipient_type "admin",
   and compute unread per caller).
5. Admin web: a bell icon in the AdminLayout header with the unread badge (reuse the existing
   badge-polling cadence), opening a dropdown inbox (title, body, relative time, deep link from
   data ids to the job/SOS/lead page); mark-read on open. Customer app: wire the existing
   notifications screen (check clicks-user/lib/features/notifications/) to the now-real endpoints.

TASK — tests:
6. Integration: a job lifecycle notify creates a customer row; unread-count and mark-read are
   ownership-scoped (customer A cannot read/mark B's, 403/empty); admin broadcast unread is
   per-admin; TTL index exists in the schema.

ACCEPTANCE: "what did I miss?" has an answer on every surface — customers and technicians have a
real inbox, dispatchers have a bell with overnight history, and nothing PII-heavy is stored.
```

---

## Prompt 7 — SLA timers & escalation (the 2 a.m. safety net)

```
You are working in the Clicks roadside-assistance monorepo. Nothing watches the clock: an SOS can
sit unclaimed, a job unaccepted, an in_progress job stuck for hours — detection depends on a human
noticing a row. Build SLA monitoring on the existing outbox-worker pattern.

TASK — backend (clicks-customer-tech-api — it owns SOS/dispatch state):
1. Create src/services/slaMonitor.js modeled on the outboxWorker loop (setInterval, unref, in-
   flight tracking, stopSlaMonitor for the SIGTERM path in index.js). Every 60s (env
   SLA_CHECK_INTERVAL_MS) evaluate, with thresholds from env (defaults):
   - SOS pending unclaimed > SLA_SOS_CLAIM_SECONDS (300)
   - Job assigned, not accepted > SLA_ACCEPT_SECONDS (600)
   - Job accepted/en_route, no arrival > SLA_ARRIVAL_SECONDS (2700)
   - Job in_progress > SLA_IN_PROGRESS_SECONDS (14400)
2. For each breach: emit an adminNamespace socket event slaBreach {kind, job_id/sos_id, minutes,
   details}, insert an admin Notification row (Prompt 6 helper), and Sentry.captureMessage at
   warning level. Deduplicate: stamp the doc (sla_flags: {kind: firedAt}) so each breach kind fires
   once per entity — an escalation re-fires at 2x threshold with escalated: true.
3. Multi-instance safety: claim each breach atomically (findOneAndUpdate setting the sla_flag) so
   two instances never double-fire — same discipline as the outbox claim.

TASK — admin web (clicks-interface):
4. Live Map / Dashboard: an "Attention" strip listing current breaches (from a new GET
   /api/dashboard/sla-breaches on the admin API — requireOps — that queries the same conditions
   live rather than storing state), each row deep-linking to the job/SOS, sorted by severity
   (escalated first). Play the existing alert sound on a new slaBreach socket event.

TASK — tests:
5. Integration: seed an SOS pending older than threshold → one breach fires, flag set, second sweep
   is silent, escalation fires at 2x; assigned-unaccepted breach fires and clears the flag when the
   job progresses (clear sla_flags on state transitions in the relevant controllers — add that).

ACCEPTANCE: a stuck SOS or job announces itself to every connected dispatcher within a minute,
lands in the admin inbox for whoever comes online later, reaches Sentry for the on-call, and each
breach fires exactly once (then once more escalated) across any number of instances.
```

---

## Prompt 8 — First-class job reassignment

```
You are working in the Clicks roadside-assistance monorepo. Reassigning a job is currently a
generic PUT /api/jobs/:id field edit: the new-assignment branch notifies the NEW technician
(clicks-admin-api/src/controllers/jobController.js — isNewTechnicianAssignment), but nothing tells
the OLD technician to stand down, no reason is recorded, and nothing stops reassigning an
in_progress job mid-repair.

TASK — backend (clicks-admin-api):
1. POST /api/jobs/:id/reassign (authenticateToken + requireOps), body {technician_id, reason
   (required enum: technician_unavailable, vehicle_issue, customer_request, dispatch_error, other
   + optional note)}:
   - Allowed from statuses assigned/accepted/en_route/arrived ONLY; 409 for in_progress ("cannot
     reassign a job in progress — cancel or complete it") and completed/cancelled.
   - Atomic: CAS on {_id, job_status: {$in: allowed}, assignedTechnician: <current>} (read current
     first, pass it in the filter so a concurrent reassign loses cleanly with 409).
   - Effects: notify OLD technician (socket jobReassigned event + FCM "you've been unassigned",
     via internal notify; set them back Online via the same presence flow completion uses); notify
     NEW technician exactly as assignment does today; reset acceptance-related fields (inspect the
     Job schema/technician session logic for accepted_at or similar and reset them); recordAudit
     ("job.reassign", from → to, reason); outbox-protect the notifies like createLead's popup.
2. Guard the legacy path: in the generic updateJob, if assignedTechnician changes for a job in the
   allowed statuses, delegate to the same internal reassign function so both paths behave
   identically; reject the change for in_progress jobs there too.

TASK — admin web (clicks-interface):
3. In JobDetails/EditJobModal, replace the raw technician dropdown edit (for already-assigned jobs)
   with a Reassign action → dialog: suggested technicians (reuse Prompt 3's endpoint if merged,
   else the technician list), reason picker, confirm. Show old→new in the job's audit/history
   section.

TASK — tests:
4. Integration: reassign notifies both parties (assert via the mocked internal notify), 409 on
   in_progress, concurrent double-reassign yields one winner, audit row records from/to/reason,
   legacy PUT path delegates (assert same effects).

ACCEPTANCE: the nightly "bounce this job to another tech" is a two-click, reasoned, audited action
that leaves no technician silently believing a job is still theirs.
```

---

## Prompt 9 — Upfront price estimate for customers

```
You are working in the Clicks roadside-assistance monorepo. A customer requesting help commits with
no price signal; pricing logic exists but only surfaces mid-job (computeJobPricing in clicks-api/
clicks-shared/utils/jobPricing.js; GET /api/jobs/:id/total). Give customers an honest estimate
BEFORE they request.

TASK — investigate first:
1. Read jobPricing.js, the job-type definitions (clicks-shared/constants/jobTypes.js) and how
   price is set on job creation across admin/business/technician flows, to determine what a
   pre-job estimate can honestly promise per job type (fixed callout fee? base price per jobType?
   parts excluded?). Summarise the pricing reality in your reply before coding.

TASK — backend (clicks-customer-tech-api):
2. GET /api/jobs/estimate?job_type=... (authenticate(["customer"])): returns {job_type, base_price,
   currency:"QAR", includes:[...], excludes:[...], disclaimer_key} derived from the jobTypes
   constants — driven by data, not hardcoded strings. If a job type has no defined base price,
   return estimate_available:false rather than a guess.
3. Store what was shown: when the customer's request/SOS becomes a job, persist
   quoted_estimate {amount, shown_at} on the Job (new optional field) so disputes have a record;
   show it in the admin job detail and the finance portal job view (read-only).

TASK — customer app (clicks-user):
4. In the service-selection step (before SOS/service request confirmation), display the estimate
   card: "From X QAR" with the includes/excludes and disclaimer, localised (en + real Arabic);
   "final price confirmed by the technician before work starts" copy. If estimate_available is
   false, show "priced on site" honestly. Pass the shown estimate through the request payload so
   the server can persist it.

TASK — tests:
5. Integration: estimate endpoint returns data-driven values per job type; a created job persists
   quoted_estimate; finance getJob includes it read-only.

ACCEPTANCE: customers see an honest "from X QAR" before committing, the shown figure is stored on
the job for dispute handling, and no estimate is ever invented for types without defined pricing.
```

---

## Prompt 10 — Business self-service: users, exports, email digest

```
You are working in the Clicks roadside-assistance monorepo. The business portal has no self-service
admin: BusinessUser exists but only Clicks admins manage accounts; there are no exports and no
email notifications of any kind for dealers.

TASK — investigate first:
1. Read clicks-shared/models/BusinessUser.js and the admin-side business user management
   (businessAdminController.js) to reuse creation/password logic — do not duplicate hashing or
   validation rules. Check clicks-admin-api/src/utils/emailService.js for the existing email
   capability and its provider config.

TASK — backend (clicks-admin-api, /api/business/*, authenticateBusiness):
2. Roles: add role ("owner"|"member", default "member") to BusinessUser if absent; the FIRST user
   of a business (or a flag set by Clicks admins) is owner. requireBusinessOwner middleware for the
   routes below.
3. User management (owner only): GET /api/business/users (own business only); POST
   /api/business/users {name, email, phone} → creates a member with a generated temp password
   emailed via emailService (console fallback if email unconfigured — mirror the SMS adapter
   pattern); PATCH /api/business/users/:id {isActive} to deactivate/reactivate (cannot deactivate
   yourself or the last active owner). Every mutation: recordAudit with business actor (per the
   Prompt 2 extension) and strict business_id scoping in every query.
4. Export: GET /api/business/requests/export?from=&to= → CSV (stream, no temp files) of the
   business's own requests: date, stage, vehicle, plate, technician (name only), completed_at,
   status. Cap range at 92 days.
5. Email digest: a daily job on the admin API's worker cadence (extend the outbox worker host
   pattern — a separate dailyDigest.js started from index.js with the same stop discipline):
   per business with digest enabled (business setting, default off; owner can toggle via PATCH
   /api/business/settings), email yesterday's summary: created, completed, cancelled, in-flight
   counts + line list. Use emailService; skip silently when email is unconfigured.

TASK — business web (clicks-business-web):
6. A Settings page (owner-gated by the /me role): Team list with invite + deactivate, and the
   digest toggle. An Export button (date-range picker) on the Jobs page hitting the CSV endpoint
   with the auth header and saving the blob.

TASK — tests:
7. Integration: member gets 403 on user routes; owner invites → new member can log in; cannot
   deactivate last owner; export contains only own-business rows (seed two businesses); date cap
   enforced.

ACCEPTANCE: a dealership owner runs their own team, pulls their own numbers, and gets a daily
email — without ever calling Clicks — and every route stays strictly tenant-scoped.
```

---

## Prompt 11 — Scheduled service, end-to-end

```
You are working in the Clicks roadside-assistance monorepo. The ServiceRequest model already
supports timing "immediate"|"scheduled" with scheduled_for and an index — but no surface lets a
customer pick a time, and nothing acts when the slot arrives. Ship the thin end-to-end version.

TASK — investigate first:
1. Read clicks-shared/models/ServiceRequest.js, the tech-api serviceRequestRoutes/controller, and
   the admin serviceRequests routes + the clicks-interface service-requests page, plus
   leadFromServiceRequest.js — understand how immediate requests flow to admin today. Reuse that
   pipeline; scheduled is the same flow with a due date.

TASK — customer app (clicks-user):
2. In the non-emergency service request flow, add "Now or later?": later opens a date+time picker
   (min +2h, max +14 days, 30-minute steps, Asia/Qatar timezone explicit); submit with
   timing:"scheduled" and scheduled_for. Confirmation screen and the request list show the slot.
   Localise (en + real Arabic).

TASK — backend:
3. Validate scheduled_for server-side (window above; reject past dates) in the tech-api create
   handler. Extend the slaMonitor (Prompt 7) or, if not merged, a small scheduledSweep on the same
   worker pattern: T-24h and T-2h before scheduled_for, send the customer an FCM reminder +
   Notification row; at T-2h, if the request has no job yet, fire the admin
   notification/popup ("scheduled service due at HH:MM — assign now") exactly like a new immediate
   request, flagged scheduled_due; dedupe with stamped flags like the SLA work.
4. Admin API list endpoints: add timing/scheduled_for to responses and a due_soon filter.

TASK — admin web:
5. Service Requests page: a "Scheduled" tab sorted by scheduled_for with countdown chips (Due in
   3h / OVERDUE), the due_soon filter, and the same convert-to-lead/job actions the immediate flow
   uses.

TASK — tests:
6. Integration: create scheduled request validates the window; sweep fires T-2h admin event once
   (flag dedupe) and customer reminder rows exist; overdue-without-job appears in due_soon.

ACCEPTANCE: "come tomorrow at 9" is a real booking: the customer picks a slot, gets reminded, and
the dispatch desk is pushed to assign it before it's due — using the existing request pipeline, not
a parallel one.
```

---

## Prompt 12 — Ops-controlled kill switches + system status page

```
You are working in the Clicks roadside-assistance monorepo. The launch kill switches
(LAUNCH_PUBLIC_SOS, LAUNCH_PUBLIC_SIGNUP — clicks-api/clicks-customer-tech-api/src/utils/
featureFlags.js, exposed at GET /api/launch-flags) are env-only: flipping one in an incident means
a Railway variable change + restart by a developer. Make them ops-controlled, safely.

TASK — backend:
1. clicks-shared/models/PlatformSetting.js: {key (unique), value (Mixed), updated_by, updated_at}.
   In featureFlags.js, resolve each flag as: DB override if a PlatformSetting row exists for the
   key, else the env value, else the current default — with a 30-second in-process cache so the
   hot paths (requirePublicSignup middleware, SOS create) never add a per-request query. Keep
   /api/launch-flags shape unchanged.
2. Admin API: GET /api/platform-settings (requireFullAdmin) listing the flags with their effective
   value + source (db/env/default); PUT /api/platform-settings/:key (requireFullAdmin) restricted
   to an allow-list of known keys (the two launch flags to start), recordAudit
   ("platform.flag_change", from → to), and an adminNamespace broadcast so other admins see it.
3. System status: extend the admin API with GET /api/system-status (requireOps) that server-side
   fetches both services' /api/health (its own directly, the tech API via CUSTOMER_TECH_API_URL
   with a 3s timeout), plus the current flag states and the outbox backlog count
   (OutboxEvent pending + failed counts) — one JSON payload for the UI.

TASK — admin web (clicks-interface):
4. A "System" page (full-admin nav, requireFullAdmin-gated route per adminRoles.js): health cards
   for both APIs (up/degraded with the db/socketAdapter details), outbox backlog with failed-event
   count highlighted, and the kill switches as labelled toggles with a type-to-confirm dialog
   ("disabling PUBLIC SOS stops new emergency requests — type DISABLE to confirm").

TASK — tests:
5. Integration: DB override beats env; cache refreshes within 30s of a PUT; PUT rejects unknown
   keys; requirePublicSignup honours a DB-disabled flag (signup 403s); flag change writes an audit
   row; ops role can read status but gets 403 on the toggle.

ACCEPTANCE: the on-duty lead can see platform health and flip the public-SOS/signup switches from
the admin UI in seconds — audited, confirmed, cached, no deploy, no developer.
```

---

## Prompt 13 — Round 3 technical residue (small, do anytime)

```
You are working in the Clicks roadside-assistance monorepo. Three small residual items from the V3
audit:
1. In clicks-api/.github/workflows/ci.yml, the secret-scan and api-smoke jobs still run on
   ubuntu-latest while integration-tests is pinned to ubuntu-22.04 — pin all jobs to ubuntu-22.04
   for consistency.
2. Confirm the partner app (clicks-partner) renders no job-status strings anywhere in lib/ (it was
   deliberately excluded from the status-label unification); if any exist, add the same
   job_status_labels.dart pattern used in the other apps (en + ar via its translation files).
3. The earnings integration suites have never executed in CI. After the tree is committed and
   pushed, verify the integration-tests job goes green; if the mongod binary resolution still
   fails on the runner, adjust MONGOMS_VERSION per the error's known-versions list and re-pin in
   both ci.yml and tests/helpers/db.js. Report what version worked.
```

---

## Suggested order

| Wave | Prompts | Theme |
|---|---|---|
| 1 | 1, 2 | Stop misleading users (customer cancel, dealer pipeline truth) |
| 2 | 3, 8 | Dispatch throughput (assist + reassignment — share suggestion code) |
| 3 | 4, 9 | Customer confidence (ETA, price) |
| 4 | 5, 6 | Ops self-sufficiency (approvals, inboxes) |
| 5 | 7, 12 | The 2 a.m. safety net (SLA, kill switches + status) |
| 6 | 10, 11 | B2B depth + scheduled service |
| any | 13 | Residue |

Standing reminder unchanged: commit + tag, rotate secrets, set SENTRY_DSN, CI green, technician
iOS Firebase — before or alongside all of this, never after.
