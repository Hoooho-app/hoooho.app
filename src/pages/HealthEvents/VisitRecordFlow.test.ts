import test from 'node:test'
import assert from 'node:assert/strict'
import { visitSummary } from './visitRecordLogic.ts'

test('visit timeline summary only organizes user-recorded facts', () => {
  assert.equal(visitSummary({ visitType: 'outpatient', institutionName: '儿童医院', department: '儿科', reasonText: '发热、咳嗽' }), '门诊 · 儿童医院 · 儿科｜因发热、咳嗽就医')
  assert.equal(visitSummary({ visitType: 'inpatient', institutionName: '儿童医院', isCurrentlyHospitalized: true }, ['发热']), '住院 · 儿童医院｜因发热就医｜仍在住院')
  assert.doesNotMatch(visitSummary({ visitType: 'online_consultation', platformName: '线上平台', doctorStatement: '待观察' }), /诊断|确诊|建议/)
})
