# Model latency optimization — 2026-10-18

Base: `origin/main` at `ef263ce5d7815138e1f40d7b2af22c6fe748fe25`, clean isolated branch `perf/qwen-latency-20261018`.

The product owner approved implementation and deployment of the preceding speed report, with **no model replacement**. Preserve model IDs/providers, medical fact validation, manual edits, original media, the V2 UI, and existing first-level navigation. No automatic supplier retries, quota increases, dependencies, TLS changes, or region migration.

Acceptance checklist:

- [x] Short dialogue/intent tasks do not generate full extraction output; final organization retains all source/negation/time checks.
- [x] Summary generation does not hold the global storage transaction while waiting for a model; stale results cannot overwrite changed sources or edits; identical valid results/in-flight requests are reused.
- [x] OCR/uploads use bounded concurrency and reuse completed work without exceeding the existing global supplier limit; original page order and failure checkpoints survive.
- [x] Symptom audio/vision processing can finish independently; retries do not repeat successful stages; frame extraction avoids repeated process startup.
- [x] Already uploaded medication/vaccination photos can be reused by authorized reference, without a second browser upload.
- [x] Recognition completion is observable without fixed polling delays; waiting never holds the account/storage lock and supports cancellation.
- [x] Draft edits are atomic and version protected, including a batch of changes; no partial changes on validation failure.
- [x] Safe trace/task/phase metadata distinguishes provider return, validation, queue and client waiting; no health text/media/account IDs/credentials enter ordinary logs.
- [ ] Relevant server/client regression, typecheck/build and mobile browser checks pass; test fixtures are distinguished from real supplier checks.
- [ ] Commit/push/main integration, isolated Staging verification, Production deployment and verification complete; physical iPhone checks are not claimed from emulation.

Implementation and validation results are appended before release.


Implemented safeguards:

- Compact nurse/help/feedback outputs; source-backed final organization is unchanged.
- Source passage references reduce repeated summary evidence output; the original semantic validator still validates the reconstructed result. Shared generation detaches per-HTTP cancellation; no model change.
- Two-phase summary persistence releases the global storage lock during generation and rejects stale inputs/edits.
- Bounded page/image/food OCR, cancellable global two-slot PDF rendering, deterministic page order and durable successful checkpoints.
- Symptom audio and vision overlap, preserve independent successes, and share one frame-extraction process.
- Recognition long polling does not hold the account lock; final responses include the current review and refresh the sequence after user edits.
- Medication/vaccination reuse scoped uploaded originals; legacy capture reuses hashed assets and completed pages while retaining its existing first-save contract. Expired asset references are invalidated for explicit retry.
- Atomic draft-edit batches retain version checks, rollback and original evidence.
- Numeric-only client timings and safe trace/task/queue/HTTP logs; cancelled HTTP requests stop synchronous model work while acknowledged jobs remain independent.

Validation before release:

- Full client suite: 719/719 (Asia/Shanghai); TypeScript and production build passed, including asset/auth/viewport/install contracts.
- Full server script: 221/221; summary/source suite: 100/100; broad relevant suite: 358/358; final focused regression after the last backend changes: 273/273. These are overlapping suites, not an additive test count.
- Real HTTP synthetic-provider acceptance: 4/4, including pending long poll plus immediate cancellation, member isolation, final context/review, atomic edits/save idempotency and exact original-photo reuse. Example: 37,000 original bytes reused by a 121-byte reference; this is transport size, not a claimed production latency improvement.
- Mobile Chromium emulation: profile-batch 2/2 passed (multi-page, append/remove, failure/retry, confirmation/save/cancel). Relevant business/image/preview cases passed; final text retry/save/undo and photo adoption checks recorded below after completion.
- Initial broad legacy browser suites include obsolete page labels, selectors, summary entry points and the old direct ASR endpoint. They are not claimed as passing. Only narrow selector updates matching the existing baseline were made; product copy/navigation were not changed.
- Physical iPhone/Safari and a statistically useful real-provider latency distribution remain unverified.

Release state: awaiting main integration, Staging and Production verification of the exact commit. No environment variables, supplier models, region, replicas, dependencies, TLS settings, quotas or global supplier concurrency limits were changed.
