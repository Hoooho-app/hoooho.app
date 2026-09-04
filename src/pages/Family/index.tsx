import { FormEvent, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, WebPageHeader } from '../../components/common'
import { ConfirmDialog } from '../../components/design-system'
import { FamilyAvatarEditor, type FamilyAvatarMode } from '../../components/family/FamilyAvatarEditor'
import { FamilyMemberSwipeRow } from '../../components/family/FamilyMemberSwipeRow'
import { RecordSubjectCard } from '../../components/health'
import { isSafeReturnPath, type FamilyLocationState } from '../../components/navigation/navigationState'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto, Member, ProfileGender } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { inferFamilyMemberRelationship } from '../../utils/childProfile'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { createClayAvatarConfig, remapClayAvatarRole, serializeClayAvatar, type ClayAvatarConfig } from '../../utils/clayAvatar'

export { EditFamilyMemberPage } from './EditFamilyMemberPage'

const genderLabel = { male: '男', female: '女', undisclosed: '不方便透露', '': '未填写' } as const

export function FamilyPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const setMembers = useAppStore((state) => state.setMembers)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const clearProfile = useAppStore((state) => state.clearProfile)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)

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
        setError(requestError instanceof Error ? requestError.message : '家庭成员加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, navigate, setMembers, token])

  const removeMember = async () => {
    if (!token || !pendingDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await familyMemberService.delete(pendingDelete.id, token)
      const remaining = members.filter((member) => member.id !== pendingDelete.id)
      setMembers(remaining)
      if (remaining.length === 0) clearProfile()
      else if (currentMemberId === pendingDelete.id) setCurrentMemberId(remaining[0].id)
      setPendingDelete(null)
      setOpenMemberId(null)
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        navigate('/login', { replace: true })
        return
      }
      setPendingDelete(null)
      setDeleteError(requestError instanceof Error ? requestError.message : '删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
    <main className="app-shell family-page pb-0">
      <WebPageHeader title="我的家人" fallback="/health-events" action={
        <button className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-primary" type="button" onClick={() => navigate('/family/new')}><Plus aria-hidden="true" size={16} />添加家人</button>
      } />
      <div className="family-page__content space-y-3 px-4 py-4">
        {loading && <p className="py-12 text-center text-sm text-text-secondary">正在加载家人…</p>}
        {error && <p className="py-8 text-center text-sm text-danger">{error}</p>}
        {deleteError && <p className="py-3 text-center text-sm text-danger" role="alert">{deleteError}</p>}
        {!loading && !error && members.map((member) => {
          const current = member.id === currentMemberId
          return (
            <FamilyMemberSwipeRow
              key={member.id}
              name={member.name}
              onDelete={() => { setOpenMemberId(null); setPendingDelete(member) }}
              onOpenChange={(open) => setOpenMemberId(open ? member.id : null)}
              open={openMemberId === member.id}
            >
              <RecordSubjectCard
                action={current
                  ? <span className="rounded-pill bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary">当前角色</span>
                  : <button className="rounded-pill border border-primary/30 px-2.5 py-1.5 text-xs font-medium text-primary" type="button" onClick={() => switchMember(member)}>切换记录对象</button>}
                age={member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}
                avatar={member.avatar}
                gender={genderLabel[member.gender ?? '']}
                label=""
                name={member.name}
              />
            </FamilyMemberSwipeRow>
          )
        })}
      </div>
    </main>
    <ConfirmDialog
      confirmLabel="确认删除"
      danger
      description={pendingDelete ? `删除后，${pendingDelete.name}的资料及相关健康记录将无法恢复。` : ''}
      loading={deleting}
      onCancel={() => setPendingDelete(null)}
      onConfirm={() => void removeMember()}
      open={Boolean(pendingDelete)}
      title={pendingDelete ? `删除${pendingDelete.name}？` : '删除家人？'}
    />
    </>
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
      if (avatarMode === 'photo' && !photoAvatar) {
        setError('请先点击相机上传照片头像')
        return
      }
      if (avatarMode === 'cartoon' && !avatarConfig) {
        setError('请完整填写姓名、出生日期和性别')
        return
      }
      const avatar = avatarMode === 'photo' ? photoAvatar : serializeClayAvatar(avatarConfig!)
      const created = createdMember ?? await familyMemberService.create({
        name: cleanName,
        birthday,
        gender,
        avatar,
        relationship: inferFamilyMemberRelationship(birthday)
      }, token)
      if (!createdMember) {
        setCreatedMember(created)
        addMember(adaptFamilyMember(created) as Member)
      }
      const firstUseEntry = (location.state as { firstUseEntry?: { continueToRecord?: boolean; returnTo?: string } } | null)?.firstUseEntry
      if (firstUseEntry?.continueToRecord) {
        setCurrentMemberId(created.id)
        navigate('/health-events', { replace: true, state: { openQuickRecord: true } })
      } else if (firstUseEntry?.returnTo === '/health-events') {
        setCurrentMemberId(created.id)
        navigate('/health-events', { replace: true })
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

  return (
    <main className="app-shell flex flex-col pb-0">
      <WebPageHeader title="添加家庭成员" fallback="/family" />
      <form className="flex flex-1 flex-col px-4 py-5" onSubmit={submit}>
        {avatarConfig && hasAvatarProfile && (
          <div className="mx-auto mb-5 w-full max-w-sm">
            <FamilyAvatarEditor
              config={avatarConfig}
              disabled={submitting}
              mode={avatarMode}
              name={name.trim() || '家人'}
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
          <Input label="姓名 *" name="name" maxLength={20} placeholder="请输入姓名" value={name} disabled={submitting} onChange={(event) => { setName(event.target.value); setError('') }} />
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
        </div>

        <div className="mt-auto pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
          <div className="min-h-5" aria-live="polite">{error && <p className="text-xs text-danger">{error}</p>}</div>
          <Button className="mt-2" disabled={submitting || photoProcessing} fullWidth type="submit">{submitting ? '正在添加…' : '添加家庭成员'}</Button>
        </div>
      </form>
    </main>
  )
}
