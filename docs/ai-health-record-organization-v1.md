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
