# SkipCash membership sandbox

Mirror of `skipcash-sandbox-job-smoke.js` for customer membership checkout.

## Flag

`LAUNCH_CUSTOMER_MEMBERSHIP` — default on outside production. Checkout returns 404 when off. Catalog/`GET /api/membership/me` return empty lists.

## Distinguish from job payments

SkipCash create payload:

- `Custom1` = `CustomerSubscription` id (HMAC-signed)
- `Custom2` = `membership` (unsigned)

The webhook in `skipcashController.handleWebhook` activates the subscription when `Custom2 === membership` instead of loading a Job.

## Smoke

From `clicks-api`:

```
node scripts/skipcash-sandbox-membership-smoke.js
```

Needs sandbox keys in `clicks-customer-tech-api/.env` (same as job smoke). Seeds Basic/Plus, starts a monthly Basic checkout, posts a signed paid webhook, then polls `GET /api/membership/:id/status`.

## App

Customer app hides membership UI unless `/api/launch-flags` reports `customerMembership: true`.
