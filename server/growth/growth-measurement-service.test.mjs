import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { GrowthMeasurementService } from './growth-measurement-service.mjs'

test('成长记录按账户和人物隔离，同日 upsert 且支持增删改', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-growth-'))
  try {
    const members = new FamilyMemberRepository(dataDirectory)
    const child = await members.create({ accountId: 'a1', name: '孩子', relationship: 'child' })
    const service = new GrowthMeasurementService({ dataDirectory, members })
    const first = await service.upsert('a1', { memberId: child.id, measuredAt: '2026-01-01', measurementType: 'length', heightCm: 70, standardId: 'who-2006' }, new Date('2026-02-01'))
    const same = await service.upsert('a1', { memberId: child.id, measuredAt: '2026-01-01', measurementType: 'length', heightCm: 70, weightKg: 11.001, standardId: 'who-2006' }, new Date('2026-02-01'))
    assert.equal(same.id, first.id); assert.equal((await service.list('a1', child.id)).length, 1); assert.equal(same.weightKg, 11.001)
    assert.equal((await service.update('a1', first.id, { dataStatus: 'pending_confirmation' }, new Date('2026-02-02'))).dataStatus, 'pending_confirmation')
    await assert.rejects(service.list('a2', child.id), (error) => error.code === 'MEMBER_NOT_FOUND')
    assert.deepEqual(await service.delete('a1', first.id), { success: true }); assert.equal((await service.list('a1', child.id)).length, 0)
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})

test('测量日期上限使用客户端时区的本地自然日', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-growth-zone-'))
  try {
    const members = new FamilyMemberRepository(dataDirectory)
    const child = await members.create({ accountId: 'a1', name: '孩子', relationship: 'child' })
    const service = new GrowthMeasurementService({ dataDirectory, members })
    const now = new Date('2026-09-10T16:30:00.000Z')
    const saved = await service.upsert('a1', { memberId: child.id, measuredAt: '2026-09-11', measurementType: 'height', heightCm: 82, standardId: 'who-2006' }, now, 'Asia/Shanghai')
    assert.equal(saved.measuredAt, '2026-09-11')
    await assert.rejects(service.upsert('a1', { memberId: child.id, measuredAt: '2026-09-12', measurementType: 'height', heightCm: 82, standardId: 'who-2006' }, now, 'Asia/Shanghai'), (error) => error.code === 'INVALID_MEASURED_AT')
  } finally { await rm(dataDirectory, { recursive: true, force: true }) }
})
