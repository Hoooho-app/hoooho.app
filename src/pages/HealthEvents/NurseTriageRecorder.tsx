import { Mic, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { getBrowserVoiceCapability } from '../../features/quick-record'
import { classifyMicrophoneFailure } from '../HealthEventDetail/components/quickRecordPresentation'
import { NurseTriageDesk } from './NurseTriageDesk'
import {
  canStartNurseHandoff,
  transitionNurseTriage,
  type NurseTriageAction,
  type NurseTriageState
} from './nurseTriageMachine'

interface RecognitionResultLike { 0: { transcript: string } }
interface RecognitionEventLike { results: ArrayLike<RecognitionResultLike> }
interface RecognitionErrorEventLike { error?: string }
interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: null | (() => void)
  onerror: null | ((event: RecognitionErrorEventLike) => void)
  onresult: null | ((event: RecognitionEventLike) => void)
  abort: () => void
  start: () => void
  stop: () => void
}
type RecognitionConstructor = new () => RecognitionLike

const getRecognitionConstructor = () => {
  const voiceWindow = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return voiceWindow.SpeechRecognition || voiceWindow.webkitSpeechRecognition
}

const appendTranscript = (current: string, addition: string) => {
  const prefix = current.trim()
  const next = addition.trim()
  if (!prefix) return next
  if (!next) return prefix
  return `${prefix}${/[，。！？,.!?]$/.test(prefix) ? '' : '，'}${next}`
}

interface NurseTriageRecorderProps {
  currentMemberId: string
  disabled?: boolean
  onSave: (transcript: string, occurredAt: string) => Promise<void>
  reducedMotion: boolean
}

