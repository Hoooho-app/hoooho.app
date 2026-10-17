export class AudioTranscriptionError extends Error {
  constructor(message, status = 400, code = 'AUDIO_TRANSCRIPTION_ERROR') { super(message); this.status = status; this.code = code }
}
