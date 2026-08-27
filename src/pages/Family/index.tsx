import { FormEvent, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, WebPageHeader } from '../../components/common'
import { RecordSubjectCard } from '../../components/health'
import { isSafeReturnPath, type FamilyLocationState } from '../../components/navigation/navigationState'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { Member, ProfileGender } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { createVirtualAvatarId } from '../../utils/virtualAvatar'

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
        setError(requestError instanceof Error ? requestError.message : '家庭成员加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, navigate, setMembers, token])

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="我的家人" fallback="/health-events" action={
        <button className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-[13px] font-medium text-primary" type="button" onClick={() => navigate('/family/new')}><Plus aria-hidden="true" size={16} />添加家人</button>
      } />
      <div className="space-y-3 px-4 py-4">
        {loading && <p className="py-12 text-center text-sm text-text-secondary">正在加载家人…</p>}
        {error && <p className="py-8 text-center text-sm text-danger">{error}</p>}
        {!loading && !error && members.map((member) => {
          const current = member.id === currentMemberId
          return (
            <RecordSubjectCard
              action={current
                ? <span className="rounded-pill bg-primary-soft px-2.5 py-1.5 text-xs font-medium text-primary">当前角色</span>
                : <button className="rounded-pill border border-primary/30 px-2.5 py-1.5 text-xs font-medium text-primary" type="button" onClick={() => switchMember(member)}>切换角色</button>}
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
  const token = useAppStore((state) => state.authToken)
  const addMember = useAppStore((state) => state.addMember)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const [name, setName] = useState('')
  const [gender, setGender] = useState<RequiredGender>('')
  const [birthday, setBirthday] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName || cleanName.length > 20 || !birthday || !gender || !token) {
      setError('请完整填写姓名、出生日期和性别')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const avatar = createVirtualAvatarId(birthday, gender)
      const created = await familyMemberService.create({ name: cleanName, birthday, gender, avatar }, token)
      addMember(adaptFamilyMember(created) as Member)
      navigate('/family', { replace: true })
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
          <p className="text-xs leading-5 text-text-secondary">保存后将根据年龄和性别自动生成虚拟头像，无需上传照片。</p>
        </div>

        <div className="mt-auto pb-[max(20px,env(safe-area-inset-bottom))] pt-6">
          <div className="min-h-5" aria-live="polite">{error && <p className="text-xs text-danger">{error}</p>}</div>
          <Button className="mt-2" disabled={submitting} fullWidth type="submit">{submitting ? '正在添加…' : '添加家庭成员'}</Button>
        </div>
      </form>
    </main>
  )
}
