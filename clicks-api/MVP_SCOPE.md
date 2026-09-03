# Clicks Launch MVP Scope (Phase 0)

Frozen for production launch. New scope requires explicit approval.

## In scope (MVP)

- Customer SOS + scheduled roadside services
- Admin dispatch + Live Map (realtime technician locations)
- Technician fulfill: online status, accept job, GPS, en_route → arrived → start → complete → payment confirm
- Job on-hold / resume (admin only; required hold reason; technician read-only status)
- Customer rating after complete
- Cash/card/wallet payment_status confirmation (no in-app gateway required)
- Auth: customer + technician + admin JWT
- Content: FAQs, privacy, terms (public `/active`)
- Soft launch: Qatar-only via feature flags

## Explicitly deferred (post soft-launch)

- In-app chat
- Digital wallets / Stripe-style gateway UI
- Full insurance check UI + notes domains (hide in admin until built)
- Multi-region HA / Redis Socket.IO adapter (keep `instances: 1` until then)
- Perfect notification center (FCM token save OK; rich inbox later)
- Full admin permission matrix beyond minimal RBAC

## Environments

| Name | Purpose |
|------|---------|
| local | Developer machines |
| staging | `stg-*` hosts / Atlas staging |
| production | `*.clicks.qa` / Atlas prod |

## Feature flags (server)

See `FEATURE_FLAGS` / `LAUNCH_*` env vars on customer-tech-api:

- `LAUNCH_PUBLIC_SOS=true|false`
- `LAUNCH_PUBLIC_SIGNUP=true|false`
- `LAUNCH_REGION=QA` (informational; clients may geo-gate)

## Owners

- API / admin: clicks-api + clicks-interface
- Field app: clicks-technician
- Customer app: clicks-user
- Ops (Atlas/Azure/SMS/TLS): infra owner named at go-live
