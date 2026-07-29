#!/usr/bin/env bash
# Run on the production VPS after Admin UI moves to Vercel.
# Upserts FRONTEND_URL / CORS_ORIGINS for admin.clicks.qa and restarts PM2.
set -euo pipefail

ADMIN_ORIGIN="${ADMIN_ORIGIN:-https://admin.clicks.qa}"
ADMIN_API_ENV="${ADMIN_API_ENV:-$HOME/clicks-api/clicks-admin-api/.env}"
TECH_API_ENV="${TECH_API_ENV:-$HOME/clicks-api/clicks-customer-tech-api/.env}"

upsert_env() {
  local file="$1" key="$2" value="$3"
  if [[ ! -f "$file" ]]; then
    echo "Missing env file: $file" >&2
    exit 1
  fi
  if grep -q "^${key}=" "$file"; then
    # portable-ish in-place replace
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
  echo "Set $key in $file"
}

upsert_env "$ADMIN_API_ENV" "FRONTEND_URL" "$ADMIN_ORIGIN"
upsert_env "$ADMIN_API_ENV" "CORS_ORIGINS" "$ADMIN_ORIGIN"

# Preserve other origins on tech-api if already set; ensure admin origin is present
if [[ -f "$TECH_API_ENV" ]]; then
  if grep -q '^CORS_ORIGINS=' "$TECH_API_ENV"; then
    current="$(grep '^CORS_ORIGINS=' "$TECH_API_ENV" | head -1 | cut -d= -f2-)"
    if [[ "$current" == *"$ADMIN_ORIGIN"* ]]; then
      echo "CORS_ORIGINS already includes $ADMIN_ORIGIN in $TECH_API_ENV"
    elif [[ -z "$current" ]]; then
      upsert_env "$TECH_API_ENV" "CORS_ORIGINS" "$ADMIN_ORIGIN"
    else
      upsert_env "$TECH_API_ENV" "CORS_ORIGINS" "${current},${ADMIN_ORIGIN}"
    fi
  else
    upsert_env "$TECH_API_ENV" "CORS_ORIGINS" "$ADMIN_ORIGIN"
  fi
else
  echo "Missing tech API env: $TECH_API_ENV" >&2
  exit 1
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart clicks-admin-api clicks-customer-tech-api || pm2 restart all
  pm2 save || true
  echo "PM2 restarted"
else
  echo "pm2 not found — restart APIs manually"
fi

echo "Done. Smoke: open $ADMIN_ORIGIN and verify login + Live Map (no CORS errors)."
