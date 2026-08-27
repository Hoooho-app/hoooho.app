export function formatRecordingDuration(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function recognitionErrorMessage(code?: string) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return '无法使用麦克风，请在浏览器设置中允许麦克风权限后重试'
  if (code === 'audio-capture') return '未检测到可用麦克风，请检查设备后重试'
  return '没有听清，请再说一次'
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
