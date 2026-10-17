import test from 'node:test'
import assert from 'node:assert/strict'
import { followupCorePhrase, followupTitle, recordCorePhrase, recordOriginal } from './followupPresentation'
import type { FollowedCase } from './types'
import type { HealthEventRecordApiDto } from '../../types'

test('long historical narratives become whole short concepts rather than sliced sentences', () => {
  assert.equal(followupCorePhrase('今天头皮一直发痒，抓挠后发红，没有发热，想记录一下观察变化'), '头皮瘙痒、抓挠')
  assert.equal(followupCorePhrase('嘴角有红疹，反复出现，其他细节在原文里'), '嘴角皮疹')
  assert.equal(followupCorePhrase('脖子这个地方不知道是什么批准，想观察一下'), '颈部症状')
})
test('negation and diagnostic uncertainty remain qualified', () => {
  assert.equal(followupCorePhrase('没有发热，没有咳嗽'), '无发热、无咳嗽')
  assert.equal(followupCorePhrase('不知道是不是湿疹'), '疑似湿疹')
  assert.equal(followupCorePhrase('估计是过敏'), '疑似过敏')
  assert.equal(followupCorePhrase('不是湿疹，只是颈部发红'), '颈部发红')
})
test('explicit short names are preserved; legacy long names and originals are projected without mutation', () => {
  const item = { event: {caseTitle:'颈部皮疹'}, followup:{title:'长标题',description:'颈部发红'} } as FollowedCase
  assert.equal(followupTitle(item),'颈部皮疹')
  ;(item.event as typeof item.event & {caseTitle:string}).caseTitle='颈部发红，今天又出现了一些变化，需要继续观察'
  assert.equal(followupTitle(item),'颈部发红')
  const raw='今天手臂有点痒，抓挠后发红，需要观察，原始记录不能被修改'
  const record={content:`症状原话：${raw}`,sourceText:raw,journal:{symptom:{narrative:raw}}} as HealthEventRecordApiDto
  const snapshot=JSON.stringify(record)
  assert.equal(recordCorePhrase(record),'手臂瘙痒、抓挠')
  assert.equal(recordOriginal(record),raw)
  assert.equal(JSON.stringify(record),snapshot)
})
