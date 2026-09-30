import { mkdtemp, writeFile, access, unlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { visitFixture } from '../../server/visit-sheets/fixtures.mjs'
import { buildOccurrences } from '../../server/medication-reminders/medication-reminder-service.mjs'
// Only this isolated fixture server can install the AI test double. Runtime code
// never reads this flag, and no fixture is written to the normal data directory.
if (process.env.VISIT_AI_TEST === '1') {
  const { createServer } = await import('node:http')
  let mode = 'success', calls = 0
  const nativeFetch = globalThis.fetch
  process.env.OPENAI_API_KEY = 'fixture-only-not-a-real-key'
  process.env.AI_MODEL = 'fixture-summary-model'
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
  globalThis.fetch = async (url, init) => {
    if (String(url) !== 'https://api.openai.com/v1/responses') return nativeFetch(url, init)
    calls++
    await new Promise(resolve => setTimeout(resolve, 400))
    if (mode === 'failure') return new Response(JSON.stringify({ error: { type: 'insufficient_quota', code: 'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details.' } }), { status: 429, headers: { 'x-request-id': 'req_fixture' } })
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ overview: `测试替身摘要第 ${calls} 版：依据当前成员已保存的皮肤观察。`, keyPoints: ['健康随记已有皮肤发红记录'], missingInformation: ['皮肤观察变化待核对'] }) }] }] })
  }
  createServer((req, res) => {
    if (req.url === '/success') mode = 'success'
    if (req.url === '/failure') mode = 'failure'
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ mode, calls }))
  }).listen(4198, '127.0.0.1')
}
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-visit-e2e-'))
const shutdownFile = new URL('./.shutdown', import.meta.url)
await unlink(shutdownFile).catch(() => {})
setInterval(
  () =>
    access(shutdownFile)
      .then(() => process.exit(0))
      .catch(() => {}),
  250,
).unref()
const f = visitFixture(),
  now = new Date().toISOString(),
  accountId = f.member.accountId
// Synthetic aspect-ratio fixtures: colored geometry, never clinical imagery.
const imageFixtures=[]
for(const [i,[width,height,color]] of [[360,960,'#1b7a6e'],[1000,260,'#a66922'],[480,480,'#526966']].entries()){
  const buffer=await sharp({create:{width,height,channels:3,background:color}}).png().toBuffer()
  imageFixtures.push({id:`v5-image-${i}`,eventId:'event-a',recordId:i===2?'s0':'s7',name:`测试原图-${i}.png`,mimeType:'image/png',createdAt:`2026-09-${20+i}T10:00:00Z`,dataUrl:`data:image/png;base64,${buffer.toString('base64')}`,width,height})
}
const seed = async (file, data) =>
  writeFile(path.join(dataDirectory, file), JSON.stringify(data), 'utf8')
await seed('.cleanup-test-data-2026-08-09-v1', { fixture: true })
await seed('users.json', {
  users: [
    {
      id: accountId,
      email: 'visit@example.test',
      createdAt: now,
      updatedAt: now,
    },
  ],
})
await seed('family-members.json', {
  members: [
    { ...f.member, relationship: 'child', createdAt: now, updatedAt: now },
    {
      id: 'empty-child',
      accountId,
      name: '空资料（虚构）',
      gender: 'male',
      relationship: 'child',
      birthday: '2025-01-01',
      createdAt: now,
      updatedAt: now,
    },
  ],
})
await seed('health-events.json', {
  events: f.events.map((e) => ({
    ...e,
    accountId,
    status: 'observing',
    category: 'allergy',
    createdAt: now,
    updatedAt: now,
  })),
})
await seed('health-event-records.json', {
  records: f.records.map((r) => ({
    ...r,
    createdAt: r.createdAt || r.occurredAt,
    updatedAt: r.updatedAt || r.occurredAt,
  })),
})
await seed('growth-measurements.json', {
  measurements: f.growth.map((g) => ({
    ...g,
    accountId,
    createdAt: now,
    updatedAt: now,
  })),
})
await seed('medication-reminders.json', {
  reminders: f.reminders.map((r) => ({
    ...r,
    accountId,
    status: 'active',
    completions: r.occurrences
      .filter((o) => o.completed)
      .map((o, index) => ({
        ...o.completion,
        occurrenceId: buildOccurrences(r.id, {...r.plan, timezone:'Asia/Shanghai'})[index].id,
        scheduledAt: buildOccurrences(r.id, {...r.plan, timezone:'Asia/Shanghai'})[index].scheduledAt,
        completedAt: o.completion.actualTakenAt,
        undoneAt: null,
      })),
    plan: { ...r.plan, timezone: 'Asia/Shanghai' },
  })),
})
await seed('desensitization-tests.json', {
  tasks: f.tasks.map((t) => ({
    ...t,
    accountId,
    categoryKey: 'egg',
    categoryLabel: '鸡蛋',
    confidence: 'confirmed',
    version: 1,
    planVersions: [],
    updatedAt: now,
  })),
  records: f.tasks.flatMap((t) =>
    t.records.map((r) => ({
      ...r,
      accountId,
      taskId: t.id,
      version: 1,
      createdAt: r.occurredAt,
      updatedAt: r.occurredAt,
      withdrawnAt: null,
    })),
  ),
})
await seed('event-attachments.json', {
  attachments: [...f.attachments.map((a) => ({
    ...a,
    accountId,
    memberId: f.member.id,
    storageKey: 'missing-fixture.png',
  })),...imageFixtures.map(a=>({...a,accountId,memberId:f.member.id}))],
})
process.env.DATA_DIRECTORY = dataDirectory
process.env.AUTH_TOKEN_SECRET = 'visit-sheet-e2e-secret'
process.env.PORT = '4196'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.chdir(fileURLToPath(new URL('../../',import.meta.url)))
await import('../../server/app.mjs')
// Independent development server exercises React StrictMode and real Vite APIs.
const { createServer } = await import('vite')
const dev = await createServer({root:fileURLToPath(new URL('../../',import.meta.url)),configFile:fileURLToPath(new URL('../../vite.config.ts',import.meta.url)),server:{host:'127.0.0.1',port:4197,strictPort:true},clearScreen:false})
await dev.listen()
