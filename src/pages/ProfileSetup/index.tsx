import { ChevronLeft, LockKeyhole, Sparkles } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from '../../components/common'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto, ProfileGender } from '../../types'
import { createVirtualAvatarId } from '../../utils/virtualAvatar'

export function ProfileSetupPage() {
  const navigate = useNavigate()
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const setProfile = useAppStore((state) => state.setProfile)
  const [selfMember, setSelfMember] = useState<FamilyMemberApiDto | null>(null)
  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<ProfileGender>('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    familyMemberService.list(token, controller.signal)
      .then((members) => {
        const self = members.find((member) => member.isSelf) ?? null
        setSelfMember(self)
        if (self && self.name !== '我') setName(self.name)
        if (self?.birthday) setBirthday(self.birthday)
        if (self?.gender === 'male' || self?.gender === 'female') setGender(self.gender)
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        if (requestError instanceof ApiRequestError && requestError.status === 401) {
          clearAuthSession()
          navigate('/login', { replace: true })
          return
        }
        setError(requestError instanceof Error ? requestError.message : '家庭成员信息加载失败，请稍后重试')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clearAuthSession, navigate, token])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanName = name.trim()

    if (!cleanName || cleanName.length > 20) {
      setError('请输入 1–20 个字符的姓名')
      return
    }
    if (!birthday) {
      setError('请选择出生日期')
      return
    }
    if (gender !== 'male' && gender !== 'female') {
      setError('请选择性别')
      return
    }
    if (!token || !selfMember) {
      setError('暂时无法创建家庭成员，请重新登录后再试')
      return
    }

    setError('')
    setSubmitting(true)
    const avatar = createVirtualAvatarId(birthday, gender)
    try {
      const member = await familyMemberService.update(selfMember.id, {
        name: cleanName,
        birthday,
        gender,
        avatar
      }, token)
      setProfile({ nickname: member.name, birthday: member.birthday ?? birthday, gender, avatar: member.avatar ?? avatar }, member.id)
      navigate('/health-events', { replace: true })
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 401) {
        clearAuthSession()
        navigate('/login', { replace: true })
        return
      }
      setError(requestError instanceof Error ? requestError.message : '保存失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-shell flex flex-col pb-6">
      <header className="grid min-h-16 grid-cols-3 items-center px-3">
        <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="返回" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} strokeWidth={1.8} />
        </button>
      </header>

      <form className="flex flex-1 flex-col px-5" noValidate onSubmit={submit}>
        <div className="text-center">
          <h1 className="hoho-text-page-title">添加家人</h1>
          <p className="mt-3 text-sm leading-7 text-text-secondary">
            先添加第一个家人，
            <br />
            方便开始记录健康事件
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-card border bg-surface px-4 py-3.5 text-left">
          <Sparkles className="mt-0.5 shrink-0 text-primary" size={18} strokeWidth={1.8} />
          <p className="text-xs leading-5 text-text-secondary">
            无需上传照片。系统会根据年龄和性别，自动分配一个卡通头像。
          </p>
        </div>

        <div className="mt-7 space-y-5">
          <Input
            label="姓名 *"
            name="name"
            autoComplete="name"
            maxLength={20}
            placeholder="请输入姓名"
            value={name}
            disabled={loading || submitting}
            onChange={(event) => {
              setName(event.target.value)
              setError('')
            }}
          />

          <Input
            label="出生日期 *"
            name="birthday"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            hint="系统将根据出生日期自动计算年龄"
            value={birthday}
            disabled={loading || submitting}
            onChange={(event) => {
              setBirthday(event.target.value)
              setError('')
            }}
          />

          <fieldset disabled={loading || submitting}>
            <legend className="text-sm font-medium">性别 *</legend>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {([
                ['male', '男'],
                ['female', '女']
              ] as const).map(([value, label]) => (
                <label key={value} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border text-sm transition ${gender === value ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border bg-surface'}`}>
                  <input className="h-4 w-4 accent-primary" type="radio" name="gender" value={value} checked={gender === value} onChange={() => { setGender(value); setError('') }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-auto pt-6">
          <div className="min-h-5" aria-live="polite">
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
          <Button className="mt-2" disabled={loading || submitting || !selfMember} fullWidth type="submit">
            {loading ? '正在准备…' : submitting ? '正在保存…' : '完成'}
          </Button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text-secondary">
            <LockKeyhole size={12} strokeWidth={1.8} />
            信息仅用于健康管理，不会对外公开
          </p>
        </div>
      </form>
    </main>
  )
}
