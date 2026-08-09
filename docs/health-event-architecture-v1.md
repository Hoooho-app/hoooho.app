# 《Hoho HealthEvent 数据架构 V1.0》

> 项目代码与品牌当前使用 `Hoooho`；本文沿用任务名称 `Hoho V1.3`。  
> 文档版本：V1.0  
> 日期：2026-08-09  
> 状态：设计确认稿，未实现

## 0. 文档范围

本文定义 Hoho 核心领域 `HealthEvent` 的数据边界、状态、内部记录、AI 整理链路、API 草案和页面数据需求。

本文不涉及：

- UI 改版；
- API 实现；
- 数据库选型实施；
- 医疗诊断、处方或治疗建议；
- 多账号共同管理家庭的完整权限体系。

设计基线：

```text
Account/User
    |
    +-- FamilyMember
            |
            +-- HealthEvent
                    |
                    +-- HealthEventRecord
                    +-- Symptom
                    +-- Attachment
                    +-- AIExtraction
                    +-- AISummary
```

---

## 1. 产品目标分析

### 1.1 HealthEvent 是什么

HealthEvent 表示某个家庭成员的一次具体健康问题或健康变化过程，例如发热、咳嗽、腹痛、外伤、过敏或暂时无法分类的不适。

它不是：

- 医学诊断；
- 单次体温读数；
- 一张检查报告；
- 一条聊天消息；
- 一份长期健康档案。

它是一个有开始、有持续记录、最终可结束和总结的业务聚合。

### 1.2 产品需要解决的四件事

1. 保存用户对“发生了什么”的原始描述。
2. 持续记录症状、体温、处理、检查和就医过程。
3. 在用户确认后，将信息整理成便于就诊沟通的摘要。
4. 事件结束后保留可追溯记录，并与长期健康档案形成关联。

### 1.3 不能破坏的领域规则

- 每个 HealthEvent 必须属于一个 `FamilyMember`。
- 每个 HealthEvent 必须属于当前账号的数据边界 `accountId`。
- `accountId` 从 Token 推导，客户端不能自行指定可信归属。
- FamilyMember 资料后来发生变化，不能无声改写历史事件中的对象信息。
- 用户原始输入不能被 AI 输出覆盖。
- AI 输出只有在用户确认后，才能成为结构化健康数据。
- “没有内容”是记录数量为零，不是事件生命周期状态。
- 时间线是事件记录按发生时间排列后的结果，不应维护第二份重复事实。

---

## 2. ER 关系

### 2.1 文字关系图

```text
Account 1
  |
  +-- N FamilyMember
          |
          +-- N HealthEvent
                  |
                  +-- N HealthEventRecord
                  |       |
                  |       +-- N AIExtraction
                  |       +-- N Attachment
                  |
                  +-- N EventSymptom
                  +-- N Attachment
                  +-- N AISummary
                  +-- N EventAction（V2）
```

### 2.2 关系解释

- `FamilyMember -> HealthEvent`：业务归属关系。
- `Account -> HealthEvent`：权限隔离和查询索引关系，属于受控冗余。
- `HealthEvent -> HealthEventRecord`：事件内每次事实记录。
- `HealthEventRecord -> AIExtraction`：某次原始输入的 AI 提取草稿，可有多个版本。
- `HealthEvent -> AISummary`：基于整个事件生成的摘要版本。
- `Attachment` 可以直接属于事件，也可以进一步关联某条记录。
- `EventSymptom` 是用户确认后的可查询症状数据，必须能够追溯到来源 Record。

---

## 3. HealthEvent 主模型

### 3.1 推荐表：health_events

