export function formatRecordingDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export type MicrophoneFailureKind = 'permission_denied' | 'unsupported_environment' | 'device_unavailable' | 'device_busy' | 'recording_failed'

export interface MicrophoneFailure {
  canRetry: boolean
  detail: string
  kind: MicrophoneFailureKind
  title: string
}

export function isValidVoiceRecording(seconds: number, transcript: string, recordingActive: boolean) {
  return recordingActive && seconds >= 1 && Boolean(transcript.trim())
}

export function classifyMicrophoneFailure(code?: string): MicrophoneFailure {
  const normalized = code?.toLowerCase()
  if (normalized === 'notallowederror' || normalized === 'not-allowed' || normalized === 'service-not-allowed') {
    return { canRetry: true, detail: '请允许 HOOOHO 使用麦克风后重新尝试。', kind: 'permission_denied', title: '麦克风权限未开启' }
  }
  if (normalized === 'notfounderror' || normalized === 'audio-capture') {
    return { canRetry: true, detail: '请检查设备麦克风后重试。', kind: 'device_unavailable', title: '未检测到可用麦克风' }
  }
  if (normalized === 'notreadableerror') {
    return { canRetry: true, detail: '可能正在被其他应用占用，请稍后重试。', kind: 'device_busy', title: '麦克风暂时无法使用' }
  }
  if (normalized === 'unsupported') {
    return { canRetry: false, detail: '建议使用系统浏览器打开，或改用文字记录。', kind: 'unsupported_environment', title: '当前浏览器暂不支持录音' }
  }
  return { canRetry: true, detail: '请重新尝试，或改用文字记录。', kind: 'recording_failed', title: '录音启动失败' }
}

export function recognitionErrorMessage(code?: string) {
  const failure = classifyMicrophoneFailure(code)
  return `${failure.title}。${failure.detail}`
}

export function appendQuickRecordTranscript(current: string, transcript: string) {
  const existing = current.trimEnd()
  const addition = transcript.trim()
  if (!addition) return current
  if (!existing) return addition
  if (existing.endsWith(addition)) return existing
  return `${existing}\n${addition}`
}

export function needsNewQuickRecord(
  pending: { recordId: string; transcript: string } | null,
  transcript: string
) {
  return !pending || pending.transcript !== transcript
}
