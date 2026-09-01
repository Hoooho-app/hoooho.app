import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, Mic, Pencil } from 'lucide-react'
import { HohoButton } from '../../../components/design-system'
import { getBrowserVoiceCapability, type BrowserVoiceCapability, type QuickRecordCandidate } from '../../../features/quick-record'
import { classifyMicrophoneFailure, formatRecordingDuration, isValidVoiceRecording, quickRecordSaveErrorMessage, type MicrophoneFailure } from './quickRecordPresentation'

type FlowState = 'requesting_permission' | 'recording' | 'error' | 'text_entry' | 'previewing' | 'review' | 'voice_help' | 'browser_help' | 'saving' | 'saved'
export type QuickRecordPresentation = 'default' | 'nurse-inline'
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
  onConfirm: (transcript: string, occurredAt: string, candidates: QuickRecordCandidate[], inputChannel: QuickRecordInputChannel) => Promise<string | void>
  onIgnored?: (message: string) => void
  onPreview?: (transcript: string, occurredAt: string, inputChannel: QuickRecordInputChannel) => Promise<QuickRecordCandidate[]>
  onSaved?: (message: string) => void
  open: boolean
  presentation?: QuickRecordPresentation
  recognitionApi?: RecognitionConstructor | null
  voiceCapability?: BrowserVoiceCapability
}

export type QuickRecordInputChannel = 'voice' | 'text'

