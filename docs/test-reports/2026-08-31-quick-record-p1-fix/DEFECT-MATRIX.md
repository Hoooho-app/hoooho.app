# 快捷记录 P1 定点修复矩阵

本矩阵只覆盖独立验收中的 29 个 FAIL 和 16 个 PARTIAL。原始证据保持不变，详见 [`../2026-08-31-symptom-tracking-independent-acceptance/RESULTS.json`](../2026-08-31-symptom-tracking-independent-acceptance/RESULTS.json)；本次没有重写旧验收结果，也没有把开发回归冒充新的独立黑盒验收。

统一开发回归入口为 `server/ai/evaluation/independent-symptom-tracking-strict.test.mjs`。它对每一步的 Preview、Confirm、Refresh 使用同一组严格字段断言，并检查人物、数量、禁用事实和纠正关系。

| 原等级 | 用例 | 完整原始输入 | 预期结构化结果 | 旧链路缺口 | 根因与修复点 | 新断言 |
|---|---|---|---|---|---|---|
| PARTIAL | ST-01、ST-04、ST-05、ST-07、NEG-01、SPEECH-08 | `今天开始咳嗽。`；`今天偶尔会咳两声。`；`今天吐了三次。`；`这个疹子是前天开始出现的。`；`今天没有发烧。`；`娃儿今天蔫巴巴的，身上烫得很，量了39度1。` | 日期级事实保留自然语言日期、人物、极性、次数和测量值；UI 不显示伪造的 00:00。 | Preview/Confirm 字段大体正确，刷新 UI 把自然日零点画成精确时刻。 | `healthEventDetailAdapter.ts` 只为 day/fuzzy 精度提供 `displayTime`；`TimelineSection.tsx` 优先显示该值。 | 精确检查 `time.raw`、本地日期及 UI 禁用 `00:00`；客户端新增日期级显示测试。 |
| PARTIAL | ST-02、ST-06、ST-10、ST-11 | `右边小腿疼。`；`肚子已经疼了两个小时。`；`鼻子堵，嗓子也疼，但是没有发烧。`；`左边肩膀疼，右边小腿也有点麻。` | 保留腹部/咽喉/肩/小腿粒度、左右侧别和持续时间，并进入紧凑摘要。 | Preview 丢部位、侧别或规范实体；UI 又过滤“部位”段。 | `local-fact-provider.mjs` 规范身体部位和实体；适配器保留非冗余部位并合并侧别。 | 严格检查 `bodyPart`、`laterality`、`duration`；客户端断言 `右小腿；疼痛`。 |
| PARTIAL | ST-03、ST-08 | `头疼得比较厉害。`；`好像有一点喘。` | severe 头痛；uncertain 且 mild 的喘息。 | 程度词未映射，弱化了事实属性。 | 扩展严重/轻微口语映射，保留不确定极性。 | 严格检查 `severity` 与 `polarity`。 |
| FAIL | ST-12、TIME-01、SPEECH-07 | `我真的快急死了，孩子一直咳，刚才还吐了两次。`；`刚刚咳得特别厉害。`；`妈的急死我了，孩子咳得更厉害了，刚刚还吐了一次。` | 去除情绪填充词；拆出持续/加重咳嗽和呕吐次数；刚才/刚刚接近提交时刻。 | 相对时刻被解析成整天或提交选择值，状态事实和程度属性不完整。 | `time-resolver-service.mjs` 将刚才/刚刚解析为精确参考时刻；解析器扩展严重、加重、次数与原子拆分。 | 严格检查 10 分钟窗口、状态 target/change、次数和禁用情绪实体。 |
| FAIL/PARTIAL | CTX-02、CTX-03、CTX-04、CTX-06 | `十点头疼得很厉害。 → 现在轻一点了。`；`头疼，而且肚子也疼。 → 这个好一点了。`；`头疼，而且肚子也疼。 → 头已经不疼了，肚子还是疼。`；`三天前开始咳嗽。 → 今天量体温37度。 → 今天比前两天轻多了。` | 唯一目标自动关联；多个候选仍 409；显式多目标分别解析；跨非症状记录保持目标。 | 通用“疼痛”覆盖明确部位，状态目标只看最近一条或候选数。 | `health-event-context.mjs` 按实体、部位和事件历史选目标；明确歧义继续 fail-closed；`三天前`使用真实日期。 | 每步严格检查状态目标、变化、部位和日期；CTX-03 第二步必须拒绝。 |
| FAIL | CTX-05 | `8月30日上午起了红疹。 → 8月30日下午红疹退了。 → 8月30日晚上又有了。` | 皮疹 active → resolved → recurred，三步日期均为 8月30日。 | 复发时只搜索当前活跃症状，已消失事实无法成为复发目标。 | 上下文层为 `recurred` 搜索已解决事实，并从原句提取显式日期时段。 | 严格检查三步 target/change、`time.raw` 和本地日期。 |
| PARTIAL | NEG-04 | `今天没有比昨天更严重，差不多还是那样。` | 一条 affirmed/unchanged 稳定状态，不生成 worsened。 | 旧门禁把“没加重”当成无事实，或产生重复 unchanged。 | 状态词表增加 stable/unchanged，并合并同输入重复状态。 | 精确 1 条状态事实；禁用 worsened。 |
| FAIL | NEG-05、NEG-06、NEG-07、NEG-08 | `左腿疼，不对，是右腿，左腿没事。`；`刚才量的是39度2，不对，我看错了，是38度2。`；`是今天早上开始疼的，哦不是，是昨天晚上就开始了。`；`不是头疼，是头晕，头不疼。` | 当前值只保留右腿、38.2℃、昨晚、头晕；旧值有 correction/revision 关系或阴性事实。 | 同句纠正按普通矛盾去重，时间上下文覆盖纠正后的时间，纠正状态被误当当前阳性。 | 解析器建立 correction 状态及 relation；纠正后完整时间优先；验收器的 `current:true` 只匹配当前有效事实。 | 检查 relation、current 禁用项、温度单值、侧别、时间和极性。 |
| FAIL | SPEECH-05 | `就是那个，嗯，孩子吧，今天这个咳嗽啊，好像比上午多一点，就这样。` | uncertain 的咳嗽 worsened 状态，不保存填充词。 | “好像”被状态构造强制改成 affirmed，基础观察重复。 | 状态构造保留 uncertain；非 persistent 状态移除同句冗余基础观察。 | 精确 1 条 uncertain/worsened/咳嗽状态。 |
| FAIL/PARTIAL | TIME-02、TIME-03、TIME-04、UI-07 | `昨晚十一点开始肚子疼。`；`昨晚十一点半开始发烧。 → 今天凌晨一点还是38度8。`；`这个疹子从8月29号开始，到今天已经持续三天了。`；`十点体温38度5。 → 十点半体温38度2。` | 中文时钟解析为 23:00/23:30/01:00/10:00/10:30；持续 3 天；连续记录互不覆盖。 | 时钟只识别阿拉伯数字；昨晚未进入 PM 换算；跨分句属性没有回填。 | `time-resolver-service.mjs` 与 `time-context-resolver.mjs` 统一中文数字、半点、PM 和跨午夜；解析后用同一时间分组排序。 | 检查本地日期、小时、分钟、duration；Preview/Confirm/Refresh 完全一致。 |
| FAIL | TIME-05、TIME-07、TIME-08 | `咳嗽已经三天了，不是一直咳，主要是晚上咳。`；`一跑步就咳，不跑的时候基本不咳。`；`这几天每天晚上都会头疼，白天基本没事。` | 区分夜间/白天、运动/静息上下文；否定“持续不断”；不得把周期词当未来发生时刻。 | 频率被当 occurrence time，正反上下文被同名矛盾去重，导致 FUTURE_OCCURRED_AT。 | 频率从时间语义分离；保留不同 frequency 的正反事实；显式构造 negated persistent。 | 检查 1–2 条上下文事实、frequency、polarity，并禁用 affirmed persistent。 |
| FAIL | TRACK-01、TRACK-02、TRACK-03、TRACK-04 | 五步发热温度链；五步咳嗽频率链；四步腹痛评分链；四步呕吐次数链（完整输入见独立验收 RESULTS）。 | 每步保留真实温度/次数/评分/频率与 worsened/improved/persistent/resolved/recurred 状态。 | 属性散落在相邻分句；同句基础观察与状态重复；日期中的“30”被误识别为体温。 | 解析后聚合相邻属性；按 prior fact 生成状态；日期数字从温度候选排除；同目标同状态稳定去重。 | TRACK-01～04 全步骤字段、数量、时间和禁用事实严格断言。 |
| FAIL | TRACK-05、TRACK-06、TRACK-07 | 三步发热/咳嗽/流鼻涕链；三步头痛/恶心/呕吐链；三步疼痛部位迁移链。 | 同一步允许多个独立目标；阴性/消失不反转；不同身体部位独立追踪。 | 状态只绑定最近实体，同名“疼痛”跨部位互相覆盖，恶心缺少目标词典。 | 上下文按 bodyPart 配对状态；加入恶心目标；阴性观察与 resolved 状态按 prior 合并。 | 每步严格检查多个 target、bodyPart、laterality、数量和当前禁用事实。 |
| FAIL | TRACK-08、TRACK-09、TRACK-10、TRACK-11、TRACK-12 | 左臂皮疹纠正右臂；咽喉痛未变/持续；头痛出现/无/复发；腹泻 5→2→1；鼻塞持续并新增症状。 | 保留历史、修订关系和当前投影；次数下降形成改善，未完全好形成持续。 | 纠正、泛化疼痛、次数变化和跨条上下文缺少统一状态模型。 | 扩展状态合同和事件上下文；次数与 prior 比较；当前症状投影排除 resolved，历史时间线不删除。 | TRACK-08～12 全步骤严格断言；摘要单测验证状态-only 当前投影。 |

## 开发验证口径

- `server/ai/evaluation/independent-symptom-tracking-strict.test.mjs`：65/65，Preview → Confirm → Refresh 严格字段一致。
- `server/ai/evaluation/symptom-tracking-65-regression.test.mjs`：保留原正式回归集，并将 NEG-04 的过时“零事实”口径更新为明确 unchanged 事实。
- `src/services/healthEventDetailAdapter.test.ts`：日期级时间不显示 00:00、部位侧别进入紧凑摘要、当前症状与历史时间线分离。
- `server/events/health-event-summary.test.mjs`：状态-only 输入仍能形成保守当前症状，纠正状态不被误判为消失。

产品结论仍为 `FAIL / 待新的独立黑盒复验`；本矩阵记录的是开发修复和回归证据，不替代独立验收。
