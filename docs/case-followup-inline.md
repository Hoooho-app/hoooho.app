# 情况跟进：卡片内闭环

范围仅 `/cases` 与必要的共享表单/服务适配。首页、独立记录页、档案布局不变。

## 单一数据源

情况 ID 仍为 HealthEvent ID。继续记录与资料调用现有 case-records、HealthEventRecord、附件和 AI business 草稿服务；成员与情况归属由服务器复核，不按症状相似度合并。重复保存使用稳定 requestId；事务失败不留下半记录。

列表新增只读 followup 投影，优先已有症状摘要/关键词，缺少时仅截取原文短句，不新增模型调用，不修改原文。记录数、最早和最近时间按真实发生时间计算。未知时间不冒充录入时间。此页面按用户确认的早到晚顺序展示，其他健康随记保留既有倒序。相同时间按 createdAt、id 稳定排序；未知时间另列在已知时间后，并明确说明。

症状组件的 embedded 模式不使用全屏 portal、不锁 body、不内嵌滚动；完整语音、定位、图片/视频、上传失败恢复和校对能力复用。正文/发生时间为主要输入。设备草稿包含账号、成员、情况作用域；切换、返回和改变状态提示离开保护。资料原件与人工校对草稿沿用 IndexedDB，识别草稿沿用既有服务器服务。

资料先明确保存原件到当前情况，再人工核对或使用原识别服务。识别结果未经确认不能成为正式诊断。新增可选 sourceRecordId 仅允许指向当前成员当前情况的既有资料记录；首次核对项更新同一记录，附件按原哈希去重，后续不同结构化项仍按原分发规则保存。revision 校验防止校对覆盖后来的修改，撤销恢复原记录、不删除其既有原件。档案分发仍调用原 archiveItem。

## 康复与旧归档

旧 archive API 和 caseArchivedAt 仍兼容。新增 recovery API 支持 recover / restore / undo、requestId 与 expectedArchivedAt。新增字段均可选：caseArchiveReason、caseRecoveryMarkedAt、caseStateHistory。显式康复同步既有 status=recovered / recoveredAt；恢复清空康复时间并回到 observing。操作历史保存前态，撤销只允许最后一项并防止覆盖新观察安排。

新的用户康复以 user_recovered 区分通用 general 归档。历史已明确 status=recovered 且有 recoveredAt 的保留原含义；未知旧归档显示“历史归档”，保留原归档时间，不补造康复原因或日期。没有破坏性迁移，没有历史数据重写，没有自动康复规则。康复暂停既有观察；普通恢复不自动重启观察，立即撤销才恢复前态。

## 验证

`node --test server/events/case-continuity-service.test.mjs` 包含时间、隔离、事务、幂等、恢复/撤销和原件核对回归。

`npx playwright test --config tests/case-continuity/followup.config.ts` 先构建真实产物，使用独立端口 4616/4617/4618 与临时合成数据，包含原有情况、症状、首页入口回归及新增内嵌闭环/320–430px检查。AI故障/成功由隔离测试服务模拟，不代表真实供应商识别或物理 iPhone 的麦克风、相机、软键盘验收。

线上验证使用单独合成账号与成员，只清理本次生成的数据；不得借用真实用户记录。实际 Git、Staging、Production 版本与验收结果在发布证据中报告，不能以本地通过替代生产通过。

`followup-webkit.config.ts` 在独立后台 WebKit 执行同一新增流程，不继承 Chrome 启动路径，不改变可视预览。后台 WebKit 通过仍不等于物理 iPhone 相机、麦克风、文件选择器或软键盘通过。保存/康复/核对请求 45 秒超时后保留草稿并允许稳定标识重试；撤销响应丢失也复用同一 requestId。

完整服务器回归的已知基线失败：`ops-service.test.mjs:62` 固定使用 2026-09-02 的失败样本，`history()` 按当前日期清理超过 30 天的非重要历史；到 2026-10-04 失败样本被清理，仅最近成功快照被保留，断言失败。Operations 实现与测试未改，Git blob 与 main 相同（实现 `8816eefb96d0846cc25b39ab092f200fb2ce3659`，测试 `92d791e73992f674147684ba10dcc8a4699ca329`）。完整测试 202/203 PASS、该项 FAIL；独立重跑同样失败。风险限定为既有 Operations 日期依赖测试，不影响本次情况记录、资料或状态服务；不删除/弱化该测试，不将完整服务器测试记作 PASS。
