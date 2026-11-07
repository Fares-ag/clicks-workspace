# Clicks Customer App — 100 Failure Scenarios

**Date:** 7 November 2026
**Scope:** customer app (`clicks-user`) plus everything it depends on: the customer/tech API, shared models and services, the admin API paths that change a customer's job, SkipCash, FCM, SMS.
**Method:** I read the working tree statically (including uncommitted changes) and called no live servers. Four parallel code reads covered:
- SOS and the job lifecycle
- money
- identity and accounts
- notifications and infrastructure

I then re-read the highest-severity claims in the source myself. Those are marked **[verified]**. The others carry the file and line where the behaviour lives and should be confirmed during testing.

**Path shorthand:**
- `API` = `clicks-api/clicks-customer-tech-api/src`
- `ADM` = `clicks-api/clicks-admin-api/src`
- `SH` = `clicks-api/clicks-shared`
- `APP` = `clicks-user/lib`
- `SOCK` = `API/services/sosSocketService.js`
- `skc` = `API/controllers/skipcashController.js`

**Verdicts:**
- **HANDLED**: the code deals with it.
- **PARTIAL**: some of it is handled.
- **NOT HANDLED**: there is no code for it.
- **BROKEN**: code exists but does the wrong thing.

**Launch blocker:**
- **YES**: do not launch until fixed.
- **PRE-SCALE**: tolerable for a closely watched soft launch with a handful of customers, but must be fixed before wider marketing.
- **NO**: fix after launch.

---

## The honest headline

The app looks complete. The happy path works: SOS, dispatch, tracking, payment, rating. The previous audits checked that path, and their verdict on it stands.

This audit looks at what happens **off** the happy path. There the platform has a consistent weakness: **multi-step state changes are a read followed by a write, and nothing reconciles them afterwards.**
- SOS and Job are linked by an unconditional overwrite.
- The service-request record never reaches a final state.
- Payment attempts overwrite one another.
- Membership checkout cancels the subscription a customer may be paying for at that moment.
- Admin cancel calls a route that does not exist.
- An SOS that no one answers waits forever.

None of these crash anything. Each one quietly leaves a wrong record, takes money with nothing recorded, or leaves a customer stuck with no one aware of it.

In my judgement **45 of the 100 scenarios are launch blockers**, plus the technician-exposure issue listed after 100. Several share a fix, so that is about **30 separate pieces of work**, and about a dozen of them are cheap fixes of one or two lines.

---

## A. Account and access (1–21)

### 1. New customer registers with the current app build ✅ (fix/ws-fhi-identity)
- **What happens:** The working-tree `register` requires a 6-digit `otp` in the request body (`API/controllers/customerController.js:35-46`). The app verifies the OTP through a separate endpoint, then calls register **without** `otp` (`APP/features/auth/register/ui/cubit/register_cubit.dart:220-229`). `findAndVerifyOtp` rejects an empty code (`SH/utils/otpVerify.js:73`) and returns 400 "Invalid or expired code". **[verified]**
- **Customer expects:** An account after entering the code.
- **Business needs:** Sign-ups to work on the day marketing starts.
- **Handled?** **BROKEN** as soon as the uncommitted server change is deployed. Live behaviour depends on which server build Railway is running.
- **If not handled:** Nobody can sign up. Installed apps can't be fixed without a store release, and there is no forced update (scenario 19).
- **Correct behaviour:** The app sends `otp` in the register call, or the server accepts a short-lived token issued by `verifyOtp`. Deploy the server only together with an app build that matches it.
- **Launch blocker:** **YES**

### 2. Customer double-taps "Create account" ✅ (fix/ws-fhi-identity)
- **What happens:** Both requests pass the existence check. The unique index rejects the second with E11000, which comes back as 500 "Registration failed" along with the raw Mongo error text (`customerController.js:89-91`).
- **Customer expects:** One account and a success message.
- **Business needs:** One account, and no internal details leaked to clients.
- **Handled?** **PARTIAL.** The database prevents the duplicate, but the user-facing result is wrong.
- **If not handled:** The customer may see "failed" although the account exists, then retry and get "already registered".
- **Correct behaviour:** Treat E11000 on phone or email as a 409 with a friendly message. Never return `err.message`.
- **Launch blocker:** NO

### 3. Customer deleted their account and wants to come back ✅ (fix/ws-fhi-identity)
- **What happens:** `deleteAccount` writes `deleted_at` and `deleted_reason`, but neither field exists in the Customer schema (`SH/models/Customer.js:4-21`), so strict mode drops them silently. Only `status: "Inactive"` is saved. **[verified: the schema has no `deleted_at`]** Then:
  - The "restore deleted account" branch can never run.
  - `sendRegisterOTP` returns "OTP sent" without sending anything.
  - `register` returns 409 and `login` returns 403.
  - `forgotPassword` sends nothing.
- **Customer expects:** Either a fresh account or their old one back.
- **Business needs:** A defined re-activation path.
- **Handled?** **BROKEN.**
- **If not handled:** The customer waits for an SMS that never arrives. Support can't explain why. Only a manual database edit recovers them.
- **Correct behaviour:** Add `deleted_at` and `deleted_reason` to the schema. Define a policy: either re-register with a fresh record after anonymising the old one, or restore after OTP. Tell the customer the truth in the app.
- **Launch blocker:** NO. It becomes a blocker once account deletion is advertised, which the App Store requires.

### 4. Customer deletes their account during an active tow, or with an active membership ✅ (fix/ws-fhi-identity)
- **What happens:** The only guard is "completed and unpaid" (`customerController.js:188-195`). Not checked:
  - a pending or in-call SOS
  - an en-route or in-progress job
  - a scheduled booking
  - an active subscription

  Personal data is kept in full. The reason the customer chose is never sent (`settings_cubit.dart:20`).
- **Customer expects:** A warning, or a clean closure.
- **Business needs:** No orphaned live jobs, a defined outcome for paid memberships, and real data deletion.
- **Handled?** **NOT HANDLED.**
- **If not handled:**
  - The technician is still driving to a customer whose every API call now returns 403. The customer can't track or pay.
  - The job completes as unpaid against a dead account.
  - The membership keeps running.
  - "Deletion" retains all personal data, which is a store-policy and Qatar data-protection exposure.
- **Correct behaviour:** Block deletion while any live SOS, job or booking exists. Warn about an active membership and define whether it is refunded or forfeited. Anonymise personal data after a retention window. Record the reason.
- **Launch blocker:** **YES**, because of the store requirement and live-job orphaning.

### 5. Account deletion fails because of an unpaid job ✅ (fix/ws-fhi-identity)
- **What happens:** A 409 `UNPAID_JOB_HOLD` becomes `ErrorSettingsState()` with no message, and the screen only listens for success (`settings_screen.dart:39-44`).
- **Customer expects:** To be told why it failed.
- **Business needs:** The customer pointed at what they owe.
- **Handled?** **BROKEN** (UX).
- **If not handled:** The customer believes the account is deleted. Later they're surprised to still receive pushes, or they complain about "deleted" data.
- **Correct behaviour:** Show the reason and a "Pay now" link.
- **Launch blocker:** NO

### 6. A foreign number with the same last 8 digits resets a Qatar customer's password ✅ (fix/ws-fhi-identity)
- **What happens:** `phoneLookupValues` adds `+974<last 8 digits>` for **any** input (`SH/utils/phone.js:18-30`). **[verified]** Password reset texts the OTP to the raw number entered and then resets whichever customer `findCustomerByPhone` matches. So a +44 number ending 5551 2345 receives the code and resets the password of +974 5551 2345.
- **Customer expects:** Only they can reset their password.
- **Business needs:** No account takeover.
- **Handled?** **BROKEN** (security). Exploiting it needs a number with a matching suffix, and virtual-number services sell those.
- **If not handled:** The attacker gets full control of the account, sees home location history, and can raise jobs in the victim's name.
- **Correct behaviour:** Only apply the last-8-digit fallback to inputs that are 8 digits or start with +974 or 974. Send the OTP to the **stored** number of the matched account, never to the raw input.
- **Launch blocker:** **YES**

### 7. An expat with a foreign number, or a legacy customer with duplicate rows, tries to log in ◐ partial (fix/ws-fhi-identity: dedupe script ready; run it, then sync-indexes)
- **What happens:** The same suffix match makes login and registration collide across countries. The code itself notes that legacy rows exist in several formats with "dedupe migration pending" (`customerController.js:17-22`). `findOne` over the `$or` returns whichever row Mongo happens to return.
- **Customer expects:** Login works every time.
- **Business needs:** One identity per person.
- **Handled?** **PARTIAL.**
- **If not handled:** "Invalid credentials" one day and success the next. A genuine foreign-number customer gets 409 "already registered".
- **Correct behaviour:** Run the dedupe migration before launch, add a unique index on the normalised E.164 number, and match on the exact number only.
- **Launch blocker:** PRE-SCALE

### 8. Customer registers with "Ali@x.com" and later types "ali@x.com" ✅ (fix/ws-fhi-identity)
- **What happens:** Email is neither lower-cased nor trimmed (`customerController.js:29, 49`). Changing to an email that's already taken returns 500.
- **Customer expects:** The same account.
- **Business needs:** One account per email.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Duplicate accounts, and receipts and membership split across them.
- **Correct behaviour:** Lower-case and trim on write and on lookup. Return 409 for a duplicate email.
- **Launch blocker:** NO

### 9. The OTP SMS never arrives ◐ partial (fix/ws-fhi-identity: body parsing, prod console refusal, volume alert; no fallback provider)
- **What happens:**
  - A SMSala response with a 2xx status but an error in the body counts as sent (`API/services/smsService.js:114`).
  - There is no retry, no fallback provider, and no voice or WhatsApp option.
  - If `SMS_PROVIDER` is unset, it defaults to `console`, so OTPs are written to logs and the customer gets nothing (`smsService.js:132,143`).
- **Customer expects:** A code within seconds, or a clear alternative.
- **Business needs:** To know when SMS delivery is failing.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Sign-up and password reset fail silently. In a misconfigured environment, valid OTPs leak into the logs.
- **Correct behaviour:** Parse SMSala's response body for errors. Make the server refuse to boot in production with `SMS_PROVIDER=console`. Alert on SMS failure rate. Offer a "call me instead" option or a support number.
- **Launch blocker:** **YES**, at least the production config check and the body parsing.

