import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Trash2, UserRound } from 'lucide-react'
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button, WebPageHeader } from '../../components/common'
import { FamilyAvatarEditor, type FamilyAvatarMode } from '../../components/family/FamilyAvatarEditor'
import { FamilyEditorConfirmDialog } from '../../components/family/FamilyEditorConfirmDialog'
import { isSafeReturnPath } from '../../components/navigation/navigationState'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto, ProfileGender } from '../../types'
import { familyBirthdayErrorMessage, getFamilyBirthdayBounds, validateFamilyBirthday } from '../../utils/familyBirthday'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { createClayAvatarConfig, parseClayAvatar, remapClayAvatarRole, serializeClayAvatar, type ClayAvatarConfig } from '../../utils/clayAvatar'
import { parseVirtualAvatarId } from '../../utils/virtualAvatar'

type RequiredGender = Extract<ProfileGender, 'male' | 'female'>
type SaveState = 'idle' | 'saving' | 'saved'

interface FamilyEditorDraft {
  avatarConfig: ClayAvatarConfig
  avatarMode: FamilyAvatarMode
  birthday: string
  gender: RequiredGender
  name: string
  photoAvatar: string
}

const fieldClass = 'min-w-0 flex-1 rounded-control border border-border-calm bg-background px-3 py-2 text-right text-[15px] text-heading outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 placeholder:text-text-secondary/70'

function makeDraft(member: FamilyMemberApiDto): FamilyEditorDraft {
  const gender = member.gender === 'female' ? 'female' : 'male'
  const avatar = member.avatar ?? ''
  const parsed = parseClayAvatar(avatar)
  const isPhoto = Boolean(avatar && !parsed && !parseVirtualAvatarId(avatar))
  const birthday = member.birthday && /^\d{4}-\d{2}-\d{2}$/.test(member.birthday) ? member.birthday : ''
  return {
    avatarConfig: parsed ?? createClayAvatarConfig(member.name, birthday || '1990-01-01', gender, member.id),
    avatarMode: isPhoto ? 'photo' : 'cartoon', birthday, gender, name: member.name,
    photoAvatar: isPhoto ? avatar : ''
  }
}

function draftFingerprint(draft: FamilyEditorDraft) {
  return JSON.stringify({ ...draft, name: draft.name.trim() })
}

