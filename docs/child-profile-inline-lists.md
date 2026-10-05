# Child profile inline lists

The five category routes use `InlineChildProfilePage` and the shared authenticated
`/api/members/:memberId/profile-list/:kind` GET/POST adapter. The home page,
growth, symptom pages and batch upload flow retain their existing structure.

## Storage and compatibility

Health histories remain in `health-profile-sections.json`. Vaccinations remain in
existing HealthEvents/HealthEventRecords journals. Commands patch only the visible
fields, preserving IDs, attachments, provenance and hidden historical fields.
`child-profile-list-state.json` stores custom relationship identities (including
empty relationships), reversible soft-delete snapshots and idempotency keys, not
a parallel health record database. Account merge/deletion and member deletion
include this state. Commands use the existing account transaction and ownership
guard; version conflicts retain client drafts rather than overwrite newer data.

Allergy lists show only explicitly confirmed objects. Pending and unknown-category
originals remain stored. GET returns per-member `compatibility.pendingAllergies`
and `confirmedUnknownCategory` counts for migration/acceptance; quantities are not
hard-coded. Legacy allergy detail/reaction routes remain for other existing links.

Chronic frequency accepts only 每天/每周/每月/每季度/每年 (or empty). Historical
free-text frequency remains untouched when editing only a name. Family issues
are projected separately; custom relationships have stable IDs. Surgeries flatten
old categories without deleting old date, location or anaesthesia fields.

Optional vaccination item fields are backward compatible:

- `administeredOn`: original calendar date YYYY-MM-DD, or explicit empty for
  unknown date. Missing field uses the existing journal date/precision contract.
- `profileAgeGroup`: chosen fallback age when no date is known.
- `profileListDeletedAt`: reversible deletion marker, filtered from journal
  projections while raw sources remain retained.

Age uses the child's actual birthday anniversary, not year subtraction alone.
Invalid/missing birth/date information remains in 年龄待确认; older records remain
in 7岁及以上 below the fixed seven tabs. Date edits regroup immediately. Batch
receipt matching respects item dates and never matches a soft-deleted vaccination.

## Drafts and validation

Drafts use sessionStorage keyed by account, member and kind, with separate group
and row keys. Back navigation, category changes, reload and token refresh preserve
drafts in the same browser session. Cancel clears only that draft; drafts are not
records. Closing the entire browser session may clear them. Storage failure is
reported. Saving locks submissions and stable request keys protect retries.

Tests: `npm run test:profile-list`, `npm run test:ai:business`, typecheck/build,
and `playwright test --config tests/ai-business/playwright.config.ts child-profile-inline.spec.ts`.
Browser acceptance covers real API persistence, CRUD/undo, draft refresh,
failure/retry, ownership, 320/375/390/430px and enlarged fonts. Screenshots use
synthetic children. iPhone Safari requires separate physical-device verification.
