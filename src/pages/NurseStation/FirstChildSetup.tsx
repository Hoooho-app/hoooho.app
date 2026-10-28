import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChildAvatar } from '../../components/common/ChildAvatar'
import { DialogueComposer, HohoButton, HohoInput } from '../../components/design-system'
import { ReceptionSurface } from '../../components/design-system/ReceptionSurface'
import { MainAppHeader } from '../../components/navigation'
import { NurseMessage } from '../../features/ai-nurse/NurseMessage'
import { useDialogueVoice } from '../../features/ai-business/useDialogueVoice'
import { captureDraft } from '../../features/ai-business/captureDraft'
import { useVisibleViewport } from '../../hooks/useVisibleViewport'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import { createChildAvatarSelection, cycleChildAvatar, serializeChildAvatar } from '../../utils/childAvatar'
import { formatChildProfileAge, getChildBirthdayBounds } from '../../utils/childProfile'
import type { FamilyMemberApiDto } from '../../types'
import { childRecorderOptions, childSetupFields, childSetupLabels, firstChildStorageKey, firstChildVoiceKey, firstIncompleteField, newFirstChildDraft, parseFirstChildAnswer, recorderLabel, restoreFirstChildDraft, type ChildSetupField, type FirstChildDraft } from './firstChildSetupModel'
import reportImage from '../../../public/images/child-record-report-camera.8076af1b81.webp?url&inline'
import './FirstChildSetup.css'

function readDraft(accountId: string) {
  try { return restoreFirstChildDraft(JSON.parse(sessionStorage.getItem(firstChildStorageKey(accountId)) ?? 'null')) }
  catch { return newFirstChildDraft() }
}
function question(field: ChildSetupField, name: string) {
  return ({ name: '先认识一下孩子。孩子叫什么名字？姓名或小名都可以。', birthday: `${name}是哪天出生的？告诉我准确的出生年月日，也可以点选日期。`, gender: `${name}是男孩还是女孩？`, recorder: `平时由你来记录，你是${name}的哪位照顾者？` })[field]
}
function answerLabel(draft: FirstChildDraft, field: ChildSetupField) {
  if (field === 'gender') return draft.gender === 'female' ? '女孩' : draft.gender === 'male' ? '男孩' : ''
  if (field === 'recorder') return recorderLabel(draft.recorder)
  if (field === 'birthday') return draft.birthday.replaceAll('-', '/')
  return draft.name
}

function SetupComposer({ accountId, token, field, text, typing, onTypingChange, onTextChange, onAnswer, onBusy }: {
  accountId: string; token: string; field: ChildSetupField; text: string; typing: boolean; onTypingChange: (typing: boolean) => void
  onTextChange: (text: string) => void; onAnswer: (field: ChildSetupField, text: string) => void; onBusy: (busy: boolean) => void
}) {
  const sending = useRef(false)
  const voice = useDialogueVoice(firstChildVoiceKey(accountId, field), token, async transcript => {
    if (useAppStore.getState().authUser?.id === accountId) onAnswer(field, transcript)
  },{livePreview:true})
  useEffect(() => { onBusy(voice.busy); return () => onBusy(false) }, [voice.busy, onBusy])
  const send = async () => {
    if (sending.current || voice.busy || !text.trim()) return
    sending.current = true
    try {
      if (voice.pendingVoice) await voice.discardPending()
      onAnswer(field, text)
    } finally { sending.current = false }
  }
  return <>
    {voice.error && <p className="first-child-voice-error" role="alert">{voice.error}</p>}
    {voice.pendingVoice && !voice.busy && <div className="first-child-voice-recovery"><HohoButton variant="text" onClick={() => void voice.retry()}>重新识别语音</HohoButton><HohoButton variant="text" onClick={() => void voice.discardPending()}>删除这段语音</HohoButton></div>}
    <DialogueComposer variant="conversation" initialTyping={typing} onTypingChange={onTypingChange} voiceDisabled={!!voice.pendingVoice} text={text} onTextChange={onTextChange} onSend={() => void send()} onStart={() => void voice.start()} onStop={voice.stop} onDiscard={voice.discard} listening={voice.state === 'listening'} requesting={voice.state === 'requesting'} processing={voice.state === 'transcribing'} audioLevel={voice.audioLevel} expandedFeedback liveTranscript={voice.liveText} liveStatus={voice.liveUnavailable?'实时文字暂不可用，松开后完整转写':'正在听你说'} feedbackHint={voice.liveUnavailable?'松开后完整识别你的回答':'边说边显示文字'} placeholder={`输入${childSetupLabels[field]}…`} maxLength={240}/>
  </>
}

