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
