import test from 'node:test'
import assert from 'node:assert/strict'
import { symptomCorePhrase } from '../../shared/symptom-core-phrase.mjs'
import { validateExtraction, buildJournal } from '../ai/business/contract.mjs'
import { caseFollowupView } from './case-followup-view.mjs'

test('core phrases remove narration and modifiers, with a dunhao only for parallel concepts', () => {
  assert.equal(symptomCorePhrase('脖子上起了红疹，痒得一直抓，晚上更明显'), '颈部皮疹、瘙痒')
  assert.equal(symptomCorePhrase('颈部伴有瘙痒和红肿，夜间非常明显'), '颈部瘙痒、红肿')
  assert.equal(symptomCorePhrase('今天一直咳嗽，夜间更加严重'), '咳嗽')
  assert.equal(symptomCorePhrase('吃奶后吐奶'), '吐奶')
})
test('negation and uncertainty do not become positive or certain diagnoses', () => {
  assert.equal(symptomCorePhrase('今天没有呕吐，只是恶心'), '恶心')
  assert.equal(symptomCorePhrase('头晕但不是头疼发烧'), '头晕')
  assert.equal(symptomCorePhrase('没有出现呕吐和发热'), '无呕吐、无发热')
  assert.equal(symptomCorePhrase('没有呕吐，有恶心'), '恶心')
  assert.equal(symptomCorePhrase('怀疑颈部皮疹、瘙痒'), '疑似颈部皮疹、疑似瘙痒')
  assert.equal(symptomCorePhrase('怀疑过敏'), '疑似过敏')
  assert.equal(symptomCorePhrase('脸颊有点红，没有呕吐'), '脸颊发红')
})
test('AI records use validated facts for the short title and retain full original evidence', () => {
  const text = '脖子上起了红疹，痒得一直抓，晚上更明显'
  const extracted = {items:[{category:'symptom',subject:'current',title:'确诊食物过敏',timeText:null,archiveCategory:null,fields:[{name:'location',value:'脖子',quote:'脖子',sourceId:'input',page:1},{name:'symptom',value:text,quote:text,sourceId:'input',page:1}]}]}
  const [item] = validateExtraction(extracted,[{id:'input',page:1,text}])
  assert.equal(item.title, '颈部皮疹、瘙痒')
  assert.equal(item.fields[1].value, text)
  assert.equal(item.fields[1].sources[0].quote, text)
  const journal = buildJournal(item)
  assert.equal(journal.symptom.narrative, text)
  assert.equal(journal.symptom.generatedSummary, item.title)
  assert.equal(caseFollowupView({title:'原来的长标题'},[{id:'r',journal,type:'symptom',content:text,createdAt:'2026-10-01T00:00:00Z',occurredAt:'2026-10-01T00:00:00Z'}]).title,item.title)
})
test('legacy projections use the same core phrase without altering records or adding model calls', () => {
  const event={title:'颈部伴有红肿和瘙痒，夜间明显'}
  const record={id:'r',type:'symptom',content:event.title,createdAt:'2026-10-01T00:00:00Z',occurredAt:'2026-10-01T00:00:00Z'}
  const before=JSON.stringify([event,record])
  assert.equal(caseFollowupView(event,[record]).title,'颈部红肿、瘙痒')
  assert.equal(JSON.stringify([event,record]),before)
  const mixed={...record,journal:{symptom:{narrative:'脸颊有点红，没有呕吐',locationText:'脸颊'}}}
  assert.equal(caseFollowupView({title:'半碗粥'},[mixed]).title,'脸颊发红')
})