| 字段 | PostgreSQL 类型 | V1 必需 | 允许为空 | 用途 |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | 是 | 否 | 事件唯一标识 |
| `accountId` | `uuid` | 是 | 否 | 账号数据边界；由服务端从 Token 确认 |
| `memberId` | `uuid` | 是 | 否 | 事件对应的家庭成员 |
| `title` | `varchar(120)` | 是 | 是 | 用户可读标题；初始事件可以为空，记录后再提取或填写 |
| `category` | `varchar(30)` | 是 | 否 | 粗粒度分类，默认 `other`，不是诊断 |
| `status` | `varchar(20)` | 是 | 否 | `observing`、`handling`、`recovered` |
| `startTime` | `timestamptz` | 是 | 否 | 用户认为问题开始的时间；不知道时可先取创建时间并标记精度 |
| `startTimePrecision` | `varchar(20)` | 建议 | 否 | `exact`、`approximate`、`date_only`、`unknown` |
| `endTime` | `timestamptz` | 是 | 是 | 事件结束时间；恢复前为空 |
| `lastRecordAt` | `timestamptz` | 建议 | 是 | 列表排序与“最近更新”展示 |
| `subjectSnapshot` | `jsonb` | 建议 | 否 | 事件创建时的姓名、性别、年龄显示和关系快照 |
| `createdByUserId` | `uuid` | 是 | 否 | 创建事件的操作者 |
| `createdAt` | `timestamptz` | 是 | 否 | 系统创建时间 |
| `updatedAt` | `timestamptz` | 是 | 否 | 最后更新时间 |
| `recoveredAt` | `timestamptz` | 建议 | 是 | 确认进入已康复阶段的时间 |
| `archivedAt` | `timestamptz` | 建议 | 是 | 软归档时间，不与康复状态混用 |
| `version` | `integer` | 建议 | 否 | 乐观锁，避免多端编辑互相覆盖 |

### 3.2 字段解释与约束

#### accountId 与 memberId

两者都需要保存：

- `memberId` 回答“这是谁的健康事件”。
- `accountId` 回答“哪个账号有权管理这条数据”。

创建事件时必须验证：

```text
Token.accountId == FamilyMember.accountId
```

查询事件时必须同时限制：

```text
HealthEvent.id == :eventId
AND HealthEvent.accountId == Token.accountId
```

不能先按 ID 查出事件，再只在前端判断权限。

#### title

数据库列必须存在，但值允许为空。用户刚创建事件时还没有描述，不应该自动写入“发烧”。首条记录确认后，可以生成建议标题并由用户修改。

#### category

建议 V1 值：

```text
fever
cough
abdominal_pain
injury
allergy
other
```

`category` 用于列表筛选和初始模板，不应被理解为医学诊断。一个事件可有多个症状，所以 category 不取代 Symptom。

#### subjectSnapshot

建议格式：

```json
{
  "memberName": "小明",
  "relationship": "child",
  "gender": "male",
  "birthday": "2018-06-02",
  "displayAge": "8岁"
}
```

FamilyMember 的最新资料仍是当前事实；Snapshot 用于保持历史事件的上下文一致性。

### 3.3 V2 可增加字段

以下内容不应阻塞 V1：

| 字段 | 用途 |
| --- | --- |
| `source` | 手动创建、导入、分享接收等来源 |
| `resolutionType` | 自行恢复、就医后恢复、合并到其他事件等结束原因 |
| `linkedProfileVersion` | 生成摘要时使用的健康档案版本 |
| `searchVector` | 服务端全文检索 |
| `legacyId` | 历史系统迁移映射 |
| `retentionPolicy` | 特殊数据保留策略 |

不要为“紧急程度”增加 AI 自动判断字段。若以后提供用户自报的紧急感受，应明确命名为 `userReportedUrgency`，不能表达诊断结论。

### 3.4 索引建议

- `(accountId, memberId, updatedAt DESC)`：成员事件列表。
- `(accountId, status, updatedAt DESC)`：状态筛选。
- `(memberId, startTime DESC)`：个人健康过程。
- `(accountId, archivedAt, updatedAt DESC)`：默认排除归档数据。
- `(eventId, occurredAt ASC)`：事件时间线。

---

## 4. 事件状态设计

### 4.1 方案 A：active / resolved

优点：

- 数据库与业务逻辑简单。
- 容易筛选进行中和已结束。

缺点：

- 无法表达用户只是观察，还是已经开始护理、用药、检查或就医。
- 与当前详情页三个阶段不一致。
- 后续“处理中”模块只能通过记录内容猜测。

