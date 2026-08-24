# Clicks API — Performance house rules

Every new list endpoint must follow these rules. CI enforces them via `scripts/check-query-hygiene.mjs` and integration query-guard tests.

## Lists

- Paginated with a hard cap (`limit` ≤ 50 on mobile, ≤ 100 on admin leads)
- `.lean()` on read-only list queries
- Explicit `.select()` — only fields the UI renders
- No unbounded `.find()` in controllers without `// unbounded-ok:` marker

## Indexes

- Every new query names its index in a schema comment (grep-able provenance)
- Sort fields must match an index prefix for the filter shape

## Search

- Anchored prefix regex on indexed normalized fields only (`search_phone`, `search_name`)
- No unanchored `$regex` on free-text fields — use Atlas Search later
- Client search inputs debounced ≥ 400ms

## Counts

- Display-only counts use `cachedCount` (15–30s TTL) or `estimatedDocumentCount()` for unfiltered totals
- Never cache counts that feed financial writes or audit

## Populate

- Always `.select()` on populate paths
- Credential and identity-document fields use `select: false` on schemas; explicit `+password` only at login/compare sites

## Dashboards

- Heavy aggregates materialized in `PlatformStats` via `statsRefresher`
- Live counts (SOS pending, online techs) stay direct with `cachedCount`

## Compression

- Both APIs use `compression()` middleware for JSON responses

## Measurement

- Staging k6 suite under `loadtest/` — run before/after performance changes at 100k–1M synthetic jobs
