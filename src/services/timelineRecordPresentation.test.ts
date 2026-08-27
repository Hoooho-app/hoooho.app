import assert from 'node:assert/strict'
import test from 'node:test'
import { createTimelineRecordDetails, createTimelineRecordSummary, extractExplicitMeasures, normalizeTimelineRecordText } from './timelineRecordPresentation.ts'

test('完整原始描述只做标点和空白清理，不改变或补写事实', () => {
  const source = '昨天半夜开始头疼，， 主要是头两侧疼。\n量了体温是37.1℃。'
  assert.equal(normalizeTimelineRecordText(source), '昨天半夜开始头疼，主要是头两侧疼。\n量了体温是37.1℃。')
})

test('只提取用户明确说出的措施并保留原句', () => {
  const source = '昨天半夜开始头疼，量了体温37.1℃。我喝了点水，躺下休息，但还是有一点疼。'
  assert.deepEqual(extractExplicitMeasures(source), ['我喝了点水', '躺下休息'])
  const details = createTimelineRecordDetails(source)
  assert.equal(details?.description, source)
  assert.deepEqual(details?.measures, ['我喝了点水', '躺下休息'])
})

test('没有措施时只保留发生了什么，简短旧记录不强制展开', () => {
  const detailed = createTimelineRecordDetails('今天早上开始有一点头晕，站起来的时候比较明显。')
  assert.ok(detailed)
  assert.deepEqual(detailed?.measures, [])
  assert.equal(createTimelineRecordDetails('头晕'), undefined)
  assert.equal(createTimelineRecordSummary('头晕'), '头晕')
})

test('否定和计划中的措施不会被显示成已经采取', () => {
  assert.deepEqual(extractExplicitMeasures('今天头晕，没有吃药，打算休息一下。'), [])
})
