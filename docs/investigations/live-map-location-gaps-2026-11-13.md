# Admin Live Map — technician pins not updating continuously

Root-cause analysis, 2026-11-13. Code read at production tag `prod-2026-11-11` (commit `6e5afc0`);
every file cited below is byte-identical to that tag except `sosSocketService.js`, whose only
uncommitted change is in the SOS-created payload and does not touch location or presence.

**Status of evidence.** Every cause is proven from code. C3 and part of C5 were also executed
locally. After the owner approved read-only probing, production was read on 2026-11-13 between
12:03 and 12:12 UTC (15:03–15:12 Doha) with GET requests only: C0 and C2 were observed live. C1, C3,
C4 and C5 were not observed and remain code findings. Details in section 8.

## Summary

**What production showed.** The database held 8 working technicians (1 Online, 7 On Job). The map
snapshot listed 6. Of those 6, one was genuinely live and five had not been heard from for between
53 minutes and 111 days while still marked "On Job". Those five are the "5 disconnected". For them
the badge is correct: their phones are silent. The defect is that an "On Job" status never expires
(C0). Separately, the one Online technician was absent from the snapshot and the one live
technician's pin was 693 m and 12 minutes out of date (C2).

The orange "N disconnected" badge counts technicians for whom **this browser** has not received a
location event in the last 60 seconds. That is true when the phone is silent (C0), and also when
delivery to the browser fails while the header still reads "Connected" (C1–C5):

| # | Cause | Layer | Severity | Verdict |
|---|-------|-------|----------|---------|
| C0 | "On Job" never expires. A technician left On Job stays on the map as disconnected indefinitely: the server never auto-Offlines On Job, refuses a manual Offline while a job is open, and keeps On Job while any old job is still open. | Tech API + data | P0 | **Observed in production** (5 technicians) |
| C1 | Admin web never rejoins the `live-map` room after its socket reconnects, and never re-reads REST while the socket is up. The feed dies silently until a page reload. | Admin web | P0 | Confirmed in code |
| C2 | `GET /api/technicians/live-map` is built from an in-process roster cached for 10 minutes in the admin-api. Status, coordinates and heartbeat times in the snapshot are up to 10+ minutes old. | Admin API | P0 | **Observed in production** |
| C3 | The server drops heartbeats whose coordinates are 1–15 m from the stored position, without recording that the app is alive. A technician who goes Online where they last parked never refreshes `lastHeartbeatAt`. | Tech API | P1 | Confirmed by execution |
| C4 | The server's "socket is alive" rescue runs on the same 60 s period as the 60 s stale threshold, so anyone relying on it shows disconnected about half the time; with no live socket they are auto-Offlined (ghost offline). | Tech API | P1 | Confirmed in code |
| C5 | The admin web discards location events for technicians it did not get from REST, keeps socket-only technicians on a 16 s leash, and stops applying updates while the tab is hidden. | Admin web | P1 | Confirmed (leash by execution; hidden tab by reasoning) |

C0 explains the standing "5 disconnected". C2 explains missing and misplaced pins at page load. C1
would explain pins frozen for the whole fleet until refresh. C3 and C4 would explain "intermittent,
not every technician, not every minute". C5 turns short gaps into pins that stay missing. They
compound: a technician hit by C3 is also removed by C5.

None of these is fixed by the unpushed socket-scaling branches (section 9). Every recommended fix is
on the server or the admin web; none needs a new technician app (section 10).

---

## 1. Architecture

```
TECHNICIAN PHONE (clicks-technician)
  Geolocator stream (distanceFilter 0; Android 4 s / 8 s interval)      home_cubit.dart:1622-1671
  Timer.periodic 12 s -> _sendCurrentPositionNow                        home_cubit.dart:1698-1701
  gate: accuracy <= 50 m, move >= 15 m from last DISPATCHED pin         home_cubit.dart:1717-1731
  otherwise replay last dispatched pin every 12 s (liveness)            home_cubit.dart:1824-1838
        |                                         |
        | socket  /technician  "updateLocation"   | REST PATCH /api/technicians/location
        | (only if connected)                     | (every beat if socket down, else every 30 s)
        v                                         v
TECH API (clicks-customer-tech-api, Railway, 1 replica, in-memory Socket.IO adapter)
  applyTechnicianLocationWrite            clicks-shared/utils/technicianLocationWrite.js:128-252
    per-process state Map: last accepted lat/lng per technician                        :13-14
    same coords (<= 1 m)  -> heartbeat: write lastLocationAt + lastHeartbeatAt         :199-217
    1 m < move < 15 m     -> DROPPED, nothing written                                  :219-221
    move >= 15 m, >= 3 s  -> write coordinates + both timestamps                       :227-242
        |                                                   |
        v                                                   v
  MongoDB technicians                         emitAdminTechnicianLocation -> 2 s batch
    currentLocation.coordinates                 sosSocketService.js:528-569, 495-506
    lastLocationAt, lastHeartbeatAt                         |
    currentStatus, autoOfflineAt                            | "technicianLocationBatch"
        |                                                   | to room "live-map" only
        | sweeps (tech API)                                 | sosSocketService.js:474-482
        |   Online ghost sweep, 60 s   :417-443             |
        |   On Job stale sweep, 30 s   :344-366             |
        |   disconnect grace, 30 s     :1828-1916           |
        v                                                   |
ADMIN API (clicks-admin-api, separate process)              |
  GET /api/technicians/live-map                             |
    technicianController.js:72-109                          |
    <- 15 s payload cache (served stale up to 120 s)        |
    <- getSlimTechnicianRoster(): in-memory, 10 min         |
       adminLookups.js:13, 117-133                          |
        |                                                   |
        | once, on page mount                               | continuously, IF the socket is
        v                                                   v in the room
ADMIN WEB (clicks-interface)  LiveMap.jsx
  REST snapshot -> mergeApiTechnicianWithSocketState        liveMapUtils.js:93-136
  socket patches -> requestAnimationFrame flush             LiveMap.jsx:281-311
  10 s tick -> prune + recount                              LiveMap.jsx:258-276
  marker drawn only if hasUsableLocation                    LiveMap.jsx:45-52, 709
  badge = countVisibleStaleTechnicians                      liveMapUtils.js:147-151
```

