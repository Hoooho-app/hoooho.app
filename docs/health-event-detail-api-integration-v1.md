# Hoho V1.6 HealthEvent Detail API 接入计划

> 文档状态：接入分析稿  
> 本阶段任务：分析健康事件详情页从 Mock 数据切换到真实 Event/Record API 的方式  
> 本次未修改代码、UI 或业务逻辑

## 1. 结论摘要

当前健康事件详情页可以接入真实 `HealthEventRecord`，但不能只把 `event.timeline` 替换成一次 fetch。现有页面的整个 `HealthEvent` 对象、记录对象、事件状态和其他模块都来自 Mock，前后端字段与状态命名也不同。

推荐采用：

```text
后端 API DTO
   ↓
前端 Domain Adapter / ViewModel
   ↓
现有页面组件
```

不要让 `TimelineSection` 直接解析后端响应，也不要把 API 字段强行改成当前 Mock 类型。这样能在保持现有视觉不变的前提下，逐步接入真实 Event、Member、Records，并为附件、症状结构化和 AI Summary 保留独立边界。

接入应分为两个小阶段：

1. **V1.6A 真实读取**：详情页读取 Event 和 Records，时间线展示真实记录。
2. **V1.6B 真实写入**：现有记录弹窗通过 POST 创建 Record，保存后刷新时间线。

## 2. 当前详情页位置与路由

### 2.1 路由

文件：`src/app/router.tsx`

```text
/health-events/:eventId
  └── HealthEventDetailPage
```

路由已支持动态 `eventId`，不需要新增详情页路由。

但当前实际导航仍使用 Mock ID：

- `/health-events/event-empty`
- `/health-events/event-ongoing`
- `/health-events/event-recovered`

真实后端 Event 使用 UUID。详情页接入后，路由结构可以保持不变，但入口必须传入真实 Event ID。

### 2.2 页面入口

文件：`src/pages/HealthEventDetail/index.tsx`

当前流程：

```text
useParams().eventId
  ↓
healthEvents.find(item.id === eventId)
  ↓
找不到则 Navigate('/health-events')
  ↓
把一个完整 Mock HealthEvent 传给所有模块
```

页面组件顺序：

```text
HealthEventDetailPage
  ├── EventHeader
  ├── EventIdentitySection
  ├── SymptomSection
  ├── EventStatus
  ├── StageDetailSection
  ├── TimelineSection
  ├── TemperatureChartSection
  ├── AttachmentSection
  ├── PersonalizedModulesSection
  ├── ConcernSection
  ├── MedicalInfoSection
  └── NextActionSection
```

当前 `stage` 只是页面本地 state，切换阶段不会 PATCH 后端 Event。

## 3. 当前数据来源

### 3.1 Event 与时间线 Mock

文件：`src/mock/events.ts`

提供三个完整页面状态：

| Mock ID | 状态 | 时间线 |
| --- | --- | --- |
| `event-empty` | `empty` | 空数组 |
| `event-ongoing` | `ongoing` | 3 条 Mock TimelineEntry |
| `event-recovered` | `recovered` | 4 条 Mock TimelineEntry |

时间线格式：

```ts
interface TimelineEntry {
  id: string
  time: string
  content: string
  kind: 'text' | 'temperature' | 'medication'
}
```

当前展示字段：

- `id`：React key。
- `time`：通过 `formatHealthDate()` 展示。
- `content`：节点正文。
- `kind`：当前 `TimelineSection` 实际没有用于不同视觉展示。

### 3.2 其他 Mock 来源

详情页不仅时间线是 Mock：

| 数据 | 当前来源 |
| --- | --- |
| Event 标题、状态、开始时间 | `src/mock/events.ts` |
| 症状、摘要、体温、附件、担心、健康背景 | `src/mock/events.ts` |
| 记录对象 Member | `src/mock/members.ts` |
| HealthProfile | `src/mock/healthProfiles.ts` |
| 个性化模块判断 | `useHealthEventPersonalization()` + Mock Member/Profile |

因此真实 Event 的 `memberId` 为 UUID 时，当前 `useHealthEventPersonalization()` 无法在 Mock members 中找到该成员，会错误回退到 `members[0]`。

