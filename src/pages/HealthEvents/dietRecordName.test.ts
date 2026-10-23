import test from 'node:test'
import assert from 'node:assert/strict'
import { dietRecordNameKey, resolveDietRecordName, suggestedDietRecordName } from './dietRecordName'

const at = (hour: number) => `2026-10-20T${String(hour).padStart(2, '0')}:00:00`
test('only meals, snacks and bottle/mixed feeding have a record name', () => {
  for (const method of ['formula', 'expressed', 'mixed'] as const) assert.equal(dietRecordNameKey('feeding', method), method)
  assert.equal(dietRecordNameKey('meal'), 'meal')
  assert.equal(dietRecordNameKey('snack'), 'snack')
  assert.equal(dietRecordNameKey('feeding', 'breast'), undefined)
  assert.equal(dietRecordNameKey('complementary'), undefined)
  assert.equal(dietRecordNameKey('supplement'), undefined)
})
test('default names follow selected occurrence time, including historical dates and boundaries', () => {
  for (const key of ['formula', 'expressed', 'mixed'] as const) {
    for (const [hour, name] of [[0,'夜奶'],[4,'夜奶'],[5,'夜奶'],[6,'早奶'],[10,'早奶'],[11,'午奶'],[16,'午奶'],[17,'晚奶'],[21,'晚奶'],[22,'夜奶'],[23,'夜奶']] as const) assert.equal(suggestedDietRecordName(key, at(hour)), name)
  }
  for (const [hour, name] of [[4,'夜宵'],[5,'早餐'],[8,'早餐'],[10,'早餐'],[11,'午餐'],[15,'午餐'],[16,'晚餐'],[21,'晚餐'],[22,'夜宵']] as const) assert.equal(suggestedDietRecordName('meal', at(hour)), name)
  for (const [hour, name] of [[4,'夜间加餐'],[6,'上午加餐'],[11,'午间加餐'],[14,'下午加餐'],[18,'晚间加餐'],[22,'夜间加餐']] as const) assert.equal(suggestedDietRecordName('snack', at(hour)), name)
})
test('manual names are isolated by type and survive time changes; blank names fall back', () => {
  const names = { formula: ' 睡前奶 ', meal: '奶奶做的早餐', snack: '' }
  assert.equal(resolveDietRecordName('formula', at(4), names), '睡前奶')
  assert.equal(resolveDietRecordName('formula', at(8), names), '睡前奶')
  assert.equal(resolveDietRecordName('expressed', at(8), names), '早奶')
  assert.equal(resolveDietRecordName('meal', at(18), names), '奶奶做的早餐')
  assert.equal(resolveDietRecordName('snack', at(15), names), '下午加餐')
})
