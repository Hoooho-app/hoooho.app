import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, WebPageHeader } from '../../components/common'
import { useAppStore } from '../../store/useAppStore'
import type { MemberRelation, ProfileGender } from '../../types'
import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

const genderLabel = { male: '男', female: '女', undisclosed: '不方便透露', '': '未填写' } as const

export function FamilyPage() {
  const navigate = useNavigate()
  const members = useAppStore((state) => state.members)
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const setCurrentMemberId = useAppStore((state) => state.setCurrentMemberId)

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="我的家人" fallback="/health-events" action={
        <button className="whitespace-nowrap text-[13px] font-medium text-primary" type="button" onClick={() => navigate('/family/new')}>+ 添加家人</button>
      } />
      <div className="space-y-3 px-4 py-4">
        {members.map((member) => {
          const current = member.id === currentMemberId
          return (
            <div key={member.id} className="flex h-16 items-center justify-between rounded-[16px] bg-surface px-4 py-3 shadow-card">
              <div>
                <strong className="block text-sm font-medium">{member.name}</strong>
                <span className="mt-0.5 block text-xs text-text-secondary">{genderLabel[member.gender ?? '']} · {member.birthday ? formatAgeFromBirthday(member.birthday) : member.age}</span>
              </div>
              {current ? (
                <span className="rounded-pill bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary">当前身份</span>
              ) : (
                <button className="rounded-pill border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary" type="button" onClick={() => setCurrentMemberId(member.id)}>切换身份</button>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}

export function AddFamilyMemberPage() {
  const navigate = useNavigate()
  const addMember = useAppStore((state) => state.addMember)
  const [relation, setRelation] = useState<MemberRelation>('子女')
  const [name, setName] = useState('')
  const [gender, setGender] = useState<ProfileGender>('')
  const [birthday, setBirthday] = useState('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !birthday || !gender) {
      setError('请完整填写姓名、性别和出生日期')
      return
    }
    addMember({
      id: `member-${Date.now()}`,
      name: name.trim(),
      age: formatAgeFromBirthday(birthday),
      relation,
      birthday,
      gender
    })
    navigate('/family', { replace: true })
  }

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="添加家庭成员" fallback="/family" />
      <form className="space-y-3 px-4 py-4" onSubmit={submit}>
        <label className="block rounded-card bg-surface px-4 py-2.5 shadow-card">
          <span className="block text-sm">关系选择</span>
          <select className="mt-1 w-full bg-transparent text-xs text-text-secondary outline-none" value={relation} onChange={(event) => setRelation(event.target.value as MemberRelation)}>
            <option value="父亲">爸爸</option><option value="母亲">妈妈</option><option value="子女">子女</option><option value="配偶">配偶</option><option value="其他">其他</option>
          </select>
        </label>
        <Input label="姓名" placeholder="请输入姓名" value={name} onChange={(event) => { setName(event.target.value); setError('') }} />
        <label className="block rounded-card bg-surface px-4 py-2.5 shadow-card">
          <span className="block text-sm">性别</span>
          <select className="mt-1 w-full bg-transparent text-xs text-text-secondary outline-none" value={gender} onChange={(event) => setGender(event.target.value as ProfileGender)}>
            <option value="">请选择</option><option value="male">男</option><option value="female">女</option><option value="undisclosed">不方便透露</option>
          </select>
        </label>
        <Input label="出生日期" type="date" max={new Date().toISOString().slice(0, 10)} value={birthday} onChange={(event) => { setBirthday(event.target.value); setError('') }} />
        <div className="min-h-5">{error && <p className="text-xs text-danger">{error}</p>}</div>
        <Button fullWidth type="submit">保存成员</Button>
      </form>
    </main>
  )
}
