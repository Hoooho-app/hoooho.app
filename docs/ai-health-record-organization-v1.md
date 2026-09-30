# Hoooho 健康记录自动整理 V1

## 数据流

1. 前端先通过现有 HealthEventRecord API 保存用户原始文字。
2. 前端仅提交已保存的 `recordId` 到整理接口。
3. 服务端重新读取该记录的 `content` 作为 `rawInput`，客户端不能伪造或覆盖原文。
4. AI Service 输出规范化的 `organizedHealthData`，并单独保存到 `health-record-organizations.json`。
5. `confirmedData` 初始为 `null`。详情页在用户确认能力上线前读取整理结果；未来有确认数据时优先读取 `confirmedData`。
6. `organizedHealthData.timeline` 将一段原始描述拆为多个时间节点，详情页不再把整段原文当成单一节点。
7. 体温统一保存为 `{ min, max, unit }`，同时兼容旧版单点和数组格式。

## 接口

- `POST /api/events/:eventId/organizations`，请求体：`{ "recordId": "..." }`
- `GET /api/events/:eventId/organizations`
- `POST /api/events/:eventId/attachments`，保存用户主动选择的图片
- `GET /api/events/:eventId/attachments`

上述接口均要求 Bearer Token，并校验事件、记录与当前账号的归属关系。

## Provider

- 未配置外部模型时，使用保守的本地事实提取器，保证测试环境可用。
- 配置 `OPENAI_API_KEY` 后使用 OpenAI Responses API。
- 可通过 `AI_MODEL` 指定模型；默认值为 `gpt-5-mini`。
- 可通过 `OPENAI_BASE_URL` 覆盖 API 基础地址。
- 外部 Provider 失败时自动回退到本地事实提取器，原始记录不会丢失。

### 病情摘要

- 当前主入口 `/visit-summary` 复用现有九章就诊情况单，不替换已确认的布局和导出能力。`PUT /api/members/:memberId/visit-sheet` 在现有版本与幂等请求中接受可选的 `generateAI: true`。
- 服务端重新收集当前账号、当前家庭成员的已保存健康随记、档案与事实，不接收客户端伪造的摘要。附件字节和历史迁移来源不发给模型；成员姓名、邮箱和手机号从生成输入中隐藏。
- 本地事实整理始终独立可用；只有 OpenAI 返回的结果才保存到独立的 `aiSummary` 并标注“AI 生成”。未配置或调用失败不会将本地结果冒充 AI，也不会覆盖上一版报告。
- 页面支持生成、加载防重复、重新生成、失败提示和重试；文本、HTML 和打印沿用原导出，明确区分 AI 固定快照与本地事实。普通编辑保留旧 AI 摘要，输入资料变化会标记待重新生成；删除依赖来源后不再携带旧摘要。
- `npm run test:visit-sheets` 验证隔离、幂等、保留旧版和来源删除；构建后运行 `npm run test:e2e:medical-summary`，用独立临时数据和模型测试替身验收 iPhone SE 页面及导出，不读取正式用户数据、不产生真实模型请求。

- 就诊前病情摘要仍以已保存记录、`LocalFactProvider`／OpenAI 提取出的可追溯事实和现有结构化章节为输入。
- 服务端只发送生成所需的去标识化章节，通过 OpenAI Responses API 和严格 JSON Schema 生成概览、关键事实与待补信息；请求设置 `store: false`。
- 模型不得诊断、判断严重程度或提供治疗、处方及用药建议；AI 内容的“查看依据”仍指向原始健康随记和健康档案。
- 模型调用失败时返回可重试错误，不写入新版本，也不覆盖上一版病情摘要。
- 开发环境从 Git 忽略的 `.env.local` 读取 `OPENAI_API_KEY`；密钥不得进入前端、日志或仓库。
- 病情摘要失败时仅在服务端记录 HTTP 状态、`error.type`、`error.code`、脱敏消息、`x-request-id` 和 `Retry-After`。消息只保留允许的通用限额说明，其他上游文字统一隐藏；不记录请求、病情输入、Authorization 或完整响应，异常 cause 也不保留原始内容。前端仍收到通用失败提示。
- 网络异常和摘要解析异常另保留允许列表内的错误码，避免把成功 HTTP 后的空输出误判为网络错误；日志不包含原始异常消息。
- 摘要 Provider 使用单次 fetch，不自动重试。`rate_limit_exceeded`／`slow_down` 表示频率限制；`credit_balance_exhausted` 表示余额耗尽；`project_spend_limit_exceeded`、`organization_spend_limit_exceeded`、`organization_usage_limit_exceeded` 分别表示项目消费、组织消费、组织使用限额。只有 `insufficient_quota` 时保留为原因未细分，不推断具体余额或限额。

AI 提示词只允许整理明示事实，禁止诊断、病因推断、风险判断、治疗或用药建议。

## 当前边界

- 支持文字记录自动整理为症状、体温、用药、就诊、检查和担心等事实集合。
- 支持 `38℃`、`38度`、`37-38度`、`37到38度`、`37～38℃` 等体温表达。
- 支持按“早上 7 点”“晚上”“昨天”“今天下午”等时间关系拆分事件时间线。
- 详情页根据事实集合动态显示已有模块；没有事实时不渲染空模块。
- 旧版整理结果首次读取时会按当前结构版本重整一次，完成后不重复执行。
- 附件完全来自用户上传，不由 AI 从文字推测。
- 语音入口仍由现有 UI 保留；语音识别服务尚未接入，最终仍以文字输入进入本流程。
- `confirmedData` 已在数据结构中预留，但本阶段不新增确认 UI 或确认 API。
- AI 结果不会覆盖 `rawInput`，也不会直接生成诊断或医疗建议。
