import { Bell, Copy, Link, Send, UserRound, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { BottomSheetSurface, HealthCard, HohoButton, HohoToggle, Typography } from '../../../components/design-system'

type Recorder = 'self' | 'family'

const focusOptions = ['血压', '头晕', '用药', '饮食作息', '睡眠', '照片']

interface ObservationSheetProps {
  onClose: () => void
  onComingSoon: () => void
  open: boolean
}

export function ObservationSheet({ onClose, onComingSoon, open }: ObservationSheetProps) {
  const [recorder, setRecorder] = useState<Recorder>('self')
  const [focuses, setFocuses] = useState(['头晕', '用药'])
  const [following, setFollowing] = useState(true)

  const toggleFocus = (focus: string) => setFocuses((current) => current.includes(focus)
    ? current.filter((item) => item !== focus)
    : [...current, focus])

  return (
    <BottomSheetSurface
      footer={<HohoButton fullWidth onClick={onComingSoon}>开始协作观察</HohoButton>}
      label="观察设置"
      onClose={onClose}
      open={open}
      title="观察"
    >
      <div className="space-y-5">
        <section>
          <Typography variant="label">1. 谁来记录</Typography>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <RecorderChoice active={recorder === 'self'} description="由当前账号继续补充变化" icon={UserRound} label="自己记录" onClick={() => setRecorder('self')} />
            <RecorderChoice active={recorder === 'family'} description="邀请家人通过链接一起记录" icon={UsersRound} label="家人协作" onClick={() => setRecorder('family')} />
          </div>
        </section>

        {recorder === 'family' && (
          <section>
            <Typography variant="label">2. 协作链接</Typography>
            <HealthCard className="mt-3 shadow-none">
              <div className="flex items-center gap-2 text-sm font-medium"><Link className="text-primary" size={18} />hoho.app/care/8K2F...</div>
              <Typography className="mt-2" variant="caption">家人可通过链接补录测量数据、症状变化、作息和图片。</Typography>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <HohoButton onClick={onComingSoon} variant="secondary"><Copy size={16} />复制链接</HohoButton>
                <HohoButton onClick={onComingSoon} variant="secondary"><Send size={16} />发送给家人</HohoButton>
              </div>
            </HealthCard>
          </section>
        )}

        <section>
          <Typography variant="label">{recorder === 'family' ? '3' : '2'}. 观察重点</Typography>
          <div className="mt-3 flex flex-wrap gap-2">
            {focusOptions.map((focus) => (
              <button aria-pressed={focuses.includes(focus)} className="health-observation-chip" data-selected={focuses.includes(focus)} key={focus} onClick={() => toggleFocus(focus)} type="button">{focus}</button>
            ))}
            <button className="health-observation-chip" onClick={onComingSoon} type="button">+ 添加其他</button>
          </div>
        </section>

        <section className="flex items-center gap-3 rounded-card border bg-surface px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Bell size={19} /></span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm">关注此事件</strong>
            <span className="mt-1 block text-xs leading-5 text-text-secondary">有新的协作记录或事件更新时提醒我。</span>
          </span>
          <HohoToggle checked={following} label="关注此事件" onChange={setFollowing} />
        </section>
      </div>
    </BottomSheetSurface>
  )
}

function RecorderChoice({ active, description, icon: Icon, label, onClick }: { active: boolean; description: string; icon: typeof UserRound; label: string; onClick: () => void }) {
  return (
    <button aria-pressed={active} className="health-recorder-choice" data-selected={active} onClick={onClick} type="button">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={20} /></span>
      <strong className="mt-2 block text-sm">{label}</strong>
      <span className="mt-1 block text-xs leading-5 text-text-secondary">{description}</span>
    </button>
  )
}
