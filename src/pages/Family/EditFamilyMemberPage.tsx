import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Camera, Droplet, Ruler, Scale, Trash2, UserRound } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Button, WebPageHeader } from '../../components/common'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { adaptFamilyMember } from '../../services/healthEventDetailAdapter'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto, ProfileGender } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'
import { createVirtualAvatarId, cycleVirtualAvatarId } from '../../utils/virtualAvatar'

type RequiredGender = Extract<ProfileGender, 'male' | 'female'>
type BloodType = 'A' | 'B' | 'AB' | 'O' | ''

const fieldClass = 'min-w-0 flex-1 bg-transparent text-right text-[15px] text-heading outline-none placeholder:text-text-secondary/70'

export function EditFamilyMemberPage() {
  const navigate = useNavigate()
  const { memberId = '' } = useParams()
  const token = useAppStore((state) => state.authToken)
  const members = useAppStore((state) => state.members)
  const profile = useAppStore((state) => state.profile)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)
  const setMembers = useAppStore((state) => state.setMembers)
  const setProfile = useAppStore((state) => state.setProfile)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const cachedMember = members.find((item) => item.id === memberId)

  const [sourceMember, setSourceMember] = useState<FamilyMemberApiDto | null>(null)
  const [name, setName] = useState(cachedMember?.name ?? '')
  const [birthday, setBirthday] = useState(cachedMember?.birthday ?? '')
  const [gender, setGender] = useState<RequiredGender>(cachedMember?.gender === 'female' ? 'female' : 'male')
  const [avatar, setAvatar] = useState(cachedMember?.avatar ?? '')
  const [heightCm, setHeightCm] = useState(cachedMember?.heightCm?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(cachedMember?.weightKg?.toString() ?? '')
  const [bloodType, setBloodType] = useState<BloodType>(cachedMember?.bloodType ?? '')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token || !memberId) return
    const controller = new AbortController()
    familyMemberService.getById(memberId, token, controller.signal)
      .then((member) => {
        setSourceMember(member)
        setName(member.name)
        setBirthday(member.birthday ?? '')
        setGender(member.gender === 'female' ? 'female' : 'male')
        setAvatar(member.avatar ?? (member.birthday && member.gender ? createVirtualAvatarId(member.birthday, member.gender) : ''))
        setHeightCm(member.heightCm?.toString() ?? '')
        setWeightKg(member.weightKg?.toString() ?? '')
        setBloodType(member.bloodType ?? '')
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          clearAuthSession()
          navigate('/login', { replace: true })
          return
        }
        setError(requestError instanceof Error ? requestError.message : '基础信息加载失败')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, memberId, navigate, token])

  const age = useMemo(() => birthday ? formatAgeFromBirthday(birthday) : '', [birthday])
  const previewAvatar = avatar || (birthday ? createVirtualAvatarId(birthday, gender) : undefined)

  const changeAvatar = () => {
    if (!birthday) {
      setError('请先填写出生日期，再更换虚拟头像')
      return
    }
    setAvatar(cycleVirtualAvatarId(previewAvatar, birthday, gender))
    setError('')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!token || !memberId || !name.trim() || !birthday) {
      setError('请完整填写姓名、出生日期和性别')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const saved = await familyMemberService.update(memberId, {
        name: name.trim(),
        birthday,
        gender,
        avatar: previewAvatar ?? null,
        heightCm: heightCm ? Number(heightCm) : null,
        weightKg: weightKg ? Number(weightKg) : null,
        bloodType: bloodType || null
      }, token)
      const adapted = adaptFamilyMember(saved)
      setMembers(members.map((member) => member.id === saved.id ? adapted : member))
      if (saved.relationship === 'self') {
        setProfile({ nickname: saved.name, birthday: saved.birthday ?? birthday, gender: saved.gender ?? gender, avatar: saved.avatar ?? undefined }, saved.id)
      }
      navigate(-1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '保存失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async () => {
    if (!token || !memberId || deleting) return
    if (!window.confirm(`确认删除“${name}”吗？删除后无法恢复。`)) return
    setDeleting(true)
    setError('')
    try {
      await familyMemberService.delete(memberId, token)
      const remaining = members.filter((member) => member.id !== memberId)
      setMembers(remaining)
      if (currentMemberId === memberId && remaining[0]) setCurrentMemberId(remaining[0].id)
      navigate(remaining.length ? '/family' : '/onboarding/profile', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '删除失败，请稍后重试')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <main className="app-shell flex min-h-dvh flex-col pb-0">
      <WebPageHeader title="编辑基本信息" fallback="/health-events" />

      {loading ? (
        <p className="py-20 text-center text-sm text-text-secondary">正在加载基本信息…</p>
      ) : sourceMember ? (
        <form className="flex flex-1 flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-5" onSubmit={save}>
          <button className="mx-auto flex flex-col items-center" type="button" onClick={changeAvatar}>
            <span className="relative">
              <Avatar name={name || '角色'} src={previewAvatar} size="xl" />
              <span className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-primary text-white shadow-card">
                <Camera size={18} strokeWidth={1.8} />
              </span>
            </span>
            <span className="mt-3 text-sm font-medium text-primary">更换头像</span>
          </button>

          <section className="mt-7 overflow-hidden rounded-card border border-border-calm bg-surface px-4 shadow-calm" aria-label="基础信息">
            <label className="flex min-h-[66px] items-center gap-3 border-b border-border">
              <UserRound className="shrink-0 text-primary" size={21} strokeWidth={1.7} />
              <span className="text-sm font-medium">姓名</span>
              <input className={fieldClass} maxLength={50} value={name} onChange={(event) => setName(event.target.value)} />
            </label>

            <label className="flex min-h-[76px] items-center gap-3 border-b border-border">
              <CalendarDays className="shrink-0 text-primary" size={21} strokeWidth={1.7} />
              <span className="text-sm font-medium">出生日期</span>
              <span className="ml-auto text-right">
                <input className={`${fieldClass} block`} type="date" max={new Date().toISOString().slice(0, 10)} value={birthday} onChange={(event) => setBirthday(event.target.value)} />
                {age && <span className="mt-1 block text-[11px] text-text-secondary">系统自动计算：{age}</span>}
              </span>
            </label>

            <div className="flex min-h-[70px] items-center gap-3 border-b border-border">
              <UserRound className="shrink-0 text-primary" size={21} strokeWidth={1.7} />
              <span className="text-sm font-medium">性别</span>
              <div className="ml-auto grid w-36 grid-cols-2 overflow-hidden rounded-control border border-border">
                {([['male', '男'], ['female', '女']] as const).map(([value, label]) => (
                  <button key={value} className={`min-h-10 text-sm ${gender === value ? 'bg-primary-soft font-semibold text-primary' : 'bg-surface text-text-secondary'}`} type="button" onClick={() => { setGender(value); if (birthday) setAvatar(createVirtualAvatarId(birthday, value)) }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex min-h-[66px] items-center gap-3 border-b border-border">
              <Ruler className="shrink-0 text-primary" size={21} strokeWidth={1.7} />
              <span className="text-sm font-medium">身高（cm）</span>
              <input className={fieldClass} inputMode="decimal" min="20" max="260" step="0.1" type="number" placeholder="未填写" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} />
            </label>

            <label className="flex min-h-[66px] items-center gap-3 border-b border-border">
              <Scale className="shrink-0 text-primary" size={21} strokeWidth={1.7} />
              <span className="text-sm font-medium">体重（kg）</span>
              <input className={fieldClass} inputMode="decimal" min="1" max="500" step="0.1" type="number" placeholder="未填写" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
            </label>

            <label className="flex min-h-[66px] items-center gap-3">
              <Droplet className="shrink-0 text-primary" size={21} strokeWidth={1.7} />
              <span className="text-sm font-medium">血型</span>
              <select className={fieldClass} value={bloodType} onChange={(event) => setBloodType(event.target.value as BloodType)}>
                <option value="">未填写</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="AB">AB</option>
                <option value="O">O</option>
              </select>
            </label>
          </section>

          <div className="mt-auto pt-7">
            <div className="min-h-5" aria-live="polite">{error && <p className="text-xs text-danger">{error}</p>}</div>
            <Button className="mt-2" disabled={submitting || deleting} fullWidth type="submit">{submitting ? '正在保存…' : '保存'}</Button>
            <button className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-danger bg-surface text-sm font-medium text-danger disabled:opacity-50" disabled={submitting || deleting} type="button" onClick={remove}>
              <Trash2 size={18} strokeWidth={1.7} />
              {deleting ? '正在删除…' : '删除此身份'}
            </button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-text-secondary">{error || '未找到该角色'}</p>
          <Button className="mt-5" onClick={() => navigate('/family')}>返回我的家人</Button>
        </div>
      )}
    </main>
  )
}
