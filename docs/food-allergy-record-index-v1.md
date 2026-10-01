# 食物过敏记录指数 v1

接口：GET /api/food-allergy-index?memberId=<当前孩子 ID>。认证沿用应用 Bearer/浏览器会话；服务端验证成员归属，客户端校验返回的 accountId/memberId。响应使用 Cache-Control: no-store。

公式版本：food-record-completeness-v1。N 为已有相关食物条目数，K 为已记录维度数；N > 0 时 Math.round(K / (4 * N) * 100)，N = 0 时为 0。该数值只表示记录完整度，不表示病情、耐受、安全进食或康复程度。

## 使用的持久化来源

- health-profile-sections.json：仅认证账号、当前成员的 allergy section.records；复用反应、检测、已确认的随记关联和排敏 sourceReferences。报告已经人工采用的结果通过现有 tests 字段进入 H。原始报告仅统计待整理数量。
- health-events.json / health-event-records.json：先按账号及成员筛事件，再按账号和事件 ID 筛记录。只使用稳定关联的 journal.symptom、明确关联该次反应的 medication 和 visit。
- desensitization-tests.json：账号/成员归属的未删除任务，未撤回且 status=effective 的观察。草稿、无反应的摄入量不计分。
- 不访问 Agent、模型或提取草稿，不修改已有资料，也不需要用户重新保存。历史本地档案沿用已有登录初始化时的服务端导入流程。

## 字段判定

|维度|v1 明确规则|
|---|---|
|A|反应 severity 为 mild/moderate/severe 或对应明确中文等级；症状文字明确描述轻/中/重度反应，或已关联 journal.symptom.impactLevel 为 little/some/clear。普通症状名称不推出等级。|
|B|反应 handling 明确记录未用药、未治疗、未处理、无需治疗、停食/停止摄入、回避、观察、清洗、冷敷、急诊、住院、已命名药品或明确外涂/雾化处理；或同事件症状通过 linkedRecordIds.medication / medication.linkedSymptomRecordIds 关联到有药名、正用量和单位的用药；或症状关联就医记录明确 followUpActions=home_observation/medication_as_instructed/hospitalization。长期用药、普通用药次数、裸“用药”不计。|
|C|同一反应 exposureAmount 有正数量及单位；或有效排敏观察 symptomAnswer=present 且 exposureAnswer=eaten，amount 有正数量和单位。支持数字及明确中文数量，mg/ml/g/kg、克/毫升/口/个/片等单位。无反应记录、未知来源和普通饮食量不计。|
|H|反应明确症状或已填写具体症状系统、明确“无既往反应”；或具体 testType 且 result 为 positive/negative/borderline；或有效排敏观察已记录具体反应；或已关联症状的具体 descriptors/narrative。只有对象、来源链接、原始图片或非空备注不计。|

所有文本判定先排除未知、不知道、不清、不详、不确定、可能、疑似、待确认、待核实、unknown、unclear。此版本采用保守规则；不识别的表述保持待补充，未对自由文本作模型推断。

## 归并、去重与生命周期

- 使用过敏条目 ID；无 ID 的历史条目沿用稳定的 legacy-allergy-<位置> 标识。
- 排敏任务仅在过敏史 sourceReferences 存在稳定 task ID 时归入该条目；未关联任务使用独立 task ID。同名无关联不强行合并。
- 每个维度最多 1 分，维度内来源按稳定来源 ID 去重。同一来源多次引用不会重复加分。
- active=false 的关联、撤回/删除/草稿观察、已删除随记及跨事件链接均不计；被编辑的随记反应沿用现有 active=false 待核对机制。
- 未明确过敏原单独统计，不进入 N；食物分类目录不参与分母。
- 每次接口请求从持久化数据重新统计；没有指数服务端缓存。JsonStore 已有写入失效机制继续生效。
- 首页和详情共用 useFoodAllergyIndex；成功写入 API 广播失效事件，页面进入、切换孩子、窗口恢复时重新请求。总读超时 10 秒。失败保留同账号同成员旧结果并提示，首次失败不伪造 0%。请求取消和返回归属校验防止切换竞态。
- 结果只暂存于内存，按 accountId/memberId 隔离。

验证：npm run test:food-allergy-index；npm run test:e2e:food-allergy-index；npm run test:client；npm run test:server；npm run build；git diff --check。手机测试使用 iPhone SE (3rd gen) 375x667 预设，390、430 独立后台上下文。测试截图中的百分比为隔离合成测试资料，不是真实账号统计。