const recognitionConstructor = () => {
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

const wechatHintKey = 'hoooho-wechat-voice-hint-seen'

export function QuickVoiceRecordFlow({ onClose, onConfirm, onIgnored, onPreview, onSaved, open, presentation = 'default', recognitionApi, voiceCapability }: QuickVoiceRecordFlowProps) {
  const capability = useMemo(() => voiceCapability ?? getBrowserVoiceCapability(), [voiceCapability])
  const RecognitionApi = useMemo(() => recognitionApi === undefined ? recognitionConstructor() : recognitionApi, [recognitionApi])
  const [state, setState] = useState<FlowState>('requesting_permission')
  const [transcript, setTranscriptState] = useState('')
  const [failure, setFailure] = useState<MicrophoneFailure | null>(null)
  const [inputError, setInputError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [candidates, setCandidates] = useState<QuickRecordCandidate[]>([])
  const candidatesRef = useRef<QuickRecordCandidate[]>([])
  const [savedMessage, setSavedMessage] = useState('已记录')
  const [showWechatHint, setShowWechatHint] = useState(false)
  const [viewportHeight, setViewportHeight] = useState(() => typeof window === 'undefined' ? 0 : (window.visualViewport?.height ?? window.innerHeight))
  const recognitionRef = useRef<Recognition | null>(null)
  const transcriptRef = useRef('')
  const occurredAtRef = useRef('')
  const confirmRequestedRef = useRef(false)
  const submittingRef = useRef(false)
  const sessionRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)
  const onConfirmRef = useRef(onConfirm)
  const onIgnoredRef = useRef(onIgnored)
  const onPreviewRef = useRef(onPreview)
  const onSavedRef = useRef(onSaved)
  const inputChannelRef = useRef<QuickRecordInputChannel>('voice')
  onCloseRef.current = onClose
  onConfirmRef.current = onConfirm
  onIgnoredRef.current = onIgnored
  onPreviewRef.current = onPreview
  onSavedRef.current = onSaved

  const setTranscript = (value: string) => { transcriptRef.current = value; setTranscriptState(value) }

  const scheduleClose = useCallback((delay: number) => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      onCloseRef.current()
    }, delay)
  }, [])

  const saveFinal = useCallback(async () => {
    const value = transcriptRef.current.trim()
    if (!value || submittingRef.current || (onPreviewRef.current && !candidatesRef.current.length)) return
    submittingRef.current = true
    setState('saving')
    setInputError('')
    try {
      const message = await onConfirmRef.current(value, occurredAtRef.current || new Date().toISOString(), candidatesRef.current, inputChannelRef.current)
      const visibleMessage = presentation === 'nurse-inline' ? '记录已保存' : (message || '已记录')
      if (presentation === 'nurse-inline') setSavedMessage(visibleMessage)
      else setSavedMessage(message || '已记录')
      setState('saved')
      if (presentation === 'nurse-inline') {
        onSavedRef.current?.(visibleMessage)
        onCloseRef.current()
      } else scheduleClose(560)
    } catch (reason) {
      setState(presentation === 'nurse-inline' ? 'review' : 'text_entry')
      setInputError(quickRecordSaveErrorMessage(reason))
      submittingRef.current = false
    }
  }, [presentation, scheduleClose])

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
      const preview = await onPreviewRef.current(value, occurredAt, inputChannelRef.current)
      if (!preview.length) {
        const message = '未识别到健康信息，本次未记录'
        candidatesRef.current = []
        setCandidates([])
        setSavedMessage(message)
        onIgnoredRef.current?.(message)
        setState('saved')
        scheduleClose(900)
        return
      }
      occurredAtRef.current = preview[0].occurredAt
      candidatesRef.current = preview
      setCandidates(preview)
      setState('review')
    } catch (reason) {
      candidatesRef.current = []
      setCandidates([])
      setInputError(quickRecordSaveErrorMessage(reason))
      setState('text_entry')
    } finally {
      submittingRef.current = false
    }
  }, [saveFinal, scheduleClose])

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
    inputChannelRef.current = 'voice'
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
    candidatesRef.current = []
    setCandidates([])
    setSavedMessage('已记录')
    setInputError('')
    inputChannelRef.current = capability.canAttemptMicrophone && !capability.isWechat ? 'voice' : 'text'
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
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [capability.canAttemptMicrophone, capability.isWechat, open, startListening, stopSession])

  useEffect(() => {
    if (!open || state !== 'recording') return
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [open, state])

  useEffect(() => {
    if (!open) return
    const viewport = window.visualViewport
    const updateViewportHeight = () => setViewportHeight(viewport?.height ?? window.innerHeight)
    updateViewportHeight()
    viewport?.addEventListener('resize', updateViewportHeight)
    viewport?.addEventListener('scroll', updateViewportHeight)
    window.addEventListener('resize', updateViewportHeight)
    return () => {
      viewport?.removeEventListener('resize', updateViewportHeight)
      viewport?.removeEventListener('scroll', updateViewportHeight)
      window.removeEventListener('resize', updateViewportHeight)
    }
  }, [open])

  if (!open) return null

  const panelStyle = { '--quick-record-viewport-height': `${viewportHeight}px` } as CSSProperties

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
    inputChannelRef.current = 'text'
    setState('text_entry')
  }
  const restartListening = () => {
    candidatesRef.current = []
    setCandidates([])
    startListening()
  }

  const panelClassName = (...classes: string[]) => [
    'quick-record-panel',
    presentation === 'nurse-inline' ? 'quick-record-panel--nurse' : '',
    ...classes
  ].filter(Boolean).join(' ')

  if (state === 'voice_help' || state === 'browser_help') {
    const browserHelp = state === 'browser_help'
    return (
      <section aria-label="快捷记录" aria-live="polite" className={panelClassName('quick-record-panel-help')} style={panelStyle}>
        <div className="quick-record-help-copy">
          <strong>{browserHelp ? '在系统浏览器中继续' : capability.isWechat ? '微信内暂不支持语音记录' : capability.availability === 'insecure_context' ? '当前页面无法安全访问麦克风' : '当前浏览器暂不支持语音记录'}</strong>
          {browserHelp
            ? <p>点击微信右上角 ···，选择“在默认浏览器中打开”或相近选项。打开后即可使用语音记录。</p>
            : <><p>你可以直接输入文字，Hoooho 会按同样的方式自动整理成记录。</p><p>使用 Safari 或 Chrome 打开 Hoooho 后，可以使用语音记录。</p></>}
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
      <section aria-label="快捷记录" aria-live="polite" className={panelClassName('quick-record-panel-error')} style={panelStyle}>
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
    if (presentation === 'nurse-inline') {
      return (
        <section aria-label="核对原话" aria-live="polite" className={panelClassName('quick-record-panel-review', 'nurse-quick-record-review')} style={panelStyle}>
          <div className="nurse-quick-record-heading">
            <strong>核对原话</strong>
            <Pencil aria-hidden="true" size={18} strokeWidth={1.8} />
          </div>
          <textarea
            aria-label="编辑识别原话"
            className="nurse-quick-record-review-text"
            disabled={submittingRef.current}
            onChange={(event) => { setTranscript(event.target.value); setInputError('') }}
            value={transcript}
          />
          {inputError && <p className="quick-record-input-error" role="alert">{inputError}</p>}
          <div className="nurse-quick-record-actions">
            <button className="nurse-quick-record-secondary" disabled={submittingRef.current} onClick={restartListening} type="button">重新说</button>
            <HohoButton disabled={!transcript.trim() || submittingRef.current} onClick={() => void saveFinal()}>保存记录</HohoButton>
          </div>
        </section>
      )
    }
    return (
      <section aria-label="快捷记录" aria-live="polite" className={panelClassName('quick-record-panel-review')} style={panelStyle}>
        <div className="quick-record-review-heading"><strong>{`识别到 ${candidates.length} 条症状记录`}</strong><p>{transcript}</p></div>
        <div className="quick-record-candidates">{candidates.map((candidate) => <article key={candidate.id}><strong>{candidate.title}</strong>{candidate.fields.map((field, index) => <p key={`${field.label}-${index}`}><span>{field.label}</span>{field.value}</p>)}</article>)}</div>
        <div className="quick-record-error-actions"><button className="quick-record-cancel" onClick={useTextEntry} type="button">修改</button><HohoButton onClick={() => void saveFinal()}>确认记录</HohoButton></div>
      </section>
    )
  }

  if (state === 'saving' || state === 'saved') {
    return <section aria-label="快捷记录" aria-live="polite" className={panelClassName('quick-record-panel-status', state === 'saved' ? 'is-saved' : '')} style={panelStyle}><Check aria-hidden="true" size={21} /><strong>{state === 'saved' ? savedMessage : '正在保存…'}</strong></section>
  }

  const textEntry = state === 'text_entry' || state === 'previewing'
  const validRecording = isValidVoiceRecording(seconds, transcript, state === 'recording')
  if (textEntry) {
    return (
      <section aria-label="快捷记录" aria-live="polite" className={panelClassName('quick-record-panel-text')} style={panelStyle}>
        {showWechatHint && <p className="quick-record-wechat-hint"><strong>正在微信内打开</strong>文字记录可正常使用，语音记录需要使用系统浏览器。</p>}
        <label className="quick-record-natural-input"><strong>写下发生了什么</strong><textarea aria-label="快捷记录文字" className="hoho-textarea" disabled={state === 'previewing'} onChange={(event) => { setTranscript(event.target.value); setInputError('') }} placeholder="例如：晚上九点给她吃了5毫升美林，刚刚量了38.5度" value={transcript} /></label>
        {inputError && <p className="quick-record-input-error" role="alert">{inputError}</p>}
        <div className="quick-record-text-actions"><button className="quick-record-cancel" disabled={state === 'previewing'} onClick={cancel} type="button">取消</button><button className="quick-record-voice-link" disabled={state === 'previewing'} onClick={() => capability.canAttemptMicrophone ? startListening() : setState('voice_help')} type="button"><Mic size={16} />想用语音记录？</button><HohoButton disabled={!transcript.trim() || state === 'previewing'} onClick={() => void prepareNaturalInput()}>{state === 'previewing' ? '正在整理…' : '自动整理'}</HohoButton></div>
      </section>
    )
  }

  if (presentation === 'nurse-inline') {
    return (
      <section aria-label="快捷记录听写" aria-live="polite" className={panelClassName('nurse-quick-record-listening')} style={panelStyle}>
        <div className="nurse-quick-record-heading">
          <strong>正在听…</strong>
          <span className="quick-record-duration" aria-label={`录音时长 ${formatRecordingDuration(seconds)}`}>{formatRecordingDuration(seconds)}</span>
        </div>
        <div className={`quick-record-wave ${state === 'recording' ? 'is-listening' : ''}`} aria-hidden="true">{Array.from({ length: 21 }, (_, index) => <span key={index} />)}</div>
        <div className="quick-record-transcript"><p>{transcript || (state === 'requesting_permission' ? '正在启动麦克风…' : '请开始说话')}</p></div>
        <div className="nurse-quick-record-actions">
          <button className="nurse-quick-record-cancel" onClick={cancel} type="button">取消</button>
          <HohoButton disabled={!validRecording} onClick={confirmVoice}>结束听写</HohoButton>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="快捷记录" aria-live="polite" className={panelClassName()} style={panelStyle}>
      <div aria-hidden="true" className={`quick-record-pulse ${state === 'recording' ? 'is-listening' : ''}`}><Mic size={19} /></div>
      <div className={`quick-record-wave ${state === 'recording' ? 'is-listening' : ''}`} aria-hidden="true">{Array.from({ length: 13 }, (_, index) => <span key={index} />)}</div>
      <span className="quick-record-duration" aria-label={`录音时长 ${formatRecordingDuration(seconds)}`}>{formatRecordingDuration(seconds)}</span>
      <div className="quick-record-transcript"><p>{transcript || (state === 'requesting_permission' ? '正在启动麦克风…' : '请开始说话')}</p></div>
      <div className="quick-record-actions"><button className="quick-record-cancel" onClick={cancel} type="button">取消</button><button className="quick-record-voice-link" onClick={useTextEntry} type="button">改用文字记录</button><HohoButton aria-label="确认快捷记录" className="quick-record-confirm" disabled={!validRecording} onClick={confirmVoice}><Check size={21} /></HohoButton></div>
    </section>
  )
}