### 3.3 Mock Service

文件：`src/services/mockService.ts`

它提供 `getEvents()`，但当前 `HealthEventDetailPage` 没有调用它，而是直接同步 import `healthEvents`。详情页不存在加载、失败、重试或请求取消状态。

## 4. 当前时间线组件与编辑入口

### 4.1 TimelineSection

文件：`src/pages/HealthEventDetail/components/TimelineSection.tsx`

当前职责：

- 接收完整 `HealthEvent`。
- 从 `event.timeline` 读取节点。
- 空数组时显示空状态卡片。
- 点击空状态或“添加记录”打开 `HealthRecordEditorModal`。
- `event.status === 'ongoing'` 时显示顶部“添加记录”。

问题：

1. 组件只需要时间线和状态，却依赖完整 `HealthEvent`。
2. 读取路径固定为 `event.timeline`，无法区分加载中与真正空状态。
3. 没有错误状态。
4. 后端已经排序，组件不应再次实现不同排序规则。

### 4.2 HealthRecordEditorModal

文件：`src/pages/HealthEventDetail/components/HealthRecordEditorModal.tsx`

入口已经存在，支持 `timeline` 模板，并暴露：

```ts
onSave?: (result: HealthRecordEditorResult) => void
```

返回值包含：

```ts
{
  templateType,
  originalText,
  structuredFields,
  attachments
}
```

但 `TimelineSection` 当前没有传入 `onSave`，因此点击“确认保存”只会关闭弹窗，不会修改 Mock，也不会请求 API。

另有两个语义风险：

- 弹窗内的“AI整理结果”目前由前端示例逻辑生成，不是真实 AI。
- Record V1.5 只接受一条原始文字及一个 `occurredAt`；弹窗目前没有明确的发生时间字段，并允许用户一次描述多个时间节点。

V1.6 不应把 `structuredFields` 当作真实 AI 数据保存。第一版只能保存 `originalText`。

## 5. 后端实际 API 契约

### 5.1 获取 Event

```http
GET /api/events/:eventId
Authorization: Bearer <token>
```

当前返回：

```ts
interface HealthEventApiDto {
  id: string
  accountId: string
  memberId: string
  title: string
  category: 'fever' | 'cough' | 'pain' | 'injury' | 'allergy' | 'other'
  status: 'observing' | 'handling' | 'recovered'
  startTime: string
  createdAt: string
  updatedAt: string
}
```

### 5.2 获取 Records

```http
GET /api/events/:eventId/records
Authorization: Bearer <token>
```

当前真实响应是排序后的数组，不是 `{ items, nextCursor }`：

```ts
type HealthEventRecordApiDto[] = Array<{
  id: string
  accountId: string
  eventId: string
  type: 'note' | 'symptom' | 'medication' | 'visit' | 'examination' | 'other'
  content: string
  occurredAt: string
  createdAt: string
  updatedAt: string
}>
```

后端排序已冻结为：

```text
occurredAt ASC
createdAt ASC
id ASC
```

前端应保留服务端顺序，不建立另一套排序规则。

### 5.3 创建 Record

```http
POST /api/events/:eventId/records
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "type": "note",
  "content": "晚上开始咳嗽，喝水后稍有缓解。",
  "occurredAt": "2026-08-09T20:00:00+08:00"
}
```

## 6. 前后端数据差异

| 概念 | 当前前端 | 后端 | 建议 |
| --- | --- | --- | --- |
| Event 状态 | `empty/ongoing/recovered` | `observing/handling/recovered` | 分开保存 `stage` 与派生 `displayStatus` |
| 开始时间 | `startDate` | `startTime` | Adapter 映射，不改 API |
| Timeline 时间 | `time` | `occurredAt` | Adapter 映射 |
| Timeline 类型 | `text/temperature/medication` | 六种 Record type | UI 直接接受 Record type 或做显式映射 |
| 标题 | Mock title | API title | 使用 API |
| Member | Mock 字符串 ID | UUID | 需要真实 Member API |
| 症状与摘要 | Event 内数组/文本 | 当前 API 没有 | 保持空状态，不能继续展示伪数据 |
| 体温曲线 | `temperatureRecords` | 当前没有结构化指标 API | 暂为空状态 |
| 附件 | `attachments` | 当前没有 Attachment API | 暂为空状态 |
| 健康背景 | Mock medicalInfo | 当前页面未接真实 Profile API | 独立后续接入 |

