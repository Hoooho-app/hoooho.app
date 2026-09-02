import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardCheck, Copy, FileImage, Mic, RefreshCw, Send, SquarePen } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HealthCard, HealthTag, HohoButton, Typography } from '../../components/design-system'
import { downloadPromptLongImage } from '../../features/ask-ai'
import { getStoredHealthProfileSectionSnapshots } from '../../features/health-profile/utils/getHealthProfileSectionGroups'
import { buildConsultationSections, consultationCopyAll, prepareDoctorReply, type PreparedDoctorReply } from '../../features/online-consultation'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { createHealthEventSubject } from '../../services/healthEventPersonalization'
import { onlineConsultationService } from '../../services/onlineConsultations'
import { useAppStore } from '../../store/useAppStore'
import type { OnlineConsultationApiDto, OnlineConsultationStatus } from '../../types'

interface RecognitionEvent { results: ArrayLike<{ 0: { transcript: string } }> }
interface RecognitionErrorEvent { error?: string }
interface Recognition { continuous: boolean; interimResults: boolean; lang: string; onend: null | (() => void); onerror: null | ((event: RecognitionErrorEvent) => void); onresult: null | ((event: RecognitionEvent) => void); abort: () => void; start: () => void; stop: () => void }
type RecognitionConstructor = new () => Recognition

function recognitionConstructor() {
  const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
}

