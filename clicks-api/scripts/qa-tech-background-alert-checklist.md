# Technician background job-alert QA checklist

Symptom: no alarm/notification when app is closed; job only appears after reopening.

## Pass / fail (Phase 0)

**PASS:** Within ~10s of assign, app force-stopped: system notification + alarm without opening app.

**FAIL:** Silent until app opened, or only Incoming Job modal on open.

---

## Phase 1 — Device (operator)

- [ ] Native Android (not web)
- [ ] Logged in; waited 15s after home
- [ ] Notifications + DND policy + full-screen (if prompted)
- [ ] Battery → Unrestricted
- [ ] Channel "Urgent jobs (alarm)" / `clicks_job_urgent_v4` exists
- [ ] Force stop before hard tests

---

## Phase 2 — Server (automated)

```bash
cd clicks-api
node scripts/qa-tech-background-alert.js
```

---

## Phase 3 — Device matrix

| Test | App state | Action | Pass if |
|------|-----------|--------|---------|
| A | Foreground | Admin assign | Modal + alarm |
| B | Background (Home) | Admin assign | Tray notif + sound, no open |
| C | Force stop | Admin assign | Same as B |
| D | Force stop | `--send-live` | Tray notif from FCM alone |
| E | After C/D fail | Open app | Record: modal_only / notif_on_open |

---

## Phase 4 — Logs

```powershell
.\scripts\qa-tech-background-alert-logcat.ps1
```

---

## Phase 5 — Classify

```bash
node scripts/qa-tech-background-alert.js --classify \
  --test-a=pass --test-b=fail --test-c=fail --test-d=fail --test-e=modal_only
```

Results file: `scripts/qa-tech-background-alert-results.json`

---

## Latest run (2026-08-14)

| Check | Result |
|-------|--------|
| Phase 2 FCM token | PASS (`e0-dgrHlTgyx…`) |
| Phase 2 Firebase send | PASS (FCM accepted) |
| Firebase project | `clicks-technician-qa` |
| Admin assign path | PASS (job created + cleaned up) |
| Live FCM (`--send-live`) | Sent `qa-live-1786719287135` |
| Reported symptom | B/C fail; notif on app open only |

**Root cause bucket:** `deferred_fcm_on_process_start`

**Recommendation:** FCM reaches Firebase but background handler likely does not run until app starts (data-only + OEM). Next: run logcat during Test C; consider hybrid notification payload in `sendJobAssignedPush`.
