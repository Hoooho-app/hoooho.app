# Hoho HealthEventRecord 数据架构 V1.0

> 文档状态：设计确认稿  
> 适用阶段：Hoho V1.5  
> 本阶段范围：原始文字记录、记录类型、发生时间、时间线排序、账号隔离  
> 本阶段不包含：AI 提取、症状结构化、附件、语音文件、医疗建议、医生摘要

## 1. 设计结论

`HealthEvent` 是一次健康问题的容器，`HealthEventRecord` 是该问题发展过程中的一条原始事实记录。

```text
Account
  └── FamilyMember
        └── HealthEvent
              └── HealthEventRecord (0..N)
```

V1.0 采用一个统一记录模型承载用户文字记录，不为症状、用药、检查、就诊分别建表。事件详情页的时间线直接由记录按发生时间派生，不再保存一份重复的 Timeline 数据。

核心原则：

1. 用户原文是事实来源，保存时不得自动改写。
2. `occurredAt` 表示事情发生的时间，`createdAt` 表示用户录入的时间，两者必须分开。
3. 记录只属于一个健康事件，并通过事件继承账号和家庭成员归属。
4. AI 将来只能读取记录并生成独立结果，不能覆盖原始记录。
5. V1 先保证可记录、可排序、可修改、可删除和不可跨账号访问。

## 2. 模型职责与边界

一条 `HealthEventRecord` 表达一个用户愿意独立回看和编辑的事实或行为，例如：

- `2026-08-09 09:00`：开始发热，体温 38.5℃。
- `2026-08-09 12:00`：服用一次退烧药。
- `2026-08-09 18:00`：体温下降，精神状态好转。
- `2026-08-10 10:30`：到医院就诊，医生建议继续观察。

它不负责保存：

- 整个事件的标题、状态和起止时间，这些属于 `HealthEvent`。
- 家庭成员的长期过敏史、既往史和用药史，这些属于健康档案。
- AI 推断、AI 摘要或医疗建议。
- 图片二进制或检查报告文件。
- 为前端专门复制的一份时间线数据。

## 3. V1.0 数据模型

### 3.1 字段定义

```ts
type HealthEventRecordType =
  | 'note'
  | 'symptom'
  | 'medication'
  | 'visit'
  | 'examination'
  | 'other'

interface HealthEventRecord {
  id: string
  accountId: string
  eventId: string
  memberId: string
  type: HealthEventRecordType
  content: string
  occurredAt: string
  createdByUserId: string
  createdAt: string
  updatedAt: string
}
```

| 字段 | 类型 | 必填 | 写入来源 | 用途 |
| --- | --- | --- | --- | --- |
| `id` | UUID/string | 是 | 服务端 | 记录唯一标识 |
| `accountId` | UUID/string | 是 | 从认证账号派生 | 数据隔离，不接受客户端传入 |
| `eventId` | UUID/string | 是 | 路由参数 | 所属健康事件，创建后不可修改 |
| `memberId` | UUID/string | 是 | 从 HealthEvent 派生 | 健康主体快照，便于权限校验与未来成员维度查询 |
| `type` | enum | 是 | 客户端 | 记录的业务分类，可由用户纠正 |
| `content` | text | 是 | 用户输入 | 原始文字事实，不做 AI 改写 |
| `occurredAt` | ISO 8601 datetime | 是 | 客户端或服务端默认 | 事情实际发生时间 |
| `createdByUserId` | UUID/string | 是 | 从 Token 派生 | 审计创建者，不接受客户端传入 |
| `createdAt` | ISO 8601 datetime | 是 | 服务端 | 首次保存时间 |
| `updatedAt` | ISO 8601 datetime | 是 | 服务端 | 最近编辑时间 |

### 3.2 为什么保留 memberId

`memberId` 可以通过 `eventId` 查询得到，看似重复，但建议作为服务端派生字段保留：

- 可以直接按家庭成员查询事实记录。
- 权限审计时能同时核对 Account、Member 和 Event。
- 后续做成员健康趋势时不必对所有查询都连接事件表。
- 即使未来事件归档，记录仍保留明确的健康主体。

客户端不得提交或修改 `memberId`，避免把记录挂到错误的家庭成员。

