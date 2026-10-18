# 排敏观察实现与验收

Base: e224119348dc2c372a02266adc1cea98aead5a06 (origin/main)
Branch: codex/food-observation-20261018; initial worktree clean.

## 已确认范围

- [x] 侧边栏「辅助工具」→「排敏观察」；复用 V2 组件与 tokens。
- [x] 每张食物卡同一行显示起止日期、绿色可点击的「已过天数／观察天数」；点击仅设置该项。删除重复的日期／设置行。短周期分段、长周期连续显示。
- [x] 每项独立 3/7/14/30/自定义 1–365 天，不增加全局时长设置。
- [x] 手动加入与明确开启后的自动观察；真实确认饮食记录是来源，未知／未来／未吃／计划／母亲进食／混合食品推断不启动。
- [x] 复用树芽账本：30 树芽解锁 30 天，可信服务端订阅权益可直接使用；幂等扣费；有效期内全部食物。到期不新建，已有观察可完成回访和读取历史。
- [x] 进度满进入待回访；饮食持续情况与新增／加重症状分别确认，未知或冲突不会自动判定成功。
- [x] 汇总保留正式来源与家长回忆的区别；无医学排除／耐受结论，不自动改过敏档案。来源修改／删除重新计算，历史汇总固定并标记变化。
- [x] 账户与孩子隔离、跨账户拒绝、并发／重试幂等、切换孩子忽略过期请求、关闭自动不删除已有观察。
- [x] 账户合并／删除、孩子删除涵盖观察数据；不更换 AI 模型、不影响原健康随记／排敏测试流程。

## 交付验证

- [x] 服务端相关测试、客户端／typecheck、完整 build。
- [x] 真实 Chromium 手机尺寸浏览器操作，包括入口／兑换／逐项设置／回访／空态与重试。注明模拟与真机区别。
- [ ] commit → push → main 整合 → Railway Staging 成功与在线验收 → Production 成功与在线验收。

Scope excludes unrelated UI, models/providers, assets and historical medical data. AI scores do not constitute product-owner acceptance.

## 本地验收记录

- `TZ=Asia/Shanghai npm run test:client`：745 passed（项目既有日期用例以此时区运行）。
- 新服务端观察用例：16 passed；含并发扣费、回访冲突、来源变更、到期、账户合并与删除。
- 呵护权益与生命周期回归：21 passed；核心认证／孩子／事件／记录／账户回归：51 passed。
- 智能记录业务回归：208 passed；guest/session/storage/account 回归：21 passed。
- `npm run build`：PASS；`git diff --check`：PASS。
- `node scripts/verify-food-observations.mjs`：PASS。真实 Chromium 的 320/390 手机尺寸模拟；入口、真实本地树芽兑换、逐项时长、7段与30天连续进度、回访、汇总下载、关闭自动、后台在未重新打开页面前持久化新食物均通过。无 pageerror、无横向溢出。测试仅使用隔离目录内的虚构账户与记录。
- 视觉复验补齐执行环境中的 Noto CJK fallback 后完成；应用字体、资产和全局视觉基线未改变。实体 iPhone/Safari 未验证。
- 确认没有新增模型调用，没有修改旧版排敏测试或自动改变过敏档案。

## 发布验收方式

`node scripts/verify-food-observations-release.mjs <known-origin> <full-SHA>` 对 Staging / Production 核对运行时 SHA、健康状态、新权益目录、未解锁拒绝写入、侧边栏入口、解锁弹层和重新加载；仅创建并删除虚构验收孩子，不修改真实钱包或患者记录。完整扣费与回访链路在相同源代码的隔离生产服务器验收。
