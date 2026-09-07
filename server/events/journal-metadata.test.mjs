import assert from 'node:assert/strict'
import test from 'node:test'
import { projectJournalRecord, validateJournal } from './journal-metadata.mjs'

test('medication journal keeps dose and route as recorded without calculation', () => {
  const journal = validateJournal({ categories: ['medication'], medication: { medicationName: '氯雷他定片', dosageForm: '片剂', strengthText: '10mg', amountValue: 2.5, amountUnit: 'mL', administrationRoute: 'oral', reasons: ['过敏相关表现'], recognitionSource: 'camera', recognitionStatus: 'draft_unverified' } })
  assert.deepEqual(journal.medication, { medicationName: '氯雷他定片', dosageForm: '片剂', strengthText: '10mg', amountValue: 2.5, amountUnit: 'mL', administrationRoute: 'oral', reasons: ['过敏相关表现'], recognitionSource: 'camera', recognitionStatus: 'draft_unverified' })
  assert.throws(() => validateJournal({ categories: ['medication'], medication: { medicationName: '药品', amountValue: 0, amountUnit: 'mg', administrationRoute: 'oral' } }), /本次用量无效/)
  assert.throws(() => validateJournal({ categories: ['medication'], medication: { medicationName: '药品', amountUnit: 'mg', administrationRoute: 'oral' } }), /不能只填写/)
})

test('vaccination journal preserves separate items and rejects conflicting observations', () => {
  const vaccination = validateJournal({ categories: ['vaccination'], vaccination: { items: [
    { id: 'vac-1', vaccineName: '流感疫苗（三价）', doseSequence: 'dose_2', manufacturerName: '示例厂家', batchNumber: 'AB-01', injectionSite: 'left_upper_arm' },
    { id: 'vac-2', vaccineName: '百白破疫苗', doseSequence: 'booster', batchNumber: 'CD/02', injectionSite: 'right_upper_arm' }
  ], institutionName: '社区卫生服务中心', observations: ['not_observed_yet'], recognitionSource: 'camera', recognitionStatus: 'draft_unverified' } }).vaccination
  assert.equal(vaccination.items.length, 2)
  assert.equal(vaccination.items[0].batchNumber, 'AB-01')
  assert.equal(vaccination.items[1].doseSequence, 'booster')
  assert.throws(() => validateJournal({ categories: ['vaccination'], vaccination: { items: [{ id: 'a', vaccineName: '疫苗', doseSequence: 'dose_1' }], observations: ['not_observed_yet', 'fever'] } }), /互斥/)
  assert.throws(() => validateJournal({ categories: ['other'], vaccination: { items: [{ id: 'a', vaccineName: '疫苗', doseSequence: 'dose_1' }] } }), /必须归入疫苗分类/)
})
import { HealthEventService } from './health-event-service.mjs'

test('journal keeps untitled lifestyle containers without changing the legacy event list', async () => {
  const rows = [{ id: 'lifestyle', title: '' }, { id: 'medical', title: '症状' }]
  const service = new HealthEventService({ members: {}, repository: { findByAccountId: async (accountId) => accountId === 'owner' ? rows : [] } })
  assert.deepEqual(await service.listJournal('owner'), rows)
  assert.deepEqual((await service.list('owner')).map((row) => row.id), ['medical'])
  assert.deepEqual(await service.listJournal('someone-else'), [])
})