### 6.1 Empty 状态派生规则

后端没有 `empty` 状态。`observing` 表示事件已创建且正在观察，即使还没有记录。

为保留现有 Empty 视觉，建议：

```ts
stage = event.status

displayStatus =
  event.status === 'recovered'
    ? 'recovered'
    : records.length === 0
      ? 'empty'
      : 'ongoing'
```

这样：

- 新建但无 Record：现有 Empty 页面。
- 有 Record 且未康复：现有 Ongoing 页面。
- Event 为 recovered：现有 Recovered 页面，即使记录较少。

不要向后端重新增加一个 `empty` 状态。

### 6.2 Record type 映射

最安全的方案是让 Timeline ViewModel 保留后端 type：

```ts
interface TimelineItemViewModel {
  id: string
  occurredAt: string
  content: string
  type: HealthEventRecordType
}
```

如果为了第一轮最小修改继续使用 `TimelineEntry`：

```text
medication  -> medication
其他类型    -> text
```

不要根据 `content` 猜测 temperature。体温结构化应等未来真实数据层，而不是在 UI 用正则推断。

## 7. 推荐前端 Service 结构

当前只有 `src/services/auth.ts`，没有统一的 Bearer 请求工具。

建议新增：

```text
src/services/apiClient.ts
src/services/healthEvents.ts
src/services/healthEventRecords.ts
src/services/familyMembers.ts       # 若本轮同时解决记录对象
```

### 7.1 apiClient.ts

职责：

- 添加 `Authorization: Bearer <token>`。
- 解析统一 `{ error: { code, message } }`。
- 非 2xx 抛出有 code/status 的领域错误。
- 支持 `AbortSignal`，避免路由切换后旧请求覆盖新页面。
- 401 交给上层清理 Session 并返回登录页。

不要让 Service 直接读取 Zustand。建议 Service 方法显式接收 token，或由一个独立 API client factory 注入 token，保持数据层可测试。

### 7.2 healthEvents.ts

建议方法：

```ts
getEvent(eventId, token, signal?): Promise<HealthEventApiDto>
updateEvent(eventId, patch, token): Promise<HealthEventApiDto>
```

### 7.3 healthEventRecords.ts

建议方法：

```ts
listRecords(eventId, token, signal?): Promise<HealthEventRecordApiDto[]>
createRecord(eventId, input, token): Promise<HealthEventRecordApiDto>
updateRecord(recordId, patch, token): Promise<HealthEventRecordApiDto>
deleteRecord(recordId, token): Promise<{ success: true }>
```

即使当前只接 GET，也应建立完整领域 Service，避免组件中散落 fetch。

## 8. 推荐详情页数据结构

不要继续把所有数据压进当前 Mock `HealthEvent`。

建议区分三层：

### 8.1 API DTO

严格对应后端响应：

```text
HealthEventApiDto
HealthEventRecordApiDto
FamilyMemberApiDto
```

### 8.2 页面组合数据

```ts
interface HealthEventDetailData {
  event: HealthEventApiDto
  member: FamilyMemberApiDto | null
  records: HealthEventRecordApiDto[]
}
```

### 8.3 展示 ViewModel

```ts
interface HealthEventDetailViewModel {
  id: string
  memberId: string
  title: string
  category: string
  stage: HealthEventStage
  displayStatus: HealthEventStatus
  startDate: string
  timeline: TimelineItemViewModel[]
}
```

未来模块继续独立加入：

```text
symptoms
temperatureSeries
attachments
concerns
medicalProfile
aiSummary
```

它们不应为了满足当前 `HealthEvent` 类型而伪造空的业务事实。页面可以为未接入模块提供明确空状态，但不得展示 Mock 健康数据与真实 Records 混合的结果。

## 9. 页面加载与状态管理方案

项目当前没有 React Query 等请求库，不需要为本次引入大型依赖。可使用：

```text
useEffect
+ useState
+ AbortController
+ 领域 Service
```

建议页面状态：

