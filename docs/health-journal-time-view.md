# 健康随身记：单日时间视图

本次只替换 `/health-events` 的列表模式；`triage/list` 内部值保留，前台护士媒体组件及状态机保持不变。

## 兼容契约

- `POST /api/quick-records` 可选接受 `journal: { categories: JournalCategory[] }`，分类非必填，去重后随原记录持久化。原有语音、照片草稿、核对、幂等保存及回滚流程不变。
- `GET /api/events/:id/records?view=time` 在原账户和事件权限校验后返回只读 `journal` 投影；无该参数时沿用旧响应。支持浏览器时区头。
- 原始 `content/sourceText/occurredAt/createdAt` 不改写、不迁移。明确选择的发生时间可展示具体时刻；听写/文字自动提交时间不能冒充事件时间。原话中的单一明确时间复用既有服务解析，时段只显示时段，多时间、歧义和缺失时间显示“时间未明确”。无日期线索的旧记录仍在原始记录日期下可见，不虚构时刻。
- 旧类型只有可直接对应的分类才映射，其他保留全文并归“其他”。无条目的旧事件仍有入口。过敏原及长期健康档案不参与此投影。
- 时间视图按当前记录对象隔离，再按发生日期筛选、发生时间倒序排列，同小时连续展示。附件只显示数量，条目继续打开既有事件详情，不改二级页。

## 验证

`npm run test:journal`、`npm run test:client`、`npm run test:server`、`npm run test:e2e:time-view` 和 `npm run test:e2e:quick-record`。

浏览器测试使用独立合成数据目录，不读取生产健康数据。覆盖 iPhone SE、390/430px 和桌面；实体 iPhone Safari/微信的系统键盘和麦克风权限仍需真人设备验收。

无数据迁移。回滚应用版本即可回到旧视图；可选 journal 字段可保留，不影响旧记录读取。
