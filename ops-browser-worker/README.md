# Private billing browser

Production service `ops-billing-browser` uses this Dockerfile, repository root `/`,
start `node /app/ops-browser-worker/app.mjs`, healthcheck `/health` (120 seconds),
region `ams`, one replica, 1 GB RAM / 1 vCPU, restart ON_FAILURE (3 retries).
Watch `ops-browser-worker/**`, `server/ops/billing-page-reader.mjs`, and
`shared/ops-billing-catalog.mjs`. Configuration is set on this service through
Railway; new services no longer accept `railway.json`. Do not reuse the legacy
health app's root config or migrate unrelated infrastructure as part of this setup.

Mount the independent persistent volume at `/profiles`. Set server-only secrets
`OPS_CAPTURE_WORKER_TOKEN` (at least 40 random characters) and
`OPS_CAPTURE_STORAGE_KEY` (64 random hex characters), plus
`CAPTURE_DATA_DIRECTORY=/profiles`, `PORT=8080`. The app accesses only the private
hostname with the shared worker token. Never expose a public domain, CDP, or TCP
proxy, and never share product authentication / medical / AI keys with this worker.

Startup verifies the actual Chromium engine before listening. All routes except
the non-sensitive `/health` require the worker token. The owner must explicitly
consent and complete platform login in the protected Ops window before capture.
See `docs/ops-billing-console.md` for the owner workflow and data semantics.