```ts
type DetailRequestState =
  | { status: 'loading' }
  | { status: 'success'; data: HealthEventDetailData }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
```

规则：

- `eventId` 缺失：返回事件列表。
- 初次进入：loading，不要先渲染 Empty，以免闪烁。
- Event 404：显示“事件不存在或已删除”，再提供返回入口；不要无提示跳转。
- Records 请求失败：可以保留 Event 基本信息并给时间线单独错误/重试。
- 路由变化或卸载：Abort 未完成请求。
- 401：清理登录状态并回到 `/login`。

## 10. 创建记录入口接入方案

### 10.1 当前能复用的部分

- Timeline 空卡片点击入口。
- Ongoing 顶部“添加记录”。
- `HealthRecordEditorModal` 的 `originalText`。
- Modal 的 `onSave` 回调接口。

### 10.2 V1.6B 最小写入映射

```text
templateType: timeline
  -> type: note

originalText
  -> content

当前时间或用户明确选择的时间
  -> occurredAt
```

保存成功后：

1. 关闭弹窗或进入成功状态。
2. 使用 POST 返回的 Record 更新列表。
3. 按后端规则重新获取一次列表，或复用同一比较规则插入。
4. 保存失败时保留用户输入，不关闭弹窗。

### 10.3 必须先确认的产品语义

当前 Modal 允许一次输入多个时间节点，但 V1.5 API 的一条 Record 表达一个事实节点。又因为本阶段不接 AI，前端无法可靠地自动拆分。

推荐 V1.6B 先采用：

- 每次保存生成一条 `note` Record。
- `occurredAt` 默认当前时间。
- 用户输入的完整原文不拆分。
- 未来增加显式发生时间控件或接入 AI 后，再支持拆成多个节点。

不要用字符串规则假装完成 AI 时间线拆分。

## 11. 需要修改的文件

### 11.1 建议新增

| 文件 | 作用 |
| --- | --- |
| `src/services/apiClient.ts` | Bearer、错误、JSON、Abort 统一处理 |
| `src/services/healthEvents.ts` | Event API DTO 与请求 |
| `src/services/healthEventRecords.ts` | Record CRUD 请求 |
| `src/services/familyMembers.ts` | 获取真实记录对象，若本轮处理 Member |
| `src/services/healthEventDetailAdapter.ts` | API DTO 转页面 ViewModel |
| `src/hooks/useHealthEventDetail.ts` | 详情加载、刷新和错误状态，可选但推荐 |

### 11.2 建议修改

| 文件 | 修改内容 |
| --- | --- |
| `src/types/index.ts` | 增加 API DTO、Record type 和 Detail ViewModel；逐步停止用 Mock HealthEvent 表示后端实体 |
| `src/pages/HealthEventDetail/index.tsx` | 移除直接 import Mock；按 eventId 加载 Event、Member、Records |
| `src/pages/HealthEventDetail/components/TimelineSection.tsx` | 改为接收 records/timeline + request state；连接 onSave |
| `src/pages/HealthEventDetail/components/EventStatus.tsx` | 后续把本地 stage 切换接 PATCH Event；读取阶段时先用真实 status |
| `src/hooks/useHealthEventPersonalization.ts` | 停止用后端 UUID 查询 Mock member；接受真实 Member/Profile |
| `src/store/useAppStore.ts` | 只保留 Session/选择状态；不建议把每个事件 Records 永久化到全局 Store |

### 11.3 暂不删除

`src/mock/events.ts` 仍可用于视觉回归或 Story/demo，但正式详情路由不再读取它。建议未来把视觉测试数据改名为 fixture，避免与生产数据源混淆。

## 12. 推荐修改顺序

### V1.6A：真实读取

1. 定义 `HealthEventApiDto` 和 `HealthEventRecordApiDto`。
2. 建立统一 `apiClient`。
3. 建立 Event/Record services。
4. 建立 Detail Adapter，冻结状态与字段映射。
5. 详情容器并行或串行获取 Event 与 Records。
6. TimelineSection 使用真实 Records。
7. 增加 loading、404、401、局部错误与重试处理。
8. 保留现有视觉布局，不改卡片设计。

### V1.6B：真实写入