/** First-use profile collection only; no health event is created here. */
export function FirstChildSetup({ accountId, token }: { accountId: string; token: string }) {
  const navigate = useNavigate(), viewport = useVisibleViewport()
  const [draft, setDraft] = useState<FirstChildDraft>(() => readDraft(accountId))
  const draftRef = useRef(draft); draftRef.current = draft
  const [error, setError] = useState(''), [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false), [voiceBusy, setVoiceBusy] = useState(false)
  const [birthdayChoice, setBirthdayChoice] = useState(draft.birthday)
  const savingRef = useRef(false), mounted = useRef(true), end = useRef<HTMLDivElement>(null), reviewFocus = useRef<HTMLElement>(null), saveController = useRef<AbortController>()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; saveController.current?.abort() } }, [])
  useEffect(() => useAppStore.subscribe(state => { if (state.authUser?.id !== accountId) saveController.current?.abort() }), [accountId])
  useEffect(() => {
    try { sessionStorage.setItem(firstChildStorageKey(accountId), JSON.stringify(draft)) } catch { /* The current conversation remains usable in memory. */ }
  }, [accountId, draft])
  useEffect(() => { setBirthdayChoice(draftRef.current.birthday) }, [draft.step])
  useEffect(() => {
    const frame = requestAnimationFrame(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'instant' }); if (draft.step === 'review') reviewFocus.current?.focus({ preventScroll: true }) })
    return () => cancelAnimationFrame(frame)
  }, [draft.step, draft.name, draft.birthday, draft.gender, draft.recorder, error, saveError, viewport.height])
  const avatar = useMemo(() => ({ ...createChildAvatarSelection(draft.birthday, draft.gender || 'male'), variant: draft.variant }), [draft.birthday, draft.gender, draft.variant])
  const bounds = getChildBirthdayBounds()
  const sameAccount = () => mounted.current && useAppStore.getState().authUser?.id === accountId
  const accept = (field: ChildSetupField, text: string) => {
    if (!sameAccount() || savingRef.current || draftRef.current.step !== field) return
    const result = parseFirstChildAnswer(field, text)
    if (result.error) { setError(result.error); setDraft(current => ({ ...current, text })); return }
    const next = { ...draftRef.current, [field]: result.value, text: '' } as FirstChildDraft
    next.step = firstIncompleteField(next)
    draftRef.current = next; setDraft(next); setError(''); setSaveError('')
  }
  const edit = (field: ChildSetupField) => {
    if (savingRef.current) return
    setError(''); setSaveError('')
    setDraft(current => ({ ...current, step: field, text: field === 'name' ? current.name : '' }))
  }
  const finish = (member: FamilyMemberApiDto) => {
    if (!sameAccount()) return
    try { sessionStorage.removeItem(firstChildStorageKey(accountId)) } catch { /* A future visit checks real members before showing setup. */ }
    for (const field of childSetupFields) void captureDraft(firstChildVoiceKey(accountId, field), null).catch(() => undefined)
    const store = useAppStore.getState()
    store.addMember(adaptFamilyMember(member)); store.setCurrentMemberId(member.id)
    navigate('/nurse-station', { replace: true })
  }
  const save = async () => {
    if (savingRef.current || !sameAccount()) return
    const value = draftRef.current, incomplete = firstIncompleteField(value)
    if (incomplete !== 'review') { setDraft(current => ({ ...current, step: incomplete })); return }
    savingRef.current = true; setSaving(true); setSaveError('')
    const controller = new AbortController(); saveController.current = controller
    try {
      // Also resolves a previous response lost after the server persisted the child.
      // A failed list never falls through to another non-idempotent create.
      const existing = await familyMemberService.list(useAppStore.getState().authToken ?? token, controller.signal)
      if (!sameAccount()) return
      const child = existing.find(member => member.relationship === 'child')
      if (child) { finish(child); return }
      const created = await familyMemberService.create({ name: value.name.trim(), birthday: value.birthday, gender: value.gender as 'male' | 'female', relationship: 'child', primaryRecorderRelationship: value.recorder || null, avatar: serializeChildAvatar({ ...createChildAvatarSelection(value.birthday, value.gender as 'male' | 'female'), variant: value.variant }) }, useAppStore.getState().authToken ?? token, controller.signal)
      finish(created)
    } catch (requestError) {
      if (sameAccount()) setSaveError(`${requestError instanceof Error ? requestError.message : '暂时未能确认添加结果'}。资料还在，重试时会先核对是否已保存。`)
    } finally {
      savingRef.current = false
      if (saveController.current === controller) saveController.current = undefined
      if (mounted.current) setSaving(false)
    }
  }
  return <section className="smart-record-page smart-record-home first-child-setup" aria-label="添加孩子信息" style={{ top: viewport.top, height: viewport.height }}>
    <MainAppHeader title="症状记录" conversation/>
    <div className="smart-record-page__body">
      <div className="front-desk-welcome front-desk-welcome--empty"><ReceptionSurface media={<img className="front-desk-welcome__image" src={reportImage} alt="手机拍摄包含孩子个人信息的记录报告单" width={384} height={256} loading="eager" fetchPriority="high" decoding="async"/>} title="先认识一下孩子" description="聊几句，把基本信息记清楚。"/></div>
      <div className="nurse-conversation first-child-conversation" aria-label="孩子信息对话">
        {childSetupFields.filter(field => draft[field] && field !== draft.step).map(field => <Fragment key={field}><NurseMessage role="assistant" conversation><p>{question(field, draft.name)}</p></NurseMessage><NurseMessage role="user" conversation><p>{answerLabel(draft, field)}</p></NurseMessage></Fragment>)}
        {draft.step !== 'review' ? <div aria-live="polite"><NurseMessage role="assistant" conversation><p className="first-child-step">添加孩子信息 · {childSetupFields.indexOf(draft.step) + 1}/4</p><p>{question(draft.step, draft.name)}</p>
          {draft.step === 'birthday' && <div className="first-child-date"><HohoInput label="出生日期" type="date" min={bounds.min} max={bounds.max} value={birthdayChoice} disabled={voiceBusy} onChange={event => setBirthdayChoice(event.target.value)}/><HohoButton variant="secondary" disabled={!birthdayChoice || voiceBusy} onClick={() => accept('birthday', birthdayChoice)}>确认出生日期</HohoButton></div>}
          {draft.step === 'gender' && <div className="first-child-choices">{['男孩', '女孩'].map(label => <HohoButton key={label} variant="secondary" disabled={voiceBusy} onClick={() => accept('gender', label)}>{label}</HohoButton>)}</div>}
          {draft.step === 'recorder' && <div className="first-child-choices first-child-choices--relations">{childRecorderOptions.map(([id, label]) => <HohoButton key={id} variant="secondary" disabled={voiceBusy} onClick={() => accept('recorder', label)}>{label}</HohoButton>)}</div>}
          {error && <p className="first-child-error" role="alert">{error}</p>}
          {firstIncompleteField(draft) === 'review' && <HohoButton variant="text" disabled={voiceBusy} onClick={() => { setDraft(current => ({ ...current, step: 'review', text: '' })); setError('') }}>保留原信息</HohoButton>}
        </NurseMessage></div> : <NurseMessage role="assistant" conversation><section ref={reviewFocus} tabIndex={-1} aria-label="核对孩子信息" className="first-child-review"><p>基本信息齐了。给{draft.name}配好了一个小头像，一起核对一下。</p><div className="first-child-avatar"><ChildAvatar selection={avatar} name={draft.name} className="h-16 w-16"/><div><strong>{draft.name}</strong><span>{formatChildProfileAge(draft.birthday)}</span></div><HohoButton variant="text" disabled={saving} onClick={() => setDraft(current => ({ ...current, variant: cycleChildAvatar(avatar).variant }))}>换一个</HohoButton></div>
          <dl>{childSetupFields.map(field => <div key={field}><dt>{childSetupLabels[field]}</dt><dd>{answerLabel(draft, field)}</dd><HohoButton variant="text" aria-label={`修改${childSetupLabels[field]}`} disabled={saving} onClick={() => edit(field)}>修改</HohoButton></div>)}</dl>
          {saveError && <p className="first-child-error" role="alert">{saveError}</p>}
          <HohoButton fullWidth loading={saving} disabled={saving} onClick={() => void save()}>{saveError ? '重试添加' : '确认添加，开始记录'}</HohoButton>
        </section></NurseMessage>}
        <div ref={end}/>
      </div>
    </div>
    {draft.step !== 'review' && <footer className="smart-record-page__footer"><SetupComposer key={draft.step} accountId={accountId} token={token} field={draft.step} text={draft.text} typing={draft.typing} onTypingChange={typing => setDraft(current => ({ ...current, typing }))} onTextChange={text => setDraft(current => ({ ...current, text }))} onAnswer={accept} onBusy={setVoiceBusy}/></footer>}
  </section>
}