export function OnlineConsultationPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const token = useAppStore((state) => state.authToken)
  const { state } = useHealthEventDetail(eventId)
  const [consultation, setConsultation] = useState<OnlineConsultationApiDto | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [question, setQuestion] = useState('')
  const [supplement, setSupplement] = useState('')
  const [prepared, setPrepared] = useState<PreparedDoctorReply | null>(null)
  const [finalInstructions, setFinalInstructions] = useState('')
  const [ending, setEnding] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)

  const loadConsultation = async () => {
    if (!eventId || !token) return
    setLoadError('')
    try { setConsultation(await onlineConsultationService.get(eventId, token)) }
    catch (error) { setLoadError(error instanceof Error ? error.message : '在线问诊资料加载失败') }
  }

  useEffect(() => {
    const controller = new AbortController()
    if (eventId && token) onlineConsultationService.get(eventId, token, controller.signal).then(setConsultation).catch((error) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadError(error instanceof Error ? error.message : '在线问诊资料加载失败')
    })
    return () => { controller.abort(); recognitionRef.current?.abort() }
  }, [eventId, token])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(''), 2400)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const context = useMemo(() => {
    if (state.status !== 'success') return null
    const member = createHealthEventSubject(state.data.member)
    const profiles = getStoredHealthProfileSectionSnapshots(state.data.member.id)
    return { event: state.data.viewModel.event, member: { ...state.data.member, name: member.name }, profiles }
  }, [state])
  const sections = useMemo(() => context ? buildConsultationSections(context) : [], [context])

  const copyText = async (value: string) => {
    if (!value.trim()) { setFeedback('暂无可复制内容'); return }
    try { await navigator.clipboard.writeText(value); setFeedback('已复制') }
    catch { setFeedback('复制失败，请长按选择文字复制') }
  }

  const exportMaterials = (value: string) => {
    try { downloadPromptLongImage(value, 'HOOOHO-在线问诊资料.png'); setFeedback('长图已生成') }
    catch (error) { setLoadError(error instanceof Error ? error.message : '长图生成失败，请重试') }
  }

  const changeStatus = async (status: OnlineConsultationStatus) => {
    if (!eventId || !token || busy) return
    setBusy(true); setLoadError('')
    try { setConsultation(await onlineConsultationService.updateStatus(eventId, status, token)) }
    catch (error) { setLoadError(error instanceof Error ? error.message : '状态保存失败，请重试') }
    finally { setBusy(false) }
  }

  const refreshWaiting = async () => {
    if (!eventId || !token || busy) return
    setBusy(true)
    try { setConsultation(await onlineConsultationService.refreshWaiting(eventId, token)); setFeedback('状态已更新') }
    catch (error) { setLoadError(error instanceof Error ? error.message : '刷新失败，请重试') }
    finally { setBusy(false) }
  }

  const prepareReply = async () => {
    if (!context || !eventId || !token || !question.trim() || busy) return
    const result = prepareDoctorReply(context, question, supplement)
    setBusy(true); setLoadError('')
    try {
      const updated = await onlineConsultationService.addQuestion(eventId, {
        question: question.trim(), reply: result.reply, missing: result.missing, sources: result.sources,
        supplements: supplement.trim() ? [supplement.trim()] : []
      }, token)
      setConsultation(updated)
      setPrepared(result)
    } catch (error) { setLoadError(error instanceof Error ? error.message : '回复整理失败，请重试') }
    finally { setBusy(false) }
  }

  const complete = async () => {
    if (!eventId || !token || !finalInstructions.trim() || busy) return
    setBusy(true); setLoadError('')
    try { setConsultation(await onlineConsultationService.complete(eventId, finalInstructions, token)); setEnding(false); setFeedback('医生交代已保存') }
    catch (error) { setLoadError(error instanceof Error ? error.message : '保存失败，请重试') }
    finally { setBusy(false) }
  }

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); return }
    const Constructor = recognitionConstructor()
    if (!Constructor) { setLoadError('当前浏览器不支持语音输入，请粘贴或手动输入医生问题'); return }
    const recognition = new Constructor()
    recognition.lang = 'zh-CN'; recognition.continuous = true; recognition.interimResults = true
    recognition.onresult = (event) => {
      let value = ''
      for (let index = 0; index < event.results.length; index += 1) value += event.results[index][0].transcript
      setQuestion(value)
    }
    recognition.onerror = (event) => { setListening(false); recognitionRef.current = null; setLoadError(event.error === 'not-allowed' ? '无法使用麦克风，请允许权限后重试' : '没有听清，请再说一次') }
    recognition.onend = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = recognition
    try { recognition.start(); setListening(true); setLoadError('') }
    catch { recognitionRef.current = null; setLoadError('无法启动麦克风，请稍后重试') }
  }

  if (state.status === 'loading' || !consultation) return <ConsultationShell eventId={eventId}><div className="online-consultation-loading">{loadError ? <><p>{loadError}</p><HohoButton onClick={() => void loadConsultation()} variant="secondary">重新加载</HohoButton></> : '正在整理问诊资料…'}</div></ConsultationShell>
  if (state.status !== 'success' || !context) return <ConsultationShell eventId={eventId}><div className="online-consultation-loading">健康随记加载失败，请返回后重试。</div></ConsultationShell>

  const activeStatus = consultation.status === 'preparing' ? null : consultation.status === 'completed' ? 'completed' : consultation.status
  return (
    <ConsultationShell eventId={eventId}>
      {activeStatus && activeStatus !== 'completed' && <div aria-label="问诊状态" className="online-consultation-tabs" role="tablist">
        <button aria-selected={activeStatus === 'waiting'} onClick={() => void changeStatus('waiting')} role="tab" type="button">等待接诊</button>
        <button aria-selected={activeStatus === 'doctor_questions'} onClick={() => void changeStatus('doctor_questions')} role="tab" type="button">医生问我</button>
      </div>}
      {consultation.status === 'preparing' && <PreparedMaterials busy={busy} onCopy={copyText} onExport={exportMaterials} onStartWaiting={() => void changeStatus('waiting')} sections={sections} />}
      {consultation.status === 'waiting' && <WaitingView busy={busy} consultation={consultation} onDoctorReply={() => void changeStatus('doctor_questions')} onRefresh={() => void refreshWaiting()} />}
      {consultation.status === 'doctor_questions' && <DoctorQuestionsView busy={busy} history={consultation.questions} listening={listening} onCopy={copyText} onEnd={() => setEnding(true)} onNext={() => { setQuestion(''); setSupplement(''); setPrepared(null) }} onPrepare={() => void prepareReply()} onQuestion={setQuestion} onSupplement={setSupplement} onVoice={toggleVoice} prepared={prepared} question={question} supplement={supplement} />}
      {consultation.status === 'completed' && <CompletedView instructions={consultation.finalDoctorInstructions ?? ''} onBack={() => navigate(`/health-events/${eventId}`)} />}
      {ending && consultation.status !== 'completed' && <section className="online-consultation-ending"><Typography variant="sectionTitle">保存医生交代</Typography><Typography className="mt-2" variant="body">内容会以“在线医生回复”标记后写回这条健康随记。</Typography><textarea aria-label="医生最终交代" className="hoho-textarea mt-4" maxLength={5000} onChange={(event) => setFinalInstructions(event.target.value)} placeholder="粘贴医生最终回复或建议" value={finalInstructions} /><div className="mt-3 grid grid-cols-2 gap-2"><HohoButton onClick={() => setEnding(false)} variant="secondary">取消</HohoButton><HohoButton disabled={!finalInstructions.trim() || busy} onClick={() => void complete()}>{busy ? '保存中…' : '保存并结束'}</HohoButton></div></section>}
      {loadError && <div className="online-consultation-error" role="alert"><span>{loadError}</span><button onClick={() => setLoadError('')} type="button">关闭</button></div>}
      {feedback && <div aria-live="polite" className="online-consultation-toast" role="status"><Check size={17} />{feedback}</div>}
    </ConsultationShell>
  )
}