### 3.3 V1 暂不加入的字段

以下字段不进入 V1.0 基础实现：

| 字段/结构 | 延后原因 |
| --- | --- |
| `structuredData` / `confirmedData` | 尚未接入 AI 和用户确认流程 |
| `rawInput` + `AIOutput` 双层结构 | 当前 `content` 本身就是用户原始文字 |
| `attachmentIds` | 附件需要独立存储和生命周期设计 |
| `inputSource` | 第一版只有文字输入 |
| `displayOrder` | 先使用稳定的时间排序规则 |
| `version` / revisions | V1 用 `updatedAt`；需要完整审计历史时再加修订表 |
| `deletedAt` | 当前本地 JSON 可物理删除；生产数据库阶段改为软删除 |

## 4. 记录类型

| type | 使用场景 | 示例 |
| --- | --- | --- |
| `note` | 无需归入专门类别的一般变化 | “下午精神状态比上午好。” |
| `symptom` | 症状、体征或主观不适 | “晚上体温 38.5℃，伴随咳嗽。” |
| `medication` | 用户已经采取的用药行为 | “12:00 服用一次退烧药。” |
| `visit` | 就诊、问诊或医生沟通 | “到儿科就诊，医生建议继续观察。” |
| `examination` | 检查、检验或结果描述 | “完成血常规检查，报告待出。” |
| `other` | 当前枚举无法表达的事实 | “联系家人说明了情况。” |

约束：

- `type` 只描述记录性质，不代表诊断结论。
- `medication` 仅表示用户记录已发生的用药，不提供药物或剂量建议。
- `examination` 使用完整单词，避免与未来自动化测试概念中的 `test` 混淆。
- 用户可以通过 PATCH 修改错误分类，原文 `content` 不受影响。
- 新类型只有在 UI、统计或结构化数据确实需要区别处理时才增加。

## 5. 时间与时间线规则

### 5.1 三种时间语义

| 时间 | 含义 | 是否可编辑 |
| --- | --- | --- |
| `occurredAt` | 健康事实实际发生时间 | 是 |
| `createdAt` | 用户把记录保存到系统的时间 | 否 |
| `updatedAt` | 用户最近一次编辑记录的时间 | 否，由服务端更新 |

例如用户在 8 月 10 日补记“8 月 9 日晚上开始发热”：

- `occurredAt = 2026-08-09T20:00:00+08:00`
- `createdAt = 2026-08-10T09:15:00+08:00`

### 5.2 时间格式

- API 一律使用带时区的 ISO 8601 字符串。
- 服务端校验为有效日期，并以统一时间格式保存。
- 创建请求未提供 `occurredAt` 时，可以默认使用服务端当前时间；保存后的字段始终必填。
- V1 不解析“昨晚”“下午”等自然语言；由用户在界面选择或确认具体时间。

### 5.3 稳定排序

事件时间线默认按以下顺序升序展示：

```text
occurredAt ASC
createdAt ASC
id ASC
```

这能保证：

- 记录按事情发生顺序而非录入顺序显示。
- 两条记录发生时间相同时仍有稳定顺序。
- 前后端和测试使用同一排序约定。

若未来需要用户手动调整同一时间点的顺序，再增加 `displayOrder`，V1 不提前引入。

### 5.4 Timeline 不独立存储

```text
HealthEvent.timeline =
  active HealthEventRecord[]
  ORDER BY occurredAt, createdAt, id
```

前端现有 `TimelineEntry` 应在接入真实 API 时由 `HealthEventRecord` 映射生成，或直接改为使用 Record DTO。后端不建立第二份 `timeline` JSON，避免编辑记录后产生两份数据不一致。

## 6. 归属与权限规则

创建记录时，Service 必须按顺序执行：

1. 从 Bearer Token 获得 `accountId` 和 `userId`。
2. 按 `eventId` 查询 HealthEvent。
3. 确认事件存在且 `event.accountId === accountId`。
4. 从事件复制 `accountId`、`memberId` 到记录。
5. 保存客户端允许提供的 `type`、`content`、`occurredAt`。

读取、编辑和删除记录时：