结论：不适合作为 Hoho 唯一状态模型，可作为统计分组的派生值。

### 4.2 方案 B：observing / handling / recovered

优点：

- 与当前产品页面一致。
- 能驱动不同页面模块。
- 用户容易理解为健康事件生命周期，而不是任务进度。

缺点：

- `observing` 和 `handling` 允许往返，不能按严格线性任务流程处理。
- 需要记录状态变化历史，不能只覆盖当前值。

### 4.3 方案 C：生命周期与内容状态分离

例如：

```text
lifecycleStatus: active | resolved
careStage: observing | handling | recovered
contentState: empty | recorded
```

优点是表达最完整，缺点是 V1 会产生多个可能矛盾的字段，例如 `resolved + observing`。

### 4.4 最终建议

V1 采用方案 B，HealthEvent 只保存一个规范字段：

```text
status = observing | handling | recovered
```

另外：

- `active` 是 `status != recovered` 的派生分组，不落库。
- `resolved` 是 `status == recovered` 的派生分组，不落库。
- 空状态是 `confirmedRecordCount == 0`，不落为事件状态。
- 归档由 `archivedAt` 表达，不增加 `archived` 状态。
- 删除由 `deletedAt` 或专门删除流程表达，不增加 `deleted` 状态。

允许的状态变化：

```text
observing <-> handling
observing  -> recovered（允许直接恢复）
handling   -> recovered（需要确认）
recovered  -> observing/handling（显式重新打开并记录原因）
```

每次变化写入 `health_event_status_history` 或审计日志：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键 |
| `eventId` | `uuid` | 所属事件 |
| `fromStatus` | `varchar null` | 原状态 |
| `toStatus` | `varchar` | 新状态 |
| `reason` | `text null` | 重新打开等场景说明 |
| `changedByUserId` | `uuid` | 操作者 |
| `changedAt` | `timestamptz` | 变化时间 |

---

## 5. 事件内部数据结构

### 5.1 HealthEventRecord：独立表，作为事实流

时间线、症状描述、体温、用药、检查、就诊、担心及个性化模块，首先都来自用户的一次记录行为。V1 建议用统一记录表承载原始事实：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键 |
| `accountId` | `uuid` | 账号隔离 |
| `eventId` | `uuid` | 所属事件 |
| `memberId` | `uuid` | 健康主体，便于权限与跨事件查询 |
| `type` | `varchar(30)` | 记录模板类型 |
| `status` | `varchar(20)` | `draft`、`processing`、`confirmed`、`failed` |
| `occurredAt` | `timestamptz` | 实际发生时间 |
| `occurredAtPrecision` | `varchar(20)` | 时间准确度 |
| `rawInput` | `text null` | 用户原始文字或语音转写 |
| `inputSource` | `varchar(20)` | `text`、`voice`、`image`、`manual` |
| `confirmedData` | `jsonb null` | 用户最终确认的结构化数据 |
| `confirmedAt` | `timestamptz null` | 确认时间 |
| `confirmedByUserId` | `uuid null` | 确认者 |
| `createdByUserId` | `uuid` | 创建者 |
| `createdAt` / `updatedAt` | `timestamptz` | 审计时间 |
| `deletedAt` | `timestamptz null` | 软删除 |

建议 `type`：

```text
symptom
note
temperature
medication
visit
test
concern
sleep
feeding
growth
exercise
female_health
lifestyle
emotion
mobility
blood_glucose
```

### 5.2 Timeline：不单独存重复表

时间线是：

```text
confirmed HealthEventRecord
  ORDER BY occurredAt ASC, createdAt ASC
```

因此不建议建立一份会与 Record 内容重复的 `timeline` 表。需要人工排序时，可在 Record 增加 `displayOrder`；需要隐藏某类记录时，由查询参数或展示配置处理。

### 5.3 Symptom：独立结构化表