The admin socket connects to the **tech API**, not the admin API. The two processes share MongoDB
and nothing else, which is why C2 exists: the tech API's writes cannot invalidate the admin API's
in-memory roster.

## 2. "Disconnected" semantics (Gate 1)

**The badge.** `staleCount` (`LiveMap.jsx:490-493`, rendered at `:608-611`) is
`countVisibleStaleTechnicians(technicians)` (`liveMapUtils.js:147-151`): every technician in React
state whose `currentStatus` is Online or On Job and for whom `isTechPresenceStale` is true. It ignores
the search box and filters, and it does not check whether a marker is drawn.

**`isTechPresenceStale`** (`liveMapUtils.js:39-46`) returns true when, in order:

1. the stored flag `presenceStale === true`, or
2. `lastHeartbeatAt` (falling back to `_socketPresenceAt`) is 60 s old or older, or
3. for legacy payloads with no heartbeat: `locationStale === true`, or GPS age is 60 s or more.

**`isTechGpsStale`** (`liveMapUtils.js:29-33`) is only GPS measurement age. It changes the label to
"Connected · GPS 3m ago" (`formatPresenceLabel`, `:66-74`) and never counts toward the badge.

What "disconnected" is **not**:

- Not the admin WebSocket. That is the separate Connected / Reconnecting badge (`LiveMap.jsx:598`).
- Not GPS age. A parked van with a live heartbeat is "Connected".
- Not marker visibility. A technician with no usable coordinates is counted and listed in the side
  panel but has no marker (`LiveMap.jsx:709`).

**The flag in rule 1 is sticky.** It is set true by the REST merge at page load
(`liveMapUtils.js:100-103`), by a `technicianOnline` payload (spread at `LiveMap.jsx:378, 391`) and
by `technicianLocationStale` (`LiveMap.jsx:356-357`). Only a location patch sets it back to false
(`LiveMap.jsx:79-90`). So in practice:

> A technician is shown "disconnected" when this browser has not received a location event for them
> within 60 seconds. It is a statement about delivery to the admin, not about the phone.

**When a technician is Online in the database but disconnected on the map:**

| Situation | Cause |
|-----------|-------|
| The admin socket reconnected at any point since the page loaded | C1 |
| The page was just loaded and the snapshot is more than 60 s old; clears when the first socket event arrives, never clears if none does | C2 |
| The technician went Offline in the last 10 minutes: the stale snapshot still lists them, and no further event will ever arrive for them | C2 |
| The technician went Online within 1–15 m of their last stored position and has not driven 15 m since | C3 + C4 |
| The app has no GPS fix better than 50 m (indoors): it sends nothing at all | Gap G3 |
| The technician has no stored coordinates: the server refreshes the database but emits nothing | Gap G4 |
| The phone really stopped reporting (force-quit, no signal) | Correct behaviour |

## 3. Technician document fields used by the Live Map

Model: `clicks-api/clicks-shared/models/Technician.js`.

| Field | Meaning | Written by |
|-------|---------|-----------|
| `currentLocation.coordinates` `[lng, lat]` (`:61`) | Last accepted pin. `[0,0]` means no fix. | `applyTechnicianLocationWrite`, only on first fix or a move of 15 m or more |
| `lastLocationAt` (`:76`) | When the GPS fix was **measured** (`fix_time` from the app, clamped to now; server time if absent) | every accepted write (`technicianLocationWrite.js:164, 204, 231`) |
| `lastHeartbeatAt` (`:81`) | When the server last **heard** from the app | accepted writes; `refreshPresenceFromLiveSocket` on register and from sweeps (`sosSocketService.js:512-526`) |
| `currentStatus` (`:51`) | Offline / Online / On Job. The map shows the last two. | `setTechnicianStatus` (`technicianOnlineHours.js:175-201`). Going Online does **not** stamp `lastHeartbeatAt`. |
| `autoOfflineAt` (`:107`) | Set when the server inferred Offline; a later socket register restores Online | `sosSocketService.js:381-415` |
| `isActive`, `applicationStatus` | Gate the socket and the snapshot | admin actions |
| `appLifecycleCapable` (`:89`) | App reports lifecycle events | socket register |
| `assignedVehicle` | Vehicle shown in popup and side panel | admin actions |

Index `{ isActive: 1, currentStatus: 1 }` (`:124`) exists for a direct Live Map query. Its comment
still says "polled every 8s per admin tab", which is no longer true (section 4).

## 4. Timers and thresholds

The brief assumed the admin polls REST every 8 s. It does not while the socket is connected.

**Technician app**

| Timer | Value | Where |
|-------|-------|-------|
| Liveness heartbeat | 12 s | `location_tracking.dart:24`, `home_cubit.dart:1698` |
| REST while socket healthy | every 30 s | `location_tracking.dart:31`, `home_cubit.dart:1847-1853` |
| REST while socket down | every heartbeat | `home_cubit.dart:1848` |
| Move before a new pin is sent | 15 m | `location_tracking.dart:9` |
| Accuracy ceiling | 50 m | `location_tracking.dart:12` |
| OS distance filter | 0 m | `location_tracking.dart:21` |
| Socket reconnect | 999 attempts, 2 s | `technician_socket_service.dart:76-77` |