### 10. Customer taps "Resend" and the first SMS arrives late
- **What happens:** Each send deletes the previous code (`customerController.js:378-387`). The customer types the code that arrived first and gets "Invalid or expired".
- **Customer expects:** Either code to work.
- **Business needs:** Fewer support calls.
- **Handled?** **PARTIAL.**
- **If not handled:** Repeated failures until the 5-attempt lockout.
- **Correct behaviour:** Keep the last two codes valid within the window, or show "use the most recent code".
- **Launch blocker:** NO

### 11. An attacker SMS-bombs a customer's number, or drains the SMSala balance ✅ (fix/ws-fhi-identity)
- **What happens:** Customer `otp/send` and `forgot-password` have no per-phone cap. They accept any international number, and the only limit is 20 per IP per 15 minutes, held in memory (`API/middleware/rateLimiter.js:28-39`). The technician flow does have a 3-per-hour per-phone cap (`technicianController.js:879-891`).
- **Customer expects:** Not to be spammed.
- **Business needs:** SMS cost under control. SMS is also the only route into sign-up and password reset.
- **Handled?** **NOT HANDLED.**
- **If not handled:** SMS pumping fraud to premium international numbers, and an empty SMSala balance takes down every OTP flow.
- **Correct behaviour:** Cap sends per phone (3 per hour, 10 per day). Restrict OTP to +974 at launch. Keep limiter state in Redis. Alert on daily SMS spend.
- **Launch blocker:** **YES**

### 12. The 7-day token expires during a breakdown ✅ (fix/ws-fhi-identity)
- **What happens:** The token is a fixed 7-day JWT with no refresh (`customerController.js:122-126`). On 401 the app wipes storage and goes to Login (`APP/core/api/dio_helper.dart:30-44`). The SOS cubit isn't reset and the socket keeps retrying with the stale token, up to 999 times, each failure sent to Sentry (`customer_socket_service.dart:55-87`).
- **Customer expects:** To stay signed in during an emergency.
- **Business needs:** A customer in trouble never logged out.
- **Handled?** **PARTIAL.** The server-side SOS survives a re-login.
- **If not handled:** The customer is on the hard shoulder at night, gets thrown to Login, and has forgotten the password. Recovery then depends on SMS (scenario 9).
- **Correct behaviour:** Add a refresh token, or a sliding expiry renewed on every authenticated call. Never force a logout while a live SOS or job exists. Rebuild the socket's auth after re-login.
- **Launch blocker:** **YES.** The first cohort hits day 7 in the first week.

### 13. Customer resets their password after their phone was stolen ✅ (fix/ws-fhi-identity)
- **What happens:** Reset and change-password only re-hash the password. There is no token version, and logout does nothing on the server (`customerController.js:177-178, 349-350, 440-443`).
- **Customer expects:** The thief is locked out.
- **Business needs:** Revocation.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The stolen token keeps working for up to 7 days.
- **Correct behaviour:** Store `token_version` on the Customer, put it in the JWT, and bump it on reset or logout-all.
- **Launch blocker:** PRE-SCALE

### 14. Admin blocks a customer who is signed in ✅ (fix/ws-fhi-identity)
- **What happens:** Every REST call returns 403 `ACCOUNT_INACTIVE` (`API/middleware/auth.js:19-28`), but the app only reacts to 401. The splash screen treats the 403 body as an empty session and opens Home. The socket checks role only, not status (`SOCK:94-95`).
- **Customer expects:** To be told the account is blocked and why.
- **Business needs:** A block actually blocks, live socket included.
- **Handled?** **NOT HANDLED.**
- **If not handled:** A blocked customer sits on Home where every button fails, and still receives live events.
- **Correct behaviour:** On `ACCOUNT_INACTIVE`, show a "contact support" screen and disconnect. On block, force-disconnect the customer's socket room on the server.
- **Launch blocker:** NO

### 15. Same account signed in on two phones (husband and wife share an account)
- **What happens:** There is one `fcm_token` field, which the last phone to sign in overwrites (`Customer.js:15`). Logout never clears it on the server. Both phones join the socket room.
- **Customer expects:** Both phones notified.
- **Business needs:** Reliable notification delivery.
- **Handled?** **PARTIAL.**
- **If not handled:** Only one phone gets "technician arrived". If that phone signs out, the server keeps a dead token and the other phone gets nothing.
- **Correct behaviour:** Store an array of device tokens with last-seen dates. Remove a token on logout. Prune tokens on `not-registered`.
- **Launch blocker:** NO

### 16. Customer gets a new SIM and number
- **What happens:** The phone field is disabled in edit profile, and the server's whitelist excludes it (`edit_profile_screen.dart:24`, `customerController.js:217-222`).
- **Customer expects:** To change their number.
- **Business needs:** Dispatch can call the right number.
- **Handled?** **PARTIAL.** It's safe, but there is no path.
- **If not handled:** Dispatch keeps calling the dead number during an SOS. The customer also can't re-register (scenarios 3 and 8).
- **Correct behaviour:** Change the number with an OTP sent to the new number, plus an audit log entry.
- **Launch blocker:** NO

### 17. A customer with the last name "Al" or "Wu" ✅ (fix/ws-fhi-identity)
- **What happens:** Register accepts it, but edit profile rejects last names shorter than 3 characters (`edit_profile_screen.dart:199-200`). Separately, a first name of 51–80 characters passes register and then fails the schema, returning a 500.
- **Customer expects:** To save their profile.
- **Business needs:** Validation that agrees across screens.
- **Handled?** **PARTIAL.**
- **If not handled:** The customer can never save any profile edit.
- **Correct behaviour:** One validation rule shared by client and server.
- **Launch blocker:** NO

### 18. Customer reinstalls on iOS, or a phone is handed to a family member ✅ (fix/ws-fhi-identity)
- **What happens:**
  - iOS keeps the Keychain across reinstalls, so the app signs straight back into the previous user.
  - `CacheHelper.init` runs before `runApp` with no try/catch (`cache_helper.dart:16-35`), so a corrupted secure-storage read can crash the app on every launch.
  - Android backup restore brings back encrypted data whose key no longer exists.
- **Customer expects:** A clean start after reinstalling.
- **Business needs:** No cross-user exposure.
- **Handled?** **PARTIAL.**
- **If not handled:** A second-hand phone opens the previous owner's account and job history. Some users crash on launch every time.
- **Correct behaviour:** Wipe storage on first run, using a flag in plain preferences. Wrap init in try/catch and reset on failure. Set `allowBackup=false`, or exclude secure storage from backup.
- **Launch blocker:** PRE-SCALE

### 19. The API changes and old app versions stay in the field ✅ (fix/ws-fhi-identity)
- **What happens:** There is no minimum-version check anywhere. `appVersion` is a local constant that is never sent (`APP/core/config/app_config.dart:256`).
- **Customer expects:** An update prompt, not a broken app.
- **Business needs:** A way to stop old clients.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Scenario 1 is a live example. The first breaking fix strands every installed copy with no way to tell the users.
- **Correct behaviour:** Send `X-App-Version` on every request. Add `/config/min-version` checked at splash. Show a blocking update screen.
- **Launch blocker:** **YES.** It has to be in the first store build, because it can't be added afterwards.

### 20. An Arabic-speaking customer hits an error at a critical moment ◐ partial (fix/ws-fhi-identity: auth/settings/SOS/payment strings; other screens still to sweep)
- **What happens:**
  - All server errors are in English, and the app shows `response.data["error"]` as-is.
  - The SOS GPS and connection errors (`sos_cubit.dart:345,367,388`), card-payment errors (`skipcash_api.dart:49,54`) and the forgot-password flow are hardcoded in English.
  - `ACCOUNT_INACTIVE` and `LAUNCH_PUBLIC_SIGNUP_OFF` are not mapped to translations.
- **Customer expects:** Arabic throughout.
- **Business needs:** A professional experience in Qatar.
- **Handled?** **PARTIAL.** Booking codes are mapped (`booking_errors.dart`).
- **If not handled:** English errors at the worst moments: SOS failure, payment, a blocked account.
- **Correct behaviour:** The server always returns a stable `code`, the app maps every code to an i18n key, and raw server text is never shown.
- **Launch blocker:** PRE-SCALE, but the SOS and payment strings should be fixed before launch.

### 21. Many customers behind one carrier IP (Ooredoo or Vodafone carrier NAT)
- **What happens:** The login, register and forgot-password limit is 10 per IP per 15 minutes, shared across all three (`rateLimiter.js:11-22`). `trust proxy` is 1 (`API/createApp.js:93`). That's correct for one proxy hop, so the team's own code comment saying "every caller lands in one bucket" is probably out of date, but check it live. Users on a shared carrier IP still share a bucket.
- **Customer expects:** To log in.
- **Business needs:** Protection against brute force without locking out real users.
- **Handled?** **PARTIAL.**
- **If not handled:** At peak times on mobile data, a legitimate user gets an English "Too many attempts from this IP".
- **Correct behaviour:** Limit per phone **and** per IP, with a higher IP ceiling. Keep the store in Redis. Verify `req.ip` on Railway with one request from two networks.
- **Launch blocker:** NO. Verify it live.

---

## B. Vehicles (22–26)

### 22. Customer bought a used car the previous owner had registered
- **What happens:** On add, a global exact-match plate check returns 409 "Plate number already registered" (`API/controllers/vehicleController.js:36-41`).
- **Customer expects:** To add their own car.
- **Business needs:** Vehicles transfer between owners.
- **Handled?** **BROKEN** for this case.
- **If not handled:** The new owner is permanently blocked from adding the car, and so from membership, which is tied to the vehicle.
- **Correct behaviour:** Allow the same plate on different customers. Flag it for ops, or retire the old owner's record after an OTP-confirmed claim.
- **Launch blocker:** NO

