import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Mic } from 'lucide-react'
import { HohoButton } from '../../../components/design-system'
import { classifyMicrophoneFailure, formatRecordingDuration, isEmbeddedBrowserUserAgent, isValidVoiceRecording, type MicrophoneFailure } from './quickRecordPresentation'

type FlowState = 'requesting_permission' | 'recording' | 'error' | 'text_entry' | 'saving' | 'saved'
interface RecognitionEvent { results: ArrayLike<{ 0: { transcript: string } }> }
interface RecognitionErrorEvent { error?: string }
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onend: null | (() => void)
  onerror: null | ((event: RecognitionErrorEvent) => void)
  onresult: null | ((event: RecognitionEvent) => void)
  abort: () => void
  start: () => void
  stop: () => void
}
type RecognitionConstructor = new () => Recognition

interface QuickVoiceRecordFlowProps {
  onClose: () => void
  onConfirm: (transcript: string, occurredAt: string) => Promise<void>
  open: boolean
  recognitionApi?: RecognitionConstructor | null
}

const recognitionConstructor = () => {
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

export function QuickVoiceRecordFlow({ onClose, onConfirm, open, recognitionApi }: QuickVoiceRecordFlowProps) {
  const RecognitionApi = useMemo(() => recognitionApi === undefined ? recognitionConstructor() : recognitionApi, [recognitionApi])
  const embeddedBrowser = useMemo(() => isEmbeddedBrowserUserAgent(window.navigator.userAgent), [])
  const [state, setState] = useState<FlowState>('requesting_permission')
  const [transcript, setTranscriptState] = useState('')
  const [failure, setFailure] = useState<MicrophoneFailure | null>(null)
  const [seconds, setSeconds] = useState(0)
  const recognitionRef = useRef<Recognition | null>(null)
  const transcriptRef = useRef('')
  const confirmRequestedRef = useRef(false)
  const submittingRef = useRef(false)
  const sessionRef = useRef(0)
  const onCloseRef = useRef(onClose)
  const onConfirmRef = useRef(onConfirm)
  onCloseRef.current = onClose
  onConfirmRef.current = onConfirm

  const setTranscript = (value: string) => { transcriptRef.current = value; setTranscriptState(value) }

  const save = useCallback(async () => {
    const value = transcriptRef.current.trim()
    if (!value) { setState('error'); setFailure(classifyMicrophoneFailure('no-speech')); return }
    if (submittingRef.current) return
    submittingRef.current = true
    setState('saving')
    setFailure(null)
    try {
      await onConfirmRef.current(value, new Date().toISOString())
      setState('saved')
      window.setTimeout(() => onCloseRef.current(), 560)
    } catch (reason) {
      setState('error')
      setFailure({ canRetry: true, detail: reason instanceof Error ? reason.message : '请重新尝试。', kind: 'recording_failed', title: '保存失败' })
      submittingRef.current = false
    }
  }, [])

  const stopSession = useCallback((discard = false) => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) discard ? recognition.abort() : recognition.stop()
  }, [])

  const startListening = useCallback(() => {
    if (!RecognitionApi || submittingRef.current) return
    sessionRef.current += 1
    stopSession(true)
    const currentSession = sessionRef.current + 1
    sessionRef.current = currentSession
    confirmRequestedRef.current = false
    setFailure(null)
    setSeconds(0)
    setTranscript('')
    setState('requesting_permission')
    const recognition = new RecognitionApi()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      if (sessionRef.current !== currentSession) return
      let next = ''
      for (let index = 0; index < event.results.length; index += 1) next += event.results[index][0].transcript
      setTranscript(next)
      setState('recording')
    }
    recognition.onerror = (event) => {
      if (sessionRef.current !== currentSession || confirmRequestedRef.current) return
      sessionRef.current += 1
      recognitionRef.current = null
      setState('error')
      setFailure(classifyMicrophoneFailure(event.error))
    }
    recognition.onend = () => {
      if (sessionRef.current !== currentSession) return
      recognitionRef.current = null
      if (confirmRequestedRef.current) void save()
      else {
        setState('error')
        setFailure(classifyMicrophoneFailure('recording-ended'))
      }
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setState('recording')
    } catch (reason) {
      recognitionRef.current = null
      setState('error')
      setFailure(classifyMicrophoneFailure(reason instanceof DOMException ? reason.name : undefined))
    }
  }, [RecognitionApi, save, stopSession])

  useEffect(() => {
    if (!open) return
    submittingRef.current = false
    if (RecognitionApi) startListening()
    else { setState('error'); setFailure(classifyMicrophoneFailure('unsupported')) }
    return () => {
      sessionRef.current += 1
      stopSession(true)
    }
  }, [RecognitionApi, open, startListening, stopSession])

  useEffect(() => {
    if (!open || state !== 'recording') return
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [open, state])

  if (!open) return null

  const cancel = () => {
    sessionRef.current += 1
    stopSession(true)
    setTranscript('')
    onClose()
  }
  const confirm = () => {
    if (submittingRef.current) return
    confirmRequestedRef.current = true
    if (recognitionRef.current) stopSession()
    else void save()
  }

  const useTextEntry = () => {
    sessionRef.current += 1
    stopSession(true)
    setFailure(null)
    setSeconds(0)
    setTranscript('')
    setState('text_entry')
  }

  if (state === 'error') {
    const visibleFailure = failure ?? classifyMicrophoneFailure()
    return (
      <section aria-label="快捷记录" aria-live="polite" className="quick-record-panel quick-record-panel-error">
        <div aria-hidden="true" className="quick-record-pulse"><Mic size={19} /></div>
        <div className="quick-record-failure" role="alert">
          <strong>{visibleFailure.title}</strong>
          <p>{visibleFailure.detail}</p>
          {embeddedBrowser && <p className="quick-record-browser-hint">建议使用 Safari 或 Chrome 打开 HOOOHO 后重试。</p>}
        </div>
        <div className="quick-record-error-actions">
          <button className="quick-record-cancel" onClick={cancel} type="button">取消</button>
          {visibleFailure.canRetry && <HohoButton onClick={startListening} variant="secondary">重新尝试</HohoButton>}
          <HohoButton onClick={useTextEntry}>改用文字记录</HohoButton>
        </div>
      </section>
    )
  }

  const textEntry = state === 'text_entry'
  const validRecording = isValidVoiceRecording(seconds, transcript, state === 'recording')

  return (
    <section aria-label="快捷记录" aria-live="polite" className={`quick-record-panel ${state === 'saved' ? 'is-saved' : ''}`}>
      <div aria-hidden="true" className={`quick-record-pulse ${state === 'recording' ? 'is-listening' : ''}`}><Mic size={19} /></div>
      {textEntry ? <strong className="quick-record-text-title">文字记录</strong> : <>
        <div className={`quick-record-wave ${state === 'recording' ? 'is-listening' : ''}`} aria-hidden="true">{Array.from({ length: 13 }, (_, index) => <span key={index} />)}</div>
        <span className="quick-record-duration" aria-label={`录音时长 ${formatRecordingDuration(seconds)}`}>{formatRecordingDuration(seconds)}</span>
      </>}
      <div className="quick-record-transcript">
        {textEntry
          ? <textarea aria-label="快捷记录文字" className="hoho-textarea" onChange={(event) => setTranscript(event.target.value)} placeholder="输入要记录的内容" value={transcript} />
          : <p>{transcript || (state === 'requesting_permission' ? '正在启动麦克风…' : '请开始说话')}</p>}
      </div>
      <div className="quick-record-actions">
        <button className="quick-record-cancel" disabled={state === 'saving' || state === 'saved'} onClick={cancel} type="button">取消</button>
        <HohoButton aria-label="确认快捷记录" className="quick-record-confirm" disabled={textEntry ? !transcript.trim() : !validRecording} onClick={confirm}><Check size={21} /></HohoButton>
      </div>
    </section>
  )
}
