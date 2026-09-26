import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { VisitSheetService } from './visit-sheet-service.mjs'
import { AccountDataService } from '../account/account-data-service.mjs'
import { visitFixture } from './fixtures.mjs'
async function setup(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'visit-sheet-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const f = visitFixture()
  const svc = new VisitSheetService({
    dataDirectory: dir,
    members: { findById: async (id) => (id === f.member.id ? f.member : null) },
    events: {
      findByAccountId: async () => [
        ...f.events,
        { id: 'foreign-event', memberId: 'foreign' },
      ],
    },
    records: {
      findByAccountId: async () => [
        ...f.records,
        {
          id: 'private',
          eventId: 'foreign-event',
          type: 'symptom',
          content: 'other child',
        },
      ],
    },
    attachments: { findByEventId: async () => [] },
    growth: { list: async () => f.growth },
    facts: { list: async () => [] },
    medication: { list: async () => f.reminders },
    desensitization: { list: async () => ({ tasks: f.tasks }) },
    organizations: { findByEventId: async () => [] },
  })
  return { svc, f, dir }
}
test('成员权限、版本持久化、旧结果保护、幂等、乱序拒绝', async (t) => {
  const { svc, f } = await setup(t),
    a = f.member.accountId,
    m = f.member.id
  await assert.rejects(svc.get('other', m), { status: 404 })
  const first = await svc.save(a, m, { expectedVersion: 0, requestId: 'first' })
  assert.equal(first.report.version, 1)
  assert.ok(!first.report.sources.some((s) => s.id === 'record:private'))
  assert.equal(
    (await svc.save(a, m, { expectedVersion: 0, requestId: 'first' })).report
      .version,
    1,
  )
  const focus = { mode: 'source', sourceId: 'record:s0' },
    next = await svc.save(a, m, {
      expectedVersion: 1,
      requestId: 'second',
      focus,
      question: '要补充哪些观察？',
      notes: { allergy: '家长补充' },
    })
  assert.equal(next.report.id, first.report.id)
  assert.equal(next.report.version, 2)
  await assert.rejects(
    svc.save(a, m, {
      expectedVersion: 1,
      requestId: 'stale',
      focus: { mode: 'auto' },
    }),
    { status: 409 },
  )
  const later = await svc.save(a, m, {
    expectedVersion: 2,
    requestId: 'refresh',
  })
  assert.deepEqual(later.report.focus, focus)
  assert.equal(later.report.question, '要补充哪些观察？')
  assert.equal(later.report.notes.allergy, '家长补充')
  assert.equal((await svc.get(a, m)).report.version, 3)
  await assert.rejects(
    svc.save(a, m, {
      expectedVersion: 3,
      requestId: 'foreign',
      focus: { mode: 'source', sourceId: 'record:private' },
    }),
  )
  assert.equal((await svc.get(a, m)).report.version, 3)
})
test('部分读取失败不覆盖已有版本，删除来源后旧快照不再导出', async (t) => {
  const { svc, f } = await setup(t)
  await svc.save(f.member.accountId, f.member.id, {
    expectedVersion: 0,
    requestId: 'one',
  })
  svc.growth.list = async () => {
    throw new Error('unavailable')
  }
  await assert.rejects(
    svc.save(f.member.accountId, f.member.id, {
      expectedVersion: 1,
      requestId: 'two',
    }),
    { status: 503 },
  )
  assert.equal((await svc.store.read()).reports[0].current.version, 1)
  svc.growth.list = async () => f.growth
  f.records = f.records.filter((r) => r.id !== 's7')
  const s = await svc.get(f.member.accountId, f.member.id)
  assert.equal(s.report, null)
  assert.equal(s.expectedVersion, 1)
})
test('游客合并保留报告与手动内容', async (t) => {
  const { svc, f, dir } = await setup(t)
  f.member.accountId = 'guest:visit'
  await svc.save('guest:visit', f.member.id, {
    expectedVersion: 0,
    requestId: 'one',
    question: '我的问题',
  })
  await new AccountDataService({ dataDirectory: dir }).mergeGuest(
    'guest:visit',
    'formal',
  )
  f.member.accountId = 'formal'
  const data = await svc.get('formal', f.member.id)
  assert.equal(data.report.question, '我的问题')
  assert.equal(data.report.version, 1)
  await assert.rejects(svc.get('guest:visit', f.member.id), { status: 404 })
})
test('已删除的手动焦点不阻塞重新生成，也不泄露旧来源编辑历史', async (t) => {
  const { svc, f } = await setup(t),
    a = f.member.accountId,
    m = f.member.id
  await svc.save(a, m, {
    expectedVersion: 0,
    requestId: 'a',
    focus: { mode: 'source', sourceId: 'record:s0' },
  })
  f.records[0].content = '更正后的原文'
  await svc.save(a, m, { expectedVersion: 1, requestId: 'b' })
  f.records = f.records.filter((r) => r.id !== 's0')
  assert.equal((await svc.get(a, m)).report, null)
  const { report } = await svc.save(a, m, {
    expectedVersion: 2,
    requestId: 'c',
  })
  assert.equal(report.focus.sourceId, 'record:s0')
  assert.equal(report.focusSourceIds.length, 0)
  assert.ok(!report.changes.some((c) => c.sourceId === 'record:s0'))
  svc.growth.list = async () => {
    throw new Error('unavailable')
  }
  await assert.rejects(svc.get(a, m), { status: 503 })
  assert.equal((await svc.store.read()).reports[0].current.version, 3)
})