### 23. Plate entered as "123 456", "123456" or with Arabic digits
- **What happens:** No normalisation, no format validation, no unique index, and no check on update.
- **Customer expects:** The app catches typos.
- **Business needs:** Clean vehicle data for membership and history.
- **Handled?** **PARTIAL.**
- **If not handled:** Duplicate vehicles, a membership on the "wrong" duplicate, and messy Data Analysis reporting.
- **Correct behaviour:** Normalise (strip spaces, convert Arabic to Latin digits, upper-case) and validate the format.
- **Launch blocker:** NO

### 24. A customer edits a vehicle and the request carries extra fields ✅ (fix/ws-fhi-identity)
- **What happens:** `Object.assign(vehicle, req.body)` (`vehicleController.js:117`). A crafted request can set `customer_id` and move the car onto another account, or set a plate that belongs to someone else.
- **Customer expects:** Not applicable; this is abuse.
- **Business needs:** Data integrity.
- **Handled?** **BROKEN** (mass assignment).
- **If not handled:** Vehicle records, and the memberships tied to them, can be corrupted or attached to other accounts.
- **Correct behaviour:** Whitelist the editable fields. It's a one-line fix.
- **Launch blocker:** **YES** (trivial fix, real integrity hole)

### 25. Customer deletes the vehicle that has an open SOS or job
- **What happens:** There is no live-job check, and it's a hard delete (`vehicleController.js:125-140`). The SOS and session populate the vehicle as `null`, and the "one active job per vehicle" guard stops applying.
- **Customer expects:** A warning.
- **Business needs:** The technician knows which car to look for.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Dispatch loses the vehicle details mid-job, and the duplicate-SOS guard goes quiet.
- **Correct behaviour:** Block deletion while a live SOS or job exists. Soft-delete otherwise.
- **Launch blocker:** NO

### 26. Customer edits the vehicle (colour or plate) during a job
- **What happens:** The live SOS view reads the vehicle record, while the Job keeps a snapshot.
- **Customer expects:** The technician finds the car.
- **Business needs:** One source of truth during a job.
- **Handled?** **PARTIAL.**
- **If not handled:** The technician and dispatch see different plates.
- **Correct behaviour:** Lock edits during a live job, or show the snapshot everywhere once a job exists.
- **Launch blocker:** NO

---

## C. Raising an SOS (27–41)

### 27. `LAUNCH_PUBLIC_SOS` is not set in production ✅ (fix/ws-bc-realtime: app hides SOS behind a call card when public_sos is off)
- **What happens:** It defaults to **OFF** in production when unset (`API/utils/featureFlags.js:15`). The app never reads the flag, so the customer selects a vehicle, waits for GPS, and only then gets "unavailable".
- **Customer expects:** SOS works, or the button is hidden.
- **Business needs:** The core product switched on.
- **Handled?** **PARTIAL.**
- **If not handled:** If one environment variable is missing, the product's main promise fails for every customer, at the last step.
- **Correct behaviour:** Make the flag explicit in Railway, with a boot log of every flag value. Expose `/config/flags` and hide or explain SOS in the app.
- **Launch blocker:** **YES** (configuration check)

### 28. SOS is switched off, but "immediate" service requests still go through
- **What happens:** Only the socket `createSOS` checks the flag. `requirePublicSos` is never mounted, so immediate requests over REST bypass it (`API/routes/serviceRequestRoutes.js:6-10`).
- **Customer expects:** Consistent availability.
- **Business needs:** One switch that turns off emergencies when ops can't serve them.
- **Handled?** **BROKEN.**
- **If not handled:** Emergency-type requests keep arriving while ops believe they're closed.
- **Correct behaviour:** Mount the same gate on the immediate service-request route.
- **Launch blocker:** NO

### 29. SOS sent from two devices, or replayed after a reconnect
- **What happens:** The "one active SOS" guard is a read at `SOCK:957`, about 5 round-trips, then a save at `SOCK:1033`. There is no unique partial index and no idempotency key (`SH/models/SOSRequest.js:75-86`).
- **Customer expects:** One request.
- **Business needs:** One dispatch.
- **Handled?** **PARTIAL.** The UI blocks a single-device double tap.
- **If not handled:** Two SOS records, two dispatchers working the same customer, and possibly two trucks sent.
- **Correct behaviour:** Add a unique partial index on `{customer_id}` where status is pending or in_call. Have the client send an idempotency key.
- **Launch blocker:** **YES**

### 30. The socket drops right after the SOS is saved (a lift, a tunnel, a weak signal)
- **What happens:** `sosCreated` is sent only to the socket that sent the request (`SOCK:1039`), with no acknowledgement and no client timeout, so the spinner never ends. On retry, the server returns `SOS_ALREADY_ACTIVE` with the `sos_id`. The app has no mapping for that code and discards the id (`sos_cubit.dart:282-290`).
- **Customer expects:** Confirmation that help is coming.
- **Business needs:** The customer to see the SOS they actually raised.
- **Handled?** **BROKEN.**
- **If not handled:** A customer in an emergency sees an endless spinner, then an error. Dispatch has a live SOS and the customer thinks it failed. They call a competitor, or the police.
- **Correct behaviour:** Use an acknowledgement with a 10s timeout. On timeout or `SOS_ALREADY_ACTIVE`, fetch the session and open the timer screen for the existing SOS. Emit `sosCreated` to the customer's room, not to one socket.
- **Launch blocker:** **YES**

### 31. GPS is denied, slow, or indoors
- **What happens:** If no fix arrives, the app silently uses `lastKnownPosition`, which can be hours old and restored from a previous SOS (`sos_cubit.dart:362-364`). Accuracy is never checked or sent.
- **Customer expects:** The truck comes to where they are now.
- **Business needs:** A correct pickup location.
- **Handled?** **BROKEN.**
- **If not handled:** The technician drives to yesterday's location. It looks like "the technician got lost", while the real cause is wrong data.
- **Correct behaviour:** Reject fixes older than about 2 minutes or less accurate than about 200 m. Make the customer confirm the location on a draggable map pin. Send accuracy and fix time to the server.
- **Launch blocker:** **YES**

### 32. Customer is near Salwa, on Hawar island or at sea
- **What happens:** The server checks a Qatar **bounding box** (`SH/utils/qatarCoverage.js:5-22`), which takes in part of Saudi Arabia, Bahraini islands and open water.
- **Customer expects:** A clear "outside coverage" message.
- **Business needs:** No dispatch outside the service area.
- **Handled?** **PARTIAL.**
- **If not handled:** SOS requests that can't be served are accepted and become a dispatcher's problem.
- **Correct behaviour:** Use a point-in-polygon check against Qatar's land border, or the serviced zones.
- **Launch blocker:** NO

### 33. Customer has to move: police order them off the road, or a tow moves them
- **What happens:** There is no endpoint to change the SOS or request location after submission.
- **Customer expects:** To update the location.
- **Business needs:** The technician goes to the right place.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The location now exists only in phone calls and isn't recorded on the job.
- **Correct behaviour:** Let the customer update the location until `arrived`, notify the technician, and keep the history.
- **Launch blocker:** NO

### 34. The dispatcher re-types the address when creating the job
- **What happens:** Admin `location` text is geocoded again (`SH/services/createJobRecord.js:126-131`). The job's pin can differ from the customer's GPS.
- **Customer expects:** The technician uses their GPS pin.
- **Business needs:** One authoritative coordinate.
- **Handled?** **PARTIAL.**
- **If not handled:** The technician navigates to a geocoded street, not the car.
- **Correct behaviour:** Copy the SOS coordinates onto the job by default. Keep the text address as a label only.
- **Launch blocker:** PRE-SCALE

### 35. Customer raises SOS with "skip vehicle" repeatedly
- **What happens:** An SOS is allowed next to a live job for another vehicle, or with skip-vehicle (`SH/utils/customerBookingGuard.js:115-145`).
- **Customer expects:** Not applicable (an edge case, or abuse).
- **Business needs:** No phantom parallel emergencies.
- **Handled?** **PARTIAL.**
- **If not handled:** A customer stacks SOS jobs and the screens get mixed up (scenario 62).
- **Correct behaviour:** Allow at most one live emergency per customer unless ops overrides.
- **Launch blocker:** NO

### 36. Customer raises and cancels SOS repeatedly
- **What happens:** There is no throttle on create and cancel. Each create pushes every dispatcher (`SOCK:1083-1101`).
- **Customer expects:** Not applicable (a confused user or abuse).
- **Business needs:** Dispatchers not flooded.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Alert fatigue, so real SOS requests get ignored.
- **Correct behaviour:** Throttle per customer, for example 3 SOS per 10 minutes, and flag the account.
- **Launch blocker:** NO

### 37. Customer raises SOS at 2 AM, outside business hours
- **What happens:** `after_hours` and `next_open_at` are stamped on the SOS (`SOCK:1032`) but never sent to or shown to the customer.
- **Customer expects:** To know whether anyone is coming.
- **Business needs:** Honest expectations, and fewer angry calls.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The customer waits for help that won't come until morning.
- **Correct behaviour:** Before submission, show "Out of hours: next available at …" with an emergency number.
- **Launch blocker:** **YES**, unless ops is staffed 24/7.

### 38. No dispatcher picks up the SOS
- **What happens:** Auto-expiry is **disabled**: `schedulePendingExpiry`, `scheduleInCallExpiry` and `sweepStaleSos` are no-ops (`SOCK:266-306`). **[verified]** Dispatchers get one push at creation and nothing more. The SOS stays pending forever and blocks any new SOS.
- **Customer expects:** Someone responds within minutes, or they're told to call.
- **Business needs:** No missed emergencies.
- **Handled?** **NOT HANDLED.**
- **If not handled:** A customer stranded on the Dukhan highway at night stares at "waiting". Nobody knows. It's the worst possible failure for a roadside brand.
- **Correct behaviour:**
  - Escalate when an SOS sits pending: at 2 minutes re-push all dispatchers, at 5 minutes SMS the on-call manager, at 10 minutes tell the customer and show a direct phone number.
  - Show a "pending for 3:12" counter on the admin SOS screen.
  - Persist the escalation state so a restart doesn't lose it.
- **Launch blocker:** **YES**

