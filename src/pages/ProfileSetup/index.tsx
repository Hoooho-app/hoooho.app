import { LockKeyhole } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, WebPageHeader } from '../../components/common'
import { FamilyAvatarEditor, type FamilyAvatarMode } from '../../components/family/FamilyAvatarEditor'
import { ApiRequestError } from '../../services/apiClient'
import { familyMemberService } from '../../services/familyMembers'
import { useAppStore } from '../../store/useAppStore'
import type { FamilyMemberApiDto, ProfileGender } from '../../types'
import { createClayAvatarConfig, parseClayAvatar, remapClayAvatarRole, serializeClayAvatar, type ClayAvatarConfig } from '../../utils/clayAvatar'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { parseVirtualAvatarId } from '../../utils/virtualAvatar'
import { getBirthdayAgeMessage, type BirthdayPrecision } from './birthdayAgeMessage'

export function ProfileSetupPage() {
  const navigate = useNavigate()
  const token = useAppStore((state) => state.authToken)
  const clearAuthSession = useAppStore((state) => state.clearAuthSession)
  const setProfile = useAppStore((state) => state.setProfile)
  const [selfMember, setSelfMember] = useState<FamilyMemberApiDto | null>(null)
  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [birthdayPrecision, setBirthdayPrecision] = useState<BirthdayPrecision>('year')
  const [gender, setGender] = useState<ProfileGender>('')
  const [avatarMode, setAvatarMode] = useState<FamilyAvatarMode>('cartoon')
  const [avatarConfig, setAvatarConfig] = useState<ClayAvatarConfig | null>(null)
  const [photoAvatar, setPhotoAvatar] = useState('')
  const [avatarTouched, setAvatarTouched] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const hasAvatarProfile = Boolean(name.trim() && birthday && (gender === 'male' || gender === 'female'))

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    familyMemberService.list(token, controller.signal)
      .then((members) => {
        const self = members.find((member) => member.isSelf) ?? null
        setSelfMember(self)
        if (self && self.name !== '我') setName(self.name)
        if (self?.birthday) {
          setBirthday(self.birthday)
          setBirthdayPrecision(/^\d{4}$/.test(self.birthday) ? 'year' : 'date')
        }
        if (self?.gender === 'male' || self?.gender === 'female') setGender(self.gender)
        const savedConfig = parseClayAvatar(self?.avatar)
        if (savedConfig) setAvatarConfig(savedConfig)
        else if (self?.avatar && !parseVirtualAvatarId(self.avatar)) {
          setAvatarMode('photo')
          setPhotoAvatar(self.avatar)
        }
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

  useEffect(() => {
    const cleanName = name.trim()
    if (!cleanName || !birthday || (gender !== 'male' && gender !== 'female')) {
      if (!avatarTouched) setAvatarConfig(null)
      return
    }
    setAvatarConfig((current) => {
      if (!current || !avatarTouched) return createClayAvatarConfig(cleanName, birthday, gender, selfMember?.id)
      return remapClayAvatarRole(current, birthday, gender)
    })
  }, [avatarTouched, birthday, gender, name, selfMember?.id])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanName = name.trim()

    if (!cleanName || cleanName.length > 20) {
      setError('请输入 1–20 个字符的姓名')
      return
    }
    const currentYear = new Date().getUTCFullYear()
    if (
      !birthday
      || (birthdayPrecision === 'year' && (!/^\d{4}$/.test(birthday) || Number(birthday) > currentYear))
    ) {
      setError(birthdayPrecision === 'year' ? '请输入有效且不晚于今年的出生年份' : '请选择出生日期')
      return
    }
    if (gender !== 'male' && gender !== 'female') {
      setError('请选择性别')
      return
    }
    if (!token) {
      setError('暂时无法创建家庭成员，请重新登录后再试')
      return
    }

    setError('')
    setSubmitting(true)
    if (avatarMode === 'photo' && !photoAvatar) {
      setError('请先点击相机上传照片头像')
      return
    }
    if (avatarMode === 'cartoon' && !avatarConfig) {
      setError('请完整填写姓名、出生日期和性别')
      return
    }
    const avatar = avatarMode === 'photo' ? photoAvatar : serializeClayAvatar(avatarConfig!)
    try {
      const member = selfMember ? await familyMemberService.update(selfMember.id, {
        name: cleanName,
        birthday,
        gender,
        avatar
      }, token) : await familyMemberService.createSelf({ name: cleanName, birthday, gender, avatar }, token)
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
      <WebPageHeader title="添加第一个家人" />

      <form className="flex flex-1 flex-col px-5" noValidate onSubmit={submit}>
        {avatarConfig && hasAvatarProfile && (
          <div className="mx-auto mt-3 w-full max-w-sm">
            <FamilyAvatarEditor
              compact
              config={avatarConfig}
              disabled={loading || submitting}
              mode={avatarMode}
              name={name.trim() || '家人'}
              onConfigChange={(next) => { setAvatarConfig(next); setAvatarTouched(true) }}
              onError={setError}
              onModeChange={setAvatarMode}
              onPhotoChange={setPhotoAvatar}
              photo={photoAvatar}
            />
          </div>
        )}
        <div className="mt-4 space-y-4">
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

          <fieldset className="hoho-field" disabled={loading || submitting}>
            <legend className="sr-only">出生日期 *</legend>
            <div className="overflow-hidden rounded-medium border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
              <div className="flex items-center justify-between gap-3 px-3 pt-2">
                <label className="hoho-text-label" htmlFor="profile-birthday">出生日期 *</label>
                <div aria-label="出生日期精度" className="hoho-segmented-control grid w-40 grid-cols-2" role="group">
                  {([
                    ['year', '仅年份'],
                    ['date', '完整日期']
                  ] as const).map(([value, label]) => (
                    <button
                      aria-pressed={birthdayPrecision === value}
                      data-selected={birthdayPrecision === value}
                      key={value}
                      type="button"
                      onClick={() => {
                        setBirthdayPrecision(value)
                        setBirthday(value === 'year' ? birthday.slice(0, 4) : '')
                        setError('')
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {birthdayPrecision === 'year' ? (
                <input
                  aria-describedby="profile-birthday-message"
                  autoComplete="bday-year"
                  className="hoho-input border-0 bg-transparent px-3 pb-3 pt-1 focus:border-0 focus:shadow-none"
                  id="profile-birthday"
                  inputMode="numeric"
                  maxLength={4}
                  name="birth-year"
                  pattern="[0-9]{4}"
                  value={birthday}
                  onChange={(event) => {
                    setBirthday(event.target.value.replace(/\D/g, '').slice(0, 4))
                    setError('')
                  }}
                />
              ) : (
                <input
                  aria-describedby="profile-birthday-message"
                  autoComplete="bday"
                  className="hoho-input border-0 bg-transparent px-3 pb-3 pt-1 focus:border-0 focus:shadow-none"
                  id="profile-birthday"
                  max={new Date().toISOString().slice(0, 10)}
                  name="birthday"
                  type="date"
                  value={birthday}
                  onChange={(event) => {
                    setBirthday(event.target.value)
                    setError('')
                  }}
                />
              )}
            </div>
            <span className="hoho-field__message" id="profile-birthday-message">
              {getBirthdayAgeMessage(birthday, birthdayPrecision)}
            </span>
          </fieldset>

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

        <div className="mt-auto pt-2">
          <div aria-live="polite">
            {error && <p className="mb-2 text-xs text-danger">{error}</p>}
          </div>
          <Button disabled={loading || submitting} fullWidth type="submit">
            {loading ? '正在准备…' : submitting ? '正在保存…' : '完成'}
          </Button>
          <button className="mt-1 min-h-11 w-full text-sm font-medium text-text-secondary transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" disabled={loading || submitting} type="button" onClick={() => navigate('/health-events', { replace: true })}>
            跳过，稍后再添加
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-text-secondary">
            <LockKeyhole size={12} strokeWidth={1.8} />
            信息仅用于健康管理，不会对外公开
          </p>
        </div>
      </form>
    </main>
  )
}