- 必须先验证 `record.accountId === currentAccountId`。
- 还应验证其 HealthEvent 存在且属于当前账号，防止孤儿数据绕过归属检查。
- 跨账号访问统一返回 `404`，避免暴露记录是否存在。
- `accountId`、`eventId`、`memberId`、`createdByUserId`、`createdAt` 均不可通过 PATCH 修改。

事件状态规则：

- `observing`、`handling`、`recovered` 均允许添加补记，康复后仍可能需要补充就诊结果或恢复情况。
- 如果未来增加 `archived` 或事件软删除状态，再禁止新增和编辑。
- 删除 HealthEvent 时，必须同时删除或软删除其 Records，不能留下可查询的孤儿记录。

## 7. 数据校验

### 创建与编辑

- `type` 必须属于允许枚举。
- `content` 去除首尾空白后长度建议为 1–5000 字符。
- `occurredAt` 必须是有效时间。
- 允许补记过去的记录。
- 明显晚于当前时间的记录应返回校验错误；如未来支持预约或提醒，应使用单独模型。
- PATCH 至少包含一个允许修改的字段：`type`、`content`、`occurredAt`。

### 删除语义

V1 本地 JSON 阶段可以物理删除，但 Repository 接口保持抽象的 `delete(id)`。生产数据库上线前应切换为 `deletedAt` 软删除，并让所有默认查询排除已删除记录。

## 8. Repository 设计草案

未来实现文件建议：

```text
server/events/repositories/health-event-record-repository.mjs
```

Repository 只负责持久化，不负责权限判断：

```text
create(record)
findById(id)
findByEventId(eventId)
update(id, patch)
delete(id)
deleteByEventId(eventId)
```

本地存储建议使用独立集合或文件，例如 `health-event-records.json`，不要把 Records 嵌套写入 HealthEvent 对象。独立存储更接近未来数据库的一对多关系，也避免每新增一条记录都重写整个事件。

## 9. API 草案

本节只冻结接口契约，不在本任务中实现。

### 9.1 新增记录

```http
POST /api/events/:eventId/records
Authorization: Bearer <token>
Content-Type: application/json
```

请求：

```json
{
  "type": "symptom",
  "content": "晚上体温 38.5℃，伴随轻微咳嗽。",
  "occurredAt": "2026-08-09T20:00:00+08:00"
}
```

返回 `201`：

```json
{
  "id": "record-uuid",
  "accountId": "account-uuid",
  "eventId": "event-uuid",
  "memberId": "member-uuid",
  "type": "symptom",
  "content": "晚上体温 38.5℃，伴随轻微咳嗽。",
  "occurredAt": "2026-08-09T20:00:00+08:00",
  "createdByUserId": "user-uuid",
  "createdAt": "2026-08-09T20:05:00+08:00",
  "updatedAt": "2026-08-09T20:05:00+08:00"
}
```

### 9.2 获取事件记录

```http
GET /api/events/:eventId/records
Authorization: Bearer <token>
```

返回 `200`，默认按时间升序：

```json
{
  "items": [
    {
      "id": "record-uuid",
      "eventId": "event-uuid",
      "memberId": "member-uuid",
      "type": "symptom",
      "content": "晚上体温 38.5℃，伴随轻微咳嗽。",
      "occurredAt": "2026-08-09T20:00:00+08:00",
      "createdAt": "2026-08-09T20:05:00+08:00",
      "updatedAt": "2026-08-09T20:05:00+08:00"
    }
  ],
  "nextCursor": null
}
```

V1 数据量较小时可以一次返回全部记录，但响应保留 `items` 结构，未来增加游标分页不会改变顶层类型。

### 9.3 修改记录

```http
PATCH /api/records/:recordId
Authorization: Bearer <token>
Content-Type: application/json
```

请求只允许以下字段：

```json
{
  "type": "medication",
  "content": "12:00 服用一次退烧药。",
  "occurredAt": "2026-08-09T12:00:00+08:00"
}
```

返回更新后的完整 Record。

### 9.4 删除记录

```http
DELETE /api/records/:recordId
Authorization: Bearer <token>
```

返回：

```json
{
  "success": true
}
```

### 9.5 错误约定

