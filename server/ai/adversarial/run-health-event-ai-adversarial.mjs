import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LocalFactProvider } from '../providers/local-fact-provider.mjs'
import { projectOrganizedHealthData } from '../ai-types.mjs'
import { allCases, RANDOM_SEED } from './health-event-ai-adversarial-cases.mjs'

const startedAt = new Date()
const provider = new LocalFactProvider()

function generatedFactText(fact) {
  return [fact.name, fact.bodyPart, fact.target, fact.change, fact.temperature && JSON.stringify(fact.temperature)].filter(Boolean).join(' ')
}
function isCurrentPositiveFact(fact) {
  return fact.polarity === 'affirmed'
    && fact.temporality === 'current'
    && !['not_applicable', 'resolved', 'corrected', 'superseded'].includes(fact.status)
    && fact.subject === 'event_subject'
}
function isCurrentFever(output) {
  return output.facts.some((fact) => isCurrentPositiveFact(fact) && fact.type === 'symptom' && /发热|发烧|高烧|低烧/.test(fact.name))
}

async function execute(testCase) {
  try {
    const healthAIOutput = await provider.organize(testCase.input)
    const organizedHealthData = projectOrganizedHealthData(healthAIOutput)
    const failures = []
    for (const forbidden of testCase.forbiddenFacts ?? []) {
      if (healthAIOutput.facts.some((fact) => isCurrentPositiveFact(fact) && (!forbidden.type || fact.type === forbidden.type) && generatedFactText(fact).includes(forbidden.name))) {
        failures.push(`forbidden fact generated: ${forbidden.name}`)
      }
    }
    for (const text of testCase.mustNotInclude ?? []) {
      if (healthAIOutput.facts.some((fact) => isCurrentPositiveFact(fact) && generatedFactText(fact).includes(text))) failures.push(`forbidden text generated: ${text}`)
    }
    if (testCase.forbiddenCurrentFever && (isCurrentFever(healthAIOutput) || organizedHealthData.symptoms.some((x) => x.content === '发热'))) {
      failures.push('current fever generated')
    }
    if (testCase.expectedTemperature !== undefined) {
      const values = healthAIOutput.facts.filter((x) => x.type === 'temperature').flatMap((x) => [x.temperature?.min, x.temperature?.max])
      if (!values.includes(testCase.expectedTemperature)) failures.push(`expected temperature missing: ${testCase.expectedTemperature}`)
    }
    return { ...testCase, status: failures.length ? 'failed' : 'passed', failures, actual: { healthAIOutput, organizedHealthData } }
  } catch (error) {
    return { ...testCase, status: 'failed', failures: [`exception: ${error?.code ?? error?.message}`], actual: { error: error?.stack ?? String(error) } }
  }
}

const results = []
for (const testCase of allCases) results.push(await execute(testCase))

const failed = results.filter((x) => x.status === 'failed')
const severities = Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((level) => [level, failed.filter((x) => x.severityIfFailed === level).length]))
const fever = results.filter((x) => x.category === 'fever-misclassification')
const report = {
  schemaVersion: 1, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
  provider: provider.name, model: null, temperature: null, randomSeed: RANDOM_SEED,
  totals: { designed: results.length, executed: results.length, passed: results.length - failed.length, failed: failed.length, skipped: 0, ...severities },
  feverSpecial: { total: fever.length, passed: fever.filter((x) => x.status === 'passed').length, failed: fever.filter((x) => x.status === 'failed').length },
  blocked: [
    'OpenAI provider not executed: OPENAI_API_KEY is not configured; no paid calls were authorized.',
    'Browser E2E not executed: this runner targets deterministic parser and projection layers only.'
  ],
  results
}

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reports')
await mkdir(directory, { recursive: true })
await writeFile(path.join(directory, 'health-event-ai-adversarial-report.json'), `${JSON.stringify(report, null, 2)}\n`)

const topFailures = failed.slice(0, 30).map((item) => `| ${item.severityIfFailed} | ${item.id} | ${item.input.replaceAll('|', '\\|')} | ${item.failures.join('; ')} |`).join('\n')
const executiveSummary = failed.length
  ? `当前本地健康事实整理仍有 ${failed.length} / ${results.length} 个 Oracle 检查失败。任何 P1 事实反转都足以阻止将该能力视为可信的健康信息整理器。`
  : `当前确定性攻击基线 ${results.length} 项全部通过，P1 已降为 0；本结论仅覆盖本地 Provider 和结构化投影，不替代真实模型与端到端验证。`
const riskConclusion = failed.length
  ? '当前结果仍存在阻断性事实反转，不应作为可信事实直接展示。'
  : '本地 Provider 已通过当前冻结攻击集；仍应保留原始输入、版本追踪与失败状态，并继续以新增真实案例做回归。'
const markdown = `# Hoooho 健康事件 AI 攻击性测试报告

## Executive Summary

${executiveSummary}

## 测试范围

- 已执行：LocalFactProvider、事实规范化、结构化投影、发热派生规则；固定攻击、发热矩阵、变形与固定种子组合。
- 未执行：真实 OpenAI Provider、HTTP API 进程、浏览器 E2E、付费模型非确定性重复。
- 阻塞：未配置 OPENAI_API_KEY；本轮禁止产生明显外部费用；E2E 需独立测试账号/环境。

## 总体结果

| 指标 | 数量 |
|---|---:|
| 设计用例 | ${results.length} |
| 实际执行 | ${results.length} |
| 通过 | ${results.length - failed.length} |
| 失败 | ${failed.length} |
| 未执行 | 0 |
| P0 | ${severities.P0} |
| P1 | ${severities.P1} |
| P2 | ${severities.P2} |
| P3 | ${severities.P3} |

## 发热误判专项结果

- 总计 ${fever.length}，通过 ${fever.filter((x) => x.status === 'passed').length}，失败 ${fever.filter((x) => x.status === 'failed').length}。
- 正常体温、明确否定、历史、他人、担忧、条件句和引用文字均按“不得成为当前发热”判定。

## 缺陷列表（前 30 条）

| 严重度 | 用例 | 输入 | 实际错误 |
|---|---|---|---|
${topFailures || '| - | - | - | 无 |'}

## 已修复的基线根因

- HealthFact 现显式建模极性、主体、时间性、状态、来源和原文。
- 用药区分已服用、未服用、备用与计划；诊断只消费明确确认事实。
- 摘要只消费规范化当前阳性事实，不从检查或就诊原文猜测诊断。
- 体温与发热派生只消费当前记录对象的有效体温测量。

## 上线风险判断

${riskConclusion}

## 复跑

\`npm run test:ai:adversarial\`
`
await writeFile(path.join(directory, 'health-event-ai-adversarial-report.md'), markdown)

console.info(`[Adversarial] provider=${provider.name} seed=${RANDOM_SEED}`)
console.info(`[Adversarial] executed=${results.length} passed=${results.length - failed.length} failed=${failed.length}`)
console.info(`[Adversarial] report=${directory}`)
if (failed.length) process.exitCode = 1
