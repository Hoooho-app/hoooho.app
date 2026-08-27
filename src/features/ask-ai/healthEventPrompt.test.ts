import test from 'node:test'
import assert from 'node:assert/strict'
import type { HealthEvent, Member } from '../../types/index.ts'
import { buildHealthEventPrompt, getPromptInformationOptions } from './healthEventPrompt.ts'

const member: Member = { id: 'm1', name: '小安', age: '6岁', relation: '子女', gender: 'female' }
const event: HealthEvent = {
  id: 'e1', memberId: 'm1', title: '咳嗽', status: 'ongoing', startDate: '2026-08-20T10:00:00.000Z', symptoms: ['干咳'], summary: '咳嗽两天', medications: ['止咳糖浆'], visits: [], examinations: [], concerns: [], attachments: [], personalizedModules: [], temperatureRecords: [], medicalInfo: { allergies: [], medications: [], medicalHistory: [], chronicDiseases: [], familyHistory: [] },
  timeline: [{ id: 't1', time: '2026-08-21T10:00:00.000Z', content: '夜间咳嗽加重，喝了温水后仍有咳嗽。', summary: '夜间咳嗽加重', details: { description: '夜间咳嗽加重，喝了温水后仍有咳嗽。', measures: ['喝了温水后仍有咳嗽'] }, recordType: 'symptom', kind: 'text' }]
}

test('only exposes information that exists and defaults can cover every option', () => {
  const options = getPromptInformationOptions({ event, member })
  assert.deepEqual(options.map(({ id }) => id), ['event', 'symptoms', 'timeline', 'medications', 'profile'])
})

test('assembles a reusable event prompt and re-organizes with an editing instruction', () => {
  const selected = ['event', 'timeline', 'medications', 'profile'] as const
  const prompt = buildHealthEventPrompt({ event, member }, selected, '重点询问是否需要尽快就医')
  assert.match(prompt, /咳嗽/)
  assert.match(prompt, /夜间咳嗽加重/)
  assert.match(prompt, /喝了温水后仍有咳嗽/)
  assert.match(prompt, /止咳糖浆/)
  assert.match(prompt, /本次修订要求/)
  assert.match(prompt, /是否建议就医/)
  assert.doesNotMatch(prompt, /【症状与变化】/)
})

test('still produces a useful prompt for a sparse event', () => {
  const sparse = { ...event, symptoms: [], medications: [], timeline: [] }
  const options = getPromptInformationOptions({ event: sparse, member })
  const prompt = buildHealthEventPrompt({ event: sparse, member }, options.map(({ id }) => id))
  assert.match(prompt, /【当前事件】/)
  assert.match(prompt, /如果信息不足/)
})
