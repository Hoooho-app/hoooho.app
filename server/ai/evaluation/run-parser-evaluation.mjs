import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AIService } from '../ai-service.mjs'
import { hasHealthFacts } from '../ai-types.mjs'

const evaluationDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDatasetPath = path.join(evaluationDirectory, 'datasets', 'parser-p0-v1.json')
const defaultReportPath = path.join(evaluationDirectory, 'reports', 'local-fact-provider-baseline.md')

function readArgument(name, fallback) {
  const prefix = `--${name}=`
  const match = process.argv.find((argument) => argument.startsWith(prefix))
  return match ? path.resolve(process.cwd(), match.slice(prefix.length)) : fallback
}

function percentage(value, total) {
  if (!total) return 'n/a'
  return `${((value / total) * 100).toFixed(1)}%`
}

function sameNumber(actual, expected) {
  return Number.isFinite(Number(actual)) && Number(actual) === Number(expected)
}

function matchesFact(fact, rule) {
  if (!fact || !rule) return false
  if (rule.type !== undefined && fact.type !== rule.type) return false
  if (rule.name !== undefined && fact.name !== rule.name) return false
  if (rule.nameIncludes !== undefined && !fact.name?.includes(rule.nameIncludes)) return false
  if (rule.bodyPart !== undefined && fact.bodyPart !== rule.bodyPart) return false
  if (rule.change !== undefined && fact.change !== rule.change) return false
  if (rule.target !== undefined && fact.target !== rule.target) return false

  if (rule.temperature) {
    if (!fact.temperature) return false
    if (rule.temperature.min !== undefined && !sameNumber(fact.temperature.min, rule.temperature.min)) return false
    if (rule.temperature.max !== undefined && !sameNumber(fact.temperature.max, rule.temperature.max)) return false
  }

  if (rule.time) {
    if (!fact.time) return false
    for (const key of ['raw', 'resolvedStart', 'resolvedEnd', 'precision', 'source']) {
      if (Object.hasOwn(rule.time, key) && fact.time[key] !== rule.time[key]) return false
    }
  }

  return true
}

function describeRule(rule) {
  const parts = [rule.type]
  if (rule.name) parts.push(`name=${rule.name}`)
  if (rule.nameIncludes) parts.push(`name~${rule.nameIncludes}`)
  if (rule.bodyPart) parts.push(`bodyPart=${rule.bodyPart}`)
  if (rule.change) parts.push(`change=${rule.change}`)
  if (rule.target) parts.push(`target=${rule.target}`)
  if (rule.temperature) parts.push(`temperature=${rule.temperature.min}-${rule.temperature.max}`)
  if (rule.time?.raw) parts.push(`time.raw=${rule.time.raw}`)
  if (rule.time?.resolvedStart) parts.push(`time.start=${rule.time.resolvedStart}`)
  return parts.filter(Boolean).join(' ')
}

function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') throw new Error('Dataset 必须是 JSON 对象')
  if (!Array.isArray(dataset.cases) || dataset.cases.length === 0) throw new Error('Dataset cases 不能为空')
  const ids = new Set()
  for (const item of dataset.cases) {
    if (!item.id || ids.has(item.id)) throw new Error(`Dataset case id 无效或重复：${item.id ?? '(empty)'}`)
    ids.add(item.id)
    if (typeof item.input !== 'string' || !item.input.trim()) throw new Error(`${item.id}: input 不能为空`)
    if (!item.category || !item.difficulty) throw new Error(`${item.id}: category 和 difficulty 必填`)
    if (!Array.isArray(item.failureCategory)) throw new Error(`${item.id}: failureCategory 必须是数组`)
    if (!item.expected || typeof item.expected.hasHealthFacts !== 'boolean' || !Array.isArray(item.expected.facts)) {
      throw new Error(`${item.id}: expected 结构无效`)
    }
    if (!Array.isArray(item.mustNotContain)) throw new Error(`${item.id}: mustNotContain 必须是数组`)
  }
}

function increment(map, key, passed) {
  const current = map.get(key) ?? { total: 0, passed: 0 }
  current.total += 1
  if (passed) current.passed += 1
  map.set(key, current)
}

function evaluateCase(item, output) {
  const facts = output.healthAIOutput.facts
  const failures = []
  const expectedHealthFacts = item.expected.hasHealthFacts
  const actualHealthFacts = hasHealthFacts(output.healthAIOutput)
  if (actualHealthFacts !== expectedHealthFacts) {
    failures.push(`hasHealthFacts expected=${expectedHealthFacts} actual=${actualHealthFacts}`)
  }

  const expectedFactChecks = item.expected.facts.map((rule) => {
    const matched = facts.some((fact) => matchesFact(fact, rule))
    if (!matched) failures.push(`missing: ${describeRule(rule)}`)
    return { rule, matched }
  })

  const forbiddenFactChecks = item.mustNotContain.map((rule) => {
    const matched = facts.some((fact) => matchesFact(fact, rule))
    if (matched) failures.push(`forbidden: ${describeRule(rule)}`)
    return { rule, passed: !matched }
  })

  if (item.expected.timeConflict !== undefined) {
    const actualConflict = Boolean(output.healthAIOutput.timeConflict?.hasConflict)
    if (actualConflict !== item.expected.timeConflict) {
      failures.push(`timeConflict expected=${item.expected.timeConflict} actual=${actualConflict}`)
    }
  }

  return {
    id: item.id,
    category: item.category,
    difficulty: item.difficulty,
    failureCategory: item.failureCategory,
    passed: failures.length === 0,
    failures,
    expectedFactChecks,
    forbiddenFactChecks,
    expectedHealthFacts,
    actualHealthFacts,
    facts
  }
}

