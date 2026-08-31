import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const evidenceRoot = path.join(root, '.codex-tmp', 'independent-symptom-tracking-acceptance')
const reportRoot = path.join(root, 'docs', 'test-reports', '2026-08-31-symptom-tracking-independent-acceptance')
const results = JSON.parse(await readFile(path.join(evidenceRoot, 'results.json'), 'utf8'))
const production = JSON.parse(await readFile(path.join(evidenceRoot, 'production-readonly', 'result.json'), 'utf8'))

const partialCases = new Set([
  'ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05', 'ST-06', 'ST-07', 'ST-08', 'ST-10', 'ST-11',
  'CTX-03', 'NEG-01', 'NEG-04', 'NEG-08', 'SPEECH-08', 'TIME-04'
])
const official = results.results.filter((item) => item.id !== 'TIME-FUTURE-01')
const classification = (item) => item.pass ? 'PASS' : partialCases.has(item.id) ? 'PARTIAL' : 'FAIL'
const counts = official.reduce((acc, item) => ({ ...acc, [classification(item)]: acc[classification(item)] + 1 }), { PASS: 0, PARTIAL: 0, FAIL: 0, BLOCKED: 0 })

const compactFact = (fact) => ({
  name: fact.name,
  type: fact.type,
  polarity: fact.polarity,
  status: fact.status,
  change: fact.change || null,
  target: fact.target || null,
  bodyPart: fact.bodyPart || fact.bodyRegion || null,
  laterality: fact.laterality || null,
  severity: fact.severity || null,
  severityScale: fact.severityScale || null,
  frequency: fact.frequency || null,
  occurrenceCount: fact.occurrenceCount ?? null,
  duration: fact.duration || null,
  temperature: fact.temperature || (fact.type === 'temperature' ? { value: fact.value, unit: fact.unit } : null),
  time: fact.time ? { raw: fact.time.raw, resolvedStart: fact.time.resolvedStart, resolvedEnd: fact.time.resolvedEnd, precision: fact.time.precision } : null,
  subjectMemberId: fact.subjectMemberId
})

const missingText = (step) => {
  const missing = (step.preview?.evaluation?.missing || []).flatMap((item) => item.closestMissing || [])
  const forbidden = step.preview?.evaluation?.forbidden?.length ? [`出现 ${step.preview.evaluation.forbidden.length} 条禁用事实`] : []
  const uiMissing = (step.refresh?.uiEvaluation?.missing || []).map((item) => `UI 缺少 ${item}`)
  const uiForbidden = (step.refresh?.uiEvaluation?.forbidden || []).map((item) => `UI 错误显示 ${item}`)
  const responseError = step.preview?.status >= 400 ? [`Preview ${step.preview.status}: ${step.preview.body?.error?.code || ''} ${step.preview.body?.error?.message || ''}`.trim()] : []
  const noWrite = !step.expectation.reject && step.counts.createdRecords === 0 ? ['预期健康事实未保存'] : []
  const items = [...missing, ...forbidden, ...uiMissing, ...uiForbidden, ...responseError, ...noWrite]
  return items.length ? [...new Set(items)].join('；') : '无'
}

const compactCases = official.map((item) => ({
  id: item.id,
  member: item.member,
  originalSteps: item.originalSteps,
  executionSteps: item.executionSteps,
  expectation: item.expectation,
  result: classification(item),
  strictPass: item.pass,
  reasons: item.steps.map(missingText),
  steps: item.steps.map((step) => ({
    step: step.step,
    input: step.executionInput,
    expectation: step.expectation,
    previewStatus: step.preview.status,
    previewFacts: (step.preview.body?.healthAIOutput?.facts || []).map(compactFact),
    confirmStatus: step.confirm?.status || null,
    refreshedFacts: (step.refresh.organizations || []).find((organization) => organization.previewId === step.preview.body?.previewId)?.healthAIOutput?.facts?.map(compactFact) || [],
    counts: step.counts,
    consistency: step.consistency,
    previewUi: step.preview.uiEvaluation,
    refreshUi: step.refresh.uiEvaluation,
    skippedConfirmReason: step.skippedConfirmReason,
    evidence: step.evidence
  }))
}))

const keyEvidence = [
  ['PERSON-02/PERSON-02-step-01-preview.png', 'evidence/PERSON-02-multi-person-blocked.png'],
  ['TRACK-05/TRACK-05-step-03-preview.png', 'evidence/TRACK-05-negation-reversal.png'],
  ['TIME-05/TIME-05-step-01-preview.png', 'evidence/TIME-05-false-future-rejection.png'],
  ['TIME-FUTURE-01/TIME-FUTURE-01-step-01-preview.png', 'evidence/TIME-FUTURE-01-correct-rejection.png'],
  ['UI-01/UI-01-step-01-confirm.png', 'evidence/UI-01-idempotency.png'],
  ['UI-06/UI-06-step-01-offline-error.png', 'evidence/UI-06-offline-error.png']
]