**Tech API**

| Timer | Value | Where |
|-------|-------|-------|
| Heartbeat write throttle | 10 s | `technicianLocationWrite.js:6-8` |
| Coordinate write throttle | 3 s | `technicianLocationWrite.js:5` |
| Minimum move | 15 m | `technicianLocationWrite.js:3` |
| Stale window (`TECH_LOCATION_STALE_MS`) | 60 s | `sosSocketService.js:164, 280` |
| Ghost Online sweep (`TECH_OFFLINE_SWEEP_MS`) | 60 s | `sosSocketService.js:374, 443` |
| On Job stale sweep | 30 s, hardcoded | `sosSocketService.js:344-366` |
| Disconnect grace (`TECH_DISCONNECT_OFFLINE_MS`) | 30 s, then up to 60 s follow-up | `sosSocketService.js:278, 1848-1912` |
| Admin batch flush (`ADMIN_MAP_BATCH_MS`) | 2 s | `sosSocketService.js:458, 505` |

**Admin API**

| Timer | Value | Where |
|-------|-------|-------|
| Technician roster cache | 10 min, then served stale once more while refreshing | `adminLookups.js:13, 117-133` |
| Live-map payload cache | 15 s fresh, served stale up to 120 s | `technicianController.js:74-76`, `payloadCache.js:27-29, 132-139` |

**Admin web**

| Timer | Value | Where |
|-------|-------|-------|
| Stale window | 60 s | `liveMapUtils.js:3` |
| REST poll | 8 s, **only** when the socket has been down 10 s and the tab is visible; otherwise off | `LiveMap.jsx:28, 215-229` |
| Age tick and prune | 10 s | `LiveMap.jsx:258-276` |
| Socket-only technician leash | 16 s (`REST_POLL_MS * 2`) | `liveMapUtils.js:138-145` |
| Cached snapshot reuse on remount | 30 s | `technicianApi.js:138` |
| Refetch on focus / reconnect | off | `apiSlice.js:113-114` |
| Socket reconnect | 10 attempts, then gives up | `AdminLayout.jsx:117-119` |
| `SOCKET_COORD_PREFERENCE_MS` | 60 s, exported but unused | `liveMapUtils.js:5` |

## 5. Failure modes already documented in code comments

These are previously fixed problems. They show where the pipeline has broken before and what each
fix assumed.

- **Parked iOS / distance filter.** `location_tracking.dart:14-21`: a 5–15 m OS distance filter
  suspended the Dart isolate between location events, so the 12 s timer never fired. The filter must
  stay 0. This fix moved the 15 m gate from the OS into Dart and the server, which is where C3 lives.
- **Frozen GPS reading as live.** `technicianLocationWrite.js:63-76` and `home_cubit.dart:1733-1739`:
  heartbeats now carry the fix's measurement time so a dead GPS ages out.
- **Socket merge.** `liveMapUtils.js:76-84`: preferring socket state because it arrived recently let
  a silently dead socket pin an old position "with the badge still reading Connected". The fix
  compares measurement times. It assumes fresher REST snapshots keep arriving; with polling off while
  connected (section 4) they do not, so the silent-dead-socket case is still open (C1).
- **Prune only ran on REST merge.** `LiveMap.jsx:261-264`: moved to the 10 s tick. This is the prune
  that now removes socket-only technicians (C5).
- **Presence stamped from payload time.** `LiveMap.jsx:72-78`: location patches stamp
  `_socketPresenceAt` from arrival because a payload with an old measurement "would otherwise be born
  already expired". The same bug is still present in `onTechnicianOnline` (`LiveMap.jsx:370`).
- **Never invent a technician.** `LiveMap.jsx:347-351` and `:290-291`: events for unknown ids are
  dropped to avoid phantom rows. Side effect: a technician missing from the snapshot can never be
  added by a location event (C5).
- **Trailing location after Offline.** `sosSocketService.js:485-493`: the `offlineTechnicians` set
  blocks fan-out after an Offline broadcast.
- **Duplicate events.** `sosSocketService.js:459-465`: only the batch is emitted by default.
- **Room scoping.** `sosSocketService.js:466-482`: the feed goes only to sockets that emitted
  `joinLiveMap`. Room membership is per connection and is lost on reconnect (C1).
- **Per-process state.** `socketAdapter.js:5-11`: timers, sets and `userHasLiveSockets` are local to
  one process. Safe today only because the tech API is pinned to one replica
  (`railway.tech.toml:13-20`).
- **Auto-Offline is undone on reconnect.** `sosSocketService.js:388-415`.

## 6. Hypotheses (Gate 2)

