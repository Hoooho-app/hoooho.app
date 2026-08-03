import { Camera, Check, ChevronLeft, LockKeyhole, UserRound } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from '../../components/common'
import { useAppStore } from '../../store/useAppStore'
import type { ProfileGender } from '../../types'

export function AccountCreatedPage() {
  const navigate = useNavigate()

  return (
    <main className="app-shell flex flex-col bg-surface px-6 pb-8">
      <button className="mt-4 grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="返回" onClick={() => navigate(-1)}>
        <ChevronLeft size={22} strokeWidth={1.8} />
      </button>

      <section className="flex flex-1 flex-col items-center justify-center pb-20 text-center">
        <div className="relative grid h-28 w-28 place-items-center rounded-full bg-primary-soft">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-surface shadow-floating">
            <Check size={36} strokeWidth={2} />
          </span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">创建成功！</h1>
        <p className="mt-4 text-sm leading-7 text-text-secondary">
          我们已为你创建 Hoooho 账号
          <br />
          请完善个人信息，开启健康管理之旅
        </p>
      </section>

      <Button fullWidth onClick={() => navigate('/onboarding/profile')}>去完善个人信息</Button>
    </main>
  )
}

export function ProfileSetupPage() {
  const navigate = useNavigate()
  const setProfile = useAppStore((state) => state.setProfile)
  const [nickname, setNickname] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<ProfileGender>('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanNickname = nickname.trim()

    if (!cleanNickname || cleanNickname.length > 20) {
      setError('请输入 1–20 个字符的昵称')
      return
    }
    if (!birthday) {
      setError('请选择出生日期')
      return
    }

    setProfile({ nickname: cleanNickname, birthday, gender })
    navigate('/health-events', { replace: true })
  }

  return (
    <main className="app-shell flex flex-col bg-surface pb-6">
      <header className="grid min-h-16 grid-cols-3 items-center px-3">
        <button className="grid h-11 w-11 place-items-center rounded-full hover:bg-primary-soft" type="button" aria-label="返回" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} strokeWidth={1.8} />
        </button>
      </header>

      <form className="flex flex-1 flex-col px-5" noValidate onSubmit={submit}>
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">完善你的健康信息</h1>
          <p className="mt-3 text-sm leading-7 text-text-secondary">
            方便记录健康事件，
            <br />
            也方便以后管理家人健康
          </p>
        </div>

        <div className="relative mx-auto mt-5 grid h-24 w-24 place-items-center rounded-full bg-primary-soft text-text-secondary">
          <UserRound size={46} strokeWidth={1.5} />
          <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-surface bg-primary text-surface">
            <Camera size={15} strokeWidth={1.8} />
          </span>
        </div>

        <div className="mt-7 space-y-5">
          <Input
            label="昵称 *"
            name="nickname"
            autoComplete="nickname"
            maxLength={20}
            placeholder="请输入昵称"
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value)
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
            onChange={(event) => {
              setBirthday(event.target.value)
              setError('')
            }}
          />

          <fieldset>
            <legend className="text-sm font-medium">性别（可选）</legend>
            <div className="mt-3 space-y-3">
              {([
                ['male', '男'],
                ['female', '女'],
                ['undisclosed', '不方便透露']
              ] as const).map(([value, label]) => (
                <label key={value} className="flex min-h-8 items-center gap-3 text-sm">
                  <input className="h-4 w-4 accent-primary" type="radio" name="gender" value={value} checked={gender === value} onChange={() => setGender(value)} />
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
          <Button className="mt-2" fullWidth type="submit">完成，开始记录健康</Button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text-secondary">
            <LockKeyhole size={12} strokeWidth={1.8} />
            信息仅用于健康管理，不会对外公开
          </p>
        </div>
      </form>
    </main>
  )
}
