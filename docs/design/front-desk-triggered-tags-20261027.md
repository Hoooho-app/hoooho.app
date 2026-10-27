# 前台条件入口与配色

Base: `73d10910` (`origin/main`), clean isolated branch `codex/front-desk-triggered-tags-20261027`.

Scope: 前台首页顶部持续入口、首次整理操作及底部四个标签。沿用现有记录、编辑、保存、整理接口与对象隔离；不修改后台、解析、数据结构、其他页面或全局主题。

Acceptance checklist:

- [x] 初始和未保存草稿不显示顶部记录入口，也不保留空栏。
- [x] 真实保存成功且记录可访问后，出现“症状记录单”；保存失败不提前出现。
- [x] 保存后继续修改可从同一顶部入口查看最新记录单。
- [x] 对话内保留“一键整理”；只有生成成功且内容可查看时，顶部出现“就诊清单”。
- [x] 整理进行中或失败不提前挂出清单；刷新、修订、对象切换沿用最新内容和现有隔离规则。
- [x] 两个顶部入口顺序稳定，绿色／蓝色略深；无标签时整个栏不渲染。
- [x] 底部顺序和文案保持“记录症状／就诊资料回传／用药／日常”，分别浅绿、浅蓝、浅紫、相近浅粉紫。
- [x] 320／375／390／430px 浏览器下可操作、无溢出，相关浏览器回归及完整构建通过。
- [ ] 提交、推送、合并 main、Railway Production SUCCESS、正式站读取核验。仅 Production，不创建 Staging。

Product-owner approval: 2026-10-27 用户确认三屏高保真并要求直接实现。本地移动浏览器仿真不代表实体 iPhone 验证。

Local validation: production build PASS; `TZ=Asia/Shanghai npm run test:client` 789/789 PASS; front-desk mobile browser regression 60/60 PASS (375, 320, 390, 430px); blank PDF original retention browser regression 1/1 PASS. Screenshots reviewed for empty top area and completed entry colors. Supplier replies in local regressions are synthetic; persistence, routing and browser operations are real. Production rollout and live validation will be recorded in the implementation PR.
