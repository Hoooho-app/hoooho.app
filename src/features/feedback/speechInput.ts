export interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}

type SpeechConstructor = new () => SpeechRecognitionLike

export function getSpeechRecognitionConstructor(): SpeechConstructor | null {
  const voiceWindow = window as typeof window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }
  return voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition ?? null
}

export function speechErrorMessage(code: string) {
  if (code === 'not-allowed' || code === 'service-not-allowed') return '麦克风权限未开启。请在浏览器网站设置中允许麦克风，然后重试。'
  if (code === 'no-speech') return '没有听到清晰语音，已有文字和图片不会丢失。'
  if (code === 'audio-capture') return '没有找到可用麦克风，请检查设备设置。'
  return '语音识别失败，已有文字和图片不会丢失。'
}
