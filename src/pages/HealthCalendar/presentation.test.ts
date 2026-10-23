import test from 'node:test'
import assert from 'node:assert/strict'
import { presentationGroup, presentCalendarRecord, normalizeCalendarCategory, matchesCalendarGroup } from './presentation'
import { monthOccurrenceEntries, savedCalendarFacts } from './navigation'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
const base: JournalEntry = { id: 'a', eventId: 'e', content: '原文', categories: ['other'], occurredAt: '2026-03-08T10:00:00+08:00', createdAt: '2026-03-08T11:00:00+08:00', attachmentCount: 0, status: 'observing' }
test('five groups are deterministic projections with legacy and source compatibility', () => {
  for (const kind of ['feeding','complementary','meal','snack','supplement'] as const) assert.equal(presentationGroup({ diet: { kind } }), 'feeding')
  for (const category of ['sleep','elimination','care','growth','activity','emotion','environment','social'] as const) assert.equal(presentationGroup({ categories: [category] }), 'daily')
  for (const category of ['vaccination','visit','examination'] as const) assert.equal(presentationGroup({ categories: [category] }), 'materials')
  assert.equal(presentationGroup({ categories: ['medication'], sourceType: 'medical_file' }), 'materials')
  assert.equal(presentationGroup({ caseContext: { identity: 'external_ai', attachmentIds: [], confirmed: true } }), 'materials')
  assert.equal(presentationGroup({ categories: ['measurement'], content: '体重：12.35kg' }), 'daily')
  assert.equal(presentationGroup({ categories: ['measurement'], content: '体温38℃' }), null)
  assert.equal(presentationGroup({ categories: ['other'], content: '可能是皮疹或者药物' }), null)
  assert.equal(matchesCalendarGroup(base, ''), true)
  assert.equal(normalizeCalendarCategory('diet'), 'feeding'); assert.equal(normalizeCalendarCategory('sleep'), 'daily')
  assert.equal(normalizeCalendarCategory('vaccination'), 'materials'); assert.equal(normalizeCalendarCategory('other'), '')
})
test('saved state, negation and uncertainty survive; missing cores never invent a diagnosis', () => {
  for (const narrative of ['无呕吐','疑似皮疹','待确认','湿疹加重','夜醒三次']) {
    const symptom = { symptomCategory: 'other' as const, narrative, descriptors: [], locations: [], generatedSummary: '呕吐', keywords: ['呕吐'] }
    assert.equal(presentCalendarRecord({ ...base, symptom }).monthSummary, narrative)
  }
  const long = { ...base, symptom: { symptomCategory: 'other' as const, narrative: '疑似皮疹，但尚未确认，需要继续观察具体发生情况', descriptors: [], locations: [] } }
  assert.equal(presentCalendarRecord(long).monthSummary, '疑似症状记录')
  assert.match(presentCalendarRecord(long).fullDetail, /尚未确认/)
  assert.equal(presentCalendarRecord({ ...base, categories: ['symptom'], content: '一大段没有可靠结构化字段的症状描述，不能机械截断' }).monthSummary, '症状记录')
  assert.equal(presentCalendarRecord(base).monthSummary, '未分类')
  const material = { ...base, sourceType: 'medical_file' as const, sourceText: '上传原文', caseContext: { identity: 'external_ai' as const, confirmed: true, attachmentIds: [], originalText: '外部AI原文' } }
  assert.match(presentCalendarRecord(material).fullDetail, /上传原文\n外部AI原文/)
})
test('dose decimals and original units are never guessed or rounded; short drug names are saved names', () => {
  const medication = { medicationName: '非常长的真实药品名称不能猜测简称', administrationRoute: 'oral' as const, amountValue: 0.125, amountUnit: '毫克' }
  const presented = presentCalendarRecord({ ...base, medication })
  assert.equal(presented.monthSummary, '用药记录'); assert.match(presented.fullDetail, /0\.125/); assert.match(presented.fullDetail, /毫克/); assert.match(presented.fullDetail, /真实药品名称/)
  assert.equal(presentCalendarRecord({ ...base, medication: { ...medication, note: '未服药' } }).monthSummary, '未服药')
  assert.equal(presentCalendarRecord({ ...base, diet: { kind: 'feeding', bottleMl: 120.5 } }).monthSummary, '奶120.5ml')
  assert.equal(presentCalendarRecord({ ...base, diet: { kind: 'complementary', foods: ['蛋黄'], amount: '半个' } }).monthSummary, '蛋黄半个')
  assert.equal(presentCalendarRecord({ ...base, diet: { kind: 'feeding' } }).coreSummary, '喂养')
})
test('facts counted once at end date, stable ties, no future, unknown or pending material fabricated', () => {
  const sleep: JournalEntry = { ...base, sleep: { sleepAt: '2026-03-07T22:00:00+08:00', wakeAt: '2026-03-08T07:00:00+08:00', durationMinutes: 540, kind: 'night' }, occurredAt: '2026-03-07T22:00:00+08:00' }
  const rows = [sleep, { ...base, id: 'b' }, { ...base, id: 'c' }, { ...base, id: 'unknown', timePrecision: 'unknown' as const }, { ...base, id: 'future', occurredAt: '2099-01-01T00:00:00Z' }, { ...base, id: 'pending', caseContext: { identity: 'external_ai' as const, attachmentIds: [], confirmed: false } }]
  assert.deepEqual(monthOccurrenceEntries(rows, '2026-03').get('2026-03-08')?.map(e => e.id), ['c','b','a'])
  assert.equal(monthOccurrenceEntries(rows, '2026-03').has('2026-03-07'), false)
  assert.equal(savedCalendarFacts(rows).length, 4)
  assert.equal(monthOccurrenceEntries([{ ...base, caseContext: { identity: 'examination_report', confirmed: true, attachmentIds: [], timeUnknown: true } }], '2026-03').size, 0)
  assert.equal(presentCalendarRecord(sleep).coreSummary, '睡眠 · 已醒 · 约9小时')
  assert.equal(presentCalendarRecord({ ...base, sleep: { ...sleep.sleep!, status: 'ongoing' } }).coreSummary, '睡眠 · 持续中')
})

test('one mixed occurrence is visible in feeding and symptom filters without changing its identity or materials boundary',()=>{
 const mixed={...base,id:'mixed',content:'配方奶，后来红屁股',categories:['diet','symptom'] as const}
 const record={...mixed,categories:[...mixed.categories]}
 assert.equal(matchesCalendarGroup(record,'feeding'),true);assert.equal(matchesCalendarGroup(record,'symptom'),true)
 assert.equal(matchesCalendarGroup(record,'medication'),false);assert.equal(record.id,'mixed')
 assert.equal(matchesCalendarGroup({...record,sourceType:'medical_file'},'feeding'),false)
})

test('named feeding and meals retain names with factual amounts in day and month summaries', () => {
  const milk = presentCalendarRecord({ ...base, diet: { kind: 'feeding', feedingMethod: 'formula', name: '夜奶', bottleMl: 120 } })
  assert.equal(milk.coreSummary, '夜奶 · 120mL')
  assert.equal(milk.monthSummary, '夜奶120ml')
  const meal = presentCalendarRecord({ ...base, diet: { kind: 'meal', name: '家里的早餐', foods: ['米饭','鸡蛋'] } })
  assert.equal(meal.coreSummary, '家里的早餐 · 米饭、鸡蛋')
  assert.equal(meal.monthSummary, '家里的早餐 · 米饭')
  assert.match(meal.fullDetail, /家里的早餐/)
})