| ID | Hypothesis | Verdict | Evidence |
|----|-----------|---------|----------|
| H1 | Admin socket connected but not in the `live-map` room | **CONFIRMED** (code) | `LiveMap.jsx:325-328` emits `joinLiveMap` once per effect run; dependencies are `[socket, queueLocationPatch]` (`:425`) and the socket object is stable across reconnects. `AdminLayout.jsx:123-126` re-emits only `register` on `connect`. The server has no connection-state recovery (`index.js:18-22`), so the new connection is in no room and `liveMap()` (`sosSocketService.js:481-482`) skips it. The Flutter admin app does this correctly (`admin_socket_service.dart:121-130`). This is C1. |
| H2 | REST merge drops socket-fresh coordinates | **RULED OUT** as written; a different REST defect found | The merge keeps whichever measurement is newer (`liveMapUtils.js:120-124`; tests pass). REST runs once at mount, so there is nothing to merge afterwards. The real REST defect is that the snapshot itself is stale: C2. |
| H3 | Heartbeat stops on the technician app | **CONFIRMED** (observed once in production) | The app does send every 12 s when it holds a pin. Two code gaps: with no fix better than 50 m it sends nothing (`home_cubit.dart:1780-1785` then `:1825`), gap G3; and the server discards the heartbeat when the app's pin is 1–15 m from the server's (C3). In production one Android device on build 1.2.3+16 reported "app went to background" and then nothing at all for 53 minutes with a job open (section 8). Whether the OS stopped the app or the technician closed it cannot be told from the server. |
| H4 | Server marks `presenceStale` or flips Offline | **CONFIRMED** (code) | Sweeps at `sosSocketService.js:344-366` and `:417-443`. With a live socket the heartbeat is refreshed only every second sweep (C4). Without one the technician is auto-Offlined (`:433-434`). No Redis is involved in production. |
| H5 | No usable coordinates, so no marker, but still counted | **CONFIRMED**, minor | `hasUsableLocation` (`LiveMap.jsx:45-52`) hides the marker; the badge does not check it (`liveMapUtils.js:147-151`). `refreshPresenceFromLiveSocket` returns without emitting for `0,0` (`sosSocketService.js:518`), so such a technician never gets a clearing event. Gap G4. |
| H6 | Batch vs duplicate events mismatch | **RULED OUT** | Server emits the batch only (`sosSocketService.js:464-465, 499`); the client handles both (`LiveMap.jsx:408-409`). |
| H7 | Parked technician mislabelled disconnected by the UI | **RULED OUT** as a labelling bug | `formatPresenceLabel` (`liveMapUtils.js:66-74`) shows "Connected · GPS …" when the heartbeat is fresh; test "parked technician with a live heartbeat is connected, GPS-stale only" passes. Parked technicians do show disconnected, but because the heartbeat never reaches the admin (C3, C4), not because of the label. |
| H8 | Multiple tabs or reconnect leave stale React refs | **CONFIRMED** for reconnect, ruled out for tabs | Each tab has its own socket and state. `apiIdsRef` (`LiveMap.jsx:189, 251`) is written only by a REST merge, so it is frozen at page load while the socket is connected; everything else flows from that (C5). |
| H9 | Production scale: Redis adapter, replicas, rate limits | **RULED OUT** as a current cause | Tech API is pinned to one replica with the in-memory adapter (`railway.tech.toml:19-20`), so `fetchSockets` sees every socket. `PATCH /location` has no rate limiter (`technicianRoutes.js:24`). Scale caveat: `overlapSeconds = 0` means every tech-API deploy drops every admin socket, which triggers C1 for every open Live Map. |

## 7. Gaps and bugs found

### C0 — P0 — "On Job" never expires (observed in production)

Three rules combine so that nothing ever takes a silent technician out of "On Job":

- The Online ghost sweep excludes On Job by design, and the disconnect path only marks the location
  stale (`sosSocketService.js:368-373, 1863-1867`).
- A technician cannot go Offline while any job is in `assigned`, `accepted`, `en_route`, `arrived`
  or `in_progress`, or completed but unpaid (`clicks-customer-tech-api/src/controllers/technicianController.js:542-572`,
  `clicks-shared/constants/jobStatuses.js:51-57`). Logging out mid-job therefore leaves the status
  as it was; the app's own comment calls this "the On-Job reconciliation gap"
  (`home_cubit.dart:2038-2042`).
- Finishing a job returns the technician to Online only if no other busy job is assigned to them
  (`clicks-shared/services/jobHold.js:192-199`). One old job that was never closed keeps them
  On Job after every later job.

Result: the technician stays in the live-map snapshot (it lists Online and On Job) with a heartbeat
that only gets older, and is counted in the badge for as long as the status lasts. Dispatchers can
also still be shown such a technician as busy rather than absent. Production had five (section 8).

### C1 — P0 — Live feed dies silently after any admin socket reconnect

Evidence under H1. After a reconnect the header reads "Connected", no location, online or offline
event arrives, and REST polling is off because the socket is up (`LiveMap.jsx:215-229`). Within 60 s
every technician turns "disconnected"; positions freeze; technicians who go Offline stay on the map
and those who come Online never appear. A page reload fixes it until the next reconnect.

Triggers: any tech-API deploy or restart, a network blip, laptop sleep. If the outage outlasts 10
attempts (`AdminLayout.jsx:118`) the socket stops trying altogether and the page falls back to 8 s
REST polling of the stale snapshot (C2).

### C2 — P0 — The REST snapshot is up to 10+ minutes old

`getLiveMapTechnicians` (`clicks-admin-api/src/controllers/technicianController.js:72-109`) filters
`getSlimTechnicianRoster()` in memory. That roster is loaded from MongoDB and kept for
`TECH_ROSTER_MAX_AGE_MS = 10 * 60 * 1000` (`adminLookups.js:13`). When it expires the stale copy is
returned once more while a refresh runs in the background (`:117-133`). The only invalidation is
when an admin creates a technician (`technicianController.js:318`). The roster carries the volatile
fields `currentStatus`, `currentLocation`, `lastLocationAt` and `lastHeartbeatAt`
(`adminLookups.js:15-28`), which the tech API, a different process, rewrites every 12 s.

On top of that sits a 15 s payload cache that may serve a value up to 120 s past expiry
(`payloadCache.js:27-29, 132-139`).

Consequences each time the Live Map loads (the only time REST is read while the socket is up):

