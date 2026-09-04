import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, Globe2, UserRound } from 'lucide-react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { Button, WebPageHeader } from '../../components/common'
import { FamilyAvatarEditor, type FamilyAvatarMode } from '../../components/family/FamilyAvatarEditor'
import { FamilyEditorConfirmDialog } from '../../components/family/FamilyEditorConfirmDialog'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { ChildRecorderRelationship, FamilyMemberApiDto, ProfileGender } from '../../types'
import { childBirthdayErrorMessage, formatChildProfileAge, getChildBirthdayBounds, isChildProfileMember, validateChildBirthday } from '../../utils/childProfile'
import { createClayAvatarConfig, parseClayAvatar, remapClayAvatarRole, serializeClayAvatar, type ClayAvatarConfig } from '../../utils/clayAvatar'
import { parseVirtualAvatarId } from '../../utils/virtualAvatar'
import { NATIONALITY_CODES } from '../../../shared/nationality-policy.mjs'

type ChildGender = Extract<ProfileGender, 'male' | 'female'> | ''
type SaveState = 'idle' | 'saving' | 'saved'

interface ChildEditorDraft {
  avatarConfig: ClayAvatarConfig
  avatarMode: FamilyAvatarMode
  birthday: string
  gender: ChildGender
  name: string
  nationality: string
  primaryRecorderRelationship: ChildRecorderRelationship | ''
  photoAvatar: string
}

const recorderOptions = [
  ['father', '爸爸'],
  ['mother', '妈妈'],
  ['paternal_grandfather', '爷爷'],
  ['paternal_grandmother', '奶奶'],
  ['maternal_grandfather', '外公'],
  ['maternal_grandmother', '外婆'],
  ['nanny', '保姆'],
  ['other', '其他']
] as const satisfies readonly (readonly [ChildRecorderRelationship, string])[]
const recorderValues = new Set<ChildRecorderRelationship>(recorderOptions.map(([value]) => value))
const nationalityDisplayNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
const nationalityOptions = ['CN', ...NATIONALITY_CODES.filter((code) => code !== 'CN')]
  .map((code) => [code, nationalityDisplayNames.of(code) ?? code] as const)
  .concat([['OTHER', '其他'] as const])
const nationalityValues = new Set(nationalityOptions.map(([value]) => value))
const rowClass = 'grid min-h-[64px] grid-cols-[94px_minmax(0,1fr)] items-center gap-3 border-b border-border px-3 last:border-b-0 sm:grid-cols-[104px_minmax(0,1fr)] sm:px-4'
const controlClass = 'h-11 min-w-0 w-full rounded-control border border-border-calm bg-surface px-3 text-sm text-heading outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:bg-surface-muted disabled:text-text-secondary'

function childAvatarBirthday(birthday: string) {
  return birthday && validateChildBirthday(birthday).valid ? birthday : getChildBirthdayBounds().min
}

function makeDraft(member: FamilyMemberApiDto): ChildEditorDraft {
  const gender: ChildGender = member.gender === 'female' ? 'female' : member.gender === 'male' ? 'male' : ''
  const avatarGender = gender || 'male'
  const avatar = member.avatar ?? ''
  const parsed = parseClayAvatar(avatar)
  const birthday = member.birthday && /^\d{4}-\d{2}-\d{2}$/.test(member.birthday) ? member.birthday : ''
  const avatarBirthday = childAvatarBirthday(birthday)
  const baseAvatar = parsed ?? createClayAvatarConfig(member.name, avatarBirthday, avatarGender, member.id)
  const isPhoto = Boolean(avatar && !parsed && !parseVirtualAvatarId(avatar))
  return {
    avatarConfig: remapClayAvatarRole(baseAvatar, avatarBirthday, avatarGender),
    avatarMode: isPhoto ? 'photo' : 'cartoon',
    birthday,
    gender,
    name: member.name,
    nationality: member.nationality && nationalityValues.has(member.nationality) ? member.nationality : '',
    primaryRecorderRelationship: member.primaryRecorderRelationship && recorderValues.has(member.primaryRecorderRelationship) ? member.primaryRecorderRelationship : '',
    photoAvatar: isPhoto ? avatar : ''
  }
}

