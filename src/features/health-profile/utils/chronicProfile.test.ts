import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chronicSummary,
  emptyChronicRecord,
  nextChronicSequence,
  normalizeChronicRecords
} from './chronicProfile.ts'

test('旧慢性病字段迁移为长期问题记录并保留兼容备注', () => {
  const [record] = normalizeChronicRecords([{
    name: '腰背筋膜炎',
    locations: ['右膝', '旧版模糊位置'],
    symptoms: ['疼痛'],
    otherSymptom: '酸胀',
    description: '久坐以后更明显',
    patterns: ['每周', '久坐后', '季节相关', '反复出现'],
    otherPattern: '下雨前',
    lifeImpact: '有一些影响',
    management: '热敷',
    firstFoundAt: '2020-01-01',
    status: '持续中',
    note: '旧备注'
  }])

  assert.equal(record.sequence, 1)
  assert.equal(record.knowledge, '已有明确名称')
  assert.equal(record.bodyLocations[0]?.id, 'lower_limb_knee_right')
  assert.deepEqual(record.legacyLocationNotes, ['旧版模糊位置'])
  assert.deepEqual(record.manifestations, ['疼痛', '酸胀', '久坐以后更明显'])
  assert.equal(record.frequency, '每周')
  assert.deepEqual(record.triggers, ['久坐', '天气变化'])
  assert.equal(record.legacy?.patternNote, '反复出现、下雨前')
  assert.deepEqual(record.lifeImpacts, ['有一些影响'])
  assert.equal(record.handling, '热敷')
  assert.equal(record.legacy?.note, '旧备注')
})

test('新字段保持身体位置、标签、频率和持续时间', () => {
  const record = {
    ...emptyChronicRecord(3),
    name: '冬天反复头疼',
    bodyLocations: [{ id: 'head_temple_left', label: '左太阳穴', parentId: 'head', locationType: 'surface' as const }],
    manifestations: ['疼痛', '麻木'],
    frequency: '每月',
    duration: '其他',
    customDuration: '两周左右'
  }

  assert.equal(nextChronicSequence([record]), 4)
  assert.deepEqual(chronicSummary(record), {
    locations: '左太阳穴',
    manifestations: '疼痛、麻木',
    rhythm: '每月 · 两周左右'
  })
  const [normalizedLocation] = normalizeChronicRecords([record])[0].bodyLocations
  assert.equal(normalizedLocation.id, record.bodyLocations[0].id)
  assert.equal(normalizedLocation.label, record.bodyLocations[0].label)
})

test('重复旧字段归一化时不会生成重复标签', () => {
  const [record] = normalizeChronicRecords([{
    symptoms: ['疼痛', '疼痛'],
    otherSymptom: '疼痛',
    patterns: ['久站', '久站']
  }])

  assert.deepEqual(record.manifestations, ['疼痛'])
  assert.deepEqual(record.triggers, ['久站'])
})
