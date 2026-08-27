import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Mic } from 'lucide-react'
import { HohoButton } from '../../../components/design-system'
import { getBrowserVoiceCapability, type BrowserVoiceCapability, type QuickRecordCandidate } from '../../../features/quick-record'
import { classifyMicrophoneFailure, formatRecordingDuration, isValidVoiceRecording, type MicrophoneFailure } from './quickRecordPresentation'

type FlowState = 'requesting_permission' | 'recording' | 'error' | 'text_entry' | 'previewing' | 'review' | 'voice_help' | 'browser_help' | 'saving' | 'saved'
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
  onPreview?: (transcript: string, occurredAt: string) => Promise<QuickRecordCandidate[]>
  open: boolean
  recognitionApi?: RecognitionConstructor | null
  voiceCapability?: BrowserVoiceCapability
}

const recognitionConstructor = () => {
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

const wechatHintKey = 'hoooho-wechat-voice-hint-seen'

export function QuickVoiceRecordFlow({ onClose, onConfirm, onPreview, open, recognitionApi, voiceCapability }: QuickVoiceRecordFlowProps) {
  const capability = useMemo(() => voiceCapability ?? getBrowserVoiceCapability(), [voiceCapability])
  const RecognitionApi = useMemo(() => recognitionApi === undefined ? recognitionConstructor() : recognitionApi, [recognitionApi])
  const [state, setState] = useState<FlowState>('requesting_permission')
  const [transcript, setTranscriptState] = useState('')
  const [failure, setFailure] = useState<MicrophoneFailure | null>(null)
  const [inputError, setInputError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [candidates, setCandidates] = useState<QuickRecordCandidate[]>([])
  const [showWechatHint, setShowWechatHint] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
  const transcriptRef = useRef('')
  const occurredAtRef = useRef('')
  const confirmRequestedRef = useRef(false)
  const submittingRef = useRef(false)
  const sessionRef = useRef(0)
  const onCloseRef = useRef(onClose)
  const onConfirmRef = useRef(onConfirm)
  const onPreviewRef = useRef(onPreview)
  onCloseRef.current = onClose
  onConfirmRef.current = onConfirm
  onPreviewRef.current = onPreview

  const setTranscript = (value: string) => { transcriptRef.current = value; setTranscriptState(value) }

  const saveFinal = useCallback(async () => {
    const value = transcriptRef.current.trim()
    if (!value || submittingRef.current) return
    submittingRef.current = true
    setState('saving')
    setInputError('')
    try {
      await onConfirmRef.current(value, occurredAtRef.current || new Date().toISOString())
      setState('saved')
      window.setTimeout(() => onCloseRef.current(), 560)
    } catch (reason) {
      setState('text_entry')
      setInputError(reason instanceof Error ? reason.message : '保存失败，请重新尝试。')
      submittingRef.current = false
    }
  }, [])

  const prepareNaturalInput = useCallback(async () => {
    const value = transcriptRef.current.trim()
    if (!value || submittingRef.current) return
    const occurredAt = new Date().toISOString()
    occurredAtRef.current = occurredAt
    if (!onPreviewRef.current) { await saveFinal(); return }
    submittingRef.current = true
    setState('previewing')
    setInputError('')
    try {
      const preview = await onPreviewRef.current(value, occurredAt)
      if (!preview.length) throw new Error('暂未识别到健康记录，请补充发生了什么、时间或数值。')
      occurredAtRef.current = preview[0].occurredAt
      setCandidates(preview)
      setState('review')
    } catch (reason) {
      setState('text_entry')
      setInputError(reason instanceof Error ? reason.message : '自动整理失败，请重新尝试。')
    } finally {
      submittingRef.current = false
    }
  }, [saveFinal])

  const stopSession = useCallback((discard = false) => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) discard ? recognition.abort() : recognition.stop()
  }, [])

  const startListening = useCallback(() => {
    if (!capability.canAttemptMicrophone) { setState('voice_help'); return }
    if (!RecognitionApi || submittingRef.current) { setState('error'); setFailure(classifyMicrophoneFailure('unsupported')); return }
    sessionRef.current += 1
    stopSession(true)
    const currentSession = sessionRef.current + 1
    sessionRef.current = currentSession
    confirmRequestedRef.current = false
    setFailure(null)
    setInputError('')
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
      if (confirmRequestedRef.current) void prepareNaturalInput()
      else { setState('error'); setFailure(classifyMicrophoneFailure('recording-ended')) }
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
  }, [RecognitionApi, capability.canAttemptMicrophone, prepareNaturalInput, stopSession])

  useEffect(() => {
    if (!open) return
    submittingRef.current = false
    setCandidates([])
    setInputError('')
    if (capability.isWechat) {
      setState('text_entry')
      try {
        const unseen = sessionStorage.getItem(wechatHintKey) !== '1'
        setShowWechatHint(unseen)
        if (unseen) sessionStorage.setItem(wechatHintKey, '1')
      } catch { setShowWechatHint(true) }
    } else if (!capability.canAttemptMicrophone) setState('text_entry')
    else startListening()
    return () => {
      sessionRef.current += 1
      stopSession(true)
    }
  }, [capability.canAttemptMicrophone, capability.isWechat, open, startListening, stopSession])

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
  const confirmVoice = () => {
    if (submittingRef.current) return
    confirmRequestedRef.current = true
    if (recognitionRef.current) stopSession()
    else void prepareNaturalInput()
  }
  const useTextEntry = () => {
    sessionRef.current += 1
    stopSession(true)
    setFailure(null)
    setInputError('')
    setSeconds(0)
    setState('text_entry')
  }

  if (state === 'voice_help' || state === 'browser_help') {
    const browserHelp = state === 'browser_help'
    return (
      <section aria-label="快捷记录" aria-live="polite" className="quick-record-panel quick-record-panel-help">
        <div className="quick-record-help-copy">
          <strong>{browserHelp ? '在系统浏览器中继续' : capability.isWechat ? '微信内暂不支持语音记录' : capability.availability === 'insecure_context' ? '当前页面无法安全访问麦克风' : '当前浏览器暂不支持语音记录'}</strong>
          {browserHelp
            ? <p>点击微信右上角 ···，选择“在默认浏览器中打开”或相近选项。打开后即可使用语音记录。</p>
            : <><p>你可以直接输入文字，HOOOHO 会按同样的方式自动整理成记录。</p><p>使用 Safari 或 Chrome 打开 HOOOHO 后，可以使用语音记录。</p></>}
        </div>
        <div className="quick-record-error-actions">
          <button className="quick-record-cancel" onClick={cancel} type="button">取消</button>
          {browserHelp ? <HohoButton onClick={() => setState('voice_help')} variant="secondary">返回</HohoButton> : <HohoButton onClick={() => setState('browser_help')} variant="secondary">如何在浏览器打开</HohoButton>}
          <HohoButton onClick={useTextEntry}>改用文字记录</HohoButton>
        </div>
      </section>
    )
  }

  if (state === 'error') {
    const visibleFailure = failure ?? classifyMicrophoneFailure()
    return (
      <section aria-label="快捷记录" aria-live="polite" className="quick-record-panel quick-record-panel-error">
        <div aria-hidden="true" className="quick-record-pulse"><Mic size={19} /></div>
        <div className="quick-record-failure" role="alert"><strong>{visibleFailure.title}</strong><p>{visibleFailure.detail}</p></div>
        <div className="quick-record-error-actions">
          <button className="quick-record-cancel" onClick={cancel} type="button">取消</button>
          {visibleFailure.canRetry && <HohoButton onClick={startListening} variant="secondary">重新尝试</HohoButton>}
          <HohoButton onClick={useTextEntry}>改用文字记录</HohoButton>
        </div>
      </section>
    )
  }

  if (state === 'review') {
    return (
      <section aria-label="快捷记录" aria-live="polite" className="quick-record-panel quick-record-panel-review">
        <div className="quick-record-review-heading"><strong>识别到 1 条记录 · {Math.max(0, (candidates[0]?.fields.length ?? 1) - 1)} 项信息</strong><p>{transcript}</p></div>
        <div className="quick-record-candidates">{candidates.map((candidate) => <article key={candidate.id}><strong>{candidate.title}</strong>{candidate.fields.map((field, index) => <p key={`${field.label}-${index}`}><span>{field.label}</span>{field.value}</p>)}</article>)}</div>
        <div className="quick-record-error-actions"><button className="quick-record-cancel" onClick={useTextEntry} type="button">修改</button><HohoButton onClick={() => void saveFinal()}>确认记录</HohoButton></div>
      </section>
    )
  }

  if (state === 'saving' || state === 'saved') {
    return <section aria-label="快捷记录" aria-live="polite" className={`quick-record-panel quick-record-panel-status ${state === 'saved' ? 'is-saved' : ''}`}><Check aria-hidden="true" size={21} /><strong>{state === 'saved' ? '已记录' : '正在保存…'}</strong></section>
  }

  const textEntry = state === 'text_entry' || state === 'previewing'
  const validRecording = isValidVoiceRecording(seconds, transcript, state === 'recording')
  if (textEntry) {
    return (
      <section aria-label="快捷记录" aria-live="polite" className="quick-record-panel quick-record-panel-text">
        {showWechatHint && <p className="quick-record-wechat-hint"><strong>正在微信内打开</strong>文字记录可正常使用，语音记录需要使用系统浏览器。</p>}
        <label className="quick-record-natural-input"><strong>写下发生了什么</strong><textarea aria-label="快捷记录文字" className="hoho-textarea" disabled={state === 'previewing'} onChange={(event) => { setTranscript(event.target.value); setInputError('') }} placeholder="例如：晚上九点给她吃了5毫升美林，刚刚量了38.5度" value={transcript} /></label>
        {inputError && <p className="quick-record-input-error" role="alert">{inputError}</p>}
        <div className="quick-record-text-actions"><button className="quick-record-cancel" disabled={state === 'previewing'} onClick={cancel} type="button">取消</button><button className="quick-record-voice-link" disabled={state === 'previewing'} onClick={() => capability.canAttemptMicrophone ? startListening() : setState('voice_help')} type="button"><Mic size={16} />想用语音记录？</button><HohoButton disabled={!transcript.trim() || state === 'previewing'} onClick={() => void prepareNaturalInput()}>{state === 'previewing' ? '正在整理…' : '自动整理'}</HohoButton></div>
      </section>
    )
  }

  return (
    <section aria-label="快捷记录" aria-live="polite" className="quick-record-panel">
      <div aria-hidden="true" className={`quick-record-pulse ${state === 'recording' ? 'is-listening' : ''}`}><Mic size={19} /></div>
      <div className={`quick-record-wave ${state === 'recording' ? 'is-listening' : ''}`} aria-hidden="true">{Array.from({ length: 13 }, (_, index) => <span key={index} />)}</div>
      <span className="quick-record-duration" aria-label={`录音时长 ${formatRecordingDuration(seconds)}`}>{formatRecordingDuration(seconds)}</span>
      <div className="quick-record-transcript"><p>{transcript || (state === 'requesting_permission' ? '正在启动麦克风…' : '请开始说话')}</p></div>
      <div className="quick-record-actions"><button className="quick-record-cancel" onClick={cancel} type="button">取消</button><button className="quick-record-voice-link" onClick={useTextEntry} type="button">改用文字记录</button><HohoButton aria-label="确认快捷记录" className="quick-record-confirm" disabled={!validRecording} onClick={confirmVoice}><Check size={21} /></HohoButton></div>
    </section>
  )
}
