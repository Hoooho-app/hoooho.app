import { FormEvent, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, WebPageHeader } from '../../components/common'
import { FamilyAvatarEditor, type FamilyAvatarMode } from '../../components/family/FamilyAvatarEditor'
import { RecordSubjectCard } from '../../components/health'
import { isSafeReturnPath, type FamilyLocationState } from '../../components/navigation/navigationState'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { ChildConcernFocus, FamilyMemberApiDto, Member, ProfileGender } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { createClayAvatarConfig, remapClayAvatarRole, serializeClayAvatar, type ClayAvatarConfig } from '../../utils/clayAvatar'

export { EditFamilyMemberPage } from './EditFamilyMemberPage'

const genderLabel = { male: '男', female: '女', undisclosed: '未填写', '': '未填写' } as const

export function FamilyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const setMembers = useAppStore((state) => state.setMembers)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const switchMember = (member: Member) => {
    setCurrentMemberId(member.id)
    const entry = (location.state as FamilyLocationState | null)?.familyEntry
    const returnTo = isSafeReturnPath(entry?.returnTo) ? entry.returnTo : '/health-events'
    navigate(returnTo, {
      replace: true,
      state: {
        memberSwitchResult: {
          memberName: member.name,
          reopenDrawer: entry?.reopenDrawer === true
        }
      }
    })
  }

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    familyMemberService.list(token, controller.signal)
      .then((items) => setMembers(items.map(adaptFamilyMember)))
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          clearAuthSession()
          navigate('/login', { replace: true })
          return
        }
        setError(requestError instanceof Error ? requestError.message : '孩子资料加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, navigate, setMembers, token])

  return (
    <main className="app-shell family-page pb-0">
      <WebPageHeader title="我的孩子" fallback="/home" action={
        <button className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-primary" type="button" onClick={() => navigate('/children/new')}><Plus aria-hidden="true" size={16} />添加孩子</button>
      } />
      <div className="family-page__content space-y-3 px-4 py-4">
        {!loading && !error && <p className="family-page__intro">选择一个孩子查看对应的随记、追踪和档案，不提供混合查看。</p>}
        {loading && <p className="py-12 text-center text-sm text-text-secondary">正在加载孩子…</p>}
        {error && <p className="py-8 text-center text-sm text-danger">{error}</p>}
        {!loading && !error && members.map((member) => {
          const current = member.id === currentMemberId
          return (
            <RecordSubjectCard
              action={current
                ? <span className="rounded-pill bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary">当前孩子</span>
                : <button className="rounded-pill border border-primary/30 px-2.5 py-1.5 text-xs font-medium text-primary" type="button" onClick={() => switchMember(member)}>切换孩子</button>}
              age={member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}
              avatar={member.avatar}
              gender={genderLabel[member.gender ?? '']}
              key={member.id}
              name={member.name}
            />
          )
        })}
      </div>
    </main>
  )
}

type RequiredGender = Extract<ProfileGender, 'male' | 'female'> | ''