const record = (content, extra = {}) => ({ content, sourceType: 'voice_record', occurredAt: '2026-09-05T15:00:00Z', createdAt: '2026-09-05T15:01:00Z', ...extra })
test('period remains a period and records without a spoken time use their recorded minute', () => {
  const raw = record('晚上起了一片疹子')
  const result = projectJournalRecord(raw)
  assert.equal(result.journal.timePrecision, 'period')
  assert.equal(result.journal.timeLabel, '晚上')
  assert.equal(result.occurredAt, raw.occurredAt)
  assert.equal(raw.journal, undefined)
  assert.equal(projectJournalRecord(record('身上起了一片疹子')).journal.timePrecision, 'exact')
})
test('explicit time and yesterday are projected using the recording reference day and timezone', () => {
  const result = projectJournalRecord(record('昨天晚上9点15分起疹'), 'Asia/Shanghai')
  assert.equal(result.journal.timePrecision, 'exact')
  assert.equal(Date.parse(result.journal.occurredAt), Date.parse('2026-09-04T21:15:00+08:00'))
  const midnight = projectJournalRecord(record('昨天09:15吃饭', { createdAt: '2026-09-05T01:00:00Z' }), 'America/Los_Angeles')
  assert.equal(Date.parse(midnight.journal.occurredAt), Date.parse('2026-09-03T09:15:00-07:00'))
})
test('a spoken day without a clock keeps the recorded minute on that calendar day', () => {
  const today = projectJournalRecord(record('今天散步'), 'Asia/Shanghai')
  assert.equal(today.journal.timePrecision, 'exact')
  assert.equal(Date.parse(today.journal.occurredAt), Date.parse('2026-09-05T23:00:00+08:00'))
  const yesterday = projectJournalRecord(record('昨天起疹'), 'Asia/Shanghai')
  assert.equal(yesterday.journal.timePrecision, 'exact')
  assert.equal(Date.parse(yesterday.journal.occurredAt), Date.parse('2026-09-04T23:00:00+08:00'))
})
test('ambiguous multi-time text is kept intact and uses the recorded minute', () => {
  const raw = record('17:30游泳，21:15起疹')
  assert.equal(projectJournalRecord(raw).journal.timePrecision, 'exact')
  assert.equal(projectJournalRecord(raw).content, raw.content)
})
test('future and fuzzy text never override the current recorded minute', () => {
  for (const text of ['身上有一点痒', '一点点痒', '明天上午9点复诊', '晚上23:59吃饭', '小时候经常起疹']) {
    const result = projectJournalRecord(record(text))
    assert.equal(result.journal.timePrecision, 'exact')
    assert.equal(result.journal.occurredAt, record(text).occurredAt)
  }
})
test('explicitly selected legacy time and optional categories remain compatible', () => {
  const raw = record('发生了不舒服', { sourceType: 'user_record', journal: { categories: ['symptom'] } })
  assert.equal(projectJournalRecord(raw).journal.timePrecision, 'exact')
  assert.deepEqual(projectJournalRecord(raw).journal.categories, ['symptom'])
  assert.equal(validateJournal(undefined), undefined)
  assert.deepEqual(validateJournal({ categories: ['diet', 'social', 'diet'] }), { categories: ['diet', 'social'] })
  assert.throws(() => validateJournal({ categories: ['invalid'] }), /记录分类无效/)
})

test('structured feeding and diet details remain optional and preserve specific first-try foods', () => {
  const complementary = validateJournal({
    categories: ['diet'],
    diet: {
      kind: 'complementary',
      foods: ['鸡蛋黄', '南瓜泥', '鸡蛋黄'],
      foodForm: 'puree',
      amount: '约 1/2 碗',
      firstTryFoods: ['鸡蛋黄'],
      reactions: ['暂未发现']
    }
  })
  assert.deepEqual(complementary.diet, {
    kind: 'complementary', foods: ['鸡蛋黄', '南瓜泥'], firstTryFoods: ['鸡蛋黄'], reactions: ['暂未发现'], foodForm: 'puree', amount: '约 1/2 碗'
  })
  assert.deepEqual(validateJournal({ categories: ['diet'], diet: { kind: 'feeding', feedingMethod: 'mixed', breastSeconds: { left: 60, right: 120, total: 180 }, bottleMl: 90 } }).diet, {
    kind: 'feeding', feedingMethod: 'mixed', breastSeconds: { left: 60, right: 120, total: 180 }, bottleMl: 90
  })
  assert.deepEqual(validateJournal({ categories: ['diet'], diet: { kind: 'supplement', supplementNames: ['维生素D'], supplementAmount: '1', supplementUnit: '滴' } }).diet, {
    kind: 'supplement', supplementNames: ['维生素D'], supplementAmount: '1', supplementUnit: '滴'
  })
  assert.throws(() => validateJournal({ categories: ['diet'], diet: { kind: 'supplement', supplementNames: ['维生素D'], supplementAmount: '1', supplementUnit: '勺' } }), /补剂单位无效/)
  assert.throws(() => validateJournal({ categories: ['diet'], diet: { kind: 'supplement', supplementNames: [], supplementAmount: '1', supplementUnit: '滴' } }), /不能为空/)
  assert.throws(() => validateJournal({ categories: ['diet'], diet: { kind: 'complementary', foods: ['南瓜泥'], firstTryFoods: ['鸡蛋黄'] } }), /首次尝试食物/)
  assert.throws(() => validateJournal({ categories: ['sleep'], diet: { kind: 'snack', foods: ['苹果'] } }), /必须归入喂养\/饮食分类/)
})

