import { Activity, FileText, Pill, PlayCircle, Plus, UserRound, UserRoundPlus } from 'lucide-react'
import { useState } from 'react'
import { BottomSheetSurface, HohoButton, HohoSurfaceRow, Typography } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import type { FamilyMemberApiDto } from '../../types'

interface FirstUseHomeProps {
  creating: boolean
  error: string
  members: FamilyMemberApiDto[]
  onAddFamily: (continueToRecord: boolean) => void
  onCreateSelf: () => void
  onOpenGuide: () => void
  onSelectMember: (member: FamilyMemberApiDto) => void
}

const capabilities = [
  { icon: Activity, label: '症状和变化' },
  { icon: Pill, label: '用药、检查与就诊' },
  { icon: FileText, label: '就诊前摘要' }
]

export function FirstUseHome({ creating, error, members, onAddFamily, onCreateSelf, onOpenGuide, onSelectMember }: FirstUseHomeProps) {
  const [subjectOpen, setSubjectOpen] = useState(false)

  const chooseSelf = () => {
    setSubjectOpen(false)
    onCreateSelf()
  }

  const chooseFamily = () => {
    setSubjectOpen(false)
    onAddFamily(true)
  }

  return (
    <main className="app-shell flex min-h-dvh flex-col overflow-x-hidden bg-background pb-[max(28px,env(safe-area-inset-bottom))]">
      <MainAppHeader title="Hoooho" />
      <div className="flex-1 px-4 pb-4 pt-5 sm:px-6">
        <section aria-labelledby="first-use-title">
          <Typography id="first-use-title" variant="pageTitle">今天想记录什么？</Typography>
          <Typography className="mt-2 max-w-[32rem] text-text-secondary" variant="body">
            身体不舒服、正在观察，或者只是想留下一条健康记录，都可以从这里开始。
          </Typography>

          <HohoButton
            className="mt-6 min-h-[148px] rounded-card text-lg shadow-card [&_.hoho-button__content]:flex-col"
            disabled={creating}
            fullWidth
            loading={creating}
            onClick={() => setSubjectOpen(true)}
          >
            {!creating && <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-surface"><Plus aria-hidden="true" size={32} strokeWidth={1.7} /></span>}
            <span className="mt-3">{creating ? '正在开始记录…' : '记录一件健康情况'}</span>
          </HohoButton>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-card bg-primary-soft px-3 text-center font-semibold text-heading transition hover:bg-primary-soft/70 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" type="button" onClick={() => onAddFamily(false)}>
              <UserRoundPlus aria-hidden="true" className="text-primary" size={31} strokeWidth={1.7} />
              添加家人
            </button>
            <button className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-card bg-primary-soft px-3 text-center font-semibold text-heading transition hover:bg-primary-soft/70 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" type="button" onClick={onOpenGuide}>
              <PlayCircle aria-hidden="true" className="text-primary" size={31} strokeWidth={1.7} />
              看看怎么使用
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-danger" aria-live="polite">{error}</p>}
        </section>

        <section className="mt-8" aria-labelledby="capability-title">
          <Typography id="capability-title" variant="sectionTitle">记录之后，可以帮你持续整理</Typography>
          <div className="mt-3 divide-y divide-border">
            {capabilities.map(({ icon: Icon, label }) => (
              <div className="flex min-h-[72px] items-center gap-4" key={label}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon aria-hidden="true" size={23} strokeWidth={1.7} /></span>
                <span className="text-[15px] font-medium text-heading">{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <BottomSheetSurface label="选择记录对象" onClose={() => setSubjectOpen(false)} open={subjectOpen} title="这件事发生在谁身上？">
        <div className="space-y-2">
          {members.length === 0 ? (
            <>
              <HohoSurfaceRow leading={<UserRound aria-hidden="true" size={21} />} title="我自己" onActivate={chooseSelf} />
              <HohoSurfaceRow leading={<UserRoundPlus aria-hidden="true" size={21} />} title="家人" onActivate={chooseFamily} />
            </>
          ) : members.map((member) => (
            <HohoSurfaceRow key={member.id} leading={<UserRound aria-hidden="true" size={21} />} title={member.name} onActivate={() => { setSubjectOpen(false); onSelectMember(member) }} />
          ))}
        </div>
      </BottomSheetSurface>
    </main>
  )
}
