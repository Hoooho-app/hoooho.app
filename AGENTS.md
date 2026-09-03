# Hoho Design System Freeze V1

## Hoho mandatory delivery chain

- The canonical application repository is `https://github.com/Hoooho-app/hoooho.app.git`; its formal deploy branch is `main`.
- Every requested application source, runtime configuration, or deployment configuration change defaults to the complete delivery chain: development -> tests -> commit -> push -> integration into `main` -> Railway Staging deploy -> Staging verification -> Railway Production deploy -> Production verification. Only an explicit user scope restriction or a genuine blocker may stop this chain.
- A feature Worktree or Branch that lacks Railway, Staging, or Production configuration is not exempt from deployment. Locate the canonical repository and deploy branch, then transfer only the verified change by cherry-pick, a clean branch, or another minimal safe integration method.
- Do not report Deployment as `N/A` merely because the current Worktree cannot deploy. Report that it must be transferred to the deployment repository, and continue there.
- `DONE` is forbidden while any applicable test, commit, push, `main` integration, Staging deploy/verification, or Production deploy/verification remains incomplete. “Ready to deploy”, “waiting for deployment confirmation”, and “current Worktree has no deployment configuration” are not completion states.
- If credentials, permissions, branch protection, provider failure, or a required high-risk approval prevents completion, preserve the evidence and report `BLOCKED`, not `DONE` or `N/A`.
- This delivery authorization does not permit destructive data operations, force-push, secret disclosure, bypassing security controls, or unrelated business changes.
- Pure instruction or documentation changes do not require redeploying an unchanged application version unless they alter runtime, build, or release behavior or the user explicitly asks for deployment.

### Existing Codex Thread rule refresh

- A new Codex Thread must read both `$CODEX_HOME/AGENTS.md` and this repository `AGENTS.md` before work begins.
- Existing Threads may not reliably hot-load later rule changes. Before resuming an existing development task, compare the Thread start context with the applicable rule file update times; if the Thread predates either file, re-read both rule layers before continuing.

Hoho Design System V1 is the project's formal and frozen visual baseline.
The reference implementation is the production-approved `/health-events` page,
the `--hoho-*` tokens in `src/styles/tokens.css`, and the components in
`src/components/design-system/`.

- New pages and components must use `--hoho-*` tokens and existing Design System components first.
- Do not define a parallel primary color, typography scale, spacing scale, radius, shadow, button, card, tag, input, modal or timeline style inside a page.
- If a reusable visual capability is missing, extend `components/design-system/` and document it. An extension must be reusable in at least two product contexts and contain no health business logic.
- Do not introduce another UI framework, replace the Design System, or globally redesign the product without explicit user authorization.
- Do not change a frozen page's information architecture or interaction flow while performing visual work.
- A local page request changes only the explicitly named surface; all other product surfaces remain frozen.
- Health event hierarchy is frozen: the list page emphasizes year/date/event summary, while the detail page emphasizes exact time and health fact changes. Shared visual language must not erase this distinction.
- Avoid dashboard density, card nesting, decorative badges, large tinted blocks and nonessential elevation. Sections are flat by default; cards are reserved for important surfaces.
- Hoho is a mobile-first web product. Do not add native-app navigation patterns or unrelated app chrome.
- Backend, API, data, AI/parser, HealthFact and time-resolution changes must stay behind their existing boundaries and must not be made as part of visual migration.

Illustration artwork such as virtual-avatar skin, hair and clothing palettes is an asset-level exception; those colors are not UI tokens.

See `docs/hoho-design-system-v1.md` for the component and token contract and `docs/ui-freeze-v1.md` for the review checklist.

## Impeccable 使用规则

Hoho Design System V1 已冻结。

Impeccable 默认只能用于：

- audit
- critique
- polish
- distill
- responsive refinement
- spacing / hierarchy / alignment / typography refinement
- accessibility and UI anti-pattern review

除非用户明确要求，否则禁止使用 Impeccable：

- redesign 整个页面
- 创建新的视觉体系
- 更换 Hoho Design System V1
- 修改主色、Typography Scale、Radius、Shadow 基线
- 引入新的 UI Framework
- 改变冻结的信息架构和业务交互

所有 Impeccable 优化必须：

1. 先读取 Hoho Design System V1；
2. 读取目标页面当前实现；
3. 保留现有产品视觉语言；
4. 只修改用户明确授权的范围。

原则：Impeccable 是 Hoho 的“设计审计和精修工具”，不是新的设计系统。

## Health time semantics

- Health event and health record occurrence times represent facts that already happened or are happening now.
- Every write of `startTime` or `occurredAt` must enforce `value <= current time` in both the UI and the server API.
- The server is authoritative: future values must fail validation before persistence or AI Parser/Organization processing.
- Compare instants after ISO 8601 parsing so client and server timezone differences do not change the rule.
## Hoho Health Chronology

- Health timelines and health-record lists default to newest first.
- The stable ordering contract is `occurredAt DESC -> createdAt DESC -> id DESC`.
- This contract applies to event detail timelines, same-day records, temperature, medication, visit, examination, status-change and backfilled history displays.
- Backfilled history is positioned by its actual `occurredAt`; a newer `createdAt` must not move an older occurrence above more recent health records.
- Year navigation lists only years that contain events and orders them newest to oldest.
- Do not substitute `createdAt` or `updatedAt` for `occurredAt` when displaying or ordering health chronology.

## Email verification authentication release strategy

- Email verification authentication follows the same mandatory release gate as all other application changes: automated verification -> commit -> push -> integration into `main` -> isolated Railway Staging -> real-email acceptance -> Railway Production -> online acceptance.
- Before a Production deployment, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `AUTH_TOKEN_SECRET` must be configured as Production environment-scoped secrets and must never be committed or printed in logs.
- `AUTH_EMAIL_FROM` must be an actual sender allowed by the configured Resend account. Do not guess or deploy an unverified sender.
- Keep the Railway Staging environment available and verified; Staging is not optional during internal-use or external-user phases.

## Hoooho global interaction optimization boundary

When auditing or optimizing interactions, freeze the first-level page structure, navigation and information architecture, approved copy, existing business flows, backend APIs and data structures, brand direction, established names including “健康随记”, nurse characters and original video assets, unrelated animations, and any page or module explicitly frozen by product management.

Unless the current task explicitly authorizes it, do not add or remove first-level capabilities; merge, split, or rename business modules; rewrite product copy; redesign a whole page; change layout hierarchy based on personal taste; expand interaction work into a visual redesign; or install a production dependency.

Inside those boundaries, interaction work may repair non-responsive controls and bad event bindings; missing loading, success, failure, disabled, and retry states; duplicate submissions; broken dialog, drawer, focus, scroll, and back behavior; mobile keyboard, safe-area, obstruction, viewport, and touch-target defects; demonstrated motion, media-continuity, flicker, or layout-shift defects; clear cross-page interaction inconsistencies; and necessary accessibility semantics or keyboard behavior.

Repository-wide interaction audits must use `.agents/skills/hoooho-interaction-audit/`. Inventory and classify before remediation; static source inspection cannot substitute for real browser operation. Parallel agents may perform independent read-only review lanes and return structured evidence, but the primary agent owns all source edits so agents do not concurrently modify the same files.

## Hoooho visual acceptance authority

AI visual scores, blind reviews, and automated gates are supporting evidence only; they do not constitute product-owner acceptance. Without explicit product-owner approval, do not mark a visual exploration as a final success, add it to Approved Screens, or automatically propagate it across the product.