| HTTP | code 示例 | 场景 |
| --- | --- | --- |
| `400` | `INVALID_RECORD_TYPE` | 类型不受支持 |
| `400` | `INVALID_OCCURRED_AT` | 时间无效 |
| `400` | `EMPTY_RECORD_CONTENT` | 记录内容为空 |
| `401` | `UNAUTHORIZED` | Token 缺失或失效 |
| `404` | `EVENT_NOT_FOUND` | 事件不存在或不属于当前账号 |
| `404` | `RECORD_NOT_FOUND` | 记录不存在或不属于当前账号 |

## 10. 事件详情页数据需求

V1 详情页的时间线只需要：

```ts
interface HealthEventRecordListItem {
  id: string
  eventId: string
  type: HealthEventRecordType
  content: string
  occurredAt: string
  createdAt: string
  updatedAt: string
}
```

展示规则：

- 左侧时间来自 `occurredAt`。
- 正文来自 `content`。
- 图标或标签由 `type` 映射，但不得改变原文。
- 编辑后重新按稳定排序规则排列。
- 空数组即详情页“尚无过程记录”状态。

HealthEvent 列表页在 V1.5 不需要加载全部 Records。未来如需显示“最后更新”，由后端聚合返回 `lastRecordAt` 和 `recordCount`，而不是把记录列表嵌入每个事件。

## 11. 未来 AI 数据边界

AI 接入后保留以下单向关系：

```text
HealthEventRecord.content (用户原始事实)
          ↓ read only
AIExtraction / AISummary (独立派生数据)
          ↓
用户查看、编辑并确认
```

必须遵守：

- AI 不覆盖 `content`。
- AI 结果保存到独立实体，并记录 `sourceRecordId`。
- AI 结果记录输入版本，例如 `sourceUpdatedAt` 或 `inputHash`；原记录编辑后，旧结果标记为过期。
- AI 失败不影响用户保存原始记录。
- AI 输出不是诊断，不自动写入长期健康档案。

未来可能增加：

```text
AIExtraction
  id
  accountId
  eventId
  sourceRecordId
  inputHash
  outputData
  status
  modelName
  promptVersion
  createdAt
```

该结构不是 V1.5 的实现范围。

## 12. 测试验收清单

后续开发至少覆盖：

1. 登录账号能为自己的事件创建一条文字记录。
2. 能为本人和孩子的事件分别创建记录，`memberId` 自动继承正确。
3. 按乱序创建三条记录，GET 仍按 `occurredAt` 升序返回。
4. 相同 `occurredAt` 的记录按 `createdAt`、`id` 稳定排序。
5. 可以修改 `type`、`content`、`occurredAt`。
6. 不允许修改 `accountId`、`eventId`、`memberId`。
7. 可以删除自己的记录，删除后不再出现在列表。
8. 无 Token 请求返回 401。
9. 账号 A 不能为账号 B 的事件创建记录。
10. 账号 A 不能查询、修改或删除账号 B 的记录。
11. 不存在或无权访问的记录统一返回 404。
12. 删除 HealthEvent 时，其 Records 不留下可访问的孤儿数据。

## 13. V1 与后续边界

### V1.5 实现范围

- 独立 HealthEventRecord 存储。
- 六种基础类型。
- 文字原文保存。
- 发生时间和稳定排序。
- Repository、Service、CRUD API。
- 账号、事件和成员归属校验。
- 单元/集成测试。

### 后续版本

- 语音输入和原始音频生命周期。
- 图片附件与检查报告。
- 体温等结构化健康指标。
- AI 信息提取和用户确认。
- 事件摘要与就诊摘要。
- 修订历史、软删除和审计日志。
- 基于 Records 的健康趋势分析。

## 14. 推荐开发顺序

1. 建立 `HealthEventRecord` repository 和独立 JSON 存储。
2. 建立 service，集中处理事件归属、成员派生和校验。
3. 实现四个 CRUD API。
4. 完成权限隔离和稳定排序测试。
5. 让健康事件详情页从 GET Records 获取真实时间线。
6. 冻结真实记录层后，再设计附件、结构化字段与 AI 派生层。

这个顺序确保后续 AI、医生摘要和健康统计都有稳定、可追溯的事实来源，而不会反向改写用户原始健康记录。