test('structured bowel observations preserve blood amount and reject invalid or conflicting values', () => {
  const result = validateJournal({ categories: ['elimination'], bowel: { shapes: ['光滑条状', '糊状'], color: '黄褐', amount: '一般', durationRange: '2–5分钟', process: '有些费力', bloodObservation: 'small-amount', observations: ['黏液'] } })
  assert.deepEqual(result.bowel, { shapes: ['光滑条状', '糊状'], color: '黄褐', amount: '一般', durationRange: '2–5分钟', process: '有些费力', bloodObservation: 'small-amount', observations: ['黏液'] })
  assert.equal(validateJournal({ categories: ['elimination'], bowel: { shapes: [], bloodObservation: 'large-amount', observations: [] } }).bowel.bloodObservation, 'large-amount')
  assert.throws(() => validateJournal({ categories: ['elimination'], bowel: { shapes: [], observations: ['没有特别发现', '黏液'] } }), /互斥/)
  assert.throws(() => validateJournal({ categories: ['diet'], bowel: { shapes: [], observations: [] } }), /必须归入排便分类/)
  assert.throws(() => validateJournal({ categories: ['elimination'], bowel: { shapes: ['成人评分 4'], observations: [] } }), /选项无效/)
})

test('structured sleep recomputes duration from timestamps and preserves optional observations', () => {
  const result = validateJournal({ categories: ['sleep'], sleep: {
    sleepAt: '2026-09-05T21:40:00+08:00', wakeAt: '2026-09-06T06:35:00+08:00', durationMinutes: 1,
    kind: 'night', quality: '睡得安稳', observations: ['夜醒', '其他', '夜醒'], otherNote: '凌晨喝了一次奶'
  } })
  assert.equal(result.sleep.durationMinutes, 535)
  assert.deepEqual(result.sleep.observations, ['夜醒', '其他'])
  assert.throws(() => validateJournal({ categories: ['sleep'], sleep: { sleepAt: '2026-09-05T21:40:00+08:00', wakeAt: '2026-09-05T21:40:00+08:00', kind: 'night' } }), /睡眠时长/)
  assert.throws(() => validateJournal({ categories: ['diet'], sleep: { sleepAt: '2026-09-05T21:40:00+08:00', wakeAt: '2026-09-06T06:35:00+08:00', kind: 'night' } }), /必须归入睡眠分类/)
})

test('structured symptom preserves facts and rejects missing location or conflicting associated observations', () => {
  const symptom = { symptomCategory: 'skin', locations: [{ id: 'left_elbow', label: '左肘窝', locationNumber: 1, locationLayer: 'surface', bodySide: 'left', bodyView: 'front', bodyRegion: 'upper_limb', localRegion: '左肘窝', markedArea: '1号区域' }], descriptors: ['发红', '痒'], impactLevel: 'some', associatedSymptoms: ['影响睡觉'], generatedSummary: '孩子左肘窝皮肤发红、痒。' }
  assert.deepEqual(validateJournal({ categories: ['symptom'], symptom }).symptom, symptom)
  assert.throws(() => validateJournal({ categories: ['symptom'], symptom: { ...symptom, locations: [] } }), /至少标记/)
  assert.throws(() => validateJournal({ categories: ['symptom'], symptom: { ...symptom, associatedSymptoms: ['没有特别发现', '发热'] } }), /互斥/)
  assert.throws(() => validateJournal({ categories: ['other'], symptom }), /必须归入症状分类/)
})

test('structured visit preserves occurrence facts, links and unverified extraction state', () => {
  const visit = validateJournal({ categories: ['visit'], visit: {
    visitType: 'inpatient', reasonText: '持续发热', linkedSymptomRecordIds: ['symptom-1', 'symptom-2'], institutionName: '儿童医院', department: '呼吸科', doctorStatement: '上呼吸道感染待观察', examinationTypes: ['抽血'], followUpActions: ['home_observation', 'medication_as_instructed'], admittedAt: '2026-09-06T02:00:00.000Z', isCurrentlyHospitalized: true, documentTypes: ['medical_record'], recognitionStatus: 'draft_unverified'
  } }).visit
  assert.equal(visit.visitType, 'inpatient')
  assert.deepEqual(visit.linkedSymptomRecordIds, ['symptom-1', 'symptom-2'])
  assert.equal(visit.recognitionStatus, 'draft_unverified')
  assert.equal(visit.isCurrentlyHospitalized, true)
})

test('visit rejects false medical state, wrong category and reversed inpatient dates', () => {
  assert.throws(() => validateJournal({ categories: ['visit'], visit: { visitType: 'outpatient', recognitionStatus: 'medically_verified' } }), /识别状态/)
  assert.throws(() => validateJournal({ categories: ['other'], visit: { visitType: 'outpatient' } }), /必须归入就医分类/)
  assert.throws(() => validateJournal({ categories: ['visit'], visit: { visitType: 'inpatient', admittedAt: '2026-09-07T02:00:00Z', dischargedAt: '2026-09-06T02:00:00Z' } }), /出院时间/)
})
