import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { actionCategoryLabels, actionCategoryOrder } from './actionSheetPresentation.ts'

const actionSheetSource = readFileSync(new URL('./ActionSheet.tsx', import.meta.url), 'utf8')
const askAISource = readFileSync(new URL('./AskAIWorkspace.tsx', import.meta.url), 'utf8')

test('health event actions only expose Ask AI, hospital, and help in the frozen mobile order', () => {
  assert.deepEqual(
    actionCategoryOrder.map((category) => actionCategoryLabels[category]),
    ['问 AI', '去医院', '求助'],
  )
  assert.equal(actionCategoryOrder.includes('online-consultation'), false)
  assert.equal(actionCategoryOrder.includes('observation'), false)
})

test('hospital and help keep their existing entry flow and content contracts', () => {
  assert.match(actionSheetSource, /hospital:\s*\{[\s\S]*label: '去医院'/)
  assert.match(actionSheetSource, /help:\s*\{[\s\S]*label: '求助'/)
  assert.match(actionSheetSource, /setSelectedFeatureId\(feature\.id\)/)
  for (const id of ['registration', 'medical-summary', 'doctor-questions', 'medical-list', 'help-summary', 'help-poster', 'key-information', 'share-contact']) assert.match(actionSheetSource, new RegExp(`id: '${id}'`))
})

test('Ask AI remains the only refactored workspace and keeps the long-image entry', () => {
  assert.match(actionSheetSource, /<AskAIWorkspace context=\{context\}/)
  assert.match(askAISource, />生成长图</)
  assert.match(askAISource, /downloadPromptLongImage\(prompt\)/)
  assert.doesNotMatch(actionSheetSource, /onOnlineConsultation/)
})
