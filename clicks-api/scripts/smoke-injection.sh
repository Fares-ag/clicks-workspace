#!/usr/bin/env bash
#
# Smoke test for the unauthenticated account-takeover hole (audit P0-1).
#
#   ./scripts/smoke-injection.sh https://stg-tech-api.clicks.qa [https://stg-admin-api.clicks.qa]
#
# Fires the real exploit payloads at every reset endpoint and asserts each one
# is refused. Run against staging after deploying stage 1.
#
# On the UNPATCHED code, the customer/technician endpoints return 200 for
# {"$gt":""} — that is the account takeover. On patched code every payload
# returns 400.

set -uo pipefail

TECH_API="${1:?usage: smoke-injection.sh <tech-api-url> [admin-api-url]}"
ADMIN_API="${2:-}"

PAYLOADS=('{"$gt":""}' '{"$ne":null}' '{"$regex":".*"}' '{"$exists":true}' '{"$nin":[]}')
PHONE="+97455512345"
EMAIL="nobody@example.invalid"

FAIL=0
PASS=0

check() {  # check <label> <actual_code> <expected_codes...>
  local label="$1" code="$2"; shift 2
  for want in "$@"; do
    if [ "$code" = "$want" ]; then
      PASS=$((PASS + 1)); printf '  PASS  %-58s %s\n' "$label" "$code"; return
    fi
  done
  FAIL=$((FAIL + 1)); printf '  FAIL  %-58s %s (want %s)\n' "$label" "$code" "$*"
}

post() {  # post <url> <json>
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
    -X POST "$1" -H 'Content-Type: application/json' -d "$2" 2>/dev/null || echo "000"
}

echo "=== operator injection: OTP verification ==="
for ep in customers technicians; do
  field="phone_number"; [ "$ep" = "technicians" ] && field="phone"
  for p in "${PAYLOADS[@]}"; do
    code=$(post "$TECH_API/api/$ep/verify-reset-otp" "{\"$field\":\"$PHONE\",\"otp\":$p}")
    check "/$ep/verify-reset-otp otp=$p" "$code" 400 429
  done
done

echo
echo "=== operator injection: password reset ==="
for ep in customers technicians; do
  field="phone_number"; [ "$ep" = "technicians" ] && field="phone"
  for p in "${PAYLOADS[@]}"; do
    code=$(post "$TECH_API/api/$ep/reset-password" \
      "{\"$field\":\"$PHONE\",\"otp\":$p,\"new_password\":\"Attacker1!\",\"confirm_password\":\"Attacker1!\"}")
    check "/$ep/reset-password otp=$p" "$code" 400 429
  done
done

echo
echo "=== operator injection: registration OTP ==="
for p in "${PAYLOADS[@]}"; do
  code=$(post "$TECH_API/api/customers/otp/verify" "{\"phone_number\":\"$PHONE\",\"otp\":$p}")
  check "/customers/otp/verify otp=$p" "$code" 400 429
  code=$(post "$TECH_API/api/technicians/otp/verify" "{\"phone\":\"$PHONE\",\"otp\":$p}")
  check "/technicians/otp/verify otp=$p" "$code" 400 429
done

echo
echo "=== operator injection: login ==="
for p in "${PAYLOADS[@]}"; do
  code=$(post "$TECH_API/api/customers/login" "{\"phone_number\":$p,\"password\":\"x\"}")
  check "/customers/login phone=$p" "$code" 400 401
done

echo
echo "=== account enumeration: unknown vs known must be identical ==="
unknown=$(post "$TECH_API/api/customers/forgot-password" '{"phone_number":"+97400000000"}')
check "forgot-password for unknown number is not 404" "$unknown" 200 429

if [ -n "$ADMIN_API" ]; then
  echo
  echo "=== admin API (this one yields Super Admin if it fails) ==="
  for p in "${PAYLOADS[@]}"; do
    code=$(post "$ADMIN_API/api/auth/reset-password" \
      "{\"email\":\"$EMAIL\",\"token\":$p,\"newPassword\":\"Attacker1!\"}")
    check "/auth/reset-password token=$p" "$code" 400 429
  done
  code=$(post "$ADMIN_API/api/auth/forgot-password" "{\"email\":\"$EMAIL\"}")
  check "forgot-password for unknown email is not 404" "$code" 200 429
  for p in "${PAYLOADS[@]}"; do
    code=$(post "$ADMIN_API/api/auth/login" "{\"email\":$p,\"password\":\"x\"}")
    check "/auth/login email=$p" "$code" 400 401
  done
else
  echo
  echo "  (skipping admin API — pass its URL as the 2nd argument)"
fi

echo
echo "-----------------------------------------------"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "PASS: operator injection blocked on all reset endpoints" || \
  echo "FAIL: at least one endpoint still accepts a Mongo operator"
exit "$FAIL"
