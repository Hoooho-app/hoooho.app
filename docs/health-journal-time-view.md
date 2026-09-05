# 健康随身记：单日时间视图

本次只替换 `/health-events` 的列表模式；`triage/list` 内部值保留，前台护士媒体组件及状态机保持不变。

## 兼容契约

- `GET /api/events?view=time` 只按账户读取原始事件容器，包含被既有摘要逻辑清空标题的生活记录；不触发医疗摘要刷新、不改变旧事件列表的过滤行为。

- `POST /api/quick-records` 可选接受 `journal: { categories: JournalCategory[] }`，分类非必填，去重后随原记录持久化。原有语音、照片草稿、核对、幂等保存及回滚流程不变。
- `GET /api/events/:id/records?view=time` 在原账户和事件权限校验后返回只读 `journal` 投影；无该参数时沿用旧响应。支持浏览器时区头。
- 原始 `content/sourceText/occurredAt/createdAt` 不改写、不迁移。原话中的单一明确时间复用既有服务解析，明确时段保留时段表达；多时间、歧义或缺少时间时回退到实际记录时刻并精确到分钟，不显示“时间未明确”。无日期线索的旧记录仍按其原始记录日期展示。
- 时间视图复用原健康随记筛选抽屉，支持时间范围、年份、月份、状态和类型；工具栏可在最新在前与从早到晚之间切换。
- 旧类型只有可直接对应的分类才映射，其他保留全文并归“其他”。无条目的旧事件仍有入口。过敏原及长期健康档案不参与此投影。
- 时间视图按当前记录对象隔离，再按发生日期筛选、发生时间倒序排列，同小时连续展示。附件只显示数量，条目继续打开既有事件详情，不改二级页。

## 验证

`npm run test:journal`、`npm run test:client`、`npm run test:server`、`npm run test:e2e:time-view` 和 `npm run test:e2e:quick-record`。

浏览器测试使用独立合成数据目录，不读取生产健康数据。覆盖 iPhone SE、390/430px 和桌面；实体 iPhone Safari/微信的系统键盘和麦克风权限仍需真人设备验收。

无数据迁移。回滚应用版本即可回到旧视图；可选 journal 字段可保留，不影响旧记录读取。
