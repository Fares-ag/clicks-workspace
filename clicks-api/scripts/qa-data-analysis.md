# Data Analysis QA

## Unit

```
node --test clicks-shared/utils/dataCleaning/normalizeJobIssue.test.js clicks-shared/utils/dataCleaning/normalizeJobVehicle.test.js
```

Covers English/Arabic vehicle typos, issue aliases, every legacy jobType, plates, customer phone keys, and Qatar areas.

## API smoke

```
node scripts/qa-data-analysis-smoke.js
```

Super Admin should get 200 on `/overview`, `/issues`, `/quality?field=issue`, `/catalogs`. Job Dispatcher should get 403.

## Manual

1. Open web admin → **Data Analysis**.
2. Confirm coverage strip and top issues use cleaned labels (Toyota Camry, Puncture repair).
3. Expand an issue row — raw spellings (`tire repair`, `بنشر`) still visible.
4. **View jobs** shows both raw and canonical columns.
5. Data quality → Issue → Preview → Apply one cluster.
6. Job Details shows the new issue; Admin audit log has `data_analysis.apply`.
7. After ~90s cache TTL, charts update.
