import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AudioTranscriptionError } from './audio-transcription-error.mjs'

const run = promisify(execFile)
const ffmpeg = process.platform === 'win32' ? (await import('@ffmpeg-installer/ffmpeg')).default.path : 'ffmpeg'
const ffprobe = process.platform === 'win32' ? (await import('ffprobe-static')).default.path : 'ffprobe'
const cancelled = () => new AudioTranscriptionError('已取消转写', 499, 'ASR_CANCELLED')
const invalid = () => new AudioTranscriptionError('录音格式无法读取，请重新录音或输入文字', 422, 'AUDIO_DECODE_FAILED')
const tooLong = () => new AudioTranscriptionError('录音超过90秒，请缩短后重试', 413, 'AUDIO_TOO_LARGE')

// A RIFF/fmt/data header alone does not prove its codec is decodable. Check
// locally before dispatching any WAV to the supplier, retaining the original.
export async function validateWavAudio(audio, signal) {
  if (!['audio/wav', 'audio/x-wav'].includes(audio.mimeType)) return audio
  if (signal?.aborted) throw cancelled()
  const directory = await mkdtemp(path.join(tmpdir(), 'hoooho-wav-'))
  const source = path.join(directory, 'source.wav')
  try {
    await writeFile(source, audio.buffer)
    await run(ffmpeg, ['-nostdin', '-v', 'error', '-threads', '1', '-i', source, '-map', '0:a:0', '-vn', '-f', 'null', '-'], { signal, timeout: 8000, maxBuffer: 256 * 1024, windowsHide: true, killSignal: 'SIGKILL' })
    if (signal?.aborted) throw cancelled()
    return audio
  } catch (error) {
    if (signal?.aborted) throw cancelled()
    if (error.code === 'ENOENT') throw new AudioTranscriptionError('录音验证暂不可用，请输入文字', 503, 'ASR_AUDIO_CONVERSION_UNAVAILABLE')
    if (error.killed && error.signal === 'SIGKILL') throw new AudioTranscriptionError('录音验证超时，请重新录音或输入文字', 504, 'ASR_TIMEOUT')
    throw invalid()
  } finally { await rm(directory, { recursive: true, force: true }) }
}

// Retain immutable originals; prepare a small supplier-only MP3 for Safari MP4
// and larger PCM WAV. Sending expanded PCM across regions can consume the
// entire ASR deadline before the supplier receives the request body.
export async function normalizeMp4Audio(audio, signal) {
  const pcm = ['audio/wav', 'audio/x-wav'].includes(audio.mimeType)
  if (audio.mimeType !== 'audio/mp4' && !(pcm && audio.buffer.length > 64000)) return audio
  if (signal?.aborted) throw cancelled()
  if (!pcm && audio.buffer.subarray(4, 8).toString('ascii') !== 'ftyp') throw invalid()
  const directory = await mkdtemp(path.join(tmpdir(), 'hoooho-asr-'))
  const source = path.join(directory, pcm ? 'source.wav' : 'source.m4a'), target = path.join(directory, 'prepared.mp3')
  const options = { signal, timeout: 8000, maxBuffer: 256 * 1024, windowsHide: true, killSignal: 'SIGKILL' }
  try {
    await writeFile(source, audio.buffer)
    const probe = async file => {
      const { stdout } = await run(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', file], options)
      return JSON.parse(stdout)
    }
    const info = await probe(source)
    if (!info.streams?.some(stream => stream.codec_type === 'audio')) throw invalid()
    const duration = Number(info.format?.duration ?? info.streams.find(stream => stream.codec_type === 'audio')?.duration)
    if (Number.isFinite(duration) && duration > 91) throw tooLong()
    // -t bounds unknown-duration files as well. Probe the output before ASR.
    await run(ffmpeg, ['-nostdin', '-y', '-v', 'error', '-threads', '1', '-i', source, '-map', '0:a:0', '-vn', '-t', '92', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k', target], options)
    const output = await probe(target), seconds = Number(output.format?.duration)
    if (!Number.isFinite(seconds) || seconds <= 0) throw invalid()
    if (seconds > 91.5) throw tooLong()
    const buffer = await readFile(target)
    if (signal?.aborted) throw cancelled()
    if (!buffer.length || buffer.length > 1024 * 1024) throw invalid()
    return { name: 'recording.mp3', mimeType: 'audio/mpeg', buffer }
  } catch (error) {
    if (signal?.aborted) throw cancelled()
    if (error instanceof AudioTranscriptionError) throw error
    if (error.killed && error.signal === 'SIGKILL') throw new AudioTranscriptionError('录音准备超时，请重新录音或输入文字', 504, 'ASR_TIMEOUT')
    if (error.code === 'ENOENT') throw new AudioTranscriptionError('录音转换暂不可用，请输入文字', 503, 'ASR_AUDIO_CONVERSION_UNAVAILABLE')
    throw invalid()
  } finally { await rm(directory, { recursive: true, force: true }) }
}
