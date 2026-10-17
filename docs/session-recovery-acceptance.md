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

## Verified result and release

- The production build passed. Local verification passed 665/665 client checks, 26/26 authentication checks, 21/21 durable-session checks and all 16 browser scenarios, including four existing real-server authentication flows. GitHub Actions run [39018817472](https://github.com/Hoooho-app/hoooho.app/actions/runs/39018817472) repeated the client/auth checks, build and 16 browser scenarios successfully.
- Visual inspection covered the original-page indicator, bottom retry notice and branded startup fallback at 320px and 390px. Reauthentication also fits a 320px by 420px visible viewport. Physical iPhone/Safari has not been verified.
- [PR #449](https://github.com/Hoooho-app/hoooho.app/pull/449) was merged into main as `bb90bee4076640c93f45446c068e3d53f658dd5a`. Files were published through the connected GitHub integration because command-line Git had no write credential. The uploaded tree `11576ceebc202b50387f33fada82ef47f91d0d48` exactly matched the locally verified tree.
- Railway Staging deployment `3e94a4b3-0847-4b88-bad7-1b022473feb0` reached **SUCCESS** for that exact main commit. All 12 recovery scenarios passed against the deployed Staging frontend in 1.5 minutes; GET `/api/health` returned `status: ok`.
- After Staging acceptance, Railway Production deployment `ea534ef8-6885-4a8c-a457-2b776fac94f4` reached **SUCCESS** for the same commit. All 12 recovery scenarios passed against [hoooho.com](https://hoooho.com) in 2.9 minutes; GET `/api/health` returned `status: ok`. Railway reported one running replica, zero crashed replicas, no pending work and no service issues.
- Deployed-frontend browser scenarios intercept all API requests with fictional accounts and member fixtures; they do not write user data. Real-server authentication was separately covered by the four localhost flows in local/CI acceptance.
- Delivery status: **DONE**, 2026-10-17. The user approved the recovery UX and explicitly authorized repository publication and deployment. This final acceptance-record update changes documentation only; the verified application release remains `bb90bee`.
