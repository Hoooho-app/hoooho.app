# Care journey runtime contract

`new CareJourneyService({...authConfig, enabledProducts, isIncluded, reviewVoucherEnabled, commercializationReady})` uses existing account transaction storage and `care-journey.json`. `isIncluded(accountId,productId)` is a trusted server callback, never client input. Defaults keep commercialization off and the current review free. Only the theme is initially exchangeable. Enable another product only after its complete consumer and data validation are available. Vaccine and subscription-gift products are intentionally absent until policy/payment integration is real.

Vite: `careJourneyApiPlugin(options)`. Production: match `careJourneyRoute(pathname)` then call `careJourneyResult(service, accountId, route, method, input, query)` after the existing auth and bounded object-JSON reader. Account ID must be verified-token subject.

Routes under `/api/care-journey`:

- `GET /` or `/overview`: dashboard; verifies real formal records and awards one daily task/relevant achievements idempotently. `balance` is currently spendable, `walletBalance` includes reservations, `reserved` is pending spend, `lifetime`/`totalEarned` determine level. `careDays` is the full count of checked-in account dates (not a streak or ledger slice); skipped dates and spending do not reduce it. `theme` is `{active,owned}`. Current-day task alternatives support profile or knowledge review without manufacturing a medical fact.
- `POST /check-in {}`: one +1 per account/local date, returns dashboard. Account timezone is fixed at first enrollment (`x-hoooho-timezone`, default Asia/Shanghai), so changing request headers cannot claim twice.
- `POST /tasks/verify {taskId?,memberId?}` (`/task/verify` alias): verifies actual data and returns dashboard; no client completion/reward field accepted.
- `GET /task-material?memberId=&type=profile|knowledge`: create scoped read receipt and return actual owned profile or published help article. `POST /task-material/confirm {materialId}` checks account/date, minimum 3-second read interval and current profile fingerprint before daily +2. Alternative paths in task are `#verify-profile`/`#read-knowledge`.
- `GET /catalogue`: `{items:[...]}`. Product IDs `theme-mist-blue`, `review-once`, `growth-comparison`, `handoff-enhanced`, `food-comparison`, `medication-templates`. `available` accounts for feature readiness, ownership, included membership, level, unused voucher and cooldown.
- `GET /entitlements`: `{products:{productId:{owned,included,available,version}},commercializationReady}`.
- `POST /redeem {productId,requestId}`: UUID-compatible unique request ID, permanent/voucher products only; atomic debit, no duplicates, returns dashboard plus `redemption`. One account's request cannot address another wallet.
- `POST /theme {themeId:'paper'|'mist-blue'}`: apply only owned theme; returns dashboard.
- `GET /review-snapshots`: `{snapshots:[metadata...]}`; `GET /review-snapshots/:id`: exact frozen `{id,memberId,start,end,createdAt,data,voucherConsumed}` owned snapshot.
- `POST /review-snapshots {memberId,start,end,voucherId?,requestId}`: backend source builder only, never client model/HTML/sources. End cannot be future; voucher requires exactly seven inclusive days. In uncommercialized mode snapshot does not consume voucher; valid paid mode consumes once after valid result. Missing/failed sources retain voucher. Unused vouchers have no expiry; 30 days is cooldown after successful use.

Server-only tool hook: `runService(accountId,{productId,requestId,memberId?,...scope},async()=>({valid:true,...trustedResult}))`. This reserves spendable funds, denies concurrent replay, settles only explicit valid success and stores result for same-request retries; failures/expiry release reservation. Food executor must prove at least two readable food results (up to three); never pass `valid:true` for empty/one-label outcome. No client settlement endpoint exists. In-progress reservations expire after 15 minutes.

All errors are `{error:{code,message}}`. 400 malformed scope, 401 authentication, 403 owned/permission, 404 unknown/private resource, 409 insufficient sprouts, level, stale receipt, cooldown or active request. API responses use no-store. Account deletion/export flows must include care-journey.json; snapshots can contain health metadata and must remain scoped to current member access.