export function EditFamilyMemberPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { memberId = '' } = useParams()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const setMembers = useAppStore((state) => state.setMembers)
  const setProfile = useAppStore((state) => state.setProfile)
  const clearProfile = useAppStore((state) => state.clearProfile)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const returnState = (location.state as { returnTo?: unknown } | null)?.returnTo
  const returnTo = isSafeReturnPath(returnState) ? returnState : null

  const [sourceMember, setSourceMember] = useState<FamilyMemberApiDto | null>(null)
  const [draft, setDraft] = useState<FamilyEditorDraft | null>(null)
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [error, setError] = useState('')
  const allowNavigationRef = useRef(false)

  useEffect(() => {
    if (!token || !memberId) return
    const controller = new AbortController()
    familyMemberService.getById(memberId, token, controller.signal)
      .then((member) => {
        const initial = makeDraft(member)
        setSourceMember(member)
        setDraft(initial)
        setBaseline(draftFingerprint(initial))
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          clearAuthSession(); navigate('/login', { replace: true }); return
        }
        setError(requestError instanceof Error ? requestError.message : '家人资料加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, memberId, navigate, token])

  const birthdayValidation = useMemo(() => validateFamilyBirthday(draft?.birthday ?? ''), [draft?.birthday])
  const birthdayError = familyBirthdayErrorMessage(birthdayValidation.error)
  const nameError = draft && !draft.name.trim() ? '请输入姓名' : draft && draft.name.trim().length > 50 ? '姓名最多 50 个字符' : ''
  const photoError = draft?.avatarMode === 'photo' && !draft.photoAvatar ? '请先选择一张照片' : ''
  const isDirty = Boolean(draft && baseline && draftFingerprint(draft) !== baseline)
  const blocker = useBlocker(isDirty && !allowNavigationRef.current && saveState !== 'saving' && !deleting)
  const bounds = useMemo(() => getFamilyBirthdayBounds(), [])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || allowNavigationRef.current) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  const previewConfig = useMemo(() => {
    if (!draft) return null
    return draft.birthday && birthdayValidation.valid ? remapClayAvatarRole(draft.avatarConfig, draft.birthday, draft.gender) : draft.avatarConfig
  }, [birthdayValidation.valid, draft])
  const age = draft?.birthday && birthdayValidation.valid ? formatAgeFromBirthday(draft.birthday) : ''
  const hasErrors = Boolean(nameError || birthdayError || photoError)
  const locked = saveState === 'saving' || deleting || photoProcessing

  const goBack = (replace = false) => {
    allowNavigationRef.current = true
    if (returnTo) navigate(returnTo, { replace })
    else navigate(-1)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || !previewConfig || !token || !memberId || !isDirty || hasErrors || photoProcessing) return
    setSaveState('saving'); setError('')
    try {
      const saved = await familyMemberService.update(memberId, {
        name: draft.name.trim(), birthday: draft.birthday || null, gender: draft.gender,
        avatar: draft.avatarMode === 'photo' ? draft.photoAvatar : serializeClayAvatar(previewConfig)
      }, token)
      const adapted = adaptFamilyMember(saved)
      setMembers(members.some((member) => member.id === saved.id) ? members.map((member) => member.id === saved.id ? adapted : member) : [...members, adapted])
      if (saved.isSelf) setProfile({ nickname: saved.name, birthday: saved.birthday ?? '', gender: saved.gender ?? draft.gender, avatar: saved.avatar ?? undefined }, saved.id)
      const savedDraft = makeDraft(saved)
      setDraft(savedDraft); setBaseline(draftFingerprint(savedDraft)); setSaveState('saved')
      allowNavigationRef.current = true
      window.setTimeout(() => goBack(true), 450)
    } catch (requestError) {
      setSaveState('idle'); setError(requestError instanceof Error ? requestError.message : '保存失败，请稍后重试')
    }
  }

  const remove = async () => {
    if (!token || !memberId || deleting || sourceMember?.isSelf) return
    setDeleting(true); setError('')
    try {
      await familyMemberService.delete(memberId, token)
      const remaining = members.filter((member) => member.id !== memberId)
      setMembers(remaining)
      if (remaining.length === 0) clearProfile()
      if (currentMemberId === memberId && remaining[0]) setCurrentMemberId(remaining[0].id)
      allowNavigationRef.current = true
      navigate(remaining.length ? '/family' : '/health-events', { replace: true })
    } catch (requestError) {
      setDeleteOpen(false); setError(requestError instanceof Error ? requestError.message : '移除失败，请稍后重试')
    } finally { setDeleting(false) }
  }

  return <main className="app-shell flex min-h-dvh flex-col pb-0">
    <WebPageHeader title="编辑家人资料" fallback="/health-events" />
    {loading ? <p className="py-20 text-center text-sm text-text-secondary">正在加载家人资料…</p> : sourceMember && draft && previewConfig ? (
      <form className="flex flex-1 flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4" onSubmit={save}>
        <div className="mx-auto w-full max-w-sm">
          <FamilyAvatarEditor config={previewConfig} disabled={locked} mode={draft.avatarMode} name={draft.name || '家人'}
            onConfigChange={(avatarConfig) => { setDraft((current) => current ? { ...current, avatarConfig } : current); setError(''); setSaveState('idle') }} onError={setError}
            onModeChange={(avatarMode) => { setDraft((current) => current ? { ...current, avatarMode } : current); setError(''); setSaveState('idle') }}
            onPhotoChange={(photoAvatar) => { setDraft((current) => current ? { ...current, photoAvatar } : current); setSaveState('idle') }}
            onProcessingChange={setPhotoProcessing} photo={draft.photoAvatar} />
        </div>

        <section className="mt-5 overflow-hidden rounded-card border border-border-calm bg-surface px-4 shadow-calm" aria-label="家人资料">
          <label className="flex min-h-[68px] items-center gap-3 border-b border-border">
            <UserRound className="shrink-0 text-primary" size={21} strokeWidth={1.7} /><span className="shrink-0 text-sm font-medium">姓名</span>
            <input aria-invalid={Boolean(nameError)} className={fieldClass} disabled={locked} maxLength={50} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(''); setSaveState('idle') }} />
          </label>
          {nameError && <p className="-mt-1 border-b border-border pb-2 text-right text-xs text-danger">{nameError}</p>}
          <label className="flex min-h-[78px] items-center gap-3 border-b border-border">
            <CalendarDays className="shrink-0 text-primary" size={21} strokeWidth={1.7} /><span className="shrink-0 text-sm font-medium">出生日期</span>
            <span className="ml-auto min-w-0 flex-1 text-right">
              <input aria-describedby="birthday-message" aria-invalid={Boolean(birthdayError)} className={`${fieldClass} block w-full`} disabled={locked} max={bounds.max} min={bounds.min} type="date" value={draft.birthday} onChange={(event) => { setDraft({ ...draft, birthday: event.target.value }); setError(''); setSaveState('idle') }} />
              <span className={`mt-1 block text-[11px] ${birthdayError ? 'text-danger' : 'text-text-secondary'}`} id="birthday-message">{birthdayError || (age ? `系统自动计算：${age}` : '选填，最多可选择 120 年前')}</span>
            </span>
          </label>
          <fieldset className="flex min-h-[70px] items-center gap-3" disabled={locked}>
            <UserRound className="shrink-0 text-primary" size={21} strokeWidth={1.7} /><legend className="sr-only">性别</legend><span className="text-sm font-medium">性别</span>
            <div className="ml-auto grid w-36 grid-cols-2 overflow-hidden rounded-control border border-border">
              {([['male', '男'], ['female', '女']] as const).map(([value, label]) => <button aria-pressed={draft.gender === value} className={`min-h-10 text-sm ${draft.gender === value ? 'bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} key={value} type="button" onClick={() => { setDraft({ ...draft, gender: value }); setError(''); setSaveState('idle') }}>{label}</button>)}
            </div>
          </fieldset>
        </section>

        <div className="mt-auto pt-5">
          <div className="min-h-5" aria-live="polite">{error && <p className="text-xs text-danger">{error}</p>}</div>
          <Button className="mt-2" disabled={!isDirty || hasErrors || locked || saveState === 'saved'} fullWidth type="submit">{saveState === 'saving' ? '正在保存…' : saveState === 'saved' ? '已保存' : '保存修改'}</Button>
          {!sourceMember.isSelf && <button className="hoho-button mt-3 w-full" data-variant="danger" disabled={locked} type="button" onClick={() => setDeleteOpen(true)}><Trash2 size={18} strokeWidth={1.7} />移除这位家人</button>}
        </div>
      </form>
    ) : <div className="px-4 py-16 text-center"><p className="text-sm text-text-secondary">{error || '未找到这位家人'}</p><Button className="mt-5" onClick={() => navigate('/family')}>返回我的家人</Button></div>}

    <FamilyEditorConfirmDialog confirmLabel="放弃修改" description="当前修改尚未保存。返回后，这些修改将不会保留。" onCancel={() => blocker.state === 'blocked' && blocker.reset()} onConfirm={() => { allowNavigationRef.current = true; if (blocker.state === 'blocked') blocker.proceed() }} open={blocker.state === 'blocked'} title="要放弃未保存的修改吗？" />
    <FamilyEditorConfirmDialog cancelLabel="取消" confirmLabel="确认移除" danger description={`将从家人列表中移除“${draft?.name.trim() || sourceMember?.name || '这位家人'}”。已保存的健康记录不会随之删除。`} loading={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} open={deleteOpen} title="移除这位家人？" />
  </main>
}
