# 首页症状跟进与智能记录保存反馈

首页只展示当前成员的一个活跃症状事件，数量仍表示全部活跃症状事件。只读 `followup` 投影新增 `hasSymptom`、`description`、`keyword`；原有跟进列表及事件不删减。首页按有效过程记录的 `latestOccurredAt` 降序、事件 ID 降序选择，首次及最近日期使用真实发生时间，以 Asia/Shanghai 显示。未知时间不替换为录入或更新时间。

智能记录仍通过现有草稿确认、事务和幂等保存。普通饮食、睡眠、接种等保存不会新建症状跟进状态；向已有跟进事件补充记录保留原状态。

保存结果 `result.records` 保留原有 `eventId`、`recordId`，增加 `memberId`、实际 `category` 和 `profileEntries: [{sectionId, entryId}]`。档案条目定位来自本次持久化实体及既有来源关联，接种条目沿用随记记录 ID / 接种 item ID，不查询最新记录。

成功引导存放在原有成员/账号隔离的 CaptureDraft 中，使用草稿 ID、记录 ID、档案条目 ID 去重。只有服务端确认 `state=saved` 且返回真实定位信息后生成；事务失败保留原草稿，丢失保存响应时只恢复相同草稿。当前保存为全事务，不存在未确认的部分成功。

“查看记录”校验原记录/条目仍可访问，并保存现有对话的输入、媒体、滚动位置；“知道了”只收起该引导的按钮。记录失效时显示简短不可用反馈，不跳到其他记录。分类页的 `entryId` / `memberId` 查询只用于现有条目定位及成员校验。

自动验收：`npx playwright test --config tests/symptom-save-feedback/playwright.config.ts`。隔离合成账号使用真实 API 与持久化事务，AI 输出使用现有测试替身，覆盖 320、375、390、430px；实际运行截图由测试生成，不代表真实付费模型或实体手机验证。
