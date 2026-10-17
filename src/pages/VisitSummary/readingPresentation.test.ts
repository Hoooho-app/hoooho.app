import test from 'node:test'
import assert from 'node:assert/strict'
import { readingCourseGroups, questionText, questionOrdinal } from './readingPresentation.ts'
import type { VisitSheet } from '../../types/visitSheet.ts'
test('hide only duplicate symptom course, preserving diet/bowel/medication content and raw data', () => {
  const groups = ['symptom', 'diet', 'bowel', 'medication'].map(id => ({ id, title: id, lines: [id], sourceIds: [id] }))
  const report = { reading: { courseGroups: groups } } as unknown as VisitSheet
  assert.deepEqual(readingCourseGroups(report).map(g => g.id), ['diet', 'bowel', 'medication'])
  assert.equal(report.reading?.courseGroups?.length, 4)
  assert.deepEqual(readingCourseGroups({} as VisitSheet), [])
})
test('numbered questions remove existing ordinal only, preserving decimal measurements', () => {
  assert.equal(questionText('1. 需要怎样护理？'), '需要怎样护理？')
  assert.equal(questionText('问题二：需要复查吗？'), '需要复查吗？')
  assert.equal(questionText('（3）要留意什么？'), '要留意什么？')
  assert.equal(questionText('1.2kg 的变化需要关注吗？'), '1.2kg 的变化需要关注吗？')
  assert.equal(questionOrdinal(0), '问题一'); assert.equal(questionOrdinal(4), '问题五')
})

test('question ordinals followed immediately by numbers are stripped while factual decimal prefixes remain', () => {
  assert.equal(questionText('1、3天后需要复查吗？'), '3天后需要复查吗？')
  assert.equal(questionText('问题一：1岁孩子需要检查吗？'), '1岁孩子需要检查吗？')
  assert.equal(questionText('（一）怎样护理？'), '怎样护理？')
})
