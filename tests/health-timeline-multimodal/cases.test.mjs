import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { cases, requiredCaseFields } from './cases.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

test('专项清单覆盖 A01-A12、B01-B16、P01-P18、M01-M06 共 52 例', () => {
  assert.equal(cases.length, 52)
  const expected = [
    ...Array.from({ length: 12 }, (_, i) => `A${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 16 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 18 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`),
    ...Array.from({ length: 6 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`)
  ]
  assert.deepEqual(cases.map(({ caseId }) => caseId), expected)
})

test('每例都包含可采集实际结果的完整字段且 caseId 唯一', () => {
  assert.equal(new Set(cases.map(({ caseId }) => caseId)).size, cases.length)
  for (const item of cases) {
    for (const field of requiredCaseFields) assert.ok(Object.hasOwn(item, field), `${item.caseId} 缺少 ${field}`)
    assert.ok(Array.isArray(item.expectedFacts))
    assert.ok(Array.isArray(item.forbiddenFacts))
    assert.ok(Array.isArray(item.actualFacts))
    assert.ok(Array.isArray(item.actualTimelineRows))
    assert.ok(Array.isArray(item.evidence))
  }
})

test('语音、照片和多模态结果必须分开统计', () => {
  const modalities = new Set(cases.map(({ modality }) => modality))
  assert.deepEqual([...modalities].sort(), ['controlled_audio', 'photo', 'photo_plus_audio', 'transcript_text'])
})

test('普通时间轴图片先经首次记录表单进入统一预处理，快捷语音仍不伪装成图片 E2E', async () => {
  const quick = await readFile(path.join(root, 'src/pages/HealthEventDetail/components/QuickVoiceRecordFlow.tsx'), 'utf8')
  const first = await readFile(path.join(root, 'src/pages/HealthEventDetail/components/FirstRecordComposer.tsx'), 'utf8')
  assert.doesNotMatch(quick, /type="file"|accept="image/)
  assert.doesNotMatch(quick, /onAttachment|attachments|addAttachment/)
  assert.match(first, /prepareHealthImage/)
  assert.match(first, /image\/heic,image\/heif/)
})

test('当前图片路径使用统一压缩并为 HEIC 提供转换或明确降级', async () => {
  const first = await readFile(path.join(root, 'src/pages/HealthEventDetail/components/FirstRecordComposer.tsx'), 'utf8')
  const processing = await readFile(path.join(root, 'src/features/health-attachments/prepareHealthImage.ts'), 'utf8')
  assert.match(first, /prepareHealthImage/)
  assert.match(processing, /createImageBitmap/)
  assert.match(processing, /imageOrientation: 'from-image'/)
  assert.match(processing, /HEIC\/HEIF/)
  assert.match(processing, /canvasBlob/)
})

test('浏览器语音链路依赖 Web Speech API，不上传原始音频', async () => {
  const quick = await readFile(path.join(root, 'src/pages/HealthEventDetail/components/QuickVoiceRecordFlow.tsx'), 'utf8')
  assert.match(quick, /SpeechRecognition|webkitSpeechRecognition/)
  assert.doesNotMatch(quick, /MediaRecorder|audio\/|Blob/)
})

test('服务端提供真实音频文件 ASR 适配器并保留未配置降级', async () => {
  const service = await readFile(path.join(root, 'server/ai/audio-transcription-service.mjs'), 'utf8')
  const provider = await readFile(path.join(root, 'server/ai/providers/openai-provider.mjs'), 'utf8')
  assert.match(service, /AUDIO_DECODE_FAILED/)
  assert.match(service, /ASR_NOT_CONFIGURED/)
  assert.match(provider, /audio\/transcriptions/)
  assert.match(provider, /FormData/)
})
