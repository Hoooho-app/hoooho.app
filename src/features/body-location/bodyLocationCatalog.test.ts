import assert from 'node:assert/strict'
import test from 'node:test'
import { findBodyLocation, getBodyLocationRegions, normalizeBodyLocationSelection, searchBodyLocations } from './bodyLocationCatalog.ts'

test('标准目录区分表面区域与内部器官', () => {
  assert.deepEqual(findBodyLocation('右膝'), {
    id: 'lower_limb_knee_right', label: '右膝', parentId: 'lower_limb', locationType: 'surface', laterality: 'right', view: 'front'
  })
  assert.deepEqual(findBodyLocation('胆囊'), {
    id: 'organ_gallbladder', label: '胆囊', parentId: 'internal_organs', locationType: 'organ', laterality: 'none', view: 'internal'
  })
})

test('腹部使用九区位置语义且搜索可直达细分位置', () => {
  const abdomen = getBodyLocationRegions().find((region) => region.id === 'abdomen')
  assert.equal(abdomen?.options.length, 9)
  assert.equal(abdomen?.atlas, 'abdomen')
  assert.deepEqual(abdomen?.atlasViews?.map((view) => view.id), ['front', 'organ-reference'])
  assert.equal(abdomen?.options.some((item) => item.label === '右上腹'), true)
  assert.equal(abdomen?.options.find((item) => item.label === '右上腹')?.clinicalLabel, '右季肋区')
  assert.equal(searchBodyLocations('太阳穴')[0]?.label, '左太阳穴')
  assert.equal(searchBodyLocations('枕部')[0]?.label, '后脑')
  assert.equal(searchBodyLocations('腰').some((item) => item.parentId === 'waist_pelvis'), true)
})

test('首批图谱提供部位专属视图与可辨识区域', () => {
  const regions = getBodyLocationRegions()
  const atlasRegions = regions.filter((region) => region.atlas)
  assert.deepEqual(atlasRegions.map((region) => region.atlas), ['head', 'chest', 'abdomen', 'back', 'hand', 'foot'])
  assert.deepEqual(regions.find((region) => region.id === 'hand')?.atlasViews?.map((view) => view.id), ['palm', 'dorsum'])
  assert.deepEqual(regions.find((region) => region.id === 'foot')?.atlasViews?.map((view) => view.id), ['dorsum', 'sole'])
  assert.equal(regions.find((region) => region.id === 'foot')?.options.some((item) => item.label === '右足跟'), true)
})

test('成员性别只影响适用器官目录，不做其他医学推断', () => {
  const female = getBodyLocationRegions({ age: '34', gender: 'female' }).find((region) => region.id === 'internal_organs')
  const male = getBodyLocationRegions({ age: '35', gender: 'male' }).find((region) => region.id === 'internal_organs')
  assert.equal(female?.options.some((item) => item.id === 'organ_uterus'), true)
  assert.equal(female?.options.some((item) => item.id === 'organ_prostate'), false)
  assert.equal(male?.options.some((item) => item.id === 'organ_uterus'), false)
  assert.equal(male?.options.some((item) => item.id === 'organ_prostate'), true)
})

test('旧字符串和已结构化数据均可归一化', () => {
  assert.equal(normalizeBodyLocationSelection('右膝')?.id, 'lower_limb_knee_right')
  assert.equal(normalizeBodyLocationSelection({ id: 'custom', label: '自定义位置', locationType: 'surface' })?.label, '自定义位置')
})