### 39. A dispatcher claims the SOS and then walks away
- **What happens:** Only the claiming admin can progress an `in_call` SOS (`ADM/controllers/sosController.js:249-266`). There is no timeout and no takeover.
- **Customer expects:** The call they were promised.
- **Business needs:** No SOS locked to an absent person.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The customer sits on "operator will call you" indefinitely.
- **Correct behaviour:** Release a claim automatically after N minutes with no job. Let a supervisor take it over. Record both in the audit log.
- **Launch blocker:** **YES**

### 40. The customer's 60-second countdown reaches zero
- **What happens:** `onComplete` is empty (`APP/features/home/timer_sos_screen.dart:132-134`). The cubit ignores `sosExpired`.
- **Customer expects:** Something to happen.
- **Business needs:** Promises the app makes are kept.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The app promised a call in 60 seconds, nothing happens, and trust breaks.
- **Correct behaviour:** At zero, show "Still connecting you. Tap to call us now", backed by the escalation in scenario 38.
- **Launch blocker:** Part of 38.

### 41. Customer taps a "Call us" button ◐ partial (fix/ws-fhi-identity: session_resume.dart still has the placeholder number)
- **What happens:** The app has **three different numbers** **[verified]**:
  - `tel:70090220` (timer screen)
  - `tel:70919191` (activity details)
  - `tel:+97444444444`, which looks like a placeholder (tracking screen, activity screen, session resume)
- **Customer expects:** To reach Clicks.
- **Business needs:** One number, which is answered.
- **Handled?** **BROKEN.**
- **If not handled:** A stranded customer calls a number that doesn't exist.
- **Correct behaviour:** Use one constant served from remote config, and test-call it before launch.
- **Launch blocker:** **YES** (trivial fix)

---

## D. Dispatch and job creation as the customer sees it (42–52)

### 42. Two dispatchers, or a double-click on Save, create jobs for the same SOS
- **What happens:** `createJobRecord` never checks that `sos.job_id` is empty or that the caller holds the claim. It overwrites the SOS without conditions (`createJobRecord.js:139-150`). **[verified]**
- **Customer expects:** One technician.
- **Business needs:** One job, one truck, one invoice.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Two technicians drive out and the SOS points to only one of the jobs. The other job is untracked by the customer but bills the technician's time.
- **Correct behaviour:** Link atomically: `findOneAndUpdate({_id, status:"in_call", job_id:null, claimed_by:me}, …)` **before** inserting the job, inside one transaction.
- **Launch blocker:** **YES**

### 43. Customer cancels at the same moment the dispatcher creates the job
- **What happens:** `cancelSOS` reads, checks `!sos.job_id`, then saves (`SOCK:1127-1141`). Job creation overwrites the status to `accepted` with no conditions.
- **Customer expects:** Cancelled means cancelled.
- **Business needs:** No truck sent to a cancelled request.
- **Handled?** **BROKEN.**
- **If not handled:** Depending on timing, either the SOS is cancelled with a live job and a technician driving, or the cancelled SOS comes back as `accepted`. The customer was told "SOS cancelled" and sent Home.
- **Correct behaviour:** Use conditional updates on both sides. Whichever lands second fails with a clear message.
- **Launch blocker:** **YES**

### 44. Job creation succeeds but updating the SOS fails
- **What happens:** The SOS → `accepted` update is a separate write whose error is only logged (`createJobRecord.js:139-149`). **[verified]**
- **Customer expects:** To see their technician.
- **Business needs:** SOS and Job agree.
- **Handled?** **BROKEN.**
- **If not handled:** The job is live and the technician driving, while the customer is kept on the in-call screen because the SOS takes priority in resume.
- **Correct behaviour:** Do the update in the same transaction, or an outbox fix-up. A nightly consistency check should flag any SOS whose job's status disagrees with it.
- **Launch blocker:** **YES** (shares the fix with 42)

### 45. The dispatcher creates the job without picking a technician
- **What happens:** The job is `pending` but the SOS flips to `accepted`. The customer's session ignores `pending` jobs (`customerBookingGuard.js:45-51`), and no event fires.
- **Customer expects:** To know a job exists.
- **Business needs:** The customer doesn't raise a second SOS.
- **Handled?** **BROKEN.**
- **If not handled:** The customer lands on Home with nothing showing, raises a new SOS, and you have a duplicate job.
- **Correct behaviour:** Include `pending` in the customer session and show "Finding a technician".
- **Launch blocker:** **YES**

### 46. The assigned technician rejects the job ✅ (fix/ws-bc-realtime)
- **What happens:** The server emits `jobReassigning` (`technicianController.js:797-803`). The customer app has no listener for it and no push is sent.
- **Customer expects:** To know the technician changed.
- **Business needs:** The customer doesn't call the old technician.
- **Handled?** **BROKEN.**
- **If not handled:** The tracking screen keeps showing the old technician's name, phone and frozen pin.
- **Correct behaviour:** Listen for the event, show "Finding another technician", and push it.
- **Launch blocker:** PRE-SCALE

### 47. Dispatch reassigns to a new technician ✅ (fix/ws-bc-realtime)
- **What happens:** The customer gets `technicianAssigned`, but the tracking screen has no handler for it (`technician_tracking_screen.dart:603-670`).
- **Customer expects:** The new technician's name and location.
- **Business needs:** The correct contact shown.
- **Handled?** **PARTIAL.**
- **If not handled:** In the `arrived` phase, the screen shows "arrived" for a technician who has gone.
- **Correct behaviour:** On assignment, reload the job and reset the tracking phase.
- **Launch blocker:** PRE-SCALE

### 48. The technician cancels mid-job (breakdown, accident)
- **What happens:** The technician cancel path (`API/controllers/jobController.js:952-1076`) leaves the SOS `accepted`. Nothing re-opens it for dispatch.
- **Customer expects:** Another technician sent.
- **Business needs:** The emergency doesn't silently drop.
- **Handled?** **BROKEN.**
- **If not handled:** The job is cancelled, the SOS looks handled, and the customer is still stranded with no one assigned.
- **Correct behaviour:** A technician cancel puts the job back to `pending` for re-dispatch, alerts admin, and tells the customer "Assigning a new technician".
- **Launch blocker:** **YES**

### 49. Admin puts the job on hold (parts awaited, garage closed) ✅ (fix/ws-bc-realtime)
- **What happens:** `putJobOnHold` and `resume` send nothing to the customer (`SH/services/jobHold.js`, `ADM/controllers/jobController.js:914-996`). There is no `on_hold` event in the app.
- **Customer expects:** To be told it's paused and why.
- **Business needs:** Fewer "where is my technician" calls.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The customer stares at "en route" for hours.
- **Correct behaviour:** Send a push, a socket event and an inbox entry for hold and resume, with the hold reason in customer-friendly wording.
- **Launch blocker:** PRE-SCALE

### 50. Dispatcher presses Cancel in the admin portal
- **What happens:** The admin app posts to `/jobs/:id/cancel` (`clicks-admin/lib/features/jobs/job_detail_screen.dart:671-674`). **That route does not exist** in `ADM/routes/jobs.js` **[verified]**, so the request returns 404. The fallback, `PUT /jobs/:id` with `job_status=cancelled`, notifies neither the customer nor the technician.
- **Customer expects:** To be told the job is cancelled.
- **Business needs:** The technician stops driving.
- **Handled?** **BROKEN.**
- **If not handled:** Dispatchers can't cancel. When they find the PUT workaround, the customer and technician both keep going.
- **Correct behaviour:** Add one admin cancel endpoint that reuses the customer and technician cancel logic: conditional update, SOS outcome, ServiceRequest state, notifications, payment guard.
- **Launch blocker:** **YES**

### 51. Admin cancels or deletes a paid job
- **What happens:** `PUT` can set `cancelled` with no payment check (`ADM/controllers/jobController.js:71-93, 541-560`). `deleteJob` hard-deletes a paid job, leaving its receipt and earnings orphaned (`:798-800`).
- **Customer expects:** A refund if they didn't get the service.
- **Business needs:** Revenue that reconciles.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The job is paid and cancelled, with no refund record, and the money still counts as revenue. Or the receipt points at a job that no longer exists.
- **Correct behaviour:** Block cancelling or deleting a paid job without a refund decision. Replace hard delete with soft delete.
- **Launch blocker:** **YES**

### 52. The car is sent to a garage, or the garage reports it ready ✅ (fix/ws-bc-realtime)
- **What happens:** `jobAtGarage` and `jobGarageReady` are sent over the socket only, with no push (`ADM/controllers/jobController.js:1228-1300`).
- **Customer expects:** To be told where the car is and when to collect it.
- **Business needs:** Fewer status calls.
- **Handled?** **PARTIAL.**
- **If not handled:** A customer whose app is closed never learns the car is ready.
- **Correct behaviour:** Push both events and add them to the inbox.
- **Launch blocker:** NO

---

## E. Scheduled bookings (53–57)

### 53. A scheduled booking times out and the customer submits again
- **What happens:** Duplicate checks run only for `timing === "immediate"` (`API/controllers/serviceRequestController.js:139-164`). There is no idempotency key and no unique index. Each request also creates a Lead (`:232`).
- **Customer expects:** One booking.
- **Business needs:** No duplicate appointments or duplicate Leads.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Two technicians booked for the same slot, and lead and conversion metrics inflated.
- **Correct behaviour:** The client sends an idempotency key. The server rejects an identical booking for the same customer, vehicle and slot within a short window.
- **Launch blocker:** PRE-SCALE

### 54. The scheduled job is completed (or cancelled), and the customer opens the app the next day
- **What happens:** The only status written to a ServiceRequest is `assigned` (`createJobRecord.js:152-160`). **[verified: no other writer in either API]** Because `findActiveServiceRequest` counts `assigned`, **every app launch from then on** opens the waiting screen, which polls every 5 seconds forever (`service_waiting_screen.dart:68`). Cancel fails with "Only pending service requests can be cancelled".
- **Customer expects:** A normal home screen.
- **Business needs:** Accurate request states, and not being hammered by polling.
- **Handled?** **BROKEN.**
- **If not handled:** Every customer who ever books a scheduled service is permanently stuck on a waiting screen. That reads as an app bug and leads to uninstalls, plus a growing stream of polling traffic.
- **Correct behaviour:** When a job completes or is cancelled, also move its ServiceRequest to completed or cancelled. Backfill existing rows. Exclude finished jobs from the "active request" check.
- **Launch blocker:** **YES**