- Whenever the roster is more than 60 s old, which is most of its 10-minute life, every heartbeat
  time in the snapshot is past the stale window. The whole fleet starts as "disconnected" and clears
  one technician at a time as socket events arrive.
- A technician who went **Online** since the roster was loaded is absent. Location events for them
  are discarded (C5). They stay missing until a reload after the roster refreshes.
- A technician who went **Offline** since the roster was loaded is present. The Offline event has
  already fired and the server blocks further fan-out for them (`sosSocketService.js:536`), so they
  sit as a faded marker, counted in the badge, until a reload after the roster refreshes.
- Positions and On Job status are equally old.

Production showed both halves: an Online technician absent from the snapshot, and a live
technician's pin 693 m and 12 minutes behind (section 8). The persistent "5 disconnected" itself is
C0, not this.

### C3 — P1 — Heartbeats within 1–15 m of the stored position are discarded

`technicianLocationWrite.js:199-221`: an update within 1 m of the server's stored position is a
heartbeat; an update 15 m or more away is a move; anything in between returns `min_move` and writes
nothing, including `lastHeartbeatAt`. The app's baseline is its own last dispatched pin
(`home_cubit.dart:1722-1731`), which is reset to null whenever the location stream restarts
(`:1704-1715`): going Online, an app relaunch, or a tracking-profile switch on low-end devices
(`:1604-1620`). The first fix after a restart is sent unconditionally (`:1723`). If the van has not
moved, GPS noise puts that fix a few metres from the stored position, inside the dead band. The app
then replays that pin every 12 s and every replay is discarded. The REST path uses the same function
and answers 200 with `skipped: true` (`technicianController.js:480-486`), so the app sees no error.

The condition lasts until the van drives 15 m. Executed result (section 8): 10 heartbeats at 4.4 m
and at 11 m produced 0 database writes and 0 admin broadcasts.

The existing unit test "rejects moves smaller than 15m" asserts this behaviour for the pin. It is
right about the pin and wrong about liveness.

### C4 — P1 — Rescue sweep period equals the stale threshold

When heartbeats do not land, the only thing refreshing `lastHeartbeatAt` is
`refreshPresenceFromLiveSocket`, called on socket register (`sosSocketService.js:1376-1383`) and
from the sweeps when the technician has a live socket (`:354-356, 429-431`). The sweep selects
technicians whose heartbeat is older than 60 s and runs every 60 s. A technician refreshed at one
sweep is a few milliseconds short of the cutoff at the next, so they are refreshed every second
sweep: the heartbeat age runs 0 to 120 s and the UI shows them disconnected from 60 to 120 s. That
is half the time for Online technicians and a third of the time for On Job (30 s sweep, 90 s cycle).

If the technician has no live socket at sweep time (app backgrounded and the socket closed), the
Online sweep auto-Offlines them (`:433-434`) and the marker is removed. This is the ghost-offline
path: C3 makes a healthy, heartbeating app look dead, and C4 acts on it.

Related: `toggleStatus` (`clicks-customer-tech-api/src/controllers/technicianController.js:573`)
does not stamp `lastHeartbeatAt` when a technician goes Online, so they begin the shift with a
heartbeat that is hours old, are announced to admins with `presenceStale: true`
(`sosSocketService.js:217`), and are eligible for the ghost sweep immediately.

### C5 — P1 — The admin client drops technicians it should keep

- **Unknown ids are discarded.** `LiveMap.jsx:290-291`: a location patch for a technician not in
  state is skipped. Only a `technicianOnline` event or a REST load can add one. Combined with C1 and
  C2, a missing technician cannot recover without a reload.
- **16 s leash.** A technician added by `technicianOnline` is not in `apiIdsRef` (frozen at page
  load), so the 10 s prune (`LiveMap.jsx:266-272`) keeps them only while their last patch arrived
  less than 16 s ago (`liveMapUtils.js:138-145`). Heartbeats arrive every 12–14 s. One late or
  throttled heartbeat removes them, and later patches are discarded as unknown.
- **Born expired.** `onTechnicianOnline` sets `_socketPresenceAt` from `data.lastLocationAt`
  (`LiveMap.jsx:370`), the GPS time from the database, which can be hours old. Unless a location
  patch arrives before the next 10 s tick the technician is pruned. With C3 no patch arrives.
- **Hidden tab.** Patches are applied in `requestAnimationFrame` (`LiveMap.jsx:306-308`), which does
  not run in a background tab, while the prune interval does. After the dispatcher spends 16 s or
  more in another tab, every socket-only technician has been pruned and the queued patches for them
  are discarded on return. Not executed in a browser; marked likely.
- **Stale snapshot on remount.** Leaving the Live Map and returning within 30 s reuses the cached
  snapshot without refetching (`technicianApi.js:138`, default RTK Query behaviour).

### Smaller gaps

| ID | Sev | Gap |
|----|-----|-----|
| G1 | P2 | Going Online does not stamp `lastHeartbeatAt` (see C4). |
| G2 | P2 | Admin socket gives up after 10 reconnect attempts (`AdminLayout.jsx:118`); only a reload recovers. |
| G3 | P2 | With no GPS fix better than 50 m the app sends nothing, because the liveness replay needs a dispatched pin (`home_cubit.dart:1780-1785, 1825`). Liveness depends on having a position. |
| G4 | P2 | `refreshPresenceFromLiveSocket` updates the database but emits nothing for a technician at `0,0` (`sosSocketService.js:518`); the badge counts them and no marker exists. |
| G5 | P3 | The Live Map never emits `leaveLiveMap` (`LiveMap.jsx:414-424`), so after one visit the admin socket receives the fleet feed on every page, which the room scoping was meant to prevent. |
| G6 | P3 | `SOCKET_COORD_PREFERENCE_MS` is unused; the comment on the `{isActive, currentStatus}` index describes polling that no longer happens. |
| G7 | P3 | The write-throttle state is per process (`technicianLocationWrite.js:13-14`); with more than one tech-API replica each would hold a different baseline. Not a problem at one replica. |
| G8 | P2 | A technician with `isActive: false` is filtered out of the snapshot (`technicianController.js:79-83`) and out of both sweeps, even while On Job. Production had one such technician with a job open and the app in use minutes earlier (section 8). They can never appear on the map. Whether that account should be inactive is an owner question. |

