import assert from 'node:assert/strict'
import test from 'node:test'
import { descriptorsFor, extractSymptomNarrative, generateSymptomSummary, inferSymptomCategory, isSemanticSymptomLocation, symptomLocationDisplay, symptomOptionalSummary, toggleExclusive, toSymptomLocations, visibleSymptomKeywords } from './symptomRecordLogic.ts'

test('narrative extraction only keeps explicitly stated symptom facts', () => {
  const result = extractSymptomNarrative('昨晚左肘窝有点发红，也很痒')
  assert.deepEqual(result.keywords, ['发红', '瘙痒'])
  assert.equal(result.bodyLocation, '左肘窝')
  assert.equal(result.occurredAtText, '昨晚')
  assert.equal(inferSymptomCategory(result.keywords), 'skin')
  assert.deepEqual(extractSymptomNarrative('孩子看起来不太对').keywords, [])
})

test('negated symptoms never become positive tags while positive facts remain', () => {
  for (const text of ['有皮疹，没发烧', '有皮疹，没有发烧', '有皮疹，未发烧', '有皮疹，无发热', '有皮疹，不发烧', '有皮疹，目前没发烧', '有皮疹，没有明显发烧']) {
    assert.deepEqual(extractSymptomNarrative(text).keywords, ['皮疹'])
  }
  assert.deepEqual(extractSymptomNarrative('出现皮疹并发烧').keywords, ['皮疹', '发烧'])
  assert.deepEqual(extractSymptomNarrative('昨天发烧，今天没发烧').keywords, [])
})

test('display tags remove negated and exact duplicate facts without hiding unrelated legacy facts', () => {
  assert.deepEqual(visibleSymptomKeywords('发烧', ['发烧', '发烧']), [])
  assert.deepEqual(visibleSymptomKeywords('还是有皮疹，没发烧', ['皮疹', '发烧']), ['皮疹'])
  assert.deepEqual(visibleSymptomKeywords('没有咳嗽，但有皮疹', ['咳嗽', '皮疹']), ['皮疹'])
  assert.deepEqual(visibleSymptomKeywords('脸色不好', ['发红']), ['发红'])
})

test('location validation rejects isolated numbering and displays locator names with numbers', () => {
  assert.equal(isSemanticSymptomLocation('1'), false)
  assert.equal(isSemanticSymptomLocation(' 1号区域 '), false)
  assert.equal(isSemanticSymptomLocation('左肘窝'), true)
  assert.equal(symptomLocationDisplay({ locationText: '1', locations: [] }), '')
  assert.equal(symptomLocationDisplay({ locationText: '左肘窝', locations: [{ id: 'left-elbow', label: '左肘窝', locationNumber: 1, locationLayer: 'surface', localRegion: '左肘窝' }] }), '左肘窝 · 1号区域')
})

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

test('collapsed supplement summary contains only real values in the confirmed order', () => {
  assert.equal(symptomOptionalSummary({ impactLevel: undefined, triggerText: '', trend: undefined, shortNote: '' }), '')
  assert.equal(symptomOptionalSummary({ impactLevel: 'some', triggerText: '出汗后明显', trend: 'more_noticeable', shortNote: '' }), '中度 · 出汗后明显 · 加重')
  assert.equal(symptomOptionalSummary({ impactLevel: undefined, triggerText: '', trend: undefined, shortNote: '晚上更明显' }), '晚上更明显')
})