### 55. Customer books a service for next week
- **What happens:** A scheduled booking counts as an active session, so every launch opens the polling waiting screen (`session_resume.dart:137-150`).
- **Customer expects:** To use the app normally, with the booking listed under Activity.
- **Business needs:** Customers can still raise SOS or browse.
- **Handled?** **BROKEN.**
- **If not handled:** The app is stuck on a waiting screen for days.
- **Correct behaviour:** Only route into the waiting flow for immediate requests, or within about an hour of the scheduled slot. Otherwise show a "Upcoming booking" card on Home.
- **Launch blocker:** **YES** (same fix as 54)

### 56. Customer wants to book next week's service while a tow is in progress
- **What happens:** A scheduled booking is blocked by **any** live job (`customerBookingGuard.js:91-109`), yet a new SOS is allowed next to a live job for another vehicle.
- **Customer expects:** To book future work.
- **Business needs:** To capture future revenue.
- **Handled?** **PARTIAL.** The rules are inconsistent.
- **If not handled:** A lost booking.
- **Correct behaviour:** Allow future bookings on any vehicle without a live job. Make the rules consistent and documented.
- **Launch blocker:** NO

### 57. Customer tries to cancel a `pending` (unassigned) or `on_hold` job
- **What happens:** Customer cancel doesn't allow these statuses and says "Work has already started" (`SH/utils/customerCancelPolicy.js:6-17`).
- **Customer expects:** A free cancel. Nothing has started.
- **Business needs:** Accurate messaging.
- **Handled?** **BROKEN** (wrong message, wrong rule).
- **If not handled:** A customer can't cancel a job no technician has touched, and calls support.
- **Correct behaviour:** Allow a free customer cancel on `pending`. Route `on_hold` to "contact support" with the correct wording.
- **Launch blocker:** NO

---

## F. Live tracking and job progress (58–68)

### 58. The customer loses signal (basement car park, desert) and the technician arrives, starts or completes meanwhile ✅ (fix/ws-bc-realtime)
- **What happens:** On reconnect the app only re-registers (`customer_socket_service.dart:88-91`). There is no event replay and no session re-fetch. The tracking poll runs only in `en_route`, reads only location, and ignores status (`technician_tracking_screen.dart:183-221`).
- **Customer expects:** The screen catches up.
- **Business needs:** The customer sees the same state as ops.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The customer stays on "en route" after the technician has arrived, phones the technician, and a "cancelled" or "completed" event may never be seen.
- **Correct behaviour:** On every reconnect and every app resume, re-fetch `/customer/session` and route from it. The tracking poll should also read `job_status`.
- **Launch blocker:** **YES**

### 59. The technician's phone dies, or their app is killed ✅ (fix/ws-bc-realtime)
- **What happens:** Locations are relayed only when they change. The `timestamp` is ignored by the customer app. Staleness detection exists only for admins (`SOCK:316-338`).
- **Customer expects:** To know whether the technician is moving.
- **Business needs:** No false ETA.
- **Handled?** **NOT HANDLED.**
- **If not handled:** A frozen pin and a countdown ETA, followed by an angry customer.
- **Correct behaviour:** Show "Last updated 4 min ago" after about 60 seconds with no update, and hide the ETA.
- **Launch blocker:** PRE-SCALE

### 60. The ETA shows "6 min" across Doha at rush hour
- **What happens:** The ETA is straight-line distance at 40 km/h (`technician_tracking_screen.dart:519-529`). The route line calls Google Directions directly from the phone with the embedded key, on every move over 25 m and every 5-second poll. Failures are swallowed.
- **Customer expects:** A realistic ETA.
- **Business needs:** Honest promises, a controlled Maps bill, and a key that can't be extracted.
- **Handled?** **PARTIAL.**
- **If not handled:** ETA disputes. The Directions bill scales with every job. The key can be extracted and abused.
- **Correct behaviour:** Get the ETA from the server-side Directions proxy (`mapsController`), throttled to about 30 seconds. Restrict the Maps key by app signature. Label the ETA "approx."
- **Launch blocker:** PRE-SCALE. Restrict the key before launch.

### 61. The customer's own location wasn't captured ✅ (fix/ws-bc-realtime)
- **What happens:** It silently defaults to central Doha (`session_resume.dart:18-19, 62`).
- **Customer expects:** A correct map.
- **Business needs:** No false ETA.
- **Handled?** **BROKEN.**
- **If not handled:** The ETA is computed to the wrong place.
- **Correct behaviour:** Use the job's stored coordinates. If there are none, hide the ETA.
- **Launch blocker:** NO

### 62. Customer has two live jobs (two cars) ✅ (fix/ws-bc-realtime)
- **What happens:** No screen filters events by job id. Any `JobCancelled` sends the timer and in-call screens Home, and any `JobCompleted` opens the rating sheet (`timer_sos_screen.dart:37-45`, `in_call_screen.dart:56-96`, `job_in_progress_screen.dart:160`).
- **Customer expects:** Each job tracked separately.
- **Business needs:** Ratings and payments attached to the right job.
- **Handled?** **BROKEN.**
- **If not handled:** A live SOS is abandoned in the UI, and a rating is posted against the wrong job.
- **Correct behaviour:** Every listener checks `event.job_id` or `sos_id` against the screen's own id.
- **Launch blocker:** PRE-SCALE. It becomes a blocker if scenario 35 isn't capped.

### 63. Customer reopens the app on an `assigned` job and sees "Cancel (fee)" ✅ (fix/ws-bc-realtime)
- **What happens:** `trackingInitialPhase('assigned')` returns `en_route` (`session_resume.dart:275-279`), so the fee warning shows, though the server treats `assigned` as free.
- **Customer expects:** Accurate fee information.
- **Business needs:** No false charges and no disputes.
- **Handled?** **BROKEN** (UI).
- **If not handled:** The customer stays with a slow job out of fear of a fee that doesn't exist, or disputes it.
- **Correct behaviour:** Map `assigned` to its own phase. Derive the fee note from the server's cancel policy.
- **Launch blocker:** NO

### 64. Customer cancels after the technician is en route
- **What happens:** `cancel_fee_due` is set to true. There is no amount, no charge, and no display. No payment path accepts a cancelled job (`skc:25`).
- **Customer expects:** To be told the fee, if any.
- **Business needs:** The fee collected, or a deliberate decision to waive it.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The app threatens a fee that nobody ever collects, or ops chases it by phone without a record.
- **Correct behaviour:** Either drop the fee from the UI for launch, or implement it properly: amount, display, a payment path, and a receipt.
- **Launch blocker:** NO. Remove the threat if it isn't real.

### 65. The API is redeployed during an active job ✅ (fix/ws-bc-realtime: covered by the resync on reconnect/resume)
- **What happens:** SIGTERM disconnects all sockets and in-memory maps are lost. Customers reconnect, but with the missed-event gap from scenario 58 and the spinner risk from scenario 30.
- **Customer expects:** No interruption.
- **Business needs:** To deploy safely during the day.
- **Handled?** **PARTIAL.**
- **If not handled:** Every deploy can leave active customers on stale screens.
- **Correct behaviour:** The fix for scenario 58 (re-fetch on reconnect) solves most of it. Deploy at low-traffic hours until then.
- **Launch blocker:** Covered by 58.

### 66. Railway runs two instances, or zero-downtime deploys overlap ◐ partial (fix/ws-fhi-identity: boot assertion + Railway pin; Redis adapter later)
- **What happens:** Without `REDIS_URL`, the in-memory adapter is used (`API/utils/socketAdapter.js:503-514`). `adminNamespace.emit('newSOSRequest')` then reaches only the dispatchers on the same instance, and nothing pins the replica count to 1 (`railway.tech.toml`).
- **Customer expects:** The SOS is seen.
- **Business needs:** Every dispatcher sees every SOS.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Half the dispatchers never see half the SOS requests. Live tracking freezes for customers on the "other" instance.
- **Correct behaviour:** Pin replicas to 1 and disable deploy overlap for the tech API, or turn on the Redis adapter. Fail the boot when more than one instance is detected without Redis.
- **Launch blocker:** **YES** (configuration check)

### 67. The database is slow when the customer opens the app ✅ (fix/ws-fhi-identity)
- **What happens:** Dio accepts every status below 600 (`dio_helper.dart:19`). `getCustomerSession` returns `{error: …}` as if it were a session, so resume falls through to Home. Raw Mongo messages such as "buffering timed out" reach users.
- **Customer expects:** "Having trouble connecting, retrying…"
- **Business needs:** A live job is never hidden.
- **Handled?** **PARTIAL.**
- **If not handled:** A customer with a technician on the way sees an empty Home screen and raises a second SOS.
- **Correct behaviour:** Treat non-2xx as an error, show a retry state, and never route to Home on an error.
- **Launch blocker:** **YES** (cheap fix, prevents duplicates)

### 68. A cross-service notification fails during a deploy ✅ (fix/ws-bc-realtime: admin → tech API notifies go through the outbox)
- **What happens:** The admin API calls the customer/technician API (`notify-claim`, `notify-outcome`, `notify-technician`) with axios, with no timeout and no retry (`ADM/controllers/sosController.js:143-156`, `ADM/controllers/jobController.js:311-316`).
- **Customer expects:** "Operator will call you."
- **Business needs:** The technician gets the job alert.
- **Handled?** **PARTIAL.**
- **If not handled:** The customer isn't told, and the technician isn't alerted to a new job. Nobody notices until the customer calls.
- **Correct behaviour:** Send these through the existing outbox, with retries and a timeout.
- **Launch blocker:** PRE-SCALE

---

## G. Notifications (69–76)