function ConsultationShell({ children, eventId }: { children: React.ReactNode; eventId?: string }) {
  return <main className="app-shell online-consultation-page"><WebPageHeader fallback={eventId ? `/health-events/${eventId}` : '/health-events'} title="在线问诊" /><div className="online-consultation-content">{children}</div></main>
}

function PreparedMaterials({ busy, onCopy, onExport, onStartWaiting, sections }: { busy: boolean; onCopy: (value: string) => Promise<void>; onExport: (value: string) => void; onStartWaiting: () => void; sections: ReturnType<typeof buildConsultationSections> }) {
  const all = consultationCopyAll(sections)
  return <><div className="online-consultation-status" data-tone="success"><ClipboardCheck size={20} /><span><strong>资料已整理</strong><small>可以按需要复制到在线问诊平台。</small></span></div><div className="consultation-section-list">{sections.map((section) => <section className="consultation-copy-section" key={section.id}><div><Typography variant="cardTitle">{section.title}</Typography><button aria-label={`复制${section.title}`} onClick={() => void onCopy(section.content)} type="button"><Copy size={15} />复制</button></div><p data-empty={!section.content}>{section.content || '暂无记录'}</p></section>)}</div><div className="online-consultation-actions"><HohoButton onClick={() => void onCopy(all)} variant="secondary"><Copy size={17} />复制全部</HohoButton><HohoButton onClick={() => onExport(all)} variant="text"><FileImage size={17} />生成长图</HohoButton><HohoButton disabled={busy} fullWidth onClick={onStartWaiting}>资料已提交，等待接诊</HohoButton></div></>
}

function WaitingView({ busy, consultation, onDoctorReply, onRefresh }: { busy: boolean; consultation: OnlineConsultationApiDto; onDoctorReply: () => void; onRefresh: () => void }) {
  return <div className="online-consultation-state"><div className="online-consultation-status" data-tone="waiting"><RefreshCw size={20} /><span><strong>等待医生回复</strong><small>HOOOHO 只记录进度，不会读取第三方问诊状态。</small></span></div><HealthCard className="shadow-none"><dl className="consultation-progress"><div><dt>当前进度</dt><dd>资料已提交 · 等待接诊</dd></div><div><dt>最近更新</dt><dd>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(consultation.updatedAt))}</dd></div></dl></HealthCard><div className="online-consultation-actions"><HohoButton disabled={busy} onClick={onRefresh} variant="secondary"><RefreshCw size={17} />刷新状态</HohoButton><HohoButton disabled={busy} onClick={onDoctorReply}>医生回复我了</HohoButton></div></div>
}

