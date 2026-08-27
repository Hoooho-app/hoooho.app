import assert from 'node:assert/strict'
import test from 'node:test'
import type { HealthEvent, Member } from '../../types/index.ts'
import { buildConsultationSections, consultationCopyAll, prepareDoctorReply, splitDoctorQuestions } from './onlineConsultationPresentation.ts'

const member: Member = { id: 'member-1', name: '刘磊', age: '35岁', relation: '本人', gender: 'male' }
const event: HealthEvent = {
  id: 'event-1', memberId: member.id, title: '发热', status: 'ongoing', startDate: '2026-08-23T02:00:00.000Z',
  symptoms: ['发热', '轻微咳嗽'], summary: '8月23日开始发热，最高体温38℃。', medications: ['布洛芬 1 次'], visits: [], examinations: [], concerns: ['是否需要做检查'], attachments: [], personalizedModules: [],
  medicalInfo: { allergies: [], medications: [], medicalHistory: [], chronicDiseases: [], familyHistory: [] },
  timeline: [
    { id: 'timeline-1', time: '2026-08-23T03:00:00.000Z', content: '轻微咳嗽', recordType: 'symptom', kind: 'text' },
    { id: 'timeline-2', time: '2026-08-23T14:00:00.000Z', content: '服用布洛芬 1 次', recordType: 'medication', kind: 'medication' }
  ],
  temperatureRecords: [{ time: '2026-08-23T03:00:00.000Z', value: 38 }, { time: '2026-08-24T03:00:00.000Z', value: 37.5 }]
}

test('当前健康事件直接生成六个可分别复制的资料模块', () => {
  const sections = buildConsultationSections({ event, member, profiles: [] })
  assert.deepEqual(sections.map(({ title }) => title), ['病情描述', '已经做过什么', '用药情况', '检查结果', '相关病史', '我想问医生'])
  assert.match(sections[0].content, /8月23日开始发热/)
  assert.equal(sections.find(({ id }) => id === 'examinations')?.content, '')
  assert.match(consultationCopyAll(sections), /【用药情况】\n布洛芬 1 次/)
  assert.equal(consultationCopyAll(sections).includes('【检查结果】'), false)
})

test('多个医生问题按已有事实回答，并明确标记缺失信息', () => {
  assert.deepEqual(splitDoctorQuestions('最近做过血常规吗？\n有没有咳嗽？\n吃过什么药？').length, 3)
  const result = prepareDoctorReply({ event, member, profiles: [] }, '最近做过血常规吗？\n有没有咳嗽？\n吃过什么药？')
  assert.match(result.reply, /相关检查情况还没有记录/)
  assert.match(result.reply, /发热、轻微咳嗽/)
  assert.match(result.reply, /布洛芬 1 次/)
  assert.deepEqual(result.missing, ['相关检查情况还没有记录'])
  assert.ok(result.sources.some((source) => source.includes('轻微咳嗽')))
})

test('未知问题不推测，用户补充后只使用用户提供的事实', () => {
  const missing = prepareDoctorReply({ event, member, profiles: [] }, '痰是什么颜色？')
  assert.deepEqual(missing.missing, ['痰的情况还没有记录'])
  const supplemented = prepareDoctorReply({ event, member, profiles: [] }, '痰是什么颜色？', '目前没有痰')
  assert.equal(supplemented.reply, '目前没有痰')
  assert.deepEqual(supplemented.missing, [])
})
