# Session recovery acceptance

Base: `166f942` (`origin/main`), branch `codex/session-recovery-20261017`, clean isolated worktree.

Integrated baseline: `7009612` after the other approved calendar, sleep and child-profile releases. Local verification: build, 665 client checks, 26 authentication checks, 21 durable-session checks, and 16 mobile browser scenarios (including the four existing real-server authentication flows). Browser emulation does not constitute physical iPhone/Safari acceptance.

Authorized scope: the approved recovery preview. Keep an already opened page mounted during transient connection/session recovery. Show a delayed, compact top indicator; show a bottom retry notice on failure. Use a branded illustration and clear retry action when no usable page exists. Confirmed session expiry opens a focused login dialog; logging back into the same account preserves the route, scroll and unfinished form. Keep the first-load authentication boundary and clear account-scoped data on an account switch.

Necessary dependencies: shared authentication guard, bootstrap/recovery coordination, profile initialization boundary and embedded reuse of the existing login form. Preserve V2 tokens/components, all business-page layouts, APIs, record schemas and AI behavior. Do not add dependencies, automatically replay writes, or claim a draft was saved without acknowledgement.

Acceptance:

- Fast recovery is silent; slower recovery appears after about one second without replacing or shifting page content.
- Network failure and server failure keep an authenticated page mounted. Retry is deduplicated and a later successful recovery clears the notice.
- Token refresh and health-data gate revalidation preserve controlled form values and the existing scroll position.
- Confirmed unauthenticated responses block protected interaction and show a login dialog. Same-account login resumes in place; a different account cannot see the previous account's page or data.
- Cold loading/failure always has a branded accessible shell and retry; no health data appears before identity verification.
- Family/profile hydration is separate from identity recovery. A profile refresh failure does not reject a successful session or block unrelated pages. Archive-dependent routes wait for initial archive hydration; previously loaded routes remain mounted during refresh.
- Logout and stale/aborted recovery responses cannot restore a logged-out account.
- Validate at 320px and 390px, including keyboard/safe-area, reduced motion, accessible status and focus behavior. Browser emulation is distinct from physical iPhone validation.
- Run the build, relevant authentication/client checks and mobile browser recovery scenarios. Commit, push, integrate into main, verify Railway Staging, then Production and report the verified release.

## Verified local result and release status

- Local implementation and build passed. The final local run passed all 16 browser scenarios in 22.7 seconds; client checks passed 665/665, authentication checks 26/26 and durable-session checks 21/21.
- Visual inspection covered the original-page indicator, bottom retry notice and branded startup fallback at 320px and 390px. Reauthentication also fits a 320px by 420px visible viewport. Physical iPhone/Safari has not been verified.
- Source commits: `7238504` (implementation), `5c19526` (stable acceptance setup). The worktree is isolated from the other active Hoooho tasks.
- Delivery status: **RELEASE IN PROGRESS**. The user explicitly authorized the proposed repository upload and deployment on 2026-10-17. The earlier automatic approval block is resolved by this authorization.
- Command-line Git has no write credential in this environment. Publish the verified files through the connected GitHub integration, verify the remote tree matches the local tree, and complete PR checks, main integration, Staging verification and Production verification before reporting completion.
