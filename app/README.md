# Norgeskart App Runbook

Interactive map app for Norwegian postal areas and Coop store filtering/export.

## Requirements

- Node `24` (see repository `.nvmrc`)
- npm

## Local Development

```bash
cd app
npm ci
npm run dev
```

Build and preview production output:

```bash
npm run build
npm run preview
```

## Quality Gates

```bash
npm run lint
npm run test
```

Optional Playwright smoke test:

```bash
ENABLE_E2E=1 npm run test:e2e
```

## Data Pipelines

- Refresh Coop store data:

```bash
npm run fetch:coop
```

Useful environment variables:

- `COOP_CONCURRENCY` (default `6`)
- `COOP_REQUEST_DELAY_MS` (default `200`)
- `COOP_REQUEST_TIMEOUT_MS` (default `15000`)
- `COOP_FETCH_RETRIES` (default `2`)
- `COOP_FETCH_RETRY_BASE_DELAY_MS` (default `400`)
- `COOP_MIN_EXPECTED_STORES` (default `0`, recommended in CI)

- Convert raw postal JSON to GeoJSON:

```bash
npm run convert:postal
```

- Clip/dissolve/build label data for postal polygons:

```bash
npm run clip:postal
```

## Dataset Conventions

- Runtime favors dissolved postal datasets and compressed assets when available.
- Keep generated postal artifacts consistent (`postal-codes.geojson`, `postal-codes.clipped.geojson`, `postal-codes.dissolved.geojson`, plus `.gz` variants).
- Coop runtime data contract must remain stable at `public/coop_stores.geojson`.

## Failure Handling

- If Coop refresh fails due low output count, set/adjust `COOP_MIN_EXPECTED_STORES` and inspect `.cache/samvirkelag-match-report.json`.
- If map labels are unavailable, app falls back to polygon-based labels and continues running.
- If lint/build/test fails, do not ship generated data updates until checks pass.

## Rollback

- The baseline rollback tag for this refactor is:
  - `backup-pre-stability-refactor-20260316-230442`
- To inspect/restore:

```bash
git show backup-pre-stability-refactor-20260316-230442
git checkout backup-pre-stability-refactor-20260316-230442
```