function DoctorQuestionsView({ busy, history, listening, onCopy, onEnd, onNext, onPrepare, onQuestion, onSupplement, onVoice, prepared, question, supplement }: { busy: boolean; history: OnlineConsultationApiDto['questions']; listening: boolean; onCopy: (value: string) => Promise<void>; onEnd: () => void; onNext: () => void; onPrepare: () => void; onQuestion: (value: string) => void; onSupplement: (value: string) => void; onVoice: () => void; prepared: PreparedDoctorReply | null; question: string; supplement: string }) {
  return <div className="online-consultation-state"><section><Typography variant="sectionTitle">医生问了什么？</Typography><div className="consultation-question-input"><textarea aria-label="医生问了什么" className="hoho-textarea" maxLength={5000} onChange={(event) => onQuestion(event.target.value)} placeholder="粘贴或输入本轮医生问题" value={question} /><button aria-label={listening ? '停止语音输入' : '语音输入医生问题'} data-listening={listening} onClick={onVoice} type="button"><Mic size={19} />{listening ? '正在听…' : '语音输入'}</button></div><HohoButton className="mt-3" disabled={!question.trim() || busy} fullWidth onClick={onPrepare}><Send size={17} />{busy ? '正在整理…' : '帮我准备回复'}</HohoButton></section>{prepared && <><section className="consultation-reply"><div><Typography variant="sectionTitle">可复制回复</Typography><HealthTag tone="success">回复已准备</HealthTag></div><p>{prepared.reply}</p>{prepared.missing.length > 0 && <div className="consultation-missing"><strong>还缺 {prepared.missing.length} 项</strong>{prepared.missing.map((item) => <span key={item}>{item}</span>)}<textarea aria-label="补充缺失信息" className="hoho-textarea" onChange={(event) => onSupplement(event.target.value)} placeholder="补充后再次生成回复" value={supplement} /><HohoButton disabled={!supplement.trim() || busy} onClick={onPrepare} variant="secondary">补充后重新生成</HohoButton></div>}{prepared.sources.length > 0 && <div className="consultation-sources"><strong>来自当前记录</strong>{prepared.sources.map((item) => <span key={item}>{item}</span>)}</div>}</section><div className="online-consultation-actions"><HohoButton fullWidth onClick={() => void onCopy(prepared.reply)}><Copy size={17} />复制回复</HohoButton><HohoButton onClick={onNext} variant="secondary">处理下一轮问题</HohoButton></div></>}{history.length > 0 && <section className="consultation-history"><Typography variant="sectionTitle">本次问诊记录</Typography>{[...history].reverse().map((item, index) => <article key={item.id}><small>第 {history.length - index} 轮</small><strong>{item.question}</strong><p>{item.reply}</p><button aria-label={`复制第 ${history.length - index} 轮回复`} onClick={() => void onCopy(item.reply)} type="button"><Copy size={15} />复制回复</button></article>)}</section>}<button className="consultation-end-button" onClick={onEnd} type="button"><SquarePen size={16} />结束本次问诊</button></div>
}

function CompletedView({ instructions, onBack }: { instructions: string; onBack: () => void }) {
  return <div className="online-consultation-state"><div className="online-consultation-status" data-tone="success"><Check size={20} /><span><strong>问诊已结束</strong><small>医生交代已写回这条健康随记。</small></span></div><section className="consultation-reply"><Typography variant="cardTitle">在线医生回复</Typography><p>{instructions}</p></section><HohoButton fullWidth onClick={onBack}>返回健康随记</HohoButton></div>
}