症状是搜索、趋势、摘要和长期统计的核心，建议独立建表：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键 |
| `accountId` / `eventId` / `memberId` | `uuid` | 归属 |
| `sourceRecordId` | `uuid` | 可追溯到用户原始记录 |
| `name` | `varchar(100)` | 用户确认的症状名称 |
| `severity` | `smallint null` | 可选 1–5，不强制填写 |
| `onsetAt` | `timestamptz null` | 开始时间 |
| `resolvedAt` | `timestamptz null` | 结束时间 |
| `bodyArea` | `varchar(100) null` | 身体部位 |
| `notes` | `text null` | 补充信息 |
| `createdAt` / `updatedAt` | `timestamptz` | 审计时间 |

V1 不需要接入医学编码系统。未来如需标准术语，可增加 `codeSystem` 与 `code`，但用户可读原文必须保留。

### 5.4 Attachment：独立表 + 私有对象存储

数据库不保存图片二进制。推荐字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键 |
| `accountId` / `eventId` | `uuid` | 权限和事件归属 |
| `recordId` | `uuid null` | 可选关联某条记录 |
| `storageKey` | `varchar(500)` | 私有对象存储键 |
| `fileName` | `varchar(255)` | 原文件名 |
| `mimeType` | `varchar(100)` | 文件类型 |
| `sizeBytes` | `bigint` | 文件大小 |
| `kind` | `varchar(30)` | 图片、检查报告、化验单、药品、医生记录等 |
| `capturedAt` | `timestamptz null` | 内容产生时间 |
| `scanStatus` | `varchar(20)` | 安全扫描状态 |
| `ocrStatus` | `varchar(20)` | 识别状态，V2 可启用 |
| `createdAt` / `deletedAt` | `timestamptz` | 生命周期 |

### 5.5 MedicalRecord：V1 不独立，V2 按需求拆分

V1 使用 `HealthEventRecord.type = visit | test | medication`，对应结构存入 `confirmedData`。

出现以下需求后再拆表：

- 需要按检查项目、数值、单位和参考范围统计：拆 `test_results`。
- 需要按医院、科室、医生和随访管理：拆 `medical_encounters`。
- 需要精确管理药品、剂量、频率和疗程：拆 `medication_records`。

这样可以先完成核心记录链路，同时保留结构化升级能力。

### 5.6 AIExtraction：独立表

每条 Record 的 AI 提取结果需要可重试、可比较、可废弃：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键 |
| `recordId` / `eventId` | `uuid` | 来源 |
| `inputHash` | `char(64)` | 标识对应的原始输入版本 |
| `schemaVersion` | `varchar(30)` | 提取模板版本 |
| `modelName` | `varchar(100)` | 模型审计 |
| `promptVersion` | `varchar(50)` | Prompt 审计 |
| `outputData` | `jsonb` | AI 草稿，不是已确认事实 |
| `status` | `varchar(20)` | `queued`、`processing`、`completed`、`failed` |
| `errorCode` | `varchar(50) null` | 失败类型，不保存敏感堆栈给客户端 |
| `createdAt` | `timestamptz` | 生成时间 |

### 5.7 AISummary：独立版本表

AISummary 面向整个事件，与单条记录的 AIExtraction 不同：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `id` | `uuid` | 主键 |
| `accountId` / `eventId` | `uuid` | 归属 |
| `kind` | `varchar(30)` | `event_summary`、`visit_brief`、`keyword_extraction` |
| `content` | `text` | 展示文本 |
| `structuredData` | `jsonb` | 就诊信息结构 |
| `sourceVersion` | `integer` | 生成时 HealthEvent.version |
| `sourceRecordIds` | `uuid[]` | 生成依据 |
| `status` | `varchar(20)` | `draft`、`confirmed`、`superseded`、`failed` |
| `modelName` / `promptVersion` | `varchar` | 可追溯信息 |
| `confirmedAt` | `timestamptz null` | 用户确认时间 |
| `createdAt` | `timestamptz` | 生成时间 |

### 5.8 ConfirmedData：V1 不单独建表

V1 把用户最终确认结果保存到对应 `HealthEventRecord.confirmedData`，并记录 `confirmedAt` 和 `confirmedByUserId`。

原因：

- ConfirmedData 与单条 Record 一对一。
- 单独建表会增加查询和事务复杂度。
- V1 只需要保留当前确认版本。

