import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { evaluateCase, runEvaluation } from './run-parser-evaluation.mjs'

const evaluationItem = {
  id: 'negative-history', category: 'negation_complex', difficulty: 'medium', failureCategory: [],
  expected: { hasHealthFacts: true, facts: [] },
  mustNotContain: [{ type: 'symptom', name: '发热' }]
}

test('forbidden Oracle rejects only current positive facts and preserves negative history', () => {
  const base = { type: 'symptom', name: '发热', subject: 'event_subject', temporality: 'current', status: 'not_applicable' }
  const negative = evaluateCase(evaluationItem, { healthAIOutput: { facts: [{ ...base, polarity: 'negated' }] } })
  assert.equal(negative.passed, true)

  const positive = evaluateCase(evaluationItem, { healthAIOutput: { facts: [{ ...base, polarity: 'affirmed', status: 'active' }] } })
  assert.equal(positive.passed, false)
  assert.match(positive.failures.join(' '), /forbidden: symptom name=发热/)
})

test('P0 parser evaluation dataset produces a LocalFactProvider baseline report', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-parser-evaluation-'))
  const reportPath = path.join(directory, 'baseline.md')
  try {
    const { summary } = await runEvaluation({ reportPath })
    assert.equal(summary.datasetVersion, 'parser-p0-v1')
    assert.equal(summary.provider, 'local-fact-extractor')
    assert.equal(summary.total, 30)
    assert.equal(summary.passed + summary.failed, 30)
    assert.equal(summary.passed, 30)
    assert.equal(summary.failed, 0)
    assert.equal(summary.results.length, 30)

    const report = await readFile(reportPath, 'utf8')
    assert.match(report, /LocalFactProvider Baseline Report/)
    assert.match(report, /Failure Category Frequency/)
    assert.match(report, /Total cases: 30/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
