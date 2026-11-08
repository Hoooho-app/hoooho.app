import { LiveAudioPreviewService } from './live-audio-preview.mjs'
import { currentSeedHome } from './providers/seed-home-scope.mjs'
import { seedASRConfiguration, seedASRModel, seedLiveSocket } from './providers/seed-asr-provider.mjs'

export class SeedLiveAudioPreviewService extends LiveAudioPreviewService {
  constructor(options = {}) {
    super(options)
    this.upstreamSocket = options.socketFactory
    this.socketFactory = null
  }

  configuration() {
    const scope = currentSeedHome()
    return scope ? scope.models.liveAudio() : seedASRConfiguration(this.env)
  }

  capabilities() {
    try {
      this.configuration()
      return { configured: true, model: seedASRModel }
    } catch {
      return { configured: false, model: seedASRModel }
    }
  }

  async open(accountId, memberId, signal) {
    if (!this.socketFactory) {
      let factory = this.upstreamSocket
      if (!factory) {
        const { default: WebSocket } = await import('ws')
        factory = (url, options) => new WebSocket(url, options)
      }
      this.socketFactory = (_, { agent }) => seedLiveSocket(factory, this.configuration(), agent)
    }
    return super.open(accountId, memberId, signal)
  }
}

export function createLiveAudioPreviewService(options = {}) {
  return (options.env ?? process.env).ASR_PROVIDER === 'seed'
    ? new SeedLiveAudioPreviewService(options)
    : new LiveAudioPreviewService(options)
}