### 69. iOS customer has the app in the background or closed ◐ partial (fix/ws-bc-realtime: notification + apns blocks sent; needs a real-iPhone check)
- **What happens:** Customer pushes are **data-only**, with no `notification` block and no `apns` block (`API/services/fcmService.js:245-251`). **[verified]** iOS does not show data-only messages while the app is backgrounded or closed. The technician push uses the correct combined format.
- **Customer expects:** "Your technician has arrived" on the lock screen.
- **Business needs:** iOS customers informed.
- **Handled?** **BROKEN on iOS.** Also unreliable on Android when OEM battery savers kill the app.
- **If not handled:** iPhone users, who are likely a large share of the market, get **no** push notifications at all.
- **Correct behaviour:** Send a `notification` block plus an `apns` block (alert, sound, `content-available`) alongside the data, and test on a real iPhone. Use a high-priority notification message on Android too.
- **Launch blocker:** **YES**

### 70. A push token rotates, and an old-token error arrives later ✅ (fix/ws-fhi-identity)
- **What happens:** On `not-registered`, `fcm_token` is set to null **without checking which token failed** (`fcmService.js:178-186, 258-263`).
- **Customer expects:** Pushes keep working.
- **Business needs:** Delivery that is reliable.
- **Handled?** **BROKEN.**
- **If not handled:** A valid new token gets wiped and all later pushes are skipped, with only a log line.
- **Correct behaviour:** Clear the token with a condition: `updateOne({_id, fcm_token: failedToken}, {$unset})`.
- **Launch blocker:** NO (one-line fix, do it)

### 71. Customer pays cash and the technician confirms it ✅ (fix/ws-bc-realtime)
- **What happens:** The REST confirmation pushes `paymentConfirmed` using `pricing.total`. The technician app then emits the socket `paymentReceived`, whose "idempotent" branch pushes again using `job.price` (`SOCK:1602-1639`).
- **Customer expects:** One "paid" notification with the right amount.
- **Business needs:** No contradictory amounts.
- **Handled?** **BROKEN.**
- **If not handled:** Two notifications showing **different amounts**, and a customer who calls to ask which one they paid.
- **Correct behaviour:** Notify only from the code path that actually changes the state. Use `pricing.total` everywhere.
- **Launch blocker:** PRE-SCALE

### 72. Customer taps a notification while the app is closed ✅ (fix/ws-bc-realtime)
- **What happens:** The tap is lost, because `getNotificationAppLaunchDetails` is never called and the shown notification is a local one (`fcm_notification_service.dart:142-145`). The router ignores the `job_id` the notification carries. A `sosInCall` tap opens the in-call screen even for an SOS that has since been cancelled.
- **Customer expects:** To land on that job.
- **Business needs:** Correct routing.
- **Handled?** **PARTIAL.**
- **If not handled:** The customer lands on the wrong screen, or a dead SOS screen.
- **Correct behaviour:** Read the launch details, fetch the job by `job_id`, and route by its current status.
- **Launch blocker:** PRE-SCALE

### 73. The notification inbox shows something different from what was pushed ✅ (fix/ws-bc-realtime)
- **What happens:**
  - The inbox row is written fire-and-forget, separately from the push.
  - Events sent only over the socket leave no inbox row.
  - In the foreground every push also raises a banner, even when the screen already updated.
  - Each push gets its own tray entry (`message.hashCode`), so one job produces 6–8 entries.
- **Customer expects:** A clean, complete history.
- **Business needs:** A record of what the customer was told, for disputes.
- **Handled?** **PARTIAL.**
- **If not handled:** "I was never told." Ops cannot prove otherwise.
- **Correct behaviour:** One `notifyCustomer()` function that writes the inbox row, then pushes and emits. Use a tray tag per job so entries replace each other.
- **Launch blocker:** NO

### 74. An event the customer needs only goes out over the socket ✅ (fix/ws-bc-realtime)
- **What happens:** These events have no push:
  - socket-path `technicianEnRoute` and `jobStarted` (`SOCK:1350, 1545`)
  - admin `adminCancelJob` (`SOCK:818`, and only if the client sends `customer_id`)
  - `sosScheduled`, `sosClosed` and `sosExpired`
  - `sosCancelled` reaches only the socket that cancelled.
- **Customer expects:** To be notified whatever path changed the job.
- **Business needs:** Notifications that don't depend on which button a technician used.
- **Handled?** **PARTIAL.**
- **If not handled:** Whether a customer is told depends on whether the technician used the REST or the socket path.
- **Correct behaviour:** Route every state change through one notifier.
- **Launch blocker:** PRE-SCALE

### 75. The customer has notifications disabled
- **What happens:** The server is never told, and there is no SMS fallback for critical events.
- **Customer expects:** Not applicable; they opted out.
- **Business needs:** Critical events (technician arrived, payment due) still reach the customer.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The technician waits at the car and the customer never knows they've arrived.
- **Correct behaviour:** At SOS time, ask the customer to allow notifications. For "arrived", send an SMS fallback when the push can't be delivered.
- **Launch blocker:** NO

### 76. An admin completes the job, or the customer was offline at completion ✅ (fix/ws-bc-realtime)
- **What happens:** Admin `completeJob` sends no customer event. The rating prompt only appears if a live `JobCompleted` arrives while the tracking screen is open. Resume ignores paid completed jobs. The server allows unlimited re-rating and rating of unpaid jobs (`API/controllers/jobController.js:291-331`).
- **Customer expects:** To be told the job is done and asked once for a rating.
- **Business needs:** Rating data that is complete and trustworthy, since it feeds technician performance.
- **Handled?** **PARTIAL.**
- **If not handled:** Most ratings are missed and the ones you do get can be overwritten.
- **Correct behaviour:** Resume should check for a paid, unrated job and prompt once. The server allows one rating per job (editable for 24 hours at most).
- **Launch blocker:** NO

---

## H. Payments (77–92)

### 77. Customer is shown "Pay QAR 150" and SkipCash charges QAR 230
- **What happens:** The app shows `job.price`, truncated to an integer (`session_resume.dart:245-249`, `job_in_progress_screen.dart:288-289`, `payment_hold_screen.dart:29,135`). The server charges `pricing.total`, which is base + repairs − membership discount (`skc:62-73`).
- **Customer expects:** To pay what they were shown.
- **Business needs:** No chargebacks.
- **Handled?** **BROKEN.**
- **If not handled:** Every job with a repair or a member discount displays the wrong amount. A covered member sees "QAR 150" and then is told nothing is due.
- **Correct behaviour:** The app shows the server's `pricing.total`, with line items, before opening checkout. It is never truncated to an integer.
- **Launch blocker:** **YES**

### 78. The technician adds a part after the customer opened the payment page
- **What happens:**
  - `createSession` creates a new payment because the amount changed, but the old pay URL stays live (`skc:132`).
  - If the customer pays the old link, the webhook recomputes today's total and rejects it with 409 `AMOUNT_MISMATCH` (`skc:337-343`), and SkipCash retries forever.
  - `getStatus` looks only at the newest payment id.
- **Customer expects:** Paid means paid.
- **Business needs:** No money in limbo.
- **Handled?** **BROKEN.**
- **If not handled:** The customer has been charged, the job stays unpaid, and the customer is stuck in payment hold and blocked from future SOS (scenario 91). Nobody can see the money.
- **Correct behaviour:**
  - Freeze the price once a payment session exists. Adding a repair then requires cancelling the session first.
  - Accept a webhook for **any** payment id ever issued for the job, and record it.
  - If the amount differs, mark the job "paid, amount mismatch" for finance review instead of rejecting.
- **Launch blocker:** **YES**

### 79. Customer opens checkout on two devices, taps Back and Pay again, or double-taps
- **What happens:** `createSession` has no lock, and each call creates a SkipCash payment (`skc:161`). **[verified]** Only the last payment id is stored. When the second "paid" webhook arrives, it finds the job already paid and returns without recording anything (`API/services/applyJobPayment.js:32-38`). **[verified]**
- **Customer expects:** To be charged once.
- **Business needs:** Every charge recorded.
- **Handled?** **NOT HANDLED.**
- **If not handled:** A **double charge that leaves no trace in the database**. The customer sees two debits, and finance has no record of the second.
- **Correct behaviour:**
  - Add a `PaymentAttempt` collection: one row per SkipCash payment id, every webhook appended.
  - Lock checkout per job, and reuse a pending session rather than creating a new one.
  - Raise a "duplicate capture, refund needed" alert when a paid webhook arrives for an already-paid job.
- **Launch blocker:** **YES**

### 80. The card webhook is delayed, so the technician collects cash as well
- **What happens:** `confirmPayment` marks the job paid without checking for a pending card session, using a plain `job.save()` (`API/controllers/jobController.js:1099-1117`). **[verified]** The late card webhook is then ignored silently.
- **Customer expects:** To pay once.
- **Business needs:** No double collection.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The customer has paid twice and the ledger shows only the cash payment.
- **Correct behaviour:** Block `confirmPayment` while a card session is pending until the technician explicitly cancels it, after a live check against SkipCash. Record the ignored webhook as a duplicate needing a refund.
- **Launch blocker:** **YES**

### 81. The webhook secret is wrong in Railway ✅ (fix/ws-de-money + verified in fix/ws-bc-realtime: webhook 401 and failed outbox events report to Sentry)
- **What happens:** The secret falls back to `KEY_SECRET` (`SH/utils/skipcash.js:149`). If SkipCash signs with a different key, every webhook returns 401. Payment then works only through app polling, and nothing alerts anyone.
- **Customer expects:** Not applicable; they don't see it.
- **Business needs:** To know payment confirmation is broken.
- **Handled?** **PARTIAL.**
- **If not handled:** Payments confirm only when the customer's app is open. Every customer who closes the app after paying stays "unpaid".
- **Correct behaviour:** Require `SKIPCASH_WEBHOOK_SECRET` in production. Alert on any 401 from the webhook. Send a test webhook before launch.
- **Launch blocker:** **YES** (configuration check)

