# Recent Changes - clicks-user

## 2026-04-21

### OTP Registration Flow
- **File**: `lib/core/api/end_points.dart`
  - Fixed endpoint URLs:
    - `sendOtp` → `/api/customers/otp/send` (was `/api/otp/send`)
    - `verifyOtp` → `/api/customers/otp/verify` (was `/api/otp/verify`)

### Register Cubit
- **File**: `lib/features/auth/register/ui/cubit/register_cubit.dart`
  - Updated `sendOtpToPhone()`:
    - Calls real API endpoint (was stub)
    - Handles **HTTP 429 rate limit** response (shows "Too many attempts" error)
    - Returns error message from API response
  - Updated `verifyOtpCode()`:
    - Calls real API endpoint (was stub)
    - Checks status code and handles errors appropriately
  - Updated `validateOTP()`:
    - OTP length validation: **6 digits** (was 4)
    - Error message improved

### Register Screen
- **File**: `lib/features/auth/register/ui/view/register_screen.dart`
  - Step 1 "Next" button now calls `sendOtpToPhone()` instead of skipping to step 2
  - OTP confirmation button calls `verifyOtpCode()` instead of local validation only

### Register Step One View
- **File**: `lib/features/auth/register/ui/view/widgets/register_step_one_view.dart`
  - Added `import 'dart:async'` for timer functionality
  - Created `_OTPView` StatefulWidget with:
    - **60-second countdown timer** (starts on view mount)
    - Real-time countdown display: "55 seconds remaining..."
    - **Resend button** becomes clickable only when timer reaches 0
    - Auto-resets timer when user taps Resend
  - Updated `CustomOTPField` to accept **6-digit Pinput** (was 4 digits)
  - Phone number and location now display in OTP view for confirmation

### Translations
- **File**: `assets/translations/en.json`
  - Added: `"too_many_otp_attempts": "Too many attempts. Please try again in 1 hour."`
- **File**: `assets/translations/ar.json`
  - Added Arabic translation: محاولات كثيرة جداً. يرجى المحاولة مجدداً بعد ساعة.

---

## OTP Flow Summary

1. **Send OTP**
   - Customer enters phone → clicks "Next"
   - `sendOtpToPhone()` calls API
   - If 200: Shows OTP input screen with 60-second timer
   - If 429: Shows rate limit error (try again in 1 hour)

2. **Verify OTP**
   - Customer enters 6-digit code
   - Timer counts down; Resend button active after 60 seconds
   - Customer clicks "Confirm OTP"
   - `verifyOtpCode()` calls API
   - If 200: Advances to next registration step
   - If 429 or error: Shows error message

3. **Rate Limit Handling**
   - Max 3 OTP requests per phone per hour
   - After 3 attempts, must wait 1 hour (cooldown enforced on API)
   - App displays: "Too many attempts. Please try again in 1 hour."

---

## Files Modified
- `lib/core/api/end_points.dart` — Fixed OTP endpoint URLs
- `lib/features/auth/register/ui/cubit/register_cubit.dart` — Added real API calls + 429 handling
- `lib/features/auth/register/ui/view/register_screen.dart` — Wire OTP send/verify calls
- `lib/features/auth/register/ui/view/widgets/register_step_one_view.dart` — 60s timer + 6-digit OTP
- `assets/translations/en.json` — Added rate limit message
- `assets/translations/ar.json` — Added Arabic rate limit message

---

## Notes
- OTP code is **6 digits** (matches API generation)
- Countdown timer is **real-time** (60 seconds starting from mount)
- Resend functionality is client-side gated (server enforces 3-request limit)
- All error messages support i18n/localization
