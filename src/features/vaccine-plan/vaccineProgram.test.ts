import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeVaccinationSourceRows, vaccinationSourceRows, vaccineChecklistText, vaccinePlanReadiness, vaccinePrograms, vaccineReviewCalendar, vaccineUnknowns } from './vaccineProgram'
import type { JournalEntry } from '../../pages/HealthEvents/timeViewModel'

const record = (changes: Partial<JournalEntry> = {}): JournalEntry => ({ id: 'record', eventId: 'event', occurredAt: '2026-10-17T10:00:00+08:00', createdAt: '2026-10-18T10:00:00+08:00', content: '接种记录', categories: ['vaccination'], attachmentCount: 1, status: 'active', timePrecision: 'exact', vaccination: { items: [{ id: 'vaccine', vaccineName: '百白破', doseSequence: 'unknown', administeredOn: '' }] }, ...changes })

test('明确未知的单项日期不取发生时间或上传时间，也不推断剂次', () => {
  const [row] = vaccinationSourceRows([record()])
  assert.equal(row.date, '')
  assert.equal(row.dose, '剂次待核对')
  assert.deepEqual(row.unknowns, ['接种日期待核对', '剂次待核对'])
})

test('资料时间未知时不把事件占位时间当接种时间，已删除单项不恢复', () => {
  const rows = vaccinationSourceRows([record({ timePrecision: 'unknown', vaccination: { items: [{ id: 'vaccine', vaccineName: '乙肝', doseSequence: 'dose_1' }, { id: 'deleted', vaccineName: '已删记录', doseSequence: 'dose_2', profileListDeletedAt: '2026-10-18' }] } })])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].date, '')
})

test('现有档案投影为唯一记录集合，聚合原件不重复增加或恢复被删记录', () => {
  const rows = mergeVaccinationSourceRows([{ id: 'record/vaccine', name: '百白破', date: '2026-10-10' }, { id: 'legacy', name: '旧针卡记录', date: '' }], vaccinationSourceRows([record()]))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].date, '2026-10-10')
  assert.equal(rows[0].originals, 1)
  assert.deepEqual(rows[0].unknowns, ['剂次待核对'])
  assert.equal(rows[1].source, '孩子档案中的原记录')
  assert.equal(mergeVaccinationSourceRows([], vaccinationSourceRows([record()])).length, 0)
  const [invalid] = mergeVaccinationSourceRows([{ id: 'old', name: '旧日期资料', date: '2026-02-30' }], [])
  assert.equal(invalid.date, '')
  assert.ok(invalid.unknowns.includes('接种日期待核对'))
})

test('没有记录和未维护地区只列待核对，不产生漏种或接种日期结论', () => {
  const unknowns = vaccineUnknowns([], 0, 'other')
  assert.ok(unknowns.some(item => item.includes('不表示没有接种')))
  assert.ok(unknowns.some(item => item.includes('尚未维护')))
  const text = vaccineChecklistText('安安', 'other', '新居住地', [], unknowns)
  assert.match(text, /常住地区：其他地区 · 新居住地/)
  assert.match(text, /当前地区程序尚未维护/)
  assert.doesNotMatch(text, /漏种：|下一针日期：|自动补种/)
  assert.equal(vaccinePlanReadiness.ready, false)
})

test('当前大陆参考采用2026版且记录来源版本，港澳不套用大陆程序', () => {
  assert.match(vaccinePrograms.mainland.version, /2026/)
  assert.match(vaccinePrograms.mainland.rows.find(item => item.id === 'dtap')!.ages, /2、4、6、18月龄及6周岁/)
  assert.notEqual(vaccinePrograms.mainland.sourceUrl, vaccinePrograms['hong-kong'].sourceUrl)
  assert.ok(vaccinePrograms['hong-kong'].rows.some(item => item.name.includes('肺炎球菌')))
  assert.match(vaccineChecklistText('孩子', 'mainland', '', [], []), /网页发布\/更新：2026-07-03；资料核对：2026-10-18/)
})

test('资料核对待办由家长明确选择未来时间，拒绝不存在日期和过去时间', () => {
  const now = new Date('2026-10-18T08:00:00Z')
  assert.throws(() => vaccineReviewCalendar('安安', '', now, 'a'), /手动选择/)
  assert.throws(() => vaccineReviewCalendar('安安', '2026-10-01T09:00', now, 'a'), /未来/)
  assert.throws(() => vaccineReviewCalendar('安安', '2027-02-30T09:00', now, 'a'), /无效/)
})

test('日历文件明确资料核对不是接种预约，并转义换行和折叠Unicode长行', () => {
  const content = vaccineReviewCalendar('安安,;\\\nBEGIN:VALARM' + '很长的名字'.repeat(30), '2026-10-20T09:00', new Date('2026-10-18T08:00:00Z'), 'test-id')
  assert.match(content, /BEGIN:VCALENDAR\r\nVERSION:2.0/)
  assert.doesNotMatch(content, /\r\nBEGIN:VALARM/)
  assert.match(content.replace(/\r\n /g, ''), /不是接种预约或疫苗日期/)
  assert.equal(content.split('BEGIN:VEVENT').length - 1, 1)
  assert.ok(content.trimEnd().split('\r\n').every(line => new TextEncoder().encode(line).length <= 75))
})
