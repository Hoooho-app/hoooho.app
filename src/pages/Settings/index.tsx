import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SettingsRow, ToggleSwitch, WebPageHeader } from '../../components/common'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { useAppStore } from '../../store/useAppStore'
import { makeFeedbackState } from '../../features/feedback/navigation'

export function SettingsPage() {
  const navigate = useNavigate()
  const rows = [
    ['账号设置', '头像、昵称与登录安全', '/settings/account'],
    ['通知设置', '提醒与免打扰', '/settings/notification'],
    ['隐私设置', '健康数据与授权', '/settings/privacy'],
    ['消息中心', '健康提醒与系统消息', '/messages'],
    ['帮助中心', '查找使用方法和常见问题', '/help'],
    ['我的反馈', '查看反馈记录和处理进度', '/feedback/mine'],
    ['反馈意见', '告诉我们哪里不好用', '/feedback'],
    ['数据管理', '导出与删除健康数据', '/settings/privacy'],
    ['关于 Hoooho', '版本、协议与隐私政策', '/about']
  ] as const

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="设置" fallback="/health-events" />
      <div className="settings-group mx-4 my-5">
        {rows.map(([title, description, to]) => <SettingsRow key={title} title={title} description={description} onClick={() => navigate(to, to === '/feedback' ? { state: makeFeedbackState('/settings', '我的', window.scrollY) } : undefined)} />)}
      </div>
    </main>
  )
}

export function AccountSettingsPage() {
  const member = useCurrentMember()
  const profile = useAppStore((state) => state.profile)
  const phone = useAppStore((state) => state.authUser?.phone)
  const email = useAppStore((state) => state.authUser?.email)
  const maskedPhone = phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '未登录'
  const accountIdentifier = email ?? maskedPhone
  const loginMethod = email ? '邮箱验证码登录' : '手机号登录'
  const rows = [
    ['头像', member.name],
    ['昵称', member.name],
    [email ? '邮箱' : '手机号', accountIdentifier],
    ['登录方式', loginMethod],
    ['修改密码', '']
  ] as const

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="账号设置" fallback="/settings" />
      <div className="settings-group mx-4 my-5">
        {rows.map(([title, value]) => <SettingsRow key={title} title={title} description={value || undefined} />)}
        {!profile && <p className="px-1 text-xs leading-5 text-text-secondary">首次完善个人资料后，昵称与头像信息会同步显示在这里。</p>}
      </div>
    </main>
  )
}

export function NotificationSettingsPage() {
  const notifications = useAppStore((state) => state.notifications)
  const setNotification = useAppStore((state) => state.setNotification)
  const setQuietHours = useAppStore((state) => state.setQuietHours)
  const rows = [
    ['healthEvent', '健康事件提醒', '事件更新与阶段变化'],
    ['medication', '用药提醒', '按记录时间进行提醒'],
    ['followUp', '复查提醒', '复查日期临近时提醒'],
    ['familyHealth', '家庭成员健康提醒', '关注家人的重要变化'],
    ['system', '系统通知', '产品服务与安全消息']
  ] as const

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="通知设置" fallback="/settings" />
      <div className="settings-group mx-4 my-5">
        {rows.map(([key, title, description]) => (
          <SettingsRow key={key} title={title} description={description} action={<ToggleSwitch label={title} checked={notifications[key]} onChange={(checked) => setNotification(key, checked)} />} />
        ))}
        <label className="flex min-h-16 items-center gap-3 border-t bg-surface px-4 py-3">
          <span className="min-w-0 flex-1"><strong className="block text-sm font-medium">免打扰时间</strong><span className="mt-0.5 block text-xs text-text-secondary">夜间不发送普通提醒</span></span>
          <select className="bg-transparent text-xs text-text-secondary outline-none" value={notifications.quietHours} onChange={(event) => setQuietHours(event.target.value)}>
            <option>22:00 - 07:00</option><option>23:00 - 08:00</option><option>关闭</option>
          </select>
        </label>
      </div>
    </main>
  )
}

export function PrivacySettingsPage() {
  const navigate = useNavigate()
  const [permissions, setPermissions] = useState({ health: true, family: true, ai: true })
  const exportData = () => {
    const data = localStorage.getItem('hoooho-app') ?? '{}'
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'hoooho-health-data.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  const deleteData = () => {
    if (!window.confirm('确认删除本设备上的 Hoooho 健康数据？此操作无法撤销。')) return
    localStorage.removeItem('hoooho-app')
    navigate('/login', { replace: true })
    window.location.reload()
  }

  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="隐私设置" fallback="/settings" />
      <div className="settings-group mx-4 my-5">
        <SettingsRow title="健康数据授权" description="允许本地保存健康信息" action={<ToggleSwitch label="健康数据授权" checked={permissions.health} onChange={(health) => setPermissions((state) => ({ ...state, health }))} />} />
        <SettingsRow title="家庭成员数据共享" description="在家庭成员间共享相关记录" action={<ToggleSwitch label="家庭成员数据共享" checked={permissions.family} onChange={(family) => setPermissions((state) => ({ ...state, family }))} />} />
        <SettingsRow title="AI分析授权" description="允许整理用户主动提交的信息" action={<ToggleSwitch label="AI分析授权" checked={permissions.ai} onChange={(ai) => setPermissions((state) => ({ ...state, ai }))} />} />
        <SettingsRow title="导出健康数据" description="导出本设备的 Mock 数据" onClick={exportData} />
        <SettingsRow title="删除健康数据" description="删除本设备保存的数据" onClick={deleteData} />
      </div>
    </main>
  )
}
