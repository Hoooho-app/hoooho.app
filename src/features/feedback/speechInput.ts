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
  if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') return '无法使用麦克风，请检查浏览器权限'
  return '没有听清，请再试一次'
}