function draftFingerprint(draft: ChildEditorDraft) {
  return JSON.stringify({
    ...draft,
    name: draft.name.trim()
  })
}

function savedDataMatches(member: FamilyMemberApiDto, draft: ChildEditorDraft) {
  return member.relationship === 'child'
    && (member.nationality ?? '') === draft.nationality
    && (member.primaryRecorderRelationship ?? '') === draft.primaryRecorderRelationship
}

function displayBirthday(value: string) {
  return value ? value.replaceAll('-', '/') : '请选择日期'
}

export function EditFamilyMemberPage() {
  const navigate = useNavigate()
  const { memberId = '' } = useParams()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const setMembers = useAppStore((state) => state.setMembers)
  const clearProfile = useAppStore((state) => state.clearProfile)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const cachedMember = token && memberId ? familyMemberService.getCachedById(memberId, token) : undefined
  const initialMember = cachedMember && isChildProfileMember(cachedMember) ? cachedMember : null
  const initialDraft = initialMember ? makeDraft(initialMember) : null

  const [sourceMember, setSourceMember] = useState<FamilyMemberApiDto | null>(initialMember)
  const [draft, setDraft] = useState<ChildEditorDraft | null>(initialDraft)
  const [baseline, setBaseline] = useState(initialDraft ? draftFingerprint(initialDraft) : '')
  const [loading, setLoading] = useState(!initialMember)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [error, setError] = useState('')
  const allowNavigationRef = useRef(false)
  const draftEditedRef = useRef(false)

  useEffect(() => {
    if (!token || !memberId) return
    const cached = familyMemberService.getCachedById(memberId, token)
    draftEditedRef.current = false
    setError('')
    if (cached && isChildProfileMember(cached)) {
      const cachedDraft = makeDraft(cached)
      setSourceMember(cached)
      setDraft(cachedDraft)
      setBaseline(draftFingerprint(cachedDraft))
      setLoading(false)
    } else {
      setSourceMember(null)
      setDraft(null)
      setBaseline('')
      setLoading(true)
    }
    const controller = new AbortController()
    familyMemberService.getById(memberId, token, controller.signal)
      .then((member) => {
        if (!isChildProfileMember(member)) {
          setSourceMember(null)
          setDraft(null)
          setError('该页面仅用于编辑孩子资料')
          return
        }
        const initial = makeDraft(member)
        setSourceMember(member)
        if (!draftEditedRef.current) {
          setDraft(initial)
          setBaseline(draftFingerprint(initial))
        }
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          clearAuthSession()
          navigate('/login', { replace: true })
          return
        }
        setError(cached
          ? '资料刷新暂时失败，当前显示最近一次数据'
          : requestError instanceof Error ? requestError.message : '孩子资料加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, memberId, navigate, token])

  const birthdayValidation = useMemo(() => validateChildBirthday(draft?.birthday ?? ''), [draft?.birthday])
  const birthdayError = childBirthdayErrorMessage(birthdayValidation.error)
  const nameError = draft && !draft.name.trim() ? '请输入姓名' : draft && draft.name.trim().length > 50 ? '姓名最多50个字符' : ''
  const photoError = draft?.avatarMode === 'photo' && !draft.photoAvatar ? '请先选择一张照片' : ''
  const isDirty = Boolean(draft && baseline && draftFingerprint(draft) !== baseline)
  const blocker = useBlocker(isDirty && !allowNavigationRef.current && saveState !== 'saving' && !deleting)
  const bounds = useMemo(() => getChildBirthdayBounds(), [])
  const age = draft?.birthday ? formatChildProfileAge(draft.birthday) : ''
  const hasErrors = Boolean(nameError || birthdayError || photoError)
  const locked = saveState === 'saving' || deleting || photoProcessing

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || allowNavigationRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  const previewConfig = useMemo(() => {
    if (!draft) return null
    const gender = draft.gender || (draft.avatarConfig.role.includes('girl') ? 'female' : 'male')
    return remapClayAvatarRole(draft.avatarConfig, childAvatarBirthday(draft.birthday), gender)
  }, [draft])

  const updateDraft = (changes: Partial<ChildEditorDraft>) => {
    draftEditedRef.current = true
    setDraft((current) => current ? { ...current, ...changes } : current)
    setError('')
    setSaveState('idle')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || !previewConfig || !token || !memberId || !isDirty || hasErrors || photoProcessing) return
    setSaveState('saving')
    setError('')
    try {
      await familyMemberService.update(memberId, {
        name: draft.name.trim(),
        relationship: 'child',
        birthday: draft.birthday || null,
        nationality: draft.nationality || null,
        gender: draft.gender || null,
        avatar: draft.avatarMode === 'photo' ? draft.photoAvatar : serializeClayAvatar(previewConfig),
        primaryRecorderRelationship: draft.primaryRecorderRelationship || null
      }, token)
      const persisted = await familyMemberService.getById(memberId, token)
      if (!savedDataMatches(persisted, draft)) throw new Error('资料尚未完整保存，请重试')
      const savedDraft = makeDraft(persisted)
      const adapted = adaptFamilyMember(persisted)
      setSourceMember(persisted)
      setMembers(members.map((member) => member.id === persisted.id ? adapted : member))
      setDraft(savedDraft)
      setBaseline(draftFingerprint(savedDraft))
      draftEditedRef.current = false
      setSaveState('saved')
    } catch (requestError) {
      setSaveState('idle')
      setError(requestError instanceof Error ? requestError.message : '保存失败，请重试')
    }
  }

  const remove = async () => {
    if (!token || !memberId || deleting || !isChildProfileMember(sourceMember)) return
    setDeleting(true)
    setError('')
    try {
      await familyMemberService.delete(memberId, token)
      const remaining = members.filter((member) => member.id !== memberId)
      setMembers(remaining)
      if (remaining.length === 0) clearProfile()
      if (currentMemberId === memberId && remaining[0]) setCurrentMemberId(remaining[0].id)
      allowNavigationRef.current = true
      navigate(remaining.length ? '/family' : '/health-events', { replace: true })
    } catch (requestError) {
      setDeleteOpen(false)
      setError(requestError instanceof Error ? requestError.message : '删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  return <main className="app-shell flex min-h-dvh flex-col bg-surface pb-0">
    <WebPageHeader title="编辑孩子资料" fallback="/family" />
    {loading ? <p className="py-20 text-center text-sm text-text-secondary">正在加载孩子资料…</p> : sourceMember && draft && previewConfig ? (
      <form className="flex flex-1 flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4" onSubmit={save}>
        <div className="mx-auto w-full max-w-sm">
          <FamilyAvatarEditor
            childProfile
            config={previewConfig}
            disabled={locked}
            mode={draft.avatarMode}
            name={draft.name || '孩子'}
            onConfigChange={(avatarConfig) => updateDraft({ avatarConfig })}
            onError={setError}
            onModeChange={(avatarMode) => updateDraft({ avatarMode })}
            onPhotoChange={(photoAvatar) => updateDraft({ photoAvatar })}
            onProcessingChange={setPhotoProcessing}
            photo={draft.photoAvatar}
          />
        </div>

        <section className="mt-5 overflow-hidden rounded-card border border-border-calm bg-surface" aria-label="孩子基本资料">
          <label className={rowClass}>
            <span className="flex items-center gap-2 text-sm font-medium"><UserRound aria-hidden="true" className="shrink-0 text-primary" size={20} strokeWidth={1.7} />姓名</span>
            <input aria-invalid={Boolean(nameError)} className={controlClass} disabled={locked} maxLength={50} value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
          </label>
          <div className={rowClass}>
            <span className="flex items-center gap-2 text-sm font-medium"><CalendarDays aria-hidden="true" className="shrink-0 text-primary" size={20} strokeWidth={1.7} />出生日期</span>
            <label className={`${controlClass} relative flex cursor-pointer items-center gap-1.5 px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15`}>
              <span className="min-w-0 flex-1 truncate text-xs tabular-nums sm:text-sm">{displayBirthday(draft.birthday)}{age && <><span className="px-1 text-text-secondary">·</span>{age}</>}</span>
              <CalendarDays aria-hidden="true" className="shrink-0 text-text-secondary" size={18} strokeWidth={1.7} />
              <input
                aria-describedby={birthdayError ? 'child-birthday-error' : undefined}
                aria-invalid={Boolean(birthdayError)}
                aria-label="出生日期"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                disabled={locked}
                max={bounds.max}
                min={bounds.min}
                type="date"
                value={draft.birthday}
                onChange={(event) => updateDraft({ birthday: event.target.value })}
              />
            </label>
          </div>
          {birthdayError && <p className="border-b border-border px-4 pb-2 text-right text-xs text-danger" id="child-birthday-error">{birthdayError}</p>}
          <fieldset className={rowClass} disabled={locked}>
            <legend className="sr-only">性别</legend>
            <span className="flex items-center gap-2 text-sm font-medium"><UserRound aria-hidden="true" className="shrink-0 text-primary" size={20} strokeWidth={1.7} />性别</span>
            <div className="grid h-11 w-full grid-cols-2 overflow-hidden rounded-control border border-border-calm bg-surface">
              {([['male', '男'], ['female', '女']] as const).map(([value, label]) => <button
                aria-pressed={draft.gender === value}
                className={`text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${draft.gender === value ? 'bg-primary-soft font-semibold text-primary' : 'text-heading'}`}
                key={value}
                type="button"
                onClick={() => updateDraft({ gender: value })}
              >{label}</button>)}
            </div>
          </fieldset>
          <label className={rowClass}>
            <span className="flex items-center gap-2 text-sm font-medium"><Globe2 aria-hidden="true" className="shrink-0 text-primary" size={20} strokeWidth={1.7} />国籍</span>
            <span className="relative">
              <select
                aria-label="国籍"
                className={`${controlClass} appearance-none pr-10`}
                disabled={locked}
                value={draft.nationality}
                onChange={(event) => updateDraft({ nationality: event.target.value })}
              >
                <option value="">请选择国籍</option>
                {nationalityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} strokeWidth={1.7} />
            </span>
          </label>
        </section>

        <section className="mt-4 rounded-card border border-border-calm bg-surface p-4" aria-labelledby="recorder-heading">
          <h2 className="text-base font-semibold text-heading" id="recorder-heading">主要记录者</h2>
          <label className="mt-3 grid grid-cols-[94px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[104px_minmax(0,1fr)]">
            <span className="text-sm font-medium">你是孩子的谁？</span>
            <span className="relative">
              <select
                aria-label="你是孩子的谁？"
                className={`${controlClass} appearance-none pr-10`}
                disabled={locked}
                value={draft.primaryRecorderRelationship}
                onChange={(event) => updateDraft({ primaryRecorderRelationship: event.target.value as ChildRecorderRelationship | '' })}
              >
                <option value="">请选择关系</option>
                {recorderOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary" size={18} strokeWidth={1.7} />
            </span>
          </label>
        </section>

        <div className="mt-auto pt-5">
          <div className="min-h-5" aria-live="polite">{error && <p className="text-xs text-danger">{error}</p>}</div>
          <Button className="mt-2 min-h-[50px]" disabled={!isDirty || hasErrors || locked || saveState === 'saved'} fullWidth type="submit">
            {saveState === 'saving' ? '正在保存…' : saveState === 'saved' ? '已保存' : '保存修改'}
          </Button>
          <Button className="mt-3 min-h-[50px]" disabled={locked} fullWidth type="button" variant="danger" onClick={() => setDeleteOpen(true)}>删除孩子资料</Button>
        </div>
      </form>
    ) : <div className="px-4 py-16 text-center"><p className="text-sm text-text-secondary">{error || '未找到这个孩子'}</p><Button className="mt-5" onClick={() => navigate('/family')}>返回我的家人</Button></div>}

    <FamilyEditorConfirmDialog confirmLabel="放弃修改" description="当前修改尚未保存。返回后，这些修改将不会保留。" onCancel={() => blocker.state === 'blocked' && blocker.reset()} onConfirm={() => { allowNavigationRef.current = true; if (blocker.state === 'blocked') blocker.proceed() }} open={blocker.state === 'blocked'} title="要放弃未保存的修改吗？" />
    <FamilyEditorConfirmDialog cancelLabel="取消" confirmLabel="确认删除" danger description="删除后，这个孩子的资料及相关记录将无法恢复。" loading={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={() => void remove()} open={deleteOpen} title="删除孩子资料？" />
  </main>
}