test('纯编辑不改资料截至、幂等重放不泄露已删除来源，照片跨成员拒绝',async t=>{
  const {svc,f}=await setup(t),a=f.member.accountId,m=f.member.id
  const first=await svc.save(a,m,{expectedVersion:0,requestId:'original'},new Date('2026-09-26T00:00:00Z'))
  const edited=await svc.save(a,m,{expectedVersion:1,requestId:'edit',notes:{course:'仅报告补充'}},new Date('2026-09-26T01:00:00Z'))
  assert.equal(edited.report.dataAsOf,first.report.dataAsOf)
  assert.equal(edited.report.generatedAt,first.report.generatedAt)
  assert.notEqual(edited.report.editedAt,first.report.editedAt)
  await assert.rejects(svc.save(a,m,{expectedVersion:2,requestId:'photos',selectedPhotoIds:['attachment:foreign']}),{status:400})
  f.records=f.records.filter(r=>r.id!=='s7')
  await assert.rejects(svc.save(a,m,{expectedVersion:1,requestId:'edit'}),{status:409})
})

test('首次部分读取失败不能保存为无记录；章节补充不改变问题来源身份',async t=>{
  const {svc,f}=await setup(t),a=f.member.accountId,m=f.member.id
  svc.growth.list=async()=>{throw new Error('unavailable')}
  await assert.rejects(svc.save(a,m,{expectedVersion:0,requestId:'partial'}),{status:503})
  assert.equal((await svc.store.read()).reports.length,0)
  svc.growth.list=async()=>f.growth
  f.records[0].content+='。想问需要补充什么观察？'
  const first=await svc.save(a,m,{expectedVersion:0,requestId:'question'})
  assert.equal(first.report.questionOrigin,'据家长记录整理')
  const edited=await svc.save(a,m,{expectedVersion:1,requestId:'chapter',notes:{sources:'附件核对'}})
  assert.equal(edited.report.question,first.report.question)
  assert.equal(edited.report.questionOrigin,first.report.questionOrigin)
  assert.equal(edited.report.questionEdited,false)
})

test('档案原件读取重新校验成员、账号和删除状态，报告不含字节',async t=>{
  const {svc,f}=await setup(t),a=f.member.accountId,m=f.member.id
  const data='data:image/png;base64,aGVsbG8='
  await svc.profiles.update(()=>({sections:[{accountId:a,memberId:m,sectionId:'examination',records:[{id:'original',name:'检查记录',imageDataUrl:data}]}]}))
  const saved=await svc.save(a,m,{expectedVersion:0,requestId:'resource'})
  assert.ok(!JSON.stringify(saved.report).includes('aGVsbG8='))
  const s=saved.report.sources.find(s=>s.contentPath)
  assert.ok(s)
  const id=s.contentPath.split('/').at(-1)
  assert.equal((await svc.readProfileResource(a,m,id)).buffer.toString(),'hello')
  await assert.rejects(svc.readProfileResource('foreign',m,id),{status:404})
  await assert.rejects(svc.readProfileResource(a,'foreign',id),{status:404})
  await svc.profiles.update(()=>({sections:[]}))
  await assert.rejects(svc.readProfileResource(a,m,id),{status:404})
  assert.equal((await svc.get(a,m)).report,null)
})

test('删除来源不能通过报告编辑历史回流，包括缺少依赖信息的旧历史',async t=>{
  const {svc,f}=await setup(t),a=f.member.accountId,m=f.member.id
  const source=f.records.find(r=>r.id==='s0');source.content=source.journal.symptom.narrative='SYNTHETIC_DELETED_SOURCE'
  await svc.save(a,m,{expectedVersion:0,requestId:'history-first',focus:{mode:'source',sourceId:'record:s0'}})
  const second=await svc.save(a,m,{expectedVersion:1,requestId:'history-switch',focus:{mode:'source',sourceId:'record:s1'}})
  assert.ok(JSON.stringify(second.report.changes).includes('SYNTHETIC_DELETED_SOURCE'))
  await svc.store.update(data=>({...data,reports:data.reports.map(row=>({...row,current:{...row.current,changes:[...row.current.changes,{sourceId:'家长报告编辑',before:'SYNTHETIC_DELETED_SOURCE',after:'legacy',at:new Date().toISOString()}]}}))}))
  f.records=f.records.filter(r=>r.id!=='s0')
  const updated=await svc.save(a,m,{expectedVersion:2,requestId:'history-deleted'})
  assert.ok(!JSON.stringify(updated.report).includes('SYNTHETIC_DELETED_SOURCE'))
  const linked=f.records.find(r=>r.id==='m0');linked.content='SYNTHETIC_LINKED_DELETED'
  await svc.save(a,m,{expectedVersion:3,requestId:'linked'})
  f.records=f.records.filter(r=>r.id!=='m0')
  const unlinked=await svc.save(a,m,{expectedVersion:4,requestId:'unlinked'})
  assert.ok(!JSON.stringify(unlinked.report).includes('SYNTHETIC_LINKED_DELETED'))
})
