import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEventCardSummaryFragment } from '../types/index.ts'
import { getHealthEventCardIconPresentation } from './healthEventCardIcon.ts'

const fragment = (label: string, kind: HealthEventCardSummaryFragment['kind'] = 'symptom'): HealthEventCardSummaryFragment => ({
  label, kind, sourceRecordId: 'record-1'
})

test('结构化单一身体部位优先于标题降级映射', () => {
  assert.deepEqual(getHealthEventCardIconPresentation({
    category: 'other', displayTitle: '原因未定', structuredBodyParts: ['右膝'], summaryFragments: []
  }), { kind: 'leg', label: '腿部', source: 'structured' })
})

test('结构化多部位和多个不同症状使用组合症状图标', () => {
  assert.equal(getHealthEventCardIconPresentation({
    category: 'pain', displayTitle: '疼痛', structuredBodyParts: ['头部', '右脚'], summaryFragments: []
  }).kind, 'combined')

  assert.equal(getHealthEventCardIconPresentation({
    category: 'other', displayTitle: '身体不适', summaryFragments: [fragment('咳嗽'), fragment('腹泻')]
  }).kind, 'combined')
})

test('缺少结构化部位时只对明确语义做安全降级', () => {
  assert.equal(getHealthEventCardIconPresentation({
    category: 'pain', displayTitle: '头痛', summaryFragments: [fragment('头痛')]
  }).kind, 'head')
  assert.equal(getHealthEventCardIconPresentation({
    category: 'other', displayTitle: '情况待确认', summaryFragments: []
  }).kind, 'general')
  assert.equal(getHealthEventCardIconPresentation({
    category: 'pain', displayTitle: '头痛', fallbackTexts: ['头痛伴脚痛'], summaryFragments: []
  }).kind, 'combined')
})

test('非身体部位事件使用对应事件类型图标', () => {
  assert.equal(getHealthEventCardIconPresentation({
    category: 'other', displayTitle: '用药记录', summaryFragments: [fragment('布洛芬', 'medication')]
  }).kind, 'medication')
  assert.equal(getHealthEventCardIconPresentation({
    category: 'other', displayTitle: '血常规报告', summaryFragments: [fragment('血常规', 'examination')]
  }).kind, 'examination')
  assert.equal(getHealthEventCardIconPresentation({
    category: 'other', displayTitle: '手术记录', summaryFragments: []
  }).kind, 'surgery')
  assert.equal(getHealthEventCardIconPresentation({
    category: 'other', displayTitle: '检查报告', summaryFragments: []
  }).kind, 'examination')
})
