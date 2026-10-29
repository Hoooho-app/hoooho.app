# Hoooho execution and design standards

## 首页欢迎区：产品主人确认 2026-10-29

- 以已确认的三块高保真版式为准：上方大欢迎区保留文案与缩小的透明护士站视频；下方并排两张小卡，左为“怎么用护护／边照顾，边记录”，3D 图表现妈妈照顾发烧女儿并手持手机记录；右为真实每日小知识标题、摘要与阅读入口，不配图、不放图标。
- 第一条实际对话气泡出现后，欢迎语、视频和两卡全部移除，不留空位；未发送文字、取消录音／附件不算消息。恢复已有对话不重现欢迎区，显式新建空白对话恢复。
- 复用已有每日选文与文章阅读，只开放小知识路径，不恢复其他隐藏模块。不得将预览示例冒充每日真实文章或后台新生成内容。教程不自动提交示例、不写健康数据。
- 本段覆盖此前该首页局部布局；其他页面、输入及持久化维持当前规则。契约见 `docs/delivery/frontdesk-welcome-cards-20261029.md`。

## 首页自动保留与输入：产品主人确认 2026-10-29

- 首页对话、未发送补充和进行中的原件按现有账户/孩子归属自动保留，侧栏可继续打开；切页不再弹保存草稿确认。保留原始输入不等于正式健康记录保存成功；其他独立表单的退出保护继续保留。
- 尚无转写文字的语音处理中只显示 loading，去掉占位麦克风和「语音消息」；失败操作为同行的「重试」「移除」。已有实际转写文字继续显示。
- 关键信息进度用相连圆点及名称表达，完成项圆点和文字变绿，不显示「已获得/待补充」。状态仍以原有信息规则为准。
- 首页相机直接进入系统附件选择，移除网页附件弹窗。包含新能力的 iPhone 包提供相册、拍照、拍视频、文件四项；普通浏览器与旧包沿用系统原有选择，不声称网页能够修改 Safari 的系统菜单。
- 具体业务分支、兼容边界与发布证据见 `docs/delivery/frontdesk-input-simplify-20261029.md`。本段覆盖此前上述局部行为的旧约定。

## 前台关键信息整改：产品主人确认 2026-10-29

- 本轮首页顶部去掉“症状记录”标题，底导名称保持；页身、输入区、底导及安全区统一纸底。欢迎语为“我是记录员‘护护’。有任何情况直接说，我可以帮你整理清楚。”（界面用中文双引号），视频等比例缩小不裁切，孩子信息独立圆角浅绿底。
- 追问直指关键缺口，工具依信息类型选用；数值直接填写、部位用定位器、程度等主观表达可用有实际信息的选项。不仅删除一组三选项，也不以有/没有/没注意等中转题代替获取具体信息。未知不等于正常，问过不等于已获得。
- 记录单仅“情况概述、关键词”默认展开，其余内容默认折叠；正文为普通只读排版，点编辑才进入编辑。确认整理一次生成并保存，保存修改更新同一 ID，以真实回执显示成功。保留原件、识别核对、人物归属、版本、失败重试与旧客户端协议兼容。
- 具体任务契约与证据见 `docs/delivery/frontdesk-key-information-20261029.md`。本段覆盖此前对上述局部行为的约定，不授权其他页面重设计。

## 首页与姓名隐私：产品主人确认 2026-10-29

- 本轮明确授权首页/底导/侧栏采用 `docs/design/frontdesk-navigation-privacy-20261029.md` 的新布局，覆盖旧的前台标题和四项侧栏导航安排；不扩展为其他页面的全局重设计。
- 首页和第一底导为「症状记录」，其余为健康日历、孩子档案、一键整理；默认语音隐藏分类，键盘输入再展开。
- 侧栏身份摘要最多两行并保留用户头像。姓名显示两字 `*末字`、三字 `姓*末字`；不改原件、编辑值和导出。子女关系以女儿/儿子表达，不以爸爸/妈妈作为用户中心身份。
- 欢迎语不含孩子姓名，保留现有护士站视频和绿底白字；不加极光和日期海报。侧栏保留真实历史及帮助/反馈/关于，不显示「产品中心」标题。

## Complete user workflows before implementation — owner instruction 2026-10-27

This requirement applies to product planning, feature design, implementation, bug fixes, testing, reviews and handoffs in ChatGPT and Codex. A list of UI changes or passing tests is not a complete business design.