V2 如需查看每次修改历史，再增加 `health_event_record_revisions`，每次确认保存不可变快照。

---

## 6. 用户输入、AI 输出与确认数据

### 6.1 三层数据

#### 第一层：RawInput

用户实际提交的内容，必须原样保存：

```json
{
  "rawInput": "昨天晚上开始发烧，最高38.5度，吃了退烧药",
  "inputSource": "voice",
  "occurredAt": "2026-08-08T20:00:00+08:00"
}
```

语音场景建议区分音频附件和语音转写文本。是否长期保留原始音频应由隐私政策和产品需求决定，不能默认永久保存。

#### 第二层：AIOutput

AI 根据 RawInput 生成可编辑草稿：

```json
{
  "symptoms": ["发热"],
  "startTime": {
    "value": "2026-08-08T20:00:00+08:00",
    "precision": "approximate",
    "sourceText": "昨天晚上"
  },
  "temperature": {
    "value": 38.5,
    "unit": "celsius"
  },
  "measures": ["服用退烧药"],
  "confidence": {
    "startTime": 0.72,
    "temperature": 0.96
  }
}
```

相对时间必须基于用户时区和提交时间解析，并保存原始 `sourceText` 与时间精度，不能假装得到精确时间。

#### 第三层：ConfirmedData

用户修改并确认后的事实：

```json
{
  "symptoms": ["发热"],
  "startTime": "2026-08-08T21:00:00+08:00",
  "startTimePrecision": "approximate",
  "highestTemperature": 38.5,
  "temperatureUnit": "celsius",
  "measures": ["服用退烧药"]
}
```

只有 ConfirmedData 可以：

- 生成 EventSymptom；
- 出现在正式事件时间线；
- 进入就诊摘要；
- 参与长期趋势统计。

### 6.2 为什么必须分开

1. 用户原文是事实来源，AI 误识别时必须可恢复。
2. AI 草稿可能多次生成，需要知道使用了哪个模型和模板。
3. 用户确认内容才代表用户认可的数据。
4. 未来修改 Prompt 或模型后，不能静默重写过去的确认结果。
5. 争议、导出和数据更正场景需要完整来源链。

### 6.3 推荐状态机

```text
draft
  -> processing
  -> awaiting_confirmation
  -> confirmed

processing -> failed -> processing（重试）
awaiting_confirmation -> draft（用户继续修改原文）
```

AI 不可用时，用户应能直接手动确认结构或保存普通文本记录，不能阻断健康记录。

---

## 7. API 草案

### 7.1 通用约定

- 路径统一使用 `/api/v1`。
- 所有接口使用 Bearer Token 或未来安全 Session。
- `accountId` 从认证上下文获得，不接受客户端输入。
- 所有 `memberId` 与 `eventId` 都做账号归属校验。
- 时间使用 ISO 8601，服务端保存 `timestamptz`。
- 写操作支持 `Idempotency-Key`。
- 列表使用游标分页。
- 错误统一为 `{ error: { code, message, details? } }`。

### 7.2 创建事件

```http
POST /api/v1/events
Authorization: Bearer <token>
Idempotency-Key: <uuid>
```

请求：

```json
{
  "memberId": "member-uuid",
  "title": null,
  "category": "other",
  "startTime": "2026-08-09T10:30:00+08:00",
  "startTimePrecision": "approximate"
}
```

服务端行为：

1. 验证 memberId 属于当前账号。
2. 创建 `status = observing` 的事件。
3. 保存成员快照。
4. 返回详情页需要的最小 Event 数据。

返回 `201`：

```json
{
  "id": "event-uuid",
  "memberId": "member-uuid",
  "title": null,
  "category": "other",
  "status": "observing",
  "startTime": "2026-08-09T10:30:00+08:00",
  "recordCount": 0,
  "createdAt": "2026-08-09T10:31:00+08:00",
  "version": 1
}
```

### 7.3 获取事件列表

```http
GET /api/v1/events?memberId=<uuid>&status=observing,handling&cursor=<cursor>&limit=20
```

返回：

