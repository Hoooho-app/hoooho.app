export type VoiceAvailability =
  | 'available'
  | 'wechat_unsupported'
  | 'browser_unsupported'
  | 'insecure_context'

export interface BrowserVoiceCapability {
  availability: VoiceAvailability
  canAttemptMicrophone: boolean
  hasGetUserMedia: boolean
  hasMediaDevices: boolean
  hasSpeechRecognition: boolean
  isSecureContext: boolean
  isWechat: boolean
}

export interface BrowserVoiceCapabilityInput {
  hasGetUserMedia: boolean
  hasMediaDevices: boolean
  hasSpeechRecognition: boolean
  isSecureContext: boolean
  userAgent: string
}

export const isWechatWebView = (userAgent: string) => /MicroMessenger/i.test(userAgent)

export function evaluateBrowserVoiceCapability(input: BrowserVoiceCapabilityInput): BrowserVoiceCapability {
  const isWechat = isWechatWebView(input.userAgent)
  let availability: VoiceAvailability = 'available'
  if (isWechat) availability = 'wechat_unsupported'
  else if (!input.isSecureContext) availability = 'insecure_context'
  else if (!input.hasMediaDevices || !input.hasGetUserMedia || !input.hasSpeechRecognition) availability = 'browser_unsupported'
  return {
    ...input,
    availability,
    canAttemptMicrophone: availability === 'available',
    isWechat
  }
}

export function getBrowserVoiceCapability(): BrowserVoiceCapability {
  const speechWindow = window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  return evaluateBrowserVoiceCapability({
    hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
    hasMediaDevices: Boolean(navigator.mediaDevices),
    hasSpeechRecognition: Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition),
    isSecureContext: window.isSecureContext,
    userAgent: navigator.userAgent
  })
}