- Before implementation or a test plan, read `docs/delivery/user-workflow-contract.md` and the lesson in `docs/lessons/2026-10-27-workflow-completeness.md`. Use the current implementation and latest confirmed product decisions; do not restore historical behavior from examples.
- Define the user's complete task from entry to a usable persisted result, reopening/editing and downstream use. Write one concrete ordinary case, not just component or feature names.
- Resolve the applicable business rules first: actor/object/task ownership; raw input versus facts, draft and saved result; state transitions, prerequisites, authoritative success receipts, and cross-surface/version consistency.
- Reason through natural branches before coding: fragmented/rapid input, corrections, side topics and object/task switches, cancel/back/refresh/reopen, delayed/duplicate work, partial failure and retry. For each applicable branch, specify the next user action, what is retained, where work resumes and which effects must not repeat. Do not require unrelated edge cases for a trivial change.
- Keep a traceable task contract for cross-message, cross-page, asynchronous or persistence changes. Map business rules to implementation owners and observable acceptance evidence. For small changes a short task record is enough; for documentation-only changes use the bounded scope/consistency checklist rather than inventing runtime tests.
- Do not delegate basic completeness to the owner or ask them to specify predictable failure behavior. Resolve routine details autonomously within scope; ask only for consequential, unresolved product choices. Do not expand a testing request into an unauthorized product rewrite.
- Derive test expectations from the business contract, not from current implementation. Distinguish synthetic responses, real providers, actual persistence, browser execution and Production. Preserve external-call budgets and release boundaries.
- Report design, implementation, verification, deployment and owner acceptance separately. Screenshots establish observations, inspected source establishes mechanisms, and traces establish incident causes; label inference. Never call an archived lesson a runtime fix or a simulated path a verified semantic result.
- When a basic omission is found, repair the missing rule and its directly affected chain, retain the counterexample, and check adjacent consequences. Do not patch only the visible symptom. Keep the contract and unresolved core issues in handoffs; do not claim a complete usable release while its core workflow remains unresolved.

## Family project separation — owner instruction 2026-10-21

- 家庭统筹会是独立项目，唯一家庭代码仓库为 `https://github.com/Hoooho-app/hoooho-family.git`（私有），正式分支 `main`。今后的家庭功能开发、测试、构建和发布进入该仓库，不继续写回本健康仓库。
- 本仓库只拥有 Hoooho 健康产品。本变更移除 `src/pages/FamilyWorkspace`、`server/family-workspace` 等家庭业务，只保留 `server/family-project` 受限路由和有期限兼容桥；不得把家庭业务重新合回健康构建。
- 两项目各有独立 Railway Production 服务和持久卷。家庭正式地址继续是 `https://hoooho.com/family-ray-home-life-workspace`，本健康服务只保留该路径的受限转发和有期限迁移桥。
- 先读取 `docs/family-project-separation.md` 和独立仓库的 `docs/project-separation.md` / `docs/release-status.md`。新服务未健康、家庭数据未校验时禁止切换；不得复制健康用户、医疗资料或 AUTH_TOKEN_SECRET 到家庭项目。
- 本删除变更只能在独立服务与数据迁移、正式入口切换已核验后合并。若平台或迁移仍阻塞，保持草稿，不发布本版本，不创建 Staging、不丢弃源数据。

## Hoho delivery chain: one production environment

- The canonical application repository is `https://github.com/Hoooho-app/hoooho.app.git`; its formal deploy branch is `main`.
- Owner instruction, 2026-10-20: keep one running environment, Railway Production only. This explicitly supersedes the earlier mandatory Staging rules throughout this repository. Do not create, restart, redeploy or require Staging unless the owner explicitly asks to restore it.
- The single official family-workspace address is `https://hoooho.com/family-ray-home-life-workspace`. Use it in user handoffs; do not present a test or Railway platform URL as an additional official address.
- Requested runtime changes follow: development -> appropriate local verification -> commit -> push -> integration into `main` -> Railway Production deploy -> Production verification. No Staging deployment or Staging acceptance is required.
- A feature Worktree or Branch that lacks Railway or Production configuration is not exempt from deployment. Locate the canonical repository and deploy branch, then transfer only the verified change by cherry-pick, a clean branch, or another minimal safe integration method.
- Do not report Deployment as `N/A` merely because the current Worktree cannot deploy. Report that it must be transferred to the deployment repository, and continue there.
- `DONE` is forbidden while any applicable verification, commit, push, `main` integration, or Production deploy/verification remains incomplete. “Ready to deploy”, “waiting for deployment confirmation”, and “current Worktree has no deployment configuration” are not completion states.
- If credentials, permissions, branch protection, provider failure, or a required high-risk approval prevents completion, preserve the evidence and report `BLOCKED`, not `DONE` or `N/A`.
- This delivery authorization does not permit destructive data operations, force-push, secret disclosure, bypassing security controls, or unrelated business changes.
- Documentation, release-policy and CI-verification-target changes do not require redeploying an unchanged application binary; verify the affected configuration and current Production access. Runtime/build behavior changes still require a Production deployment.
- Both Staging services were retired through the authenticated Railway dashboard on 2026-10-20. The Staging environment has zero services and one detached data volume retained as an offline backup; do not delete it or recreate test services. Production is the only running environment. See `docs/production-only-policy.md` for verified evidence.

### Release targets and cost control — owner instruction 2026-10-28

