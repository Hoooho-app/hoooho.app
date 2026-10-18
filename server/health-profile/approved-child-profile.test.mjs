import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { ChildProfileListService } from './child-profile-list-service.mjs'
import { validateProfileSectionRecords } from './profile-section-store.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'

test('儿保完成日期由服务端拒绝未来事实，计划保留且不能伪装完成', () => {
  const row = { id: 'checkup', title: '儿保', type: 'checkup', recordType: 'record', date: '2020-01-01' }
  assert.deepEqual(validateProfileSectionRecords('checkups', [row]), [row])
  assert.throws(() => validateProfileSectionRecords('checkups', [{ ...row, date: '2999-01-01' }]))
  assert.doesNotThrow(() => validateProfileSectionRecords('checkups', [{ ...row, recordType: 'plan', date: '2999-01-01' }]))
  assert.throws(() => validateProfileSectionRecords('checkups', [{ ...row, date: '2026-02-30' }]))
  assert.throws(() => validateProfileSectionRecords('checkups', [{ ...row, recordType: 'other' }]))
  assert.doesNotThrow(() => validateProfileSectionRecords('vaccination-plans', [{ id: 'plan', title: '咨询接种', plannedOn: '2999-01-01' }]))
  assert.throws(() => validateProfileSectionRecords('vaccination-plans', [{ id: 'plan', title: '', plannedOn: '2026-01-01' }]))
})

test('接种新剂次、未知年龄、原件归属、旧字段和版本冲突保持正确', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-approved-profile-')); t.after(() => rm(directory, { recursive: true, force: true }))
  const service = new ChildProfileListService({ dataDirectory: directory }), members = new FamilyMemberRepository(directory)
  const child = await members.create({ accountId: 'owner', name: '虚构孩子', relationship: 'child', birthday: '2024-01-01' })
  const command = input => service.command('owner', child.id, 'vaccination', { key: randomUUID(), ...input })
  let list = await command({ action: 'add', name: '合成疫苗', date: '', group: '年龄待确认', doseSequence: 'dose_2' })
  assert.equal(list.rows[0].doseSequence, 'dose_2'); assert.equal(list.rows[0].group, '年龄待确认'); assert.equal(list.rows[0].date, '')
  let row = list.rows[0], record = await service.records.findById(row.recordId)
  assert.equal(record.journal.vaccination.items[0].profileAgeGroup, undefined)
  await service.attachments.create({ accountId: 'owner', eventId: row.eventId, recordId: row.recordId, name: '合成原件' })
  await service.attachments.create({ accountId: 'foreign', eventId: row.eventId, recordId: row.recordId, name: '其他账户原件' })
  list = await service.list('owner', child.id, 'vaccination'); row = list.rows[0]
  assert.equal(row.attachmentIds.length, 1)
  await command({ action: 'edit', id: row.id, version: row.version, name: row.name, group: row.group, doseSequence: 'dose_3' })
  await assert.rejects(() => command({ action: 'edit', id: row.id, version: row.version, name: '过期修改', group: row.group }), /记录已更新/)
  await assert.rejects(() => command({ action: 'add', name: '无效剂次', group: '年龄待确认', doseSequence: 'dose_100' }), /剂次无效/)
  await service.sections.update(data => ({ ...data, sections: [...data.sections, { accountId: 'owner', memberId: child.id, sectionId: 'vaccination', revision: 1, records: [{ id: 'legacy', name: '旧疫苗', date: '未知日期', dose: '原始自由文本', batchNumber: '旧批号', sourceFiles: [{ id: 'file' }] }] }] }))
  row = (await service.list('owner', child.id, 'vaccination')).rows.find(r => r.id === 'legacy')
  await command({ action: 'edit', id: row.id, version: row.version, name: '旧疫苗修正', group: row.group })
  const raw = (await service.sections.read()).sections.find(s => s.sectionId === 'vaccination').records[0]
  assert.equal(raw.date, '未知日期'); assert.equal(raw.dose, '原始自由文本'); assert.equal(raw.batchNumber, '旧批号'); assert.deepEqual(raw.sourceFiles, [{ id: 'file' }])
})
