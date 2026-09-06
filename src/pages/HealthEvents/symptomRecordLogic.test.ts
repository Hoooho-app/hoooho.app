import assert from 'node:assert/strict'
import test from 'node:test'
import { descriptorsFor, generateSymptomSummary, toggleExclusive, toSymptomLocations } from './symptomRecordLogic.ts'

test('symptom locations preserve structured position and stable numbering', () => {
  assert.deepEqual(toSymptomLocations([{ id: 'upper_limb_elbow_left', label: '左肘', parentId: 'upper_limb', locationType: 'surface', laterality: 'left', view: 'front' }]), [{ id: 'upper_limb_elbow_left', label: '左肘', locationNumber: 1, locationLayer: 'surface', bodySide: 'left', bodyView: 'front', bodyRegion: 'upper_limb', localRegion: '左肘', markedArea: '1号区域' }])
})

test('none observed is mutually exclusive with associated symptoms', () => {
  assert.deepEqual(toggleExclusive(['发热'], '没有特别发现'), ['没有特别发现'])
  assert.deepEqual(toggleExclusive(['没有特别发现'], '咳嗽'), ['咳嗽'])
})

test('ENT descriptors follow the selected visible location', () => {
  const nose = descriptorsFor('ent', [{ id: 'ent_nose', label: '鼻腔', locationType: 'surface' }])
  assert.ok(nose.includes('鼻塞'))
  assert.ok(!nose.includes('眼皮肿'))
})

test('deterministic summary uses only recorded facts and never invents diagnosis or cause', () => {
  const summary = generateSymptomSummary({ symptomCategory: 'skin', locations: [{ id: 'elbow', label: '左肘窝', locationNumber: 1, locationLayer: 'surface', localRegion: '左肘窝' }], descriptors: ['发红', '痒'], impactLevel: 'some', onsetApprox: 'today', trend: 'more_noticeable', associatedSymptoms: ['影响睡觉'] }, 2)
  assert.match(summary, /左肘窝1号区域/)
  assert.match(summary, /发红、痒/)
  assert.match(summary, /今天开始/)
  assert.match(summary, /2张现场照片/)
  assert.doesNotMatch(summary, /湿疹|过敏|诱因|治疗/)
})

test('omitted optional facts do not appear in summary', () => {
  const summary = generateSymptomSummary({ symptomCategory: 'fever', locations: [{ id: 'whole', label: '全身', locationNumber: 1, locationLayer: 'surface', localRegion: '全身' }], descriptors: [] })
  assert.doesNotMatch(summary, /开始|相比|影响|照片/)
})