## 8. Automated checks (Gate 4) and production checks (Gate 5)

| Suite | Command | Result |
|-------|---------|--------|
| Admin live-map utils | `npm run test:live-map` (clicks-interface) | 14 / 14 pass |
| Location write policy | `node --test clicks-shared/utils/technicianLocationWrite.test.js` | 19 / 19 pass |
| Socket reconnect, technician session | `npx jest --runInBand --forceExit --ci --testPathPattern="socket-reconnect\|technician-session-fresh"` | 10 / 10 pass |

No integration test matches `live-map` or `presence` on this branch.

The suites pass because they encode the current behaviour. Relevant expectations:

- `rejects moves smaller than 15m` asserts `reason === "min_move"` and zero broadcasts for a 4.4 m
  offset. This is C3.
- `isSocketOnlyPreserved drops old socket-only techs` asserts removal at 24 s. This is the C5 leash.
- `an admin socket that never joins receives no location events` asserts the room scoping that makes
  C1 fatal. There is no test that an admin who reconnects still receives events.

**Executed demonstrations** (throwaway scripts against the real modules, not committed):

```
applyTechnicianLocationWrite, DB position 12 h old, 10 heartbeats 12 s apart
  same spot (0 m)     : heartbeat x10, admin broadcasts=10, lastHeartbeatAt age=0.00h
  GPS jitter (~4.4 m) : min_move  x10, admin broadcasts=0,  lastHeartbeatAt age=12.00h
  GPS jitter (~11 m)  : min_move  x10, admin broadcasts=0,  lastHeartbeatAt age=12.00h
  real move (~33 m)   : moved, then heartbeat, admin broadcasts=10, age=0.00h

liveMapUtils
  snapshot 0.5 min old on page load -> Live
  snapshot 2 min old on page load   -> Disconnected, counted in badge
  snapshot 10 min old on page load  -> Disconnected, counted in badge
  socket-only technician, last patch 12 s / 14 s ago -> kept
  socket-only technician, last patch 16 s / 24 s ago -> pruned
  technicianOnline carrying an 8 h old lastLocationAt -> pruned at next tick
  sweep-only refresh, 120 s cycle -> disconnected 60 s of every 120 s
```

**Production (Gate 5).** Run on 2026-11-13, 12:03–12:12 UTC, after the owner approved read-only
probing. One admin login and GET requests only against the admin API: `/api/technicians/live-map`,
`/api/technicians?currentStatus=…`, `/api/technicians/:id` (reads MongoDB directly), `…/recent-jobs`
and `/api/technician-activity`. No status, job or technician was changed. Tokens are not recorded
here. The comparison is repeatable with `clicks-api/scripts/live-map-probe.js`, which reads
credentials from the environment.

Not done: the admin map UI was not opened in a browser, so C1 was not tested. The technician login
(ACC-TECH) was not attempted: no phone is available from this environment, so a login would add
nothing, and it could disturb a device already signed in to that account.

Snapshot against database (heartbeat age; "silent" means no check-in from the phone):

| Technician | Database | Map snapshot | Finding |
|-----------|----------|--------------|---------|
| Mahmoud Qadour | On Job, heartbeat 3–11 s | On Job, heartbeat 7 min rising to 12 min, pin 693 m off | **C2**: snapshot behind the database |
| Omar Al-Thani (QA account) | Online, heartbeat 7–11 s | absent | **C2**: Online technician missing from the map |
| Rawad Adib | On Job, silent 53 min | same | **C0 / H3**: Android 1.2.3+16; opened app, went to background, nothing since; job open |
| Mohammed Adib | On Job, silent 60 min | same | **C0**: completed a job at 11:11 UTC, app closed its socket seconds later, status still On Job; an older job is still open |
| Khodor Al Fayad | On Job, silent 47 h | same | **C0**: socket dropped in background 47 h ago; a job was assigned to him 2.5 h before the probe |
| Ossman Mustafa | On Job, silent 10 days | same | **C0**: four jobs from 10 days ago still open |
| Fares M | On Job, no heartbeat ever, last GPS 111 days | same | **C0**: last jobs completed 106+ days ago, status never reset |
| Raed Adib | On Job, `isActive: false`, silent 6–8 min, app used minutes earlier | absent (inactive filter) | **G8** |

Reading:

- The five silent On Job technicians are the "5 disconnected". The UI is reporting them correctly.
- The snapshot was 7 minutes old at first read and 12 minutes old ten minutes later, so it outlived
  the nominal 10-minute roster age, as the stale-while-refresh path predicts.
- A first probe that only watched whether heartbeat values changed between polls was inconclusive:
  a silent phone and a cached snapshot look identical. The comparison with the direct read is what
  separates them, and the probe script was rewritten to do that.
- C3 and C4 were not observed. The one live technician was heartbeating normally. Rawad Adib's
  silence began right after a background event with no later messages at all, which fits an app
  that stopped (H3) better than heartbeats being discarded (C3), but the server cannot tell them
  apart: a discarded heartbeat leaves no trace.

