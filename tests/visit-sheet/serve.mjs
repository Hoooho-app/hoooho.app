import { mkdtemp, writeFile, readFile, mkdir, access, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { visitFixture } from '../../server/visit-sheets/fixtures.mjs'
import { buildOccurrences } from '../../server/medication-reminders/medication-reminder-service.mjs'
// Only this isolated fixture server can install the AI test double. Runtime code
// never reads this flag, and no fixture is written to the normal data directory.
if (process.env.VISIT_AI_TEST === '1') {
  const { createServer } = await import('node:http')
  let mode = 'success', calls = 0,asrCalls=0,speechCalls=0,transcript='今天没有呕吐',draftItems=null,ocrText=null,summaryOutput=null
  const nativeFetch = globalThis.fetch
  process.env.OPENAI_API_KEY = 'fixture-only-not-a-real-key'
  process.env.AI_MODEL = 'fixture-summary-model'
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1'
  const bailian = process.env.VISIT_BAILIAN_TEST === '1'
  process.env.AI_PROVIDER = bailian ? 'bailian' : 'openai'
  if(bailian){process.env.BAILIAN_API_KEY='fixture-bailian-not-a-real-key';process.env.BAILIAN_BASE_URL='https://fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';process.env.BAILIAN_MODEL='qwen3.7-plus';process.env.ASR_PROVIDER=process.env.VISIT_ASR_TEST==='1'?'bailian':'none';process.env.TTS_PROVIDER='none'}
  const fixtureResponse = value => bailian ? Response.json({id:'chatcmpl-fixture',choices:[{finish_reason:'stop',message:{content:value.output[0].content[0].text}}],usage:{prompt_tokens:value.usage?.input_tokens??10,completion_tokens:value.usage?.output_tokens??20}},{headers:{'x-request-id':'01234567-1234-1234-1234-123456789abc'}}) : Response.json(value)
  globalThis.fetch = async (url, init) => {
    if(!String(url).startsWith('https://api.openai.com/v1/')&&!String(url).startsWith(process.env.BAILIAN_BASE_URL??'https://not-a-fixture.invalid/'))return nativeFetch(url,init)
    if(bailian&&String(url).startsWith('https://api.openai.com/v1/'))throw new Error('Bailian fixture must not call OpenAI')
    if(bailian&&JSON.parse(init.body).model==='qwen3-asr-flash'){asrCalls++;await new Promise(resolve=>setTimeout(resolve,600));if(mode==='failure')return Response.json({error:{code:'AllocationQuota.FreeTierOnly',message:'The free tier of the model has been exhausted.'}},{status:403});return Response.json({id:'chatcmpl-synthetic-asr',choices:[{finish_reason:'stop',message:{content:transcript}}],usage:{prompt_tokens:100,completion_tokens:12,seconds:4}})}
    if(String(url)==='https://api.openai.com/v1/audio/transcriptions'){asrCalls++;return Response.json({text:transcript})}
    if(String(url)==='https://api.openai.com/v1/audio/speech'){speechCalls++;const wave=Buffer.alloc(44+3200);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(16000,24);wave.writeUInt32LE(32000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(3200,40);return new Response(wave,{headers:{'Content-Type':'audio/wav'}})}
    if(String(url)!==(bailian?process.env.BAILIAN_BASE_URL+'/chat/completions':'https://api.openai.com/v1/responses'))throw new Error('Unconfigured synthetic endpoint; network prohibited')
    calls++
    await new Promise(resolve => setTimeout(resolve, 400))
    if (mode === 'failure') return new Response(JSON.stringify({ error: { type: bailian?'AllocationQuota.FreeTierOnly':'insufficient_quota', code: bailian?'AllocationQuota.FreeTierOnly':'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details.' } }), { status: bailian?403:429, headers: { 'x-request-id': 'req_fixture' } })
    let body=JSON.parse(init.body)
    if(bailian){const text=body.messages[1].content[0].text;body={input:text,text:{format:body.response_format.json_schema}}}
    if (body.text.format.name === 'hoooho_nurse_v1') {
      const turns = JSON.parse(body.input), user = turns.filter(t => t.role === 'user').at(-1)
      const first = turns.find(t => t.role === 'user' && t.text.includes('脸颊')) ?? user
      const organized = { reply: '有没有影响睡眠？', intent: user.text.includes('整理') ? 'organize' : 'continue', emergency: { currentChild: false, quote: '' }, fields: { narrative: '脸颊发红发痒，没有发热。', timeText:'', locationText: '脸颊', impactLevel: '', triggerText: '', trend: '' }, fieldEvidence: [{ field: 'narrative', sourceTurnId: first.id, quote: first.text.split('。')[0] }, { field: 'locationText', sourceTurnId: first.id, quote: first.text.split('。')[0] }], notes: [{ category: 'parent_concern', heading: '家长担心', text: '担心鸡蛋相关，尚未确认。', sourceTurnId: first.id, quote: first.text, certainty: 'uncertain', attribution: 'parent' }, { category: 'prior_action', heading: '已做处理', text: '涂过保湿霜，效果不确定。', sourceTurnId: first.id, quote: first.text, certainty: 'uncertain', attribution: 'parent' }] }
      return fixtureResponse({ usage: { input_tokens: 30, output_tokens: 30 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(organized) }] }] })
    }
    if(body.text.format.name==='symptom_media_observations')return fixtureResponse({output:[{content:[{type:'output_text',text:JSON.stringify({observations:[{frame:0,text:'合成可见表现：局部发红'}],questions:['请核对人物、部位与原件日期']})}]}]})
    if(body.text.format.name==='hoooho_business'){
      if(body.text.format.schema.properties.text)return fixtureResponse({output:[{content:[{type:'output_text',text:JSON.stringify(Array.isArray(ocrText)?ocrText:{text:ocrText??'测试机构\n2026-09-29\n红细胞 4.2 mmol/L 参考3.5-5.5',status:'readable'})}]}]})
      const data=JSON.parse(body.input),first=data.sources[0]
      const items=draftItems?draftItems.map(i=>({...i,fields:i.fields.map(f=>({...f,sourceId:f.sourceId==='@first'?first.id:f.sourceId}))})):[{category:'symptom',title:'合成观察记录',timeText:first.text.includes('今天')?'今天':null,subject:'current',archiveCategory:null,relationKey:null,fields:[{name:'symptom',value:first.text,quote:first.text,sourceId:first.id,page:first.page}]}]
      return fixtureResponse({usage:{input_tokens:10,output_tokens:20},output:[{content:[{type:'output_text',text:JSON.stringify({items})}]}]})
    }
    if(summaryOutput)return fixtureResponse({output:[{content:[{type:'output_text',text:JSON.stringify(summaryOutput)}]}]})
    const input=JSON.parse(body.input.split('\n\n').at(-1)),line=input.sections.find(s=>s.id==='record')?.lines[0]??input.sections[0].lines[0],sectionId=input.sections.find(s=>s.lines.includes(line)).id
    return fixtureResponse({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ overview: `测试替身摘要：${line}`, keyPoints: [{text:'健康随记已有皮肤观察记录',sectionId,quote:line}], missingInformation: ['皮肤观察变化待核对'] }) }] }] })
  }
  // Bailian now uses the Node HTTPS transport rather than global fetch. Keep
  // that boundary inside this isolated fixture process; never contact a real
  // provider, modify production transports, or loosen output validation.
  if (bailian) https.request = (url, options, callback) => {
    if (String(url) !== process.env.BAILIAN_BASE_URL + '/chat/completions') throw new Error('Non-fixture HTTPS target prohibited')
    const request = new EventEmitter()
    let stopped = false
    request.destroy = () => { stopped = true; return request }
    request.end = body => {
      void globalThis.fetch(String(url), { ...options, body }).then(async response => {
        if (stopped) return
        const incoming = Readable.from(Buffer.from(await response.arrayBuffer()))
        incoming.statusCode = response.status
        incoming.headers = Object.fromEntries(response.headers)
        callback(incoming)
      }).catch(error => { if (!stopped) request.emit('error', error) })
      return request
    }
    options.signal?.addEventListener('abort', () => { if (!stopped) { stopped = true; request.emit('error', options.signal.reason) } }, { once: true })
    return request
  }
  createServer(async(req, res) => {
    const controlUrl=new URL(req.url,'http://127.0.0.1:4198')
    if(controlUrl.pathname==='/voice')transcript=controlUrl.searchParams.get('text')??''
    if(controlUrl.pathname==='/draft-data'&&req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);const data=JSON.parse(Buffer.concat(chunks).toString());draftItems=data.items??null;ocrText=data.ocrText??null;summaryOutput=data.summaryOutput??null}
    if (req.url === '/success') mode = 'success'
    if (req.url === '/failure') mode = 'failure'
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ mode, calls,asrCalls,speechCalls }))
  }).listen(Number(process.env.VISIT_CONTROL_PORT ?? 4198), '127.0.0.1')
}
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-visit-e2e-'))
const shutdownFile = new URL(process.env.VISIT_SHUTDOWN_FILE ?? './.shutdown', import.meta.url)
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
await mkdir(path.join(dataDirectory,'quick-record-photo-files'))
const videoPath=path.join(dataDirectory,'quick-record-photo-files','synthetic-playable.mp4')
await promisify(execFile)(ffmpeg.path,['-f','lavfi','-i','color=c=teal:s=160x120:d=2','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',videoPath])
const videoFixture=await readFile(videoPath)
imageFixtures.push({id:'test-video',eventId:'event-a',recordId:'s7',name:'合成可播放视频.mp4',mimeType:'video/mp4',createdAt:'2026-09-22T10:00:00Z',storageKey:'synthetic-playable.mp4',duration:2,binarySize:videoFixture.length,width:160,height:120})
const webmPath=path.join(dataDirectory,'quick-record-photo-files','synthetic-playable.webm')
await promisify(execFile)(ffmpeg.path,['-f','lavfi','-i','color=c=teal:s=160x120:d=2','-c:v','libvpx','-b:v','100k',webmPath])
imageFixtures.push({id:'test-webm',eventId:'event-a',recordId:'s7',name:'合成可播放视频.webm',mimeType:'video/webm',createdAt:'2026-09-22T10:00:00Z',storageKey:'synthetic-playable.webm',duration:2,binarySize:(await readFile(webmPath)).length,width:160,height:120})
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
// Keep this synthetic 28-day plan straddling the actual test date. Fixed
// September dates would turn all future-plan assertions into past-plan checks.
const planDay = offset => { const value = new Date(); value.setDate(value.getDate()+offset); return value.toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}) }
f.reminders = f.reminders.map(r => ({...r,plan:{...r.plan,startDate:planDay(-12),endDate:planDay(15)}}))
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
process.env.PORT = process.env.VISIT_E2E_PORT ?? '4196'
process.env.HOST = '127.0.0.1'
process.env.NODE_ENV = 'development'
process.chdir(fileURLToPath(new URL('../../',import.meta.url)))
await import('../../server/app.mjs')
// Independent development server exercises React StrictMode and real Vite APIs.
const { createServer } = await import('vite')
const dev = await createServer({root:fileURLToPath(new URL('../../',import.meta.url)),configFile:fileURLToPath(new URL('../../vite.config.ts',import.meta.url)),server:{host:'127.0.0.1',port:Number(process.env.VISIT_E2E_DEV_PORT ?? 4197),strictPort:true},clearScreen:false})
await dev.listen()