export function NurseTriageRecorder({ currentMemberId, disabled = false, onSave, reducedMotion }: NurseTriageRecorderProps) {
  const [state, setState] = useState<NurseTriageState>('idle')
  const [deskOverride, setDeskOverride] = useState<NurseTriageState | null>(null)
  const [transcript, setTranscriptState] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState('')
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationFrameRef = useRef(0)
  const silenceTimerRef = useRef(0)
  const stateRef = useRef<NurseTriageState>('idle')
  const sessionRef = useRef(0)
  const userStoppedRef = useRef(false)
  const transcriptRef = useRef('')
  const transcriptPrefixRef = useRef('')
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  const move = useCallback((action: NurseTriageAction) => {
    setState((current) => {
      const next = transitionNurseTriage(current, action)
      stateRef.current = next
      return next
    })
  }, [])

  const setTranscript = useCallback((value: string) => {
    transcriptRef.current = value
    setTranscriptState(value)
  }, [])

  const stopAudioMeter = useCallback(() => {
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = 0
    setAudioLevel(0)
    const context = audioContextRef.current
    audioContextRef.current = null
    if (context && context.state !== 'closed') void context.close()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const stopRecognition = useCallback((discard = false) => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (!recognition) return
    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    if (discard) recognition.abort()
    else recognition.stop()
  }, [])

  const stopRecording = useCallback((discard = false) => {
    window.clearTimeout(silenceTimerRef.current)
    stopRecognition(discard)
    stopAudioMeter()
  }, [stopAudioMeter, stopRecognition])

  useEffect(() => () => {
    sessionRef.current += 1
    stopRecording(true)
  }, [stopRecording])

  useEffect(() => {
    sessionRef.current += 1
    stopRecording(true)
    setTranscript('')
    setError('')
    setDeskOverride(null)
    stateRef.current = 'idle'
    setState('idle')
  }, [currentMemberId, setTranscript, stopRecording])

  useEffect(() => {
    if (!canStartNurseHandoff(state) || reducedMotion) return
    const delay = state === 'saved' ? 120_000 : 300_000 + Math.round(Math.random() * 120_000)
    let shiftedTimer = 0
    const handoffTimer = window.setTimeout(() => {
      if (!canStartNurseHandoff(stateRef.current) || document.hidden) return
      setDeskOverride('handoff')
      shiftedTimer = window.setTimeout(() => setDeskOverride('shifted'), 1_500)
    }, delay)
    return () => {
      window.clearTimeout(handoffTimer)
      window.clearTimeout(shiftedTimer)
    }
  }, [reducedMotion, state])

  const startAudioMeter = useCallback((stream: MediaStream) => {
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextConstructor) return
    const context = new AudioContextConstructor()
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.frequencyBinCount)
    audioContextRef.current = context
    let lastSampleAt = 0

    const measure = (timestamp: number) => {
      if (document.hidden || !streamRef.current) return
      if (timestamp - lastSampleAt >= 120) {
        analyser.getByteTimeDomainData(samples)
        let energy = 0
        samples.forEach((sample) => { const normalized = (sample - 128) / 128; energy += normalized * normalized })
        setAudioLevel(Math.min(1, Math.sqrt(energy / samples.length) * 5))
        lastSampleAt = timestamp
      }
      animationFrameRef.current = window.requestAnimationFrame(measure)
    }
    animationFrameRef.current = window.requestAnimationFrame(measure)
  }, [])

  const markSpeechActivity = useCallback(() => {
    window.clearTimeout(silenceTimerRef.current)
    if (stateRef.current === 'speechPaused') move('speechResumed')
    silenceTimerRef.current = window.setTimeout(() => {
      if (stateRef.current === 'listening') move('speechPaused')
    }, 1_500)
  }, [move])

  const beginListening = useCallback(async (continueExisting = false) => {
    if (disabled) return
    const capability = getBrowserVoiceCapability()
    const RecognitionApi = getRecognitionConstructor()
    sessionRef.current += 1
    const currentSession = sessionRef.current
    userStoppedRef.current = false
    setDeskOverride(null)
    setError('')
    if (!continueExisting) setTranscript('')
    transcriptPrefixRef.current = continueExisting ? transcriptRef.current.trim() : ''
    move(continueExisting && (stateRef.current === 'reviewing' || stateRef.current === 'awaitingConfirmation') ? 'continueSpeaking' : 'start')

    if (!capability.canAttemptMicrophone || !RecognitionApi) {
      const failure = classifyMicrophoneFailure('unsupported')
      setError(`${failure.title}。${failure.detail}`)
      move('fail')
      return
    }

    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 60 : 380))
      ])
      if (sessionRef.current !== currentSession) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      move('attentionComplete')
      if (!reducedMotion) await new Promise<void>((resolve) => window.setTimeout(resolve, 300))
      if (sessionRef.current !== currentSession) return
      startAudioMeter(stream)

      const recognition = new RecognitionApi()
      recognition.lang = 'zh-CN'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.onresult = (event) => {
        if (sessionRef.current !== currentSession) return
        let spoken = ''
        for (let index = 0; index < event.results.length; index += 1) spoken += event.results[index][0].transcript
        setTranscript(appendTranscript(transcriptPrefixRef.current, spoken))
        markSpeechActivity()
      }
      recognition.onerror = (event) => {
        if (sessionRef.current !== currentSession || userStoppedRef.current) return
        const failure = classifyMicrophoneFailure(event.error)
        setError(`${failure.title}。${failure.detail}`)
        move('fail')
        stopRecording(true)
      }
      recognition.onend = () => {
        if (sessionRef.current !== currentSession || userStoppedRef.current) return
        recognitionRef.current = null
        const failure = classifyMicrophoneFailure('recording-ended')
        setError(`${failure.title}。${failure.detail}`)
        move('fail')
        stopAudioMeter()
      }
      recognitionRef.current = recognition
      recognition.start()
      move('microphoneReady')
    } catch (reason) {
      if (sessionRef.current !== currentSession) return
      const code = reason instanceof DOMException ? reason.name : undefined
      const failure = classifyMicrophoneFailure(code)
      setError(`${failure.title}。${failure.detail}`)
      move('fail')
      stopRecording(true)
    }
  }, [disabled, markSpeechActivity, move, reducedMotion, setTranscript, startAudioMeter, stopAudioMeter, stopRecording])

  const finishSpeaking = () => {
    userStoppedRef.current = true
    stopRecording()
    if (!transcriptRef.current.trim()) {
      setError('还没有听到可保存的内容，可以继续说或直接输入文字。')
      move('fail')
      return
    }
    move('finishSpeaking')
  }

  const save = async () => {
    const value = transcriptRef.current.trim()
    if (!value || stateRef.current === 'saving') return
    setError('')
    move('confirmSave')
    try {
      await onSaveRef.current(value, new Date().toISOString())
      move('saveSucceeded')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重新尝试。')
      move('saveFailed')
    }
  }

  const useTextFallback = () => {
    if (!transcriptRef.current.trim()) setTranscript('')
    move('editTranscript')
  }

  const visualState = deskOverride ?? state
  const reviewState = state === 'reviewing' || state === 'awaitingConfirmation'
  const listeningState = state === 'listening' || state === 'speechPaused'
  const statusCopy = useMemo(() => {
    if (state === 'idle') return { title: '发生什么，都可以告诉我们', detail: '' }
    if (state === 'attention' || state === 'preparing') return { title: '准备聆听…', detail: '' }
    if (listeningState) return { title: '我们正在听', detail: transcript || '请开始说话' }
    if (reviewState) return { title: '请核对原话', detail: '' }
    if (state === 'saving') return { title: '正在保存…', detail: '' }
    if (state === 'saved') return { title: '已经替你记下了', detail: '需要时，可以切回列表查看' }
    if (state === 'error') return { title: '可以改用文字记录', detail: '' }
    return { title: '', detail: '' }
  }, [listeningState, reviewState, state, transcript])

  return (
    <section aria-label="健康事件语音记录" className="nurse-triage-recorder">
      <NurseTriageDesk
        audioLevel={audioLevel}
        idleAnimationResetKey={currentMemberId}
        reducedMotion={reducedMotion}
        state={visualState}
      />
      <div aria-live="polite" className="nurse-triage-status">
        <h3>{statusCopy.title}</h3>
        {statusCopy.detail && <p>{statusCopy.detail}</p>}
      </div>

      {error && <StatusNotice title="记录没有继续" tone="error">{error}</StatusNotice>}

      {(reviewState || state === 'error') && (
        <label className="nurse-triage-transcript-card">
          <span>你的原话</span>
          <textarea
            aria-label="原始转写"
            autoFocus={reviewState}
            onChange={(event) => {
              setTranscript(event.target.value)
              setError('')
              move('editTranscript')
            }}
            placeholder="把发生的事写在这里"
            value={transcript}
          />
        </label>
      )}

      <div className="nurse-triage-actions">
        {state === 'idle' && <HohoButton disabled={disabled} fullWidth onClick={() => void beginListening(false)}>开始说话</HohoButton>}
        {(state === 'attention' || state === 'preparing') && <HohoButton disabled fullWidth>正在准备…</HohoButton>}
        {listeningState && <HohoButton fullWidth onClick={finishSpeaking}><Mic aria-hidden="true" size={18} />说完了</HohoButton>}
        {reviewState && (
          <>
            <HohoButton onClick={() => void beginListening(true)} variant="secondary">继续补充</HohoButton>
            <HohoButton disabled={!transcript.trim()} onClick={() => void save()}>确认保存</HohoButton>
          </>
        )}
        {state === 'saving' && <HohoButton disabled fullWidth loading>正在保存…</HohoButton>}
        {state === 'saved' && <HohoButton fullWidth onClick={() => void beginListening(false)}>继续说一件事</HohoButton>}
        {state === 'error' && (
          <>
            <HohoButton onClick={() => void beginListening(Boolean(transcript.trim()))} variant="secondary"><RotateCcw aria-hidden="true" size={17} />重新尝试</HohoButton>
            <HohoButton disabled={!transcript.trim()} onClick={transcript.trim() ? () => move('editTranscript') : useTextFallback}>确认原话</HohoButton>
          </>
        )}
      </div>
    </section>
  )
}
