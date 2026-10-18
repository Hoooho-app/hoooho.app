# Approved child profile scope · 2026-10-18

Base: `27962307d40bf7bc29be40789136cd5a450c7a09`, clean `origin/main`, isolated branch `feat/child-profile-approved`.

- Keep the homepage, main navigation and current child-profile list structure. Add only 基本资料, 生长记录 and 儿保与筛查. Growth opens the existing `/health-profile/basic`; its implementation stays frozen.
- Add 基本资料与出生背景 with canonical identity, birth background, blood type/evidence and newborn documents. Preserve old birth/basic fields and other records.
- Add 儿保与筛查 with manual arrangements, completed checkups, hearing/newborn/vision/oral records and original documents. Plans are not completed health facts.
- Update only the vaccination route: completed records, manual future arrangements, doses, source documents, existing regional reference, photo/manual entry. Preserve old records and provenance; no automatic vaccination recommendations.
- Enlarge only smart-record held feedback. Initial composer, recording lifecycle, release recognition and review remain unchanged. Current recognition occurs after release; never display fabricated live transcription.

Frozen: allergy, chronic, surgery, family history, growth views, health calendar, medication, search, sources/updates, symptom cases, medical documents and one-click organization. Do not add medication/advice, developmental behavior, collaboration or reaction-observation capabilities.

Acceptance: real server persistence/reload; account/child isolation; revision conflicts preserve edits; existing records retain unknown/evidence fields; actual dates newest first; future plans separated from completed facts; no mobile horizontal overflow; hold feedback above the finger; existing cancel behaviors retained. Use existing V2 components/tokens, no dependencies.

Delivery: relevant tests/build → commit/push → main integration → Railway staging verification → production verification. Browser emulation is not physical iPhone/Safari acceptance. Product-owner visual acceptance remains separate from automated review.

## Local verification

- Production build (type checks, assets, Vite, viewport, authentication and install contracts): passed.
- Profile list and new approved-profile server tests: 11 passed. Profile synchronization: 9 passed. Member tests: 3 passed. Growth: 2 passed. Existing member editor contracts: 5 passed.
- `node tests/approved-child-profile/run-local.mjs`: mobile browser verified the three entries and original growth route; canonical identity/blood data; server-persisted birth originals; legacy evidence preservation; file-reading save lock; member editor return; checkup/plan separation; server future-date rejection; stale revision protection and retained draft; vaccine dose/date persistence and reload draft; no invented unknown age; camera capture entry; existing source deep links and member guard; owned-member isolation.
- Hold fixture verified compact standalone/composer and opt-in expanded feedback: hold/release, early release, slide cancellation, pointer cancellation, keyboard, blur, denied permission, halo/haptic callback, timer, above-finger position and 320/390/430px bounds.
- Production preview screenshots were visually inspected against current tokens/components. Physical iPhone/Safari, microphone hardware, vibration and the operating-system camera remain device acceptance items; emulated capture attributes and gesture callbacks do not prove hardware behavior.