### 82. Customer pays and closes the WebView, and the webhook is lost
- **What happens:** Recovery happens only when the customer taps Pay again (`skc:131-159`), and then only if the amount hasn't changed. There is no reconciliation job, and the technician app can't trigger a re-check.
- **Customer expects:** The payment to register.
- **Business needs:** Paid and unpaid always reflect SkipCash.
- **Handled?** **NOT HANDLED.**
- **If not handled:** The technician can't complete the job, so they collect cash, which leads to scenario 80.
- **Correct behaviour:**
  - Run a sweep every 5 minutes that calls `getPayment` for every unsettled payment attempt younger than 48 hours.
  - Give the technician a "re-check card payment" button.
  - Run a daily reconciliation against the SkipCash settlement report.
- **Launch blocker:** **YES**

### 83. Customer needs a refund (overcharge, double charge, service not delivered)
- **What happens:** There is no refund endpoint, model or state. `payment_status` is only `unpaid` or `paid` (`SH/models/Job.js:59-63`). Error messages tell users to "request a refund", but no such path exists.
- **Customer expects:** A refund, with confirmation.
- **Business needs:** Refunds tracked, approved and reconciled.
- **Handled?** **NOT HANDLED.**
- **If not handled:** Refunds happen in the SkipCash portal with no record in Clicks. Revenue and receipts stay wrong, and nobody can answer the customer.
- **Correct behaviour:**
  - Add `refunded` and `partially_refunded` states.
  - Add an admin refund action, with an approval role and an audit row.
  - Link it to the SkipCash refund id.
  - Void or credit-note the receipt.
- **Launch blocker:** **YES** (card payments must not launch without it)

### 84. A failed or refunded webhook arrives after a successful one
- **What happens:** It overwrites `skipcash.status_id` on a job that is already paid (`skc:325-334`). There's no event log.
- **Customer expects:** Not applicable.
- **Business needs:** A correct record of what SkipCash says.
- **Handled?** **PARTIAL.**
- **If not handled:** The job reads `paid`, with `status_id` showing refunded, and nobody notices.
- **Correct behaviour:** Append every webhook to the payment attempt. Never let a lower-state webhook overwrite a paid one. A refund webhook creates a refund record and an alert.
- **Launch blocker:** Covered by 79 and 83.

### 85. The technician collects cash but marks it "card"
- **What happens:** `confirmPayment` accepts `card`, `wallet` or `fawran` with no reference (`jobController.js:1111-1115`). The cash the technician owes then calculates to 0 (`SH/services/technicianCredit.js:23-24`), and the finance settlement counts the job as card.
- **Customer expects:** Not applicable.
- **Business needs:** Cash collected by technicians is fully accounted for.
- **Handled?** **BROKEN.**
- **If not handled:** A technician can take cash and never owe it, and finance has no way to detect it.
- **Correct behaviour:** A technician can confirm **cash only**. Card, wallet and Fawran must be confirmed by the provider, or by finance with a reference number.
- **Launch blocker:** **YES** (fraud vector)

### 86. The technician adds a negative line item, or adds items after payment
- **What happens:** `addRepairProcedure` has no status or payment check, and price and quantity have no minimum (`jobController.js:846-895`, `SH/models/RepairProcedure.js:11-15`). The PDF rebuilds line items from the current repairs, while the total stays frozen.
- **Customer expects:** A receipt whose lines add up.
- **Business needs:** Line items that can't be tampered with.
- **Handled?** **BROKEN.**
- **If not handled:** Discounts the business never approved, and receipts whose lines don't add up to the total.
- **Correct behaviour:** Require price > 0 and quantity ≥ 1. Lock repairs once the job is paid or completed. Snapshot the line items into the receipt.
- **Launch blocker:** PRE-SCALE

### 87. The technician sets the price with no customer approval
- **What happens:** The technician sets any price up to QAR 100,000 (`jobController.js:1465`). There is no customer-approval step.
- **Customer expects:** To approve a quote before work starts.
- **Business needs:** Fewer disputes and chargebacks.
- **Handled?** **NOT HANDLED.**
- **If not handled:** "I was never told it would cost this much." Chargebacks follow, and there is no evidence to contest them.
- **Correct behaviour:** Send the quote to the customer for one-tap approval, with a timestamp and evidence, before `in_progress`. Use a price list per service type, with limits that need admin approval above them.
- **Launch blocker:** PRE-SCALE. Decide the policy before launch.

### 88. Cash dispute: the customer says they paid, the technician says they didn't
- **What happens:** The customer's "pay cash" only sets a method. There's no acknowledgement from the customer, no proof, and no dispute state.
- **Customer expects:** Proof of payment.
- **Business needs:** A way to resolve it.
- **Handled?** **PARTIAL.** A receipt is issued once the technician confirms.
- **If not handled:** It's one person's word against the other's, with no record.
- **Correct behaviour:** After cash is confirmed, the customer gets a push: "Did you pay QAR X in cash? Yes / Report a problem". "Report" opens a dispute for finance.
- **Launch blocker:** NO

### 89. A member's job is fully covered (total QAR 0)
- **What happens:** Completion marks the job paid but leaves `payment_method` unset, which is treated as cash (`jobController.js:545-548`). The credit then falls back to `job.price` (`technicianCredit.js:29-30`).
- **Customer expects:** Nothing to pay.
- **Business needs:** The technician owes nothing.
- **Handled?** **BROKEN.**
- **If not handled:** The technician's cash balance grows by a call-out fee they never collected. Settlement disputes start in week one.
- **Correct behaviour:** Set `payment_method: "membership"` with collected amount 0, and treat 0 as a valid total.
- **Launch blocker:** **YES** (if memberships launch)

### 90. Admin completes a member's QAR 0 job
- **What happens:** Admin `completeJob` doesn't mark a QAR 0 job paid. The customer gets payment hold. `createSession` returns "no amount to collect", pay-cash changes nothing, and admin has no "mark paid" action.
- **Customer expects:** No hold, since nothing is owed.
- **Business needs:** No trapped customers.
- **Handled?** **BROKEN.**
- **If not handled:** The customer is blocked from SOS permanently, and only the original technician can release them.
- **Correct behaviour:** Reuse the technician path's QAR 0 rule in admin complete. Add an audited admin "mark paid / waive" action.
- **Launch blocker:** **YES**

### 91. Customer owes money on an old job and now has a new emergency
- **What happens:** `UNPAID_JOB_HOLD` blocks a new SOS (`customerBookingGuard.js:120-127`).
- **Customer expects:** To get help now and pay later.
- **Business needs:** To collect the debt, **and** not abandon someone stranded at night, which is a safety and reputation risk.
- **Handled?** **HANDLED** as designed, but it is a business-policy risk, made worse by the false holds in 78 and 90.
- **If not handled:** A customer who has actually paid (78) or owes nothing (90) is refused an emergency service.
- **Correct behaviour:** **A product decision you need to make.** Recommended: allow the SOS but show the outstanding balance, and let dispatch collect both. Always show a call number.
- **Launch blocker:** **YES** (decide the policy)

### 92. Cancellation fee or partial-service charge
- **What happens:** See scenario 64. It's a flag only.
- **Handled?** **NOT HANDLED.**
- **Launch blocker:** NO (remove it from the UI or build it)

---

## I. Membership (93–97)

### 93. Customer opens membership checkout twice, then pays the first link
- **What happens:** Each checkout cancels earlier `pending_payment` subscriptions (`API/controllers/membershipController.js:196-202`). **[verified]** When the first link is paid, activation sees `cancelled`, saves the payment, and **doesn't activate** (`SH/services/membershipEntitlement.js:249-252`). **[verified]** `getStatus` still returns `payment_status: "paid"`, and the app shows success.
- **Customer expects:** An active membership.
- **Business needs:** No money taken without the service delivered.
- **Handled?** **BROKEN.**
- **If not handled:** The customer is charged, sees "success", and has no membership. They find out at the roadside.
- **Correct behaviour:** Don't cancel pending subscriptions that have a live payment session. Activate any paid subscription unless another is already active. In that case, flag it for a refund and tell the customer.
- **Launch blocker:** **YES** (if memberships launch)

### 94. Two membership checkouts race (double tap)
- **What happens:** The second activation hits the unique "one active per vehicle" index, so the webhook returns 500 forever.
- **Handled?** **BROKEN.**
- **If not handled:** The customer is charged twice, and SkipCash retries a 500 endlessly.
- **Correct behaviour:** Lock checkout per vehicle. A paid duplicate becomes a refund case (scenario 83).
- **Launch blocker:** **YES** (same fix as 93)

### 95. A member with 1 free service books 3 jobs at once
- **What happens:** Coverage is decided when each request is created and usage is counted only at completion (`serviceRequestController.js:199`, `membershipEntitlement.js:186-233`). The counter is a read, modify, save, so two concurrent completions can lose a count.
- **Customer expects:** Benefits as advertised.
- **Business needs:** Quota enforced.
- **Handled?** **BROKEN.**
- **If not handled:** The customer gets unlimited free services.
- **Correct behaviour:** Reserve the quota atomically at job creation with `$inc` guarded by a `$lt` limit, and release it on cancel.
- **Launch blocker:** PRE-SCALE

### 96. Customer cancels their membership
- **What happens:** It's immediate, with no refund, no proration, no confirmation of terms and no audit (`membershipController.js:354-383`).
- **Customer expects:** To know what they lose, and possibly a refund.
- **Business needs:** A clear policy, and compliance with consumer protection.
- **Handled?** **PARTIAL.**
- **If not handled:** Disputes and chargebacks.
- **Correct behaviour:** Confirm the terms on screen, cancel at period end by default, and add an audit row.
- **Launch blocker:** NO

### 97. A member raises an SOS expecting it to be covered
- **What happens:** Emergency types (SOS, towing, jump start) are **never** covered (`membershipEntitlement.js:5-20`). Separately, the period end uses server-local `setMonth`, so 31 January + 1 month ≈ 3 March.
- **Customer expects:** "Roadside membership" covers roadside emergencies.
- **Business needs:** Marketing matches entitlement.
- **Handled?** **HANDLED** as coded. Whether it's the right policy is a product question.
- **If not handled:** The most likely complaint from members.
- **Correct behaviour:** Show "What's covered" on the plan screen and before SOS. Fix the month arithmetic.
- **Launch blocker:** NO. Confirm the policy and the copy.

---

## J. Records, history, support and privacy (98–100)

