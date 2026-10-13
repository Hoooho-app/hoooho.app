/** Observe the existing recording stream. Never requests another microphone. */
export function observeAudioLevel(stream: MediaStream, onLevel: (level: number) => void) {
  let context: AudioContext | undefined
  let frame = 0
  try {
    context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    let smoothed = 0
    const sample = () => {
      analyser.getFloatTimeDomainData(samples)
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
      const target = Math.min(1, Math.max(0, (rms - .008) * 10))
      smoothed += (target - smoothed) * (target > smoothed ? .45 : .18)
      onLevel(smoothed)
      frame = requestAnimationFrame(sample)
    }
    void context.resume().catch(() => undefined)
    sample()
    return () => { cancelAnimationFrame(frame); source.disconnect(); void context?.close().catch(() => undefined); onLevel(0) }
  } catch {
    cancelAnimationFrame(frame)
    void context?.close().catch(() => undefined)
    return () => onLevel(0)
  }
}