```json
{
  "items": [
    {
      "id": "event-uuid",
      "memberId": "member-uuid",
      "title": "发热、咳嗽",
      "category": "fever",
      "status": "observing",
      "startTime": "2026-08-08T20:00:00+08:00",
      "lastRecordAt": "2026-08-09T09:20:00+08:00",
      "recordCount": 3,
      "summaryPreview": "昨晚开始发热并伴随轻微咳嗽"
    }
  ],
  "nextCursor": null
}
```

列表接口不返回完整时间线、健康背景或 AI 全文。

### 7.4 获取事件详情

```http
GET /api/v1/events/:eventId
```

建议返回聚合结构，而不是直接暴露数据库表：

```json
{
  "event": {
    "id": "event-uuid",
    "memberId": "member-uuid",
    "title": "发热、咳嗽",
    "category": "fever",
    "status": "handling",
    "startTime": "2026-08-08T20:00:00+08:00",
    "endTime": null,
    "version": 4
  },
  "subject": {
    "name": "小明",
    "gender": "male",
    "displayAge": "8岁"
  },
  "overview": {
    "recordCount": 4,
    "attachmentCount": 2,
    "latestRecordAt": "2026-08-09T09:20:00+08:00"
  },
  "symptoms": [],
  "records": [],
  "temperatureSeries": [],
  "attachments": [],
  "concerns": [],
  "personalizedModules": [],
  "healthBackground": {},
  "latestSummary": null,
  "capabilities": {
    "canEdit": true,
    "canAddRecord": true,
    "canMarkRecovered": true,
    "canGenerateHelpPoster": false
  }
}
```

记录非常多时，详情只返回最近若干条，完整时间线使用独立分页接口。

### 7.5 修改事件元信息

```http
PATCH /api/v1/events/:eventId
```

请求：

```json
{
  "title": "发热伴轻微咳嗽",
  "category": "fever",
  "startTime": "2026-08-08T20:00:00+08:00",
  "version": 4
}
```

版本不一致返回 `409 EVENT_VERSION_CONFLICT`。

### 7.6 切换事件状态

```http
PATCH /api/v1/events/:eventId/status
```

请求：

```json
{
  "status": "recovered",
  "effectiveAt": "2026-08-10T08:00:00+08:00",
  "reason": null,
  "version": 4
}
```

进入 `recovered` 后服务端设置 `endTime/recoveredAt`。重新打开时 `reason` 必填并写状态历史。

### 7.7 新增一条记录

```http
POST /api/v1/events/:eventId/records
```

请求：

```json
{
  "type": "symptom",
  "occurredAt": "2026-08-08T20:00:00+08:00",
  "occurredAtPrecision": "approximate",
  "rawInput": "昨天晚上开始发烧，最高38.5度，吃了退烧药",
  "inputSource": "text",
  "attachmentIds": []
}
```

返回 `202`：

```json
{
  "record": {
    "id": "record-uuid",
    "status": "processing",
    "rawInput": "昨天晚上开始发烧，最高38.5度，吃了退烧药"
  },
  "extraction": {
    "status": "queued"
  }
}
```

先持久化 RawInput，再启动 AI。AI 超时不能使原始记录丢失。

### 7.8 获取 AI 提取预览

```http
GET /api/v1/events/:eventId/records/:recordId
```

返回 Record、最新 AIExtraction 和状态。客户端可轮询，未来也可以使用 SSE/WebSocket 推送任务完成事件。

### 7.9 确认记录

```http
POST /api/v1/events/:eventId/records/:recordId/confirm
```

请求：

```json
{
  "extractionId": "extraction-uuid",
  "confirmedData": {
    "symptoms": ["发热"],
    "highestTemperature": 38.5,
    "temperatureUnit": "celsius",
    "measures": ["服用退烧药"]
  }
}
```

服务端在同一事务中：

1. 保存 confirmedData。
2. 标记 Record 为 confirmed。
3. 更新 EventSymptom 等结构化投影。
4. 更新 HealthEvent.lastRecordAt 与 version。
5. 将旧摘要标记为需要更新，但不自动覆盖已确认摘要。

### 7.10 附件 API

