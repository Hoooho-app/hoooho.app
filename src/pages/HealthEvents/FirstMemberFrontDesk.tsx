import { UserRoundPlus } from 'lucide-react'
import { HohoButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { NurseTriageDesk } from './NurseTriageDesk'

interface FirstMemberFrontDeskProps {
  busy: boolean
  error: string
  onAddMember: () => void
  reducedMotion: boolean
}

export function FirstMemberFrontDesk({ busy, error, onAddMember, reducedMotion }: FirstMemberFrontDeskProps) {
  return (
    <main className="app-shell first-member-front-desk flex min-h-[100dvh] flex-col overflow-hidden pb-[max(20px,env(safe-area-inset-bottom))]">
      <MainAppHeader title="Hoooho" />
      <section className="first-member-front-desk__content" aria-labelledby="first-member-title">
        <div className="first-member-front-desk__copy">
          <p className="first-member-front-desk__eyebrow">孩子健康记录台</p>
          <h1 id="first-member-title">先添加一个孩子</h1>
          <p>建立孩子身份后，随记、追踪和档案会始终分别保存。</p>
        </div>
        <div className="first-member-front-desk__visual">
          <NurseTriageDesk
            audioLevel={0}
            idleActive
            idleAnimationResetKey="first-member"
            reducedMotion={reducedMotion}
            state="idle"
          />
        </div>
        <div className="first-member-front-desk__actions">
          <HohoButton disabled={busy} fullWidth onClick={onAddMember} size="large">
            <UserRoundPlus aria-hidden="true" size={19} />
            {busy ? '正在准备…' : '添加孩子'}
          </HohoButton>
          {error && <p className="text-center text-xs text-danger" role="alert">{error}</p>}
        </div>
      </section>
    </main>
  )
}
