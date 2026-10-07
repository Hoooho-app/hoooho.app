import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RoutineService } from '../../server/routines/routine-service.mjs'
import { FamilyMemberRepository } from '../../server/members/repositories/family-member-repository.mjs'
import { localDateKey } from '../../server/time/local-calendar.mjs'
import { shiftDay } from '../../server/routines/daily-record-service.mjs'
process.chdir(path.resolve(import.meta.dirname, '../..'))
const shutdownMarker = path.resolve('.codex-tmp/daily-records-shutdown')
await mkdir(path.dirname(shutdownMarker), { recursive: true })
await rm(shutdownMarker, { force: true })
setInterval(() => void access(shutdownMarker).then(() => process.exit()).catch(() => undefined), 200)
process.env.TZ = 'Asia/Shanghai'
const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-daily-e2e-'))
await writeFile(path.join(directory, '.cleanup-test-data-2026-08-09-v1'), '{}')
const accountId = 'daily-e2e-account', now = new Date()
await writeFile(path.join(directory, 'users.json'), JSON.stringify({ users: [{ id: accountId, email: 'daily@hoooho.test', createdAt: now.toISOString() }] }))
const members = new FamilyMemberRepository(directory), routines = new RoutineService({ dataDirectory: directory, members })
// Fixture history only: genuine server scheduler materializes due rules from a
// prior local day. No clock-changing or backdating API exists in the application.
for (const width of [375, 390, 430]) {
  const member = await members.create({ accountId, name: `自动记录验收${width}`, relationship: 'child', gender: 'female', birthday: '2025-01-01' })
  const yesterday = shiftDay(localDateKey(now, 'Asia/Shanghai'), -1)
  await routines.daily.saveSettings(accountId, member.id, { kind: 'feeding', revision: 0, enabled: true, timeZone: 'Asia/Shanghai', slots: [ { id: 'early_milk_slot', name: '早奶', time: '07:30', enabled: true, fields: { feedingMethod: 'formula', bottleMl: 150 } }, { id: 'mid_milk_slot', name: '午奶', time: '13:00', enabled: true, fields: { feedingMethod: 'formula', bottleMl: 180 } }, { id: 'late_milk_slot', name: '晚奶', time: '21:00', enabled: true, fields: { feedingMethod: 'formula', bottleMl: 200 } } ] }, new Date(`${shiftDay(yesterday, -1)}T01:00:00Z`))
  for (const [kind, fields] of [['bowel', {}], ['topical', { kind: 'skincare', productName: '用户填写护肤品' }]]) await routines.daily.saveSettings(accountId, member.id, { kind, revision: 0, enabled: true, timeZone: 'Asia/Shanghai', slots: [{ id: `${kind}_today_slot`, name: kind === 'bowel' ? '排便核对' : '涂抹核对', time: '00:00', enabled: true, fields }] }, new Date(`${yesterday}T01:00:00Z`))
}
process.env.PORT = '4197'; process.env.HOST = '127.0.0.1'; process.env.NODE_ENV = 'development'; process.env.DATA_DIRECTORY = directory; process.env.AUTH_TOKEN_SECRET = 'daily-e2e-local-only-secret'
await import('../../server/app.mjs')