Still open: in the dispatcher's own browser, open DevTools, Network, WS, and watch for
`technicianLocationBatch` frames. Set the network to Offline for 5 seconds and back. If the badge
returns to "Connected" and the frames do not resume, C1 is confirmed.

## 9. Tie-in to known platform risk (Gate 6)

**Ghost offline.** The mechanism exists and is reachable on a single replica without Redis: C3 stops
`lastHeartbeatAt` advancing for a healthy app, and if the socket is not live when the 60 s sweep
runs, `sweepGhostOnlineTechnicians` marks the technician Offline (`sosSocketService.js:417-441`).
An Offline technician is not offered jobs. They are restored only when their socket next registers
(`:394-415`). So one server defect (C3, acted on by C4) can produce both a missing map marker and a
technician who is not dispatchable while their app looks normal. That link is proven in code and has
not been observed in production.

**Admin UI bugs are separate.** C1, C2 and C5 make the map wrong even when server presence is
correct. They do not affect dispatch or alerts; the technician's `currentStatus` in the database is
right. Fixing them changes only what dispatchers see.

**Scaling work does not cover this.** Against the production tag, the stacked `scale/*` branches
(through `scale/p3-runbook`) change `sosSocketService.js` (presence modes, leased sweeps, atomic
auto-Offline) and add a size getter to `technicianLocationWrite.js`. They do not touch
`adminLookups.js`, the admin `technicianController.js`, `LiveMap.jsx`, `liveMapUtils.js` or
`AdminLayout.jsx`, and they leave the 1–15 m branch as it is. `TECH_PRESENCE_MODE` exists only on
those branches. Multi-instance `fetchSockets` blindness (`socketAdapter.js:5-11`) is a real future
risk and is not a current cause, because production runs one replica.

`CLICKS_LOAD_SCALABILITY_AUDIT.md` covers Live Map fan-out cost (LOAD-8, since implemented as the
2 s batch). It does not mention the roster cache or presence.

## 10. Recommended fixes

Smallest first. F1 to F4 are each a few lines and independent. No refactor is needed.

**Compatibility with the technician app in the field.** F0 to F6 change only the admin web, the
admin API and the tech API. None changes a message the app sends or a response it reads, so build
1.2.3+16 and older builds keep working unchanged and no app release is needed. Two server fixes
change how technicians are treated, in their favour: F3 stops healthy parked technicians being
auto-Offlined, and F0 (if the expiry option is chosen) takes long-silent technicians out of On Job.
Only F7 needs a new app build, and it is optional.

**F0 — Stop silent On Job technicians reading as live staff (fixes C0).** Two parts.

1. Data, now: the five technicians in section 8 need their old open jobs closed or cancelled and
   their status reset. This writes to production and needs the owner's decision per technician; it
   was not done as part of this investigation.
2. Code. Admin web first, because it changes no behaviour: show On Job technicians who have been
   silent for more than a set time in a separate "not reporting" list with name and last-seen time,
   and leave them out of the "disconnected" count, so the badge means something a dispatcher can act
   on. Then, as an owner policy decision, expire them on the server: On Job, no heartbeat for N
   hours and no live socket becomes Offline with `autoOfflineAt` set, which the existing code
   already undoes when the app reconnects (`sosSocketService.js:394-415`). The threshold is the
   decision; the brief's rule "never flip a technician Offline mid-job" was written for short gaps.

**F1 — Admin web: rejoin and resync on every connect (fixes C1).** `LiveMap.jsx`, socket effect.

```js
const onConnect = () => {
  socket.emit("joinLiveMap");
  refetch();
};
socket.on("connect", onConnect);
socket.emit("joinLiveMap"); // buffered until connected on first mount
// cleanup: socket.off("connect", onConnect); socket.emit("leaveLiveMap");
```

Test: integration test that an admin socket which disconnects and reconnects, with the client
re-emitting `joinLiveMap`, receives the next batch.

**F2 — Admin API: read volatile fields from MongoDB (fixes C2).** In `getLiveMapTechnicians`, query
`Technician.collection.find({ currentStatus: { $in: ["Online", "On Job"] } }, { projection })`
directly, using the existing index, and drop the 10-minute roster for this endpoint. Do not use
`getCachedPayload` here: its stale window is at least 120 s whatever TTL is passed. If caching is
wanted, hold the result for 2 s with no stale serving. The earlier cost concern (`adminLookups.js:4-8`)
came from an unprojected read of `performance.earningsData`; a projected query on a few dozen
documents does not carry that.

Test: update `lastHeartbeatAt` in the database, call the endpoint twice 3 s apart, expect the new
value.

**F3 — Tech API: a sub-15 m update is a heartbeat (fixes C3).** `technicianLocationWrite.js`: treat
`movedMeters < MIN_MOVE_METERS` the same as the same-coordinates branch. Keep the stored pin,
respect the 10 s heartbeat throttle, write `lastLocationAt` and `lastHeartbeatAt`, and broadcast the
**stored** coordinates so the marker does not jitter.

Test: change "rejects moves smaller than 15m" to expect `heartbeat: true`, coordinates unchanged,
one broadcast.

**F4 — Tech API: stamp `lastHeartbeatAt` when going Online (fixes G1).** One line in `toggleStatus`
after `setTechnicianStatus`, and the same in `restoreAutoOfflinedTechnician`.