```text
POST   /api/v1/events/:eventId/attachments/upload-url
POST   /api/v1/events/:eventId/attachments
GET    /api/v1/events/:eventId/attachments
DELETE /api/v1/events/:eventId/attachments/:attachmentId
```

上传流程应使用短时签名地址，下载也使用短时授权地址。

### 7.11 AI 摘要 API

```text
POST /api/v1/events/:eventId/summaries
GET  /api/v1/events/:eventId/summaries
GET  /api/v1/events/:eventId/summaries/:summaryId
POST /api/v1/events/:eventId/summaries/:summaryId/confirm
```

摘要生成请求需保存 `event.version`。如果生成过程中事件增加记录，返回结果应标注“基于较早版本”，而不是假装包含最新数据。

---

## 8. 页面数据需求

### 8.1 健康事件列表页

需要：

- `id`：点击进入详情。
- `memberId`：当前记录对象过滤。
- `title`：允许空，空时展示产品定义的占位文案。
- `category`：筛选和图标。
- `status`：观察中、处理中、已康复。
- `startTime`：事件开始时间。
- `lastRecordAt`：最近更新排序。
- `summaryPreview`：一行简短预览。
- `recordCount`、`attachmentCount`：可选轻量统计。

不需要：完整 Records、附件 URL、健康背景、完整 AI Summary。

### 8.2 创建健康事件页

最小必需输入：

- `memberId`：谁的健康事件。
- `startTime`：默认当前时间，可调整。

可选输入：

- `category`：发热、咳嗽、腹痛、外伤、过敏、其他。
- `title`：可以不填，后续根据记录提取。
- 首条 `rawInput`：若创建流程直接让用户描述情况，可与事件创建做一个事务型应用服务，但底层仍分别保存 Event 与 Record。

### 8.3 健康事件详情页

当前页面需要以下聚合数据：

1. 记录对象：Member Snapshot 与最新成员资料。
2. 症状记录：入口、最近确认内容、关键词。
3. 事件阶段：当前 status 和允许的目标状态。
4. 处理记录：处理中展示 visit/test/medication Records。
5. 时间线：Confirmed Records 按 occurredAt 排序。
6. 体温曲线：temperature Records 投影成时间序列。
7. 附件：私有附件元数据和短时访问地址。
8. 个性化模块：基于成员年龄、性别和健康档案生成的推荐入口；推荐规则不是 Event 永久字段。
9. 我的担心：`type = concern` 的 Records。
10. 健康背景：来自 FamilyMember HealthProfile，不复制为普通事件记录。
11. AI 摘要：最新 Draft/Confirmed Summary 与来源版本。
12. 下一步行动：由 status、summary readiness 和账号权限生成 capabilities。

详情 API 应返回页面需要的聚合 DTO，不要求前端理解数据库内部连接方式。

### 8.4 下一步行动：报平安与求助海报

这两个功能属于 EventAction，不应在 HealthEvent 增加大量临时字段。

V2 可增加：

```text
event_actions
  id
  accountId
  eventId
  type: reassurance_share | help_poster
  status: draft | generated | shared | revoked | failed
  inputSnapshot
  outputAttachmentId
  shareTokenHash
  expiresAt
  createdByUserId
  createdAt
  revokedAt
```

需要预留的数据：

- 生成时事件摘要快照和 Event.version。
- 记录对象的最小公开信息，默认不暴露手机号和完整档案。
- 用户选择分享的内容范围。
- 海报生成文件的私有 Attachment。
- 短期分享 Token、过期时间和撤销能力。
- 分享行为审计。

V1 页面可以保留入口，但在真正实现分享前必须先确认隐私范围与失效机制。

---

## 9. 数据安全与隐私

### 9.1 权限校验

每个事件相关接口至少验证：

```text
Token.accountId
  == HealthEvent.accountId
  == FamilyMember.accountId
```

跨账号访问返回 404，避免泄露事件或成员是否存在。

### 9.2 数据隔离

- 所有业务表包含 accountId，Repository 默认要求 accountId 查询条件。
- 数据库层可进一步启用 PostgreSQL Row Level Security。
- 后台任务和 AI 任务也必须携带 accountId/eventId，不能只凭 eventId 访问。