### 98. Finance audits receipts and money records
- **What happens:**
  - Receipt numbers are `REC-YYYYMMDD-<last 4 hex of ObjectId>` (`SH/services/receiptPdf.js:118-122`), which is neither unique nor sequential.
  - A paid job can have no receipt (card paid with no technician; admin complete swallows the error).
  - Receipts store no payment method and no transaction id.
  - Outbox events that fail permanently get a Sentry alert, but there's no admin view and no replay (`SH/services/outboxWorker.js:68-87`).
  - Finance "pending" totals ignore membership discounts (`ADM/controllers/financeOverviewController.js:73-121`).
  - Admin `PUT` completion skips the technician credit, the receipt and membership usage.
- **Customer expects:** A valid receipt.
- **Business needs:** Books that reconcile.
- **Handled?** **PARTIAL.**
- **If not handled:** Month-end figures that don't reconcile to SkipCash or to cash collected, with no trail to find out why.
- **Correct behaviour:** Use an atomic sequential receipt counter, and store the method and transaction id on the receipt. Add an admin page listing failed outbox events with a Replay button. Put every completion path through one shared `completeJob` service.
- **Launch blocker:** **YES** (one completion path, and receipt numbering)

### 99. Customer checks their job history and argues with the arrival time ✅ (fix/ws-fhi-identity)
- **What happens:** Activity times are parsed from UTC and never converted to local time (`APP/features/activity/models/job_history_response.dart:161`, with no `.toLocal()` in `APP/features/activity`). **[verified]** Every time shows 3 hours early.
- **Customer expects:** Correct times.
- **Business needs:** Credible records in disputes.
- **Handled?** **BROKEN.**
- **If not handled:** "Your app says the technician came at 6 AM when it was 9 AM."
- **Correct behaviour:** Call `.toLocal()` on every parsed server date.
- **Launch blocker:** **YES** (trivial fix)

### 100. Customer submits a complaint through Contact Us ✅ (fix/ws-fhi-identity)
- **What happens:**
  - Rows are saved, but the admin app calls a customer-only route and gets 403.
  - It reads the wrong response key, and calls `/contact-us/:id`, which doesn't exist.
  - The admin API has no contact-us endpoint at all.
  - The customer gets no confirmation, has no "my requests" view, and has no reply channel.
  - Categories are stored as translated text (`APP/features/settings/ui/view/contact_us_screen.dart:24-27`; `clicks-admin/lib/features/phase2/support_tickets_screen.dart:43-53`).
- **Customer expects:** A reply.
- **Business needs:** Complaints handled before they become reviews and chargebacks.
- **Handled?** **BROKEN.**
- **If not handled:** The customer sees "Sent!", **and no one at Clicks can ever read it.** Complaints, refund requests and disputes all vanish.
- **Correct behaviour:**
  - Add an admin endpoint and a working screen.
  - Store a stable category code.
  - Send the customer an SMS or push acknowledgement with a ticket number, plus a "my requests" list.
  - Alert on new tickets.
- **Launch blocker:** **YES**

### Additional privacy issue: customers can list every online technician
- **What happens:** `GET /api/jobs/technicians/nearby` is open to any customer token (`API/routes/jobRoutes.js:87`). **[verified]** It returns every online technician's name, phone and live coordinates. The radius has no upper bound, and with no coordinates given it returns all of them (`jobController.js:913-950`).
- **Handled?** **BROKEN** (privacy and staff safety).
- **If not handled:** Anyone who signs up can track your entire field workforce in real time and harvest their phone numbers.
- **Correct behaviour:** Remove customer access, or return only a count and an approximate distance. The app doesn't need names, phones or exact coordinates.
- **Launch blocker:** **YES.** It's listed separately so the 100 count stays intact. Treat it as one of the most urgent fixes.

---

## Launch-blocker list (45 scenarios + the technician exposure, about 30 distinct fixes)

**Identity:**
- 1: registration broken by the OTP gate
- 4: deletion with live jobs
- 6: takeover through the last-8-digit match
- 9: SMS failure detection
- 11: SMS pumping
- 12: forced logout mid-emergency
- 19: forced update

**Data integrity:**
- 24: vehicle mass assignment

**SOS:**
- 27: SOS flag configuration
- 29: duplicate SOS
- 30: lost SOS acknowledgement
- 31: stale GPS
- 37: after-hours honesty
- 38: no escalation
- 39: abandoned claim
- 41: wrong phone numbers

**Dispatch:**
- 42: double job
- 43: cancel/create race
- 44: SOS/Job divergence
- 45: pending job invisible
- 48: technician cancel drops the emergency
- 50: admin cancel 404
- 51: paid job cancel or delete

**Bookings:**
- 54/55: service request never reaches a final state

**Realtime:**
- 58: no resync
- 66: multi-instance
- 67: errors treated as a session

**Notifications:**
- 69: iOS push

**Money:**
- 77: wrong amount shown
- 78: stale pay link
- 79: untracked double charge
- 80: card + cash
- 81: webhook secret
- 82: reconciliation
- 83: refunds
- 85: technician method fraud
- 89/90: QAR 0 member jobs
- 91: unpaid-hold policy
- 93/94: membership charged, not active
- 98: completion paths and receipts

**Records and support:**
- 99: UTC times
- 100: Contact Us black hole

**Privacy:**
- technician location and phone exposure

**Cheap fixes (one or two lines each) to do first:**
- 24: whitelist vehicle fields
- 41: one support number
- 70: conditional FCM token clear
- 99: `.toLocal()`
- 67: treat non-2xx as an error
- 1: send `otp` in register
- the nearby-technicians route
- 6: restrict the last-8-digit fallback
- 3: add `deleted_at` to the schema

---

## The 20 scenarios that must be tested before launch

These are ranked by how likely each is to happen to a real customer in week one, multiplied by how bad it is when it does. Each one should be a written test case on real devices (one iPhone, one Android) against staging, using the live SkipCash sandbox.

| Rank | Test | Scenarios | Pass criteria |
|---|---|---|---|
| 1 | **Fresh-install sign-up end to end** with the release build against the release server | 1, 9, 19 | Account created. OTP received on a real SIM. The forced-update screen appears when min-version is raised. |
| 2 | **Unanswered SOS.** Raise an SOS and let no dispatcher touch it for 15 minutes | 38, 40, 37 | The escalation fires. The customer sees a call option and a truthful message. The admin screen shows the age. |
| 3 | **iPhone push with the app killed.** Run the full job and check the lock screen at each step | 69, 72, 74 | A banner for assigned, en route, arrived, completed and paid. Tapping opens the right job. |
| 4 | **Double charge.** Open checkout on two devices and pay both | 79 | The second capture is recorded and flagged for refund. Finance sees both. |
| 5 | **Price change mid-checkout.** Customer opens pay, technician adds a part, customer pays the old link | 78, 77 | The amount shown equals the amount charged. The payment is recorded and the customer isn't held. |
| 6 | **Card + cash.** Customer pays by card, webhook blocked, technician tries to confirm cash | 80, 82 | Blocked or reconciled. Never two collections. |
| 7 | **Webhook never arrives.** Pay, kill the app, block the webhook, wait for the sweep | 81, 82 | The job turns paid within 5 minutes without the customer acting. |
| 8 | **Membership double checkout.** Open checkout twice, pay the first | 93, 94 | Membership active, or an explicit refund flagged. Never "success" without activation. |
| 9 | **Two dispatchers on one SOS.** Both create a job within one second | 42, 44 | Exactly one job. The second gets a clear error. |
| 10 | **Cancel vs create race.** Customer cancels while the dispatcher saves the job | 43 | A consistent final state on all three apps. The technician is told. |
| 11 | **Network drop during SOS submit.** Airplane mode for 5 seconds right after tapping SOS | 30, 29 | The customer lands on their live SOS. One record. |
| 12 | **Network drop mid-job.** Customer offline through arrived → started → completed, then back online | 58, 76 | The screen shows the correct current state and the rating prompt within seconds. |
| 13 | **GPS denied or stale.** Deny location; separately, test indoors after a long time with no fix | 31 | The customer must confirm a pin. No stale coordinates are sent. |
| 14 | **Technician rejects, then a reassignment** | 46, 47, 48 | The customer sees "finding another technician", then the new technician's details. The SOS is never left orphaned. |
| 15 | **Admin cancel and hold from the portal** | 50, 49, 51 | Cancel works. Customer and technician are both notified. A paid job can't be cancelled without a refund decision. |
| 16 | **Scheduled booking lifecycle.** Book, complete, reopen the app next day; also book for next week | 54, 55, 53 | Normal Home with no waiting screen. A retry doesn't create a duplicate. |
| 17 | **Member QAR 0 job**, completed by the technician and separately by an admin | 89, 90 | No payment hold. The technician's cash balance doesn't change. |
| 18 | **Token expiry during a live job.** Set the expiry to 2 minutes on staging | 12 | The customer is never thrown to Login while a job is live. |
| 19 | **Password reset from a foreign number** sharing the last 8 digits of a test customer | 6, 11 | Reset refused. Sends capped per phone. |
| 20 | **Contact Us round trip.** Submit from the app, find it in admin, reply | 100 | Visible in admin within a minute, and the customer receives an acknowledgement. |

**Configuration checks to tick off alongside these, since they don't need a scenario:**
- `LAUNCH_PUBLIC_SOS=true`
- `SKIPCASH_WEBHOOK_SECRET` set, and a test webhook returns 200
- `SMS_PROVIDER=smsala`
- tech API replicas = 1 with no deploy overlap, or `REDIS_URL` set
- `CORS_ORIGINS` set
- `SENTRY_DSN` set on both APIs and in the app build
- Maps key restricted
- Notification TTL index present in Atlas
- One support phone number, test-called

---

## What this audit did not cover

- Live behaviour. No endpoint was called, so anything marked as config-dependent must be checked on Railway.
- Load. That is covered in `CLICKS_LOAD_SCALABILITY_AUDIT.md`.
- The technician app beyond the paths that affect the customer.
- Store-review requirements beyond account deletion.
- Legal review of the membership and refund terms.

Line numbers refer to the working tree on 7 November 2026, which includes uncommitted changes. They will drift as fixes land.
