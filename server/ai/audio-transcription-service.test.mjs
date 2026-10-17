import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AudioTranscriptionService } from './audio-transcription-service.mjs'

function realWavBuffer() {
  const samples = Buffer.alloc(1600 * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF'); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVE', 8); header.write('fmt ', 12)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(samples.length, 40)
  for (let index = 0; index < 1600; index += 1) samples.writeInt16LE(Math.round(Math.sin(index / 8) * 4000), index * 2)
  return Buffer.concat([header, samples])
}

test('unsupported WAV codec is rejected before ASR and does not consume its call budget', async () => {
  let calls = 0
  const service = new AudioTranscriptionService({ maxCallsPerHour: 1, logger: { info() {}, warn() {} }, provider: { name: 'local-fixture', async transcribeAudio(audio) { calls++; assert.equal(Buffer.compare(audio.buffer, realWavBuffer()), 0); return { transcript: '合成转写' } } } })
  const buffer = realWavBuffer(); buffer.writeUInt16LE(65535, 20)
  const input = bytes => ({ mimeType: 'audio/wav', dataUrl: 'data:audio/wav;base64,' + bytes.toString('base64') })
  await assert.rejects(service.transcribe(input(buffer), 'synthetic-wav'), { code: 'AUDIO_DECODE_FAILED' })
  assert.equal(calls, 0)
  await service.transcribe(input(realWavBuffer()), 'synthetic-wav')
  assert.equal(calls, 1)
})

test('decodable streaming WAV with unknown chunk lengths retains original bytes and reaches ASR', async () => {
  const buffer = realWavBuffer(); buffer.writeUInt32LE(0xffffffff, 4); buffer.writeUInt32LE(0xffffffff, 40)
  let calls = 0
  const service = new AudioTranscriptionService({ logger: { info() {}, warn() {} }, provider: { name: 'local-fixture', async transcribeAudio(audio) { calls++; assert.equal(Buffer.compare(audio.buffer, buffer), 0); return { transcript: '合成转写' } } } })
  await service.transcribe({ mimeType: 'audio/wav', dataUrl: 'data:audio/wav;base64,' + buffer.toString('base64') })
  assert.equal(calls, 1)
})

async function readFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'hoooho-asr-fixture-'))
  const file = path.join(directory, 'mandarin-safety.wav')
  await writeFile(file, realWavBuffer())
  return { buffer: await readFile(file), cleanup: () => rm(directory, { recursive: true, force: true }) }
}

test('真实 WAV 文件通过 ASR 适配器而不是转交同内容文本', async () => {
  const fixture = await readFixture()
  const buffer = fixture.buffer
  let received = null
  const service = new AudioTranscriptionService({ provider: { name: 'fixture-asr', transcribeAudio: async (audio) => {
    received = audio.buffer
    return { transcript: '孩子烧到三十九度二，刚才喂了五毫升布洛芬。', model: 'fixture' }
  } } })
  const result = await service.transcribe({ name: 'A01.wav', mimeType: 'audio/wav', dataUrl: `data:audio/wav;base64,${buffer.toString('base64')}` })
  assert.equal(Buffer.compare(received, buffer), 0)
  assert.match(result.transcript, /三十九度二/)
  await fixture.cleanup()
})

test('ASR 未配置和伪造 WAV 返回可行动错误且不伪造转写', async () => {
  const service = new AudioTranscriptionService({ provider: null })
  const fixture = await readFixture()
  const buffer = fixture.buffer
  await assert.rejects(() => service.transcribe({ name: 'A01.wav', mimeType: 'audio/wav', dataUrl: `data:audio/wav;base64,${buffer.toString('base64')}` }), (error) => error.code === 'ASR_NOT_CONFIGURED')
  await assert.rejects(() => service.transcribe({ name: 'fake.wav', mimeType: 'audio/wav', dataUrl: 'data:audio/wav;base64,aGVsbG8=' }), (error) => error.code === 'AUDIO_DECODE_FAILED')
  await fixture.cleanup()
})
test('转写预算由认证账号计数，超限不请求模型；账号之间独立',async()=>{
  let calls=0;const service=new AudioTranscriptionService({maxCallsPerHour:1,provider:{name:'test',transcribeAudio:async()=>{calls++;return {transcript:'合成转写'}}}}),input={mimeType:'audio/wav',dataUrl:`data:audio/wav;base64,${realWavBuffer().toString('base64')}`}
  await service.transcribe(input,'synthetic-a');await assert.rejects(()=>service.transcribe(input,'synthetic-a'),{code:'ASR_CALL_LIMIT'});await service.transcribe(input,'synthetic-b');assert.equal(calls,2)
})