1. TimelineSection 为 Modal 传入 `onSave`。
2. `originalText -> content`，`timeline -> note`。
3. 明确 `occurredAt` 的第一版规则。
4. POST 成功后刷新 Records。
5. 保存失败时保留草稿并显示错误。
6. 补充组件/Service 测试。

### V1.6C：完整入口闭环

1. 健康事件列表改为 GET `/api/events`。
2. 点击真实卡片进入 `/health-events/:uuid`。
3. 新建页 POST `/api/events`，成功后导航至返回的 UUID。
4. 去除 `event-empty/event-recovered` 等生产导航。

## 13. 主要风险

### P0：没有真实 Event 入口

当前健康事件首页没有读取后端事件列表，`CreateHealthEventPage` 直接跳转 `/health-events/event-empty`。即使详情页完成 API 接入，正常用户流程仍拿不到真实 UUID。

处理：V1.6A 可以用已创建的 UUID 直接测试；MVP 闭环必须紧接着完成 V1.6C。

### P0：真实 Records 与 Mock 医疗信息混合

如果仅替换时间线，用户会看到真实 Record 与假的症状、体温、附件、健康背景同时出现，属于健康数据可信度问题。

处理：未接入的数据模块必须显示明确空状态，不能继续显示 Mock 内容。

### P1：状态体系不一致

直接把 backend `observing` 赋给 frontend `HealthEventStatus` 会破坏条件渲染。

处理：`stage` 使用后端状态，`displayStatus` 使用 Event + recordCount 派生。

### P1：记录对象仍是 Mock

真实 `memberId` 无法命中 `src/mock/members.ts`，当前 Hook 会错误显示第一个 Mock 用户。

处理：同页获取真实 Member，或让 FamilyMember store 先切换为真实 API。

### P1：Modal 不是事实记录编辑器

它包含前端假 AI 预览、附件名称和多节点描述，但 Record V1.5 只保存单条原文。

处理：V1.6B 只保存 `originalText`，不保存伪结构化结果；附件继续保持未接入状态。

### P1：阶段变更未持久化

EventStatus 切换只更新 React state，刷新页面会恢复后端状态；“标记为已恢复”还导航到固定 Mock URL。

处理：后续将阶段切换接入 `PATCH /api/events/:id`，移除硬编码恢复路由。

### P2：无统一请求错误模型

若各组件分别 fetch，会重复处理 Token、错误和 JSON。

处理：先建立 `apiClient` 和领域 Service，再改页面。

### P2：时区显示

后端统一返回 ISO/UTC，前端 `new Date()` 按浏览器本地时区显示。对当前中国用户通常正确，但未来账号时区需显式保存。

处理：V1.6 保持现有 `formatHealthDate`，测试 UTC 到 Asia/Shanghai 的显示结果。

## 14. 验收建议

V1.6 实际开发完成后至少验证：

1. 登录后用真实 Event UUID 打开详情页。
2. Event 标题、阶段、开始时间来自 API。
3. 无 Records 时显示 Empty，而不是 loading 闪烁。
4. Records 按后端顺序显示，内容和时间不被改写。
5. 刷新详情路由后数据仍存在。
6. 账号 A 无法看到账号 B 的 Event/Records。
7. 401 会回到登录页。
8. 404 有明确返回路径。
9. 新增 Record 后无需刷新浏览器即可出现。
10. 保存失败时用户原文不丢失。
11. 已康复事件仍可补记。
12. 页面不展示与真实 Event 无关的 Mock 健康数据。

## 15. 最终建议

下一轮开发建议先实施 V1.6A，不改视觉，只完成：

```text
GET Event
+ GET Records
+ DTO Adapter
+ Timeline 真实展示
+ Loading/Error/Auth 状态
```

随后实施 V1.6B，将现有 Modal 的用户原文保存为单条 Record。最后用 V1.6C 接通真实列表与创建页，形成：

```text
登录
  ↓
真实家庭成员
  ↓
创建真实 HealthEvent
  ↓
进入 /health-events/:uuid
  ↓
读取并新增 HealthEventRecord
  ↓
形成真实时间线
```

这个拆分能避免为了适配 API 改坏现有视觉，也避免把未来 AI、附件和结构化症状提前耦合到 Timeline 组件。