- Follow `docs/release-environments.md` for each channel's purpose, release order, review and completion receipt. A request to submit code does not authorize uploading every client. Runtime changes still follow the existing main/Production chain unless the owner explicitly narrows the task to a branch or says not to deploy.
- Keep local preview/test servers on demand and stop task-owned servers after verification. Preserve source and data. Keep Production available; do not restore Staging or stop the independent family product as part of health-client housekeeping.
- Keep relevant verification. Superseded checks in the same PR may be cancelled; historical one-off branch triggers and automatic paid/Production acceptance must not be reintroduced. Real provider calls and Production writes follow the task's existing authorization and budget.
- Native CI remains scoped to native-related changes or explicit manual runs. TestFlight upload stays manual; App Store submission and mini-program release are separate targets. Reuse an eligible validated build for App Store submission instead of rebuilding every channel by default.
- The current iOS container uses the shared Production site. Web releases can affect installed beta and release containers, so verify compatibility rather than assuming that installation channels isolate data or backend behavior.

### Existing Codex Thread rule refresh

- A new Codex Thread must read both `$CODEX_HOME/AGENTS.md` and this repository `AGENTS.md` before work begins.
- Existing Threads may not reliably hot-load later rule changes. Before resuming an existing development task, compare the Thread start context with the applicable rule file update times; if the Thread predates either file, re-read both rule layers before continuing.

Hoooho Design System V2 is the project's current visual baseline; V1 is historical only.
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

See `docs/hoooho-design-system-v2.md` for the component and token contract and `docs/ui-audit-v2.md` for the review checklist.

## Impeccable 使用规则

Hoooho Design System V2 是当前视觉基线；V1 只保留为历史。

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
- 更换 Hoooho Design System V2
- 修改主色、Typography Scale、Radius、Shadow 基线
- 引入新的 UI Framework
- 改变冻结的信息架构和业务交互

所有 Impeccable 优化必须：

1. 先读取 Hoooho Design System V2；
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

- Email verification authentication follows the production-only delivery chain: automated verification -> commit -> push -> integration into `main` -> Railway Production -> online acceptance, including real-email acceptance when authentication behavior changes. Do not require a separate test environment.
- Before a Production deployment, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and `AUTH_TOKEN_SECRET` must be configured as Production environment-scoped secrets and must never be committed or printed in logs.
- `AUTH_EMAIL_FROM` must be an actual sender allowed by the configured Resend account. Do not guess or deploy an unverified sender.
- The 2026-10-20 production-only instruction applies to internal/family use and future updates. Do not restore the former mandatory Staging gate from historical release notes.

## Hoooho global interaction optimization boundary

When auditing or optimizing interactions, freeze the first-level page structure, navigation and information architecture, approved copy, existing business flows, backend APIs and data structures, brand direction, established names including “健康随记”, nurse characters and original video assets, unrelated animations, and any page or module explicitly frozen by product management.

Unless the current task explicitly authorizes it, do not add or remove first-level capabilities; merge, split, or rename business modules; rewrite product copy; redesign a whole page; change layout hierarchy based on personal taste; expand interaction work into a visual redesign; or install a production dependency.

Inside those boundaries, interaction work may repair non-responsive controls and bad event bindings; missing loading, success, failure, disabled, and retry states; duplicate submissions; broken dialog, drawer, focus, scroll, and back behavior; mobile keyboard, safe-area, obstruction, viewport, and touch-target defects; demonstrated motion, media-continuity, flicker, or layout-shift defects; clear cross-page interaction inconsistencies; and necessary accessibility semantics or keyboard behavior.

Repository-wide interaction audits must use `.agents/skills/hoooho-interaction-audit/`. Inventory and classify before remediation; static source inspection cannot substitute for real browser operation. Parallel agents may perform independent read-only review lanes and return structured evidence, but the primary agent owns all source edits so agents do not concurrently modify the same files.

## Hoooho visual acceptance authority

AI visual scores, blind reviews, and automated gates are supporting evidence only; they do not constitute product-owner acceptance. Without explicit product-owner approval, do not mark a visual exploration as a final success, add it to Approved Screens, or automatically propagate it across the product.

## Shared execution contract (ChatGPT and Codex)

These rules apply to every task, regardless of whether it is executed directly in ChatGPT, in Codex, or through a generated handoff prompt.

- Start from the canonical repository and current `origin/main`; record the base commit, branch and working-tree status. Another workspace is not assumed identical merely because it uses the same repository. Preserve uncommitted work and isolate the task.
- Before editing, turn the user's confirmed requirements into one acceptance checklist, with the named surface, permitted behavior changes, frozen boundaries and necessary direct dependencies. The executor owns this bookkeeping; do not ask the user to reconfirm information already supplied.
- Implement the smallest sufficient change. Do not add unrelated refactors, copy changes, dependencies, API/data/AI changes or product capabilities. Discovering a necessary dependency does not authorize unrelated work.
- Use V2 tokens and existing components. Preserve approved page-specific behavior and current business data. A user's explicit local layout or interaction request authorizes that change only; it does not authorize a global migration.
- Reuse the same checklist in any Codex handoff. Include the base commit, scope, acceptance checks and the mandatory delivery chain; do not summarize away requirements or invent extra ones.
- Review the final diff against the scope, run the required build and relevant automated checks, and operate the changed flow in a real browser at mobile widths. Distinguish browser emulation from physical iPhone/Safari verification; report unverified checks explicitly.
- Follow the delivery chain above. Report implementation, checks, deployment and product-owner acceptance separately. Identical process and observable acceptance criteria are required; do not promise identical code or guaranteed identical model output.