test('音频失败日志白名单可定位配置/格式/取消阶段，不记录输入或转写',async()=>{
 const logs=[],logger={info:(...v)=>logs.push(v),warn:(...v)=>logs.push(v)},input={name:'私有医疗描述.wav',mimeType:'audio/wav',dataUrl:`data:audio/wav;base64,${realWavBuffer().toString('base64')}`}
 const absent=new AudioTranscriptionService({provider:null,logger});await assert.rejects(()=>absent.transcribe(input),e=>{assert.match(e.details.requestId,/^[a-f0-9-]{36}$/);return e.code==='ASR_NOT_CONFIGURED'})
 assert.equal(JSON.parse(logs[0][1]).stage,'configuration');assert.equal(JSON.parse(logs[0][1]).supplierRequestAttempted,false);assert.equal(JSON.parse(logs[0][1]).supplierResponseReceived,false)
 let calls=0;const configured=new AudioTranscriptionService({logger,provider:{name:'bailian',model:'qwen3-asr-flash',transcribeAudio:async()=>{calls++;return {transcript:'私有转写不要日志'}}}}),controller=new AbortController();controller.abort()
 await assert.rejects(()=>configured.transcribe(input,'normal-account',controller.signal),{code:'ASR_CANCELLED'});assert.equal(calls,0)
 await configured.transcribe(input,'normal-account');assert.equal(calls,1)
 assert.doesNotMatch(JSON.stringify(logs),/私有医疗|私有转写|data:audio|Authorization|normal-account/)
 assert.equal(configured.capabilities().asr.model,'qwen3-asr-flash')
})

test('Safari MP4 is truly converted into compressed MP3; invalid/no-audio/long inputs never reach ASR', async () => {
  const {execFile}=await import('node:child_process'),{promisify}=await import('node:util')
  const run=promisify(execFile),directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-compressed-test-'))
  let calls=0,received
  const service=new AudioTranscriptionService({logger:{info(){},warn(){}},provider:{name:'bailian',transcribeAudio:async audio=>{calls++;received=audio;return {transcript:'合成语音'}}}})
  const input=buffer=>({mimeType:'audio/mp4',dataUrl:`data:audio/mp4;base64,${buffer.toString('base64')}`})
  try{
    const file=path.join(directory,'audio.m4a')
    await run('ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i','sine=frequency=500:duration=2','-c:a','aac',file])
    const original=await readFile(file)
    await service.transcribe(input(original));assert.equal(calls,1);assert.equal(received.mimeType,'audio/mpeg');assert(received.buffer.length<32000*2)
    const output=path.join(directory,'converted.mp3');await writeFile(output,received.buffer)
    const probe=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-of','json',output])).stdout)
    assert.equal(probe.streams[0].codec_name,'mp3');assert.equal(probe.streams[0].sample_rate,'16000');assert.equal(probe.streams[0].channels,1)
    await assert.rejects(()=>service.transcribe(input(realWavBuffer())),{code:'AUDIO_DECODE_FAILED'})
    const broken=Buffer.from(original.subarray(0,40));await assert.rejects(()=>service.transcribe(input(broken)),{code:'AUDIO_DECODE_FAILED'})
    const video=path.join(directory,'video.mp4')
    await run('ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i','color=size=16x16:duration=1','-an',video])
    const videoBytes=await readFile(video);await assert.rejects(()=>service.transcribe(input(videoBytes)),{code:'AUDIO_DECODE_FAILED'})
    await run('ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i','sine=frequency=500:duration=92','-c:a','aac',file])
    const long=await readFile(file);await assert.rejects(()=>service.transcribe(input(long)),{code:'AUDIO_TOO_LARGE'})
    const controller=new AbortController(),cancelled=service.transcribe(input(original),null,controller.signal)
    setTimeout(()=>controller.abort(),5);await assert.rejects(cancelled,{code:'ASR_CANCELLED'});assert.equal(calls,1)
  }finally{await rm(directory,{recursive:true,force:true})}
})