**F5 — Tech API: make the rescue sweep faster than the threshold (fixes C4).** In the live-socket
branch of both sweeps, refresh when the heartbeat is older than half the stale window, and run the
sweeps every 20 s. Setting `TECH_OFFLINE_SWEEP_MS=20000` alone only shrinks the gap (disconnected
20 s of every 80 s instead of 60 of 120), because the query cutoff is still 60 s; the query needs
the shorter cutoff for the refresh case. After F3 this path is rarely used.

**F6 — Admin web: stop losing technicians (fixes C5).** In order of value:
1. Poll REST every 30 s while the socket is connected and the tab is visible, 8 s when it is down.
   Do this after F2, otherwise it re-imports stale status.
2. On a location patch for an unknown id, trigger a debounced `refetch()` instead of discarding it.
3. In `onTechnicianOnline`, stamp `_socketPresenceAt` with arrival time, and add the id to
   `apiIdsRef` or widen the leash to `LOCATION_STALE_MS`.
4. Flush pending patches on `visibilitychange`, or use a timer when the tab is hidden.

**Later, larger.**
- F7 (G3): a coordinate-free liveness event so that presence does not depend on having a GPS fix.
  Needs an app release.
- F8 (G2): unlimited admin reconnect attempts with backoff.
- F9 (G4): count only technicians with a drawable marker in the badge, or list "no position"
  separately.

**Implementation status (2026-11-13).** The owner's stated priority is that any technician who is
Online or On Job is always on the map in real time. F1 to F6 are implemented for that goal on branch
`fix/live-map-realtime`, cut from `prod-2026-11-11`, in the worktree
`.claude/worktrees/live-map-realtime`.

**Deployed to production 2026-11-13, 15:55–16:00 Doha**, at the owner's request. Production is
deployed from the main working folder (uncommitted), which had been redeployed at 15:36 and was
ahead of the tag, so the fixes were applied there as a patch (it applied cleanly) and deployed from
there: full API suite 61 files / 423 tests passing in that folder beforehand.

| Service | Deployment | Verified |
|---------|-----------|----------|
| clicks-admin-api (Railway `melodious-achievement`) | `32c0c280`, 15:55 | healthy; probe: snapshot behind database 0, missing 0 |
| clicks-interface (Vercel, admin.clicks.qa) | `gm2bret0z`, 15:57 | live bundle contains the new Live Map code |
| clicks-tech-api (Railway `melodious-achievement`) | `b9b6126f`, 15:58 | healthy; the three working technicians were checking in within 10 s of the restart |

Not committed anywhere. Not verified: the pages were not driven by hand in a browser. Deploy
incident: the first `railway up` ran from a shell whose path was `c:\…` (lower-case drive letter);
the Railway CLI matches linked folders case-sensitively, treated the folder as unlinked, and created
a new empty project `clicks-api` (`21c0888c-7714-4386-a63a-67b1b16f550c`) whose build failed.
Production was not affected; the stray local link was removed; the stray project itself was left
for the owner to delete.

| Fix | Change | Files |
|-----|--------|-------|
| F1 | Join the feed on every socket connect, re-read REST then, leave on unmount | `LiveMap.jsx` |
| F2 | Snapshot read from MongoDB directly, 2 s burst memo, no stale serving | admin `technicianController.js` |
| F3 | A sub-15 m update is a heartbeat; stored pin kept and broadcast | `technicianLocationWrite.js` |
| F4 | Going Online, and being restored after auto-Offline, stamps `lastHeartbeatAt` | tech `technicianController.js`, `sosSocketService.js` |
| F5 | New 20 s pass refreshes presence for technicians with a live socket at half the stale window. Refresh only: it never marks anyone stale or Offline, so auto-Offline timing is unchanged | `sosSocketService.js` |
| F6 | REST re-read every 20 s while connected, on tab return and on an event for an unknown technician; arrival-time presence stamp; 45 s socket-only grace; no pruning in a hidden tab; Offline echo guard | `LiveMap.jsx`, `liveMapUtils.js` |
| G2 | Admin socket retries without limit | `AdminLayout.jsx` |
| G8 | Activation switch states the wanted value (repeat-safe), asks for confirmation before deactivating, refuses to deactivate a technician with a job in progress unless forced, writes `technician.activate` / `technician.deactivate` to the admin audit log, and refreshes the cached list and map immediately | admin `technicianController.js`, `Technicians.jsx`, `technicianApi.js` |

Not changed: F0 (stuck On Job technicians still show, faded, at their last known position), G3, G4.
Not verified: the pages were not driven in a browser against live data.

**Raed Adib (G8), follow-up the same day.** His account has `isActive: false` on every admin
endpoint, and he is the only one of 9 technicians with it. A deactivated technician is refused by
the tech API on every request and cannot open a new socket
(`requireApprovedTechnician.js`, `sosSocketService.js:114-131`). His trail shows a job started and
payment collected at 12:26 UTC and no completion since, with the app repeatedly opened and
backgrounded. The switch is one unconfirmed click in the technicians table
(`Technicians.jsx`), it was a bare flip on the server, the table is served from the 10-minute
roster so it did not show the change, and nothing was written to the audit log, so who changed it
and when cannot be recovered. His account was **not** reactivated from this investigation: the
production write was blocked by the session's permission system. It needs one click by an admin
(Technicians, his row, Activation), once only, since the table may take minutes to show it.

**Suggested order of work:** F0 part 1 (data cleanup) and F2 first, because both were observed in
production. Then F1 and the display half of F0 (admin-only, no effect on dispatch). Then F3 and F4
(server, changes who is auto-Offlined, so watch the auto-Offline rate after deploy), then F6 and F5.
Re-run `scripts/live-map-probe.js` after F2: "snapshot behind the database" and "missing from the
snapshot" should both read 0.