await mkdir(path.join(reportRoot, 'evidence'), { recursive: true })
for (const [source, target] of keyEvidence) await copyFile(path.join(evidenceRoot, source), path.join(reportRoot, target))

const summary = {
  generatedAt: new Date().toISOString(),
  taskDeliveryStatus: 'DONE',
  productAcceptance: 'FAIL',
  officialCaseCounts: counts,
  strictPassRate: results.totals.strictPassRate,
  severityClusters: { P0: 0, P1: 6, P2: 4 },
  staging: {
    url: results.baseline.baseUrl,
    deploymentId: '49dfade9-7405-4262-ac3a-adaa8efa37d8',
    status: 'SUCCESS',
    deployLabel: 'deploy b54067c fact pipeline final',
    imageDigest: 'sha256:b4d067351f7582acf10e39a8b3824f1a8dd475557f131b088c4e365219a248ee',
    assets: results.baseline.root.assets
  },
  production: {
    ...production,
    railwayDeploymentId: '23e31c77-0004-4c00-8b86-4a07aa5dcb37',
    railwayCommit: 'c4ebef775c61add55d8a3c2eee2d7a4ab2b04870',
    railwayStatus: 'SUCCESS'
  },
  browser: results.browser,
  account: { alias: 'account-acceptance', identifier: 'redacted-fictional-phone', authChannel: results.account.authChannel },
  members: results.members,
  execution: { startedAt: results.startedAt, endedAt: results.endedAt, timezone: 'Asia/Shanghai' },
  metrics: {
    officialCases: 65,
    officialSteps: official.flatMap((item) => item.steps).length,
    confirmedSteps: 94,
    previewConfirmRefreshFactConsistency: '94/94 (100%)',
    successfulConfirmPersistence: '94/94 (100%)',
    previewFacts: 133,
    wrongSubjectFacts: 0,
    subjectAccuracy: '133/133 (100%)',
    hypothesisQuestionGate: '5/5 (100%)',
    futureOccurrenceGate: 'PASS'
  },
  cases: compactCases,
  extraCases: [{ id: 'TIME-FUTURE-01', result: 'PASS', errorCode: 'FUTURE_OCCURRED_AT', message: '发生时间不能晚于现在，请修改后重试。', recordsCreated: 0 }]
}
await writeFile(path.join(reportRoot, 'RESULTS.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

const formatExpectation = (expectation) => JSON.stringify(expectation)
const formatFacts = (facts) => facts.length ? facts.map((fact) => JSON.stringify(fact)).join('<br>') : '[]'
const caseSections = compactCases.map((item) => {
  const steps = item.steps.map((step) => `
#### Step ${step.step}

- 输入：${step.input}
- 完整预期：${formatExpectation(step.expectation)}
- Preview：HTTP ${step.previewStatus}；${formatFacts(step.previewFacts)}
- Confirm：${step.confirmStatus ? `HTTP ${step.confirmStatus}` : `未确认（${step.skippedConfirmReason || '无可确认事实'}）`}
- 刷新 API：${formatFacts(step.refreshedFacts)}
- 数量：Records +${step.counts.createdRecords}，Organizations +${step.counts.createdOrganizations}
- Preview/Confirm/Refresh：${step.consistency ? JSON.stringify(step.consistency) : '无确认链路'}
- 最终 UI：${step.refreshUi.pass ? '满足本步 UI 断言' : `不满足：${JSON.stringify(step.refreshUi)}`}
- 失败/差异：${item.reasons[step.step - 1]}
- 完整本地证据：${Object.values(step.evidence).join('；')}
`).join('')
  return `### ${item.id} — ${item.result}

- 当前人物：${item.member.name}（${item.member.kind}）
- 原始输入：${item.originalSteps.join(' → ')}
- 执行输入：${item.executionSteps.join(' → ')}
- 用例预期：${item.expectation}
- 严格结果：${item.strictPass ? 'PASS' : '未满足全部字段'}
${steps}`
}).join('\n')

const rows = compactCases.map((item) => `| ${item.id} | ${item.member.name} | ${item.result} | ${item.reasons.join(' / ')} |`).join('\n')
const report = `# Hoooho 快捷记录事实链路独立验收报告

## 1. 最终结论

- 测试任务交付状态：**DONE**
- 产品验收结论：**FAIL**
- 65 个正式用例：${counts.PASS} PASS / ${counts.PARTIAL} PARTIAL / ${counts.FAIL} FAIL / 0 BLOCKED
- 严格 PASS：${counts.PASS}/65（${(results.totals.strictPassRate * 100).toFixed(1)}%），远低于 90% 门槛
- 缺陷簇：P0 0 / P1 6 / P2 4
- 判定要点：跨人物、假设/问句、幂等、离线和真正未来时间门禁通过；但仍有显式否定反转、状态链丢失、语义时间错误、多事实丢失与纠正关系缺失。

## 2. 测试基线

- 仓库：Hoooho-app/hoooho.app
- 测试分支：codex/independent-symptom-tracking-acceptance
- 代码基线：858bac329ec6e75f4bd553963c71be99f2ad7f16（执行开始时与 origin/main 一致）
- Staging：${results.baseline.baseUrl}；健康检查 ${results.baseline.health.status}；部署 49dfade9-7405-4262-ac3a-adaa8efa37d8 / SUCCESS；镜像 sha256:b4d067…；标签 deploy b54067c fact pipeline final
- Staging 静态资源：${results.baseline.root.assets.join('，')}
- 浏览器：Google Chrome ${results.browser.version}，Playwright Core 独立上下文
- 设备：iPhone SE，375×667，DPR 2，竖屏
- 时区：Asia/Shanghai
- 执行时间：${results.startedAt} ～ ${results.endedAt}
- 账号：全新虚构 Staging 账号（redacted-fictional-phone）；人物：测试宝宝A、测试成人B、测试老人C

## 3. 与修复方回归的独立性

没有复用旧账号、旧 Token、旧事件、浏览器缓存或修复方宽松断言。65 条均通过 Staging 真实页面文字入口、Preview API、Confirm API、刷新后的 Records/Organizations 与最终 UI 执行；每条使用独立事件。独立预期逐字段覆盖人物、实体、极性、状态、属性、时间、关系和 UI。开发侧 65/65、314/314 等结果未作为本报告通过证据。

## 4. 65 个正式用例结果

| Case | 人物 | 结果 | 主要差异 |
|---|---|---|---|
${rows}

${caseSections}

## 5. 基础症状与属性

ST-09 的 38～39℃范围、ST-04 的偶尔/两声、ST-05 的三次在 API 中正确；但日期级 UI 均把无具体时刻显示为 00:00。ST-02 丢右侧，ST-03 丢程度，ST-06 丢腹部与两小时，ST-08 丢轻微，ST-10 咽喉部位退化，ST-11 左右侧别均丢。属性链未达到接受标准。

## 6. 连续症状跟踪

CTX-01、SPEECH-02/03/04 的简单持续/复发/消失/改善链可用；复杂链大量失败。TRACK-01～12 无一严格 PASS：精确时刻被压成时段起点、加重/缓解/持续/复发状态缺失、症状原子丢失或出现反向阳性。TRACK-05 的“没有再发烧”同时生成发热 affirmed active 与发热消失，构成明确矛盾。

## 7. 上下文、否定与纠正

CTX-03 的歧义目标被 409 正确阻断；CTX-05 的“又有了”零事实，复发上下文失败。NEG-05 只留下左腿阴性而没有右腿当前阳性；NEG-06 最终 38.2℃正确但没有纠正关系；NEG-07 保留了被纠正的今天早上而丢昨天晚上；TRACK-08 没有 superseded/revised 关系。NEG-08 没有头痛阳性，但生成两条语义相近的头部阴性事实，判 PARTIAL。

## 8. 时间语义

浏览器 Date 在每步提交前固定为执行机 UTC 当前时间前 5 秒，服务端保持真实时间；报告保存 selectedOccurredAt 与 HTTP Date。全天序列仅把时间锚点等价改写到 2026-08-30，症状、顺序、数值和状态未改。

TIME-01 的“刚刚”被解析为当天 00:00；TIME-02/03、TRACK-01/04、UI-07 的明确时分被压成时段起点或提交时间；TIME-05/08 的有效当前输入被 FUTURE_OCCURRED_AT 错误拒绝。额外真正未来用例正确返回 FUTURE_OCCURRED_AT、中文错误、零记录。日期级事实在最终 UI 显示 00:00，违反“日期或具体时间未记录”的要求。

## 9. 跨人物安全

PERSON-01、02、03、04 全部 PASS。明确人物不匹配和多人物输入均整次阻断并零写入；奶奶仅作为信息来源，宝宝为 uncertain 主体且未虚构温度。全部 133 条 Preview 事实的 subjectMemberId 均属于当前事件人物，跨人物污染为 0。

## 10. 假设、问句、担忧、引用门禁

FILTER-01～05 与 TIME-06 全部零阳性入库。假设、知识问句、诊断担忧、天气闲聊和未来条件句均没有 Records/Organizations，门禁结论通过。

## 11. 多事实原子保存

94 个成功确认步骤的 Preview、Confirm、Refresh API 事实 JSON 全部一致，且均恰好新增 1 Record 与 1 Organization。然而一致地保存错误事实不等于业务正确：ST-10、CTX-04、TRACK-05/06/07 等仍发生实体或状态原子丢失；最终 UI 又经常隐藏部位、侧别、状态和日期精度。因此端到端业务一致性不成立。

## 12. 离线、双击与幂等

UI-06 真实 context offline：中文“网络连接失败”，无英文 Failed to fetch，离线期间零写入；恢复网络后仅写入一次。UI-01 真实双击后再以同一 Confirm 请求重放，服务端返回 idempotent=true，Records/Organizations/事实和 UI 未重复。两项 PASS。

## 13. Staging 黑盒结果

Staging / 与 /api/health 均为 200，页面、JavaScript、CSS 与 API 来自同一部署。执行 65 个正式用例、107 个正式步骤和 1 个额外未来用例；完整截图和脱敏响应位于本地证据包。Staging 产品结论 FAIL。

## 14. Production 只读检查

Railway Production 部署 23e31c77-0004-4c00-8b86-4a07aa5dcb37 / SUCCESS，commit c4ebef775c61add55d8a3c2eee2d7a4ab2b04870。/api/health 200；/ 与未登录 /health-events/read-only-route-probe 均 200 并进入 /login，静态页面可打开。正式留档复跑拦截全部非 GET；页面尝试的 Cloudflare RUM POST 被浏览器阻断。未登录、未访问用户数据、未调用 Preview/Confirm、未产生健康数据。

## 15. 与第一次 35/100 的对比

第一次为 18/65 严格 PASS（27.7%）；本轮为 20/65（30.8%），仅增加 2 条、提升 3.1 个百分点。跨人物污染、假设/问句门禁、幂等、离线与基础状态链有明显改善；但原 P1 的时间、否定、复杂状态、多事实和纠正关系仍广泛存在，不能视为专项修复完成。

## 16. 对“65/65、100%”声明的核验

- 65/65：**被推翻**。逐字段严格结果为 20/65。
- 跨人物污染 0：**本轮证实**。
- Preview—Confirm—Refresh API 一致率 100%：**本轮证实为 94/94**，但只证明错误结果也被一致保存。
- 明确主体准确率 100%：**本轮 133/133 证实**。
- 最终 UI 与 API 100% 一致：**未证实并被多项反例推翻**。
- 否定、时间、多事实、状态链均已修复：**被推翻**。

## 17. 缺陷清单

### P1（6 个缺陷簇）

1. 显式否定反转：TRACK-05 第三步“没有再发烧”生成发热 affirmed active；同类见 TRACK-02/04。
2. 语义时刻丢失或错位：TIME-01/02/03、TRACK-01/04、UI-07；TRACK-01 还新增无依据 30℃。
3. 有效当前输入误判未来：TIME-05、TIME-08 返回 FUTURE_OCCURRED_AT 且零保存。
4. 状态链缺失/反向：CTX-04/05、SPEECH-05/07、TRACK-01～12 多处加重、缓解、持续、消失、复发未形成。
5. 纠正关系和当前值失败：NEG-05/06/07、TRACK-08 无 superseded/revised，或保留被纠正值。
6. 多事实静默丢失：CTX-04、TRACK-05/06/07 等省略症状或状态原子。

### P2（4 个缺陷簇）

1. 部位、侧别、程度、持续时间等属性丢失：ST-02/03/06/08/10/11、TIME-04。
2. 日期级时间在最终 UI 伪装成 00:00：ST-01/04/05/07、NEG-01、SPEECH-08。
3. 最终时间轴不显示 API 已有的部位、侧别、次数或状态细节。
4. NEG-08 对同一头部否定产生重复/近义阴性事实。

### P0

0。未观察到跨人物健康事实写入。

## 18. 剩余 BLOCKED 项

- 真实麦克风 E2E：BLOCKED（本轮环境无真实麦克风）；SPEECH-* 仅验证文字入口后的公共事实链路，不计作真实语音采集 PASS。
- 照片入口：不在本轮范围。
- Production 写入链路：按安全边界禁止，不是 Staging 结论的阻塞项。

## 19. 最终产品建议

**需要关闭/回滚快捷记录用于真实家庭连续症状跟踪的入口，至少在 P1 修复并通过同等黑盒复验前不得正式接受。** 可以保留受限的简单单事实试用，但必须阻断复杂多事实、否定、纠正和语义时间确认；下一步应另开修复任务，不能在本验收任务中修改业务代码。

关键截图位于本目录 evidence/；完整证据仅保存在 .codex-tmp/independent-symptom-tracking-acceptance/ 及其 ZIP，未提交账号、Token、Cookie、验证码或完整认证响应。
`

await writeFile(path.join(reportRoot, 'REPORT.md'), report, 'utf8')
console.log(JSON.stringify({ report: path.join(reportRoot, 'REPORT.md'), summary: path.join(reportRoot, 'RESULTS.json'), counts }))
