# V3 图标剩余页面与状态核验（2026-10-29）

## 任务契约

- 基线：`origin/main` `7476ca628cbf5bb1dcd2e8666a2eff13a5c7803d`，开始时工作区干净；分支 `codex/material-icons-state-audit-20261029`。
- 本轮承接已批准、已上线的 Material Symbols Rounded V3，全局替换本体已完成；仅补关于 8 个子页、账号绑定、档案与记录详情的真实页面状态证据。
- 普通案例：家长打开关于子页后返回；查看账户绑定状态，失败后可重试或取消；在孩子档案与健康日历中打开已有记录、关闭并重开，仍能读到原文。所属账号与孩子始终由原有会话和服务端决定。
- 图标必须继续使用固定 `wght=300 / opsz=24 / GRAD=0` 原件；持久选中态才使用实心，普通返回、关闭、错误和菜单动作保持空心；Apple / 微信 / QQ 保留品牌原件。
- 核验正常、空、加载、禁用、失败、重试、关闭、返回、刷新、重开中适用的分支。取消不产生绑定、删除或额外保存，既有记录不丢失；验证码和第三方授权只使用拦截的合成失败响应。
- 冻结导航、布局、文案、业务接口与数据、AI、护士与头像、身体图和隐藏路由；不为了核验解锁隐藏功能。明确复现的图标缺陷按现有单一 Production 链修复，不扩展到 TestFlight、App Store 或小程序。
- 环境：本地隔离临时数据服务器、真实应用路由和浏览器，375×667 / 390×844 / 430×932，Chromium 手机模拟；不调用真实邮件、短信、OAuth 或 AI，不写 Production 用户数据。

## 验收记录

本轮共核验 14 个页面/详情入口（关于主页及 8 个查询子页、第三方账户、手机号、邮箱、手术史、日历记录详情），5 组流程 × 3 种宽度 = **15/15 PASS**，没有跳过或重试后转绿。它是剩余重点状态的补查，不能据此声称全部 99 个路由的所有业务状态均已实测。

| 入口 | 操作与预期 | 实现归属 | 运行结论 / 证据 |
| --- | --- | --- | --- |
| `/about` | 8 条文字入口各保留一个空心右箭头；品牌原件保留 | `src/pages/About/index.tsx`、`HohoSurfaceRow` | PASS；`about keeps…` / `about.png` |
| `/about?section=updates/terms/privacy/children/boundaries/permissions/legal/business`（各自独立查询值） | 逐项打开、刷新、返回，标题正确且返回图标保持空心 | `AboutPage`、`WebPageHeader` | PASS；同一用例对 8 个真实查询页逐一操作 |
| `/account/providers` | 3 个原始品牌标识继承容器白色；合成绑定失败后可重试；关闭解除绑定弹层不发解除请求，原始形状不随状态改变 | `AccountProvidersPage`、`ProviderBrandIcon` | PASS；`provider brands…` / `provider-paints.json` / `providers-error.png` |
| `/account/phone`、`/account/email` | 空输入禁用；合成发送失败后恢复操作；确认绑定时加载图标可见且禁用，失败后恢复，无邮件/短信/OAuth 外呼 | `AccountBindingPage`、`HohoButton`、`StatusNotice` | PASS；`phone and email…` / `phone-error.png` / `email-error.png` |
| `/health-profile/surgery` | 空态添加、合成读取失败、重试、取消草稿、已有记录菜单、取消删除；无额外保存或删除 | `InlineChildProfilePage`、`BottomSheetSurface` | PASS；`profile empty…` / `profile-record.png` |
| `/health-events?eventId=…&recordId=…` | 详情加载、合成失败、重试、关闭、重开与刷新；原文仍可读；关闭后日历导航实心、未选中导航空心 | `JournalRecordDetail`、`MainBottomNavigation` | PASS；`journal detail…` / `journal-detail.png` |

表中简称对应 `tests/material-icons/page-states.spec.ts` 的完整用例名。原始截图、诊断附件与 JSON 总结保存在忽略的 `test-results/material-icon-states/`。种子清单扫描 1,012 个文件、99 条路由，仅用于确定入口，不作为运行 PASS 证据。

## 唯一产品发现：IC3-001（P2，已修复并本地复验）

- 路由/控件：`/account/providers` 的 Apple / 微信 / QQ 标识，其中黑色 Apple 在 `#111` 底块上难以辨认。
- 复现：以隔离账号打开第三方账户页。原始 SVG 的路径为 `fill="black"`；既有 `.provider-mark` 明确设置白色，但路径覆盖了容器颜色。实际观测 3 个 SVG 的 `color` 均为 `rgb(255, 255, 255)`，4 条路径的 `fill` 均为 `rgb(0, 0, 0)`。
- 根因与修复：`ProviderBrandIcon.tsx` 提取本地单色原件时，将路径的黑色绘制改为 `currentColor`，让现有宿主样式决定颜色。没有改动任何原始 SVG 文件、`d` 几何、viewBox、布局、底色或品牌形状。
- 反例：先添加真实页面颜色断言，旧构建在 430 宽度确定失败；保留于 `.codex-tmp/material-icon-states/paint-before.log`、`paint-before-results.json`、`providers-before-430.png`。
- 修复后：375 / 390 / 430 的 4 条路径全部为白色，账号错误/取消状态不改品牌形状；登录使用同一组件，图标库状态回归通过。风险局限为同一组件的单色填充继承。
- 统计：P0=0、P1=0、P2=1（已修复）、P3=0；无待产品决策项，无未修复的本轮已确认图标问题。

## 验证与交付边界

- `npm run build`：PASS，包含类型、314 个 Material 原始 SVG 完整性、头像/身体/图片资源、视口及认证构建契约。
- `TZ=Asia/Shanghai npm run test:client`：**802/802 PASS**。
- `npx playwright test -c tests/material-icons/page-states.config.ts`：**15/15 PASS**，约 47 秒；3 宽度共 24 个预设 503 响应以及对应 24 条浏览器资源错误均来自故障注入；未捕获页面异常为 0。
- `npx playwright test -c tests/material-icons/playwright.config.ts`：**4/4 PASS**，包括 157 组原始形状、显式选中态、原生选项与 16 个食物文字/PNG 导出。
- 初始核验脚本准备期间的 WebKit 缺失、错误读取旧会话存储及错误拦截路径属于新测试夹具问题，已改为本地 Chromium、真实注册响应和实际 `/api/events/:id` 请求；未因此改动认证或记录产品代码。
- 浏览器为 Chromium 手机模拟；物理 iPhone、Safari、微信宿主、真实第三方授权仍为 NOT_RUN。隐藏功能保持既有路由重定向；其他未在上表覆盖的页面/状态不计入本轮 PASS。
- 分支：`codex/material-icons-state-audit-20261029`；改动仅共享品牌图标组件、两份核验文件和本报告。原始证据、生成截图和本地数据不提交。
- 发布前正式站检查：`https://hoooho.com/login` 可访问；既有正式运行版本为 `84d0d39e865bdc491a5afae6b2e28d2e767581f6`，部署 `d03f9d14-1347-46ca-a464-862f901dfa7b` 为 SUCCESS。
- 本报告在本地验证后随修复提交，不预填尚未发生的发布结果。提交、推送、main 集成和新 Production 回执补充到同一 PR 说明；正式状态以终态 SUCCESS 及对应提交核对。Staging 按现行规则不启用；本轮不上传原生或小程序安装包。
- 当前文档状态：LOCAL_PASS；最终交付状态与线上验收回执见本变更 PR。图标方案沿用用户已批准的 V3，本报告不冒充真机或产品主人视觉验收。