### 9.3 附件安全

- 使用私有 Bucket。
- 上传前限制 MIME、扩展名、大小和数量。
- 上传后执行恶意文件扫描。
- 使用短时签名 URL，不保存永久公开地址。
- 删除数据库记录时同步进入对象存储销毁队列。
- 日志不打印附件内容、签名 URL 或识别全文。

### 9.4 删除策略

- 普通删除：先软删除 Event 和子记录，支持短期误删恢复。
- 账号隐私删除：异步级联删除事件、记录、摘要、附件和派生索引。
- 审计记录只保留合法必要的最小元数据，不保留已要求删除的健康正文。
- 删除任务需要状态、失败重试和最终完成凭证。

### 9.5 AI 数据安全

- 发送给模型前最小化个人标识信息。
- 明确第三方模型供应商的数据保留策略。
- Prompt 和输出日志不得无期限保存完整敏感数据。
- AIOutput 明确标识为整理草稿，不作为诊断。
- 用户拒绝 AI 授权时仍能手动记录和确认。

### 9.6 家庭成员数据

- 未成年人和代管长辈的数据仍属于敏感健康数据。
- V1 只有创建该成员的账号可访问。
- 未来家庭共享必须使用邀请、成员级权限、撤销和审计，不能通过共享同一个登录 Token 实现。

---

## 10. V1 / V2 功能边界

### 10.1 V1 必须完成

数据层：

- HealthEvent 主表与三个状态。
- accountId/memberId 所有权校验。
- 创建、列表、详情、编辑、状态切换、软归档。
- HealthEventRecord 原始输入和确认数据。
- 时间线由 confirmed Records 生成。
- EventSymptom 基础结构。
- 图片 Attachment 元数据与私有存储边界。
- 事件版本号和基本审计时间。

产品链路：

```text
选择 FamilyMember
  -> 创建 HealthEvent
  -> 记录一个新情况
  -> 确认记录
  -> 查看时间线
  -> 切换事件阶段
  -> 标记已康复
```

AI 可以先使用 Mock 或规则提取，但 RawInput/AIOutput/ConfirmedData 的数据边界从第一版就要正确。

### 10.2 V2 再增加

- 正式 AI 异步任务和多版本 AISummary。
- OCR、检查报告结构化和药品识别。
- MedicalEncounter、TestResult、MedicationRecord 专用表。
- 标准症状编码与跨事件统计。
- 多账号家庭协作。
- 报平安分享与求助海报生成。
- 摘要导出、可撤销分享链接。
- Event Record 修订历史。
- 高级搜索、趋势和统计投影。
- HealthProfile 版本引用和完整背景快照。

### 10.3 明确不做

- 自动诊断。
- 自动开药建议。
- 治疗方案生成。
- 未经用户确认就把 AI 提取写成健康事实。
- 公开可访问的健康附件。

---

## 11. 下一步开发建议

推荐顺序：

1. 冻结本文中的状态与字段命名，先消除前端 `empty/ongoing` 与页面阶段的差异。
2. 在当前 JSON Repository 架构中实现 HealthEvent 主模型，所有方法显式接收 accountId。
3. 实现 Event CRUD 与 FamilyMember 归属校验测试。
4. 实现 HealthEventRecord，并让时间线从 Records 派生。
5. 实现 RawInput 与 ConfirmedData，不接 AI 时也能完成手动确认。
6. 增加 AIExtraction 接口和异步任务，保持失败可降级。
7. 增加图片 Attachment 私有上传流程。
8. 最后实现 AISummary 和就诊摘要确认。
9. 在接入真实健康数据前迁移 PostgreSQL，并完成权限、备份、删除和审计测试。

首个后台实现阶段的验收重点不应是页面数量，而是以下不变量：

```text
事件一定属于正确的 FamilyMember
事件一定不能跨 Account 访问
用户原文永远不会被 AI 覆盖
只有确认数据进入正式时间线和摘要
状态、记录与附件都可以被审计和安全删除
```
