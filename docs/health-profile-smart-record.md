# Health profile grouped archive and smart record

Scope: only the health-profile landing page and its archive/upload dependencies.
The shared member header and visit-summary destination remain unchanged.

- Fixed rows: allergy, chronic, family-history, surgery, vaccination. No locking or membership placeholder.
- Allergy counts are loaded from the authenticated profile sections and use `allergyGroup`, the same grouping as the actual allergy list. Unavailable is not empty.
- `/health-profile/smart-record` reuses AIBusinessComposer and the authenticated member AI draft service. JPEG/PNG/WebP and multipage PDF limits remain 12 pages / 15 MB. Explicit camera capture is available.
- Users review source-backed values and archive destinations before confirmation. A document may generate multiple source-linked items. Abnormal measurements alone do not populate chronic history; suspected allergy remains investigating. Unknown diagnoses and family-history certainty remain pending.
- Vaccine extraction writes the existing `JournalMetadata.vaccination` model. `/health-profile/vaccination` reads the same journal records and uses VaccinationRecordFlow for manual supplements. Old standalone profile vaccine records remain accessible through `/health-profile/legacy/vaccination` without migrating or duplicating them.
- Secondary materials history includes existing reports, visits and attachments. Originals are authenticated and read through the existing attachment service. Unmapped documents are retained on the first saved source record rather than discarded.
- Failed recognition retains its draft and original for an explicit retry. In the profile flow, closing the sheet leaves the member-scoped draft available until its existing 24-hour expiry; explicit cancellation deletes only that unsaved draft. Manual-original mode is only available for failed drafts with actual originals, writes a manual/unavailable provenance marker and does not pretend OCR succeeded.
- Existing archive information is preserved. Related archive entries require acknowledgement in the smart record review. Account transactions, draft versions and source-record identity prevent partial writes, conflicting edits and duplicate archives.

Validation commands:

```
npm run test:client
npm run test:server
npm run test:ai:business
npm run build
npm run test:e2e:ai-business
npx playwright test --config tests/ai-business/health-profile.config.ts
node tests/ai-business/health-profile-deployment-smoke.mjs <verified-staging-or-production-url>
```

The isolated E2E server uses explicit synthetic AI responses, never production credentials or real medical data. Its runtime screenshots are in `outputs/health-profile/`; live smoke screenshots are under the environment-specific subdirectory. AI quality on real medical documents is not asserted by fixture tests. Live recognition availability is reported separately; no secret is copied between environments by this feature.