export function AddFamilyMemberPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const addMember = useAppStore((state) => state.addMember)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<RequiredGender>('')
  const [birthday, setBirthday] = useState('')
  const [avatarMode, setAvatarMode] = useState<FamilyAvatarMode>('cartoon')
  const [avatarConfig, setAvatarConfig] = useState<ClayAvatarConfig | null>(null)
  const [photoAvatar, setPhotoAvatar] = useState('')
  const [avatarTouched, setAvatarTouched] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [createdMember, setCreatedMember] = useState<FamilyMemberApiDto | null>(null)
  const [premature, setPremature] = useState(false)
  const [concernFocus, setConcernFocus] = useState<ChildConcernFocus[]>([])
  const hasAvatarProfile = Boolean(name.trim() && birthday && gender)

  useEffect(() => {
    const cleanName = name.trim()
    if (!cleanName || !birthday || !gender) {
      if (!avatarTouched) setAvatarConfig(null)
      return
    }
    setAvatarConfig((current) => {
      if (!current || !avatarTouched) return createClayAvatarConfig(cleanName, birthday, gender)
      return remapClayAvatarRole(current, birthday, gender)
    })
  }, [avatarTouched, birthday, gender, name])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (photoProcessing) return
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 20 || !birthday || !gender || !token) {
      setError('请完整填写姓名、出生日期和性别')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const avatar = avatarMode === 'photo' ? photoAvatar : avatarConfig ? serializeClayAvatar(avatarConfig) : undefined
      const created = createdMember ?? await familyMemberService.create({ name: cleanName, birthday, gender, avatar, premature }, token)
      if (!createdMember) {
        setCreatedMember(created)
        addMember(adaptFamilyMember(created) as Member)
        setSubmitting(false)
        return
      }
      const firstUseEntry = (location.state as { firstUseEntry?: { continueToRecord?: boolean; returnTo?: string } } | null)?.firstUseEntry
      if (firstUseEntry?.continueToRecord) {
        setCurrentMemberId(created.id)
        navigate('/health-events', { replace: true, state: { openQuickRecord: true } })
      } else if (firstUseEntry?.returnTo === '/health-events') {
        setCurrentMemberId(created.id)
        navigate('/home', { replace: true })
      } else {
        navigate('/family', { replace: true })
      }
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        navigate('/login', { replace: true })
        return
      }
      setError(requestError instanceof Error ? requestError.message : '添加失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const finishConcern = async () => {
    if (!createdMember || !token || submitting) return
    setSubmitting(true); setError('')
    try {
      const updated = await familyMemberService.update(createdMember.id, { concernFocus: concernFocus.length ? concernFocus : ['none'] }, token)
      addMember(adaptFamilyMember(updated)); setCurrentMemberId(updated.id)
      navigate('/home', { replace: true })
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '保存失败，请稍后重试') }
    finally { setSubmitting(false) }
  }

  if (createdMember) return <main className="app-shell flex flex-col pb-0"><WebPageHeader title="添加孩子" fallback="/children" /><section className="child-concern-step"><span>孩子已添加</span><h1>最近主要在关注什么？</h1><p>用于初始化页面内容，不代表诊断。可以跳过，之后随时开始记录。</p><div>{([['reaction','过敏或反复身体反应'],['growth','身高体重或营养'],['recurring_discomfort','反复出现的不适'],['none','目前没有特定问题，先开始记录']] as const).map(([value,label]) => <button aria-pressed={concernFocus.includes(value)} data-selected={concernFocus.includes(value)} key={value} onClick={() => setConcernFocus(value === 'none' ? ['none'] : [...concernFocus.filter((item) => item !== 'none' && item !== value), ...(concernFocus.includes(value) ? [] : [value])])} type="button">{label}</button>)}</div>{error && <p className="text-xs text-danger">{error}</p>}<Button disabled={submitting} fullWidth onClick={() => void finishConcern()}>{submitting ? '正在保存…' : '开始记录'}</Button></section></main>

  return (
    <main className="app-shell flex flex-col pb-0">
      <WebPageHeader title="添加孩子" fallback="/children" />
      <form className="flex flex-1 flex-col px-4 py-5" onSubmit={submit}>
        {avatarConfig && hasAvatarProfile && (
          <div className="mx-auto mb-5 w-full max-w-sm">
            <FamilyAvatarEditor
              config={avatarConfig}
              disabled={submitting}
              mode={avatarMode}
              name={name.trim() || '孩子'}
              onConfigChange={(next) => { setAvatarConfig(next); setAvatarTouched(true) }}
              onError={setError}
              onModeChange={setAvatarMode}
              onPhotoChange={setPhotoAvatar}
              onProcessingChange={setPhotoProcessing}
              photo={photoAvatar}
            />
          </div>
        )}
        <div className="space-y-5 rounded-card bg-surface p-4 shadow-card">
          <Input label="姓名或小名 *" name="name" maxLength={20} placeholder="例如：乐乐" value={name} disabled={submitting} onChange={(event) => { setName(event.target.value); setError('') }} />
          <Input label="出生日期 *" name="birthday" type="date" max={getLocalDateKey(new Date()) ?? undefined} hint="系统将根据出生日期自动计算年龄" value={birthday} disabled={submitting} onChange={(event) => { setBirthday(event.target.value); setError('') }} />
          <fieldset disabled={submitting}>
            <legend className="text-sm font-medium">性别 *</legend>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {([['male', '男'], ['female', '女']] as const).map(([value, label]) => (
                <label key={value} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border text-sm transition ${gender === value ? 'border-primary bg-primary-soft font-semibold text-primary' : 'bg-surface'}`}>
                  <input className="h-4 w-4 accent-primary" type="radio" name="gender" value={value} checked={gender === value} onChange={() => { setGender(value); setError('') }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-12 items-center gap-3 text-sm"><input checked={premature} className="h-5 w-5 accent-primary" onChange={(event) => setPremature(event.target.checked)} type="checkbox" /><span>是否早产（可选）</span></label>
        </div>

        <div className="mt-auto pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
          <div className="min-h-5" aria-live="polite">{error && <p className="text-xs text-danger">{error}</p>}</div>
          <Button className="mt-2" disabled={submitting || photoProcessing} fullWidth type="submit">{submitting ? '正在添加…' : '继续'}</Button>
        </div>
      </form>
    </main>
  )
}