function summarize(dataset, results, provider, parserVersion, promptVersion) {
  const categories = new Map()
  const difficulties = new Map()
  const failureCategories = new Map()
  const capabilities = {
    validity: { total: results.length, passed: results.filter((result) => result.expectedHealthFacts === result.actualHealthFacts).length },
    factType: { total: 0, passed: 0 },
    temperature: { total: 0, passed: 0 },
    time: { total: 0, passed: 0 },
    negation: { total: 0, passed: 0 }
  }

  for (const result of results) {
    increment(categories, result.category, result.passed)
    increment(difficulties, result.difficulty, result.passed)
    if (!result.passed) {
      for (const category of result.failureCategory) {
        failureCategories.set(category, (failureCategories.get(category) ?? 0) + 1)
      }
    }
    for (const check of result.expectedFactChecks) {
      capabilities.factType.total += 1
      if (check.matched) capabilities.factType.passed += 1
      if (check.rule.type === 'temperature') {
        capabilities.temperature.total += 1
        if (check.matched) capabilities.temperature.passed += 1
      }
      if (check.rule.time) {
        capabilities.time.total += 1
        if (check.matched) capabilities.time.passed += 1
      }
    }
    for (const check of result.forbiddenFactChecks) {
      capabilities.negation.total += 1
      if (check.passed) capabilities.negation.passed += 1
    }
  }

  return {
    datasetVersion: dataset.datasetVersion,
    provider,
    parserVersion,
    promptVersion,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed).length,
    categories,
    difficulties,
    failureCategories,
    capabilities,
    results
  }
}

function tableRows(map) {
  return [...map.entries()].map(([name, value]) => (
    `| ${name} | ${value.passed} | ${value.total} | ${percentage(value.passed, value.total)} |`
  )).join('\n')
}

function buildMarkdown(summary) {
  const capabilityLabels = {
    validity: 'Health fact validity',
    factType: 'Expected fact matching',
    temperature: 'Temperature',
    time: 'Time',
    negation: 'Forbidden fact avoidance'
  }
  const capabilityRows = Object.entries(summary.capabilities).map(([key, value]) => (
    `| ${capabilityLabels[key]} | ${value.passed} | ${value.total} | ${percentage(value.passed, value.total)} |`
  )).join('\n')
  const failureRows = [...summary.failureCategories.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([name, count]) => `| ${name} | ${count} |`)
    .join('\n') || '| none | 0 |'
  const failedCases = summary.results.filter((result) => !result.passed)
    .map((result) => (
      `### ${result.id}\n\n`
      + `- Category: ${result.category}\n`
      + `- Difficulty: ${result.difficulty}\n`
      + `- Failure categories: ${result.failureCategory.join(', ')}\n`
      + `- Reasons:\n${result.failures.map((failure) => `  - ${failure}`).join('\n')}\n`
    )).join('\n')

  return (`# LocalFactProvider Baseline Report

This report is generated from the P0 parser evaluation dataset. It measures the current implementation without changing parser behavior.

## Baseline

- Dataset: ${summary.datasetVersion}
- Provider: ${summary.provider}
- Parser version: ${summary.parserVersion}
- Prompt version: ${summary.promptVersion}
- Total cases: ${summary.total}
- Passed: ${summary.passed}
- Failed: ${summary.failed}
- Case pass rate: ${percentage(summary.passed, summary.total)}

## Capability Metrics

| Capability | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
${capabilityRows}

## Results By Category

| Category | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
${tableRows(summary.categories)}

## Results By Difficulty

| Difficulty | Passed | Total | Rate |
| --- | ---: | ---: | ---: |
${tableRows(summary.difficulties)}

## Failure Category Frequency

Failure categories are dataset annotations. A failed case can contribute to more than one category.

| Failure category | Failed cases |
| --- | ---: |
${failureRows}

## Failed Cases

${failedCases || 'No failed cases.'}
`).trimEnd() + '\n'
}

export async function runEvaluation(options = {}) {
  const datasetPath = options.datasetPath ?? defaultDatasetPath
  const reportPath = options.reportPath ?? defaultReportPath
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'))
  validateDataset(dataset)

  const ai = options.ai ?? new AIService({ primaryProvider: false })
  const results = []
  let provider = 'local-fact-extractor'
  let parserVersion = 'unknown'
  let promptVersion = 'unknown'

  for (const item of dataset.cases) {
    const context = {
      ...dataset.defaults?.context,
      ...item.context,
      referenceNow: new Date(item.context?.referenceNow ?? dataset.defaults?.context?.referenceNow)
    }
    const output = await ai.organizeHealthRecord(item.input, context)
    provider = output.provider
    parserVersion = output.healthAIOutput.parserVersion
    promptVersion = output.healthAIOutput.promptVersion
    results.push(evaluateCase(item, output))
  }

  const summary = summarize(dataset, results, provider, parserVersion, promptVersion)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, buildMarkdown(summary), 'utf8')
  return { summary, reportPath }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const datasetPath = readArgument('dataset', defaultDatasetPath)
  const reportPath = readArgument('report', defaultReportPath)
  const { summary } = await runEvaluation({ datasetPath, reportPath })
  console.info(`[Parser Evaluation] dataset=${summary.datasetVersion}`)
  console.info(`[Parser Evaluation] provider=${summary.provider}`)
  console.info(`[Parser Evaluation] passed=${summary.passed}/${summary.total} (${percentage(summary.passed, summary.total)})`)
  console.info(`[Parser Evaluation] report=${reportPath}`)
  if (process.argv.includes('--strict') && summary.failed > 0) process.exitCode = 1
}
