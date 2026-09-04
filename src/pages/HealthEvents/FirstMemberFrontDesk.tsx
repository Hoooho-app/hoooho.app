import { UserRoundPlus } from 'lucide-react'
import { HohoButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { NurseTriageDesk } from './NurseTriageDesk'

interface FirstMemberFrontDeskProps {
  onAddMember: () => void
  reducedMotion: boolean
}

export function FirstMemberFrontDesk({ onAddMember, reducedMotion }: FirstMemberFrontDeskProps) {
  return (
    <main className="app-shell first-member-front-desk flex min-h-[100dvh] flex-col overflow-hidden pb-[max(20px,env(safe-area-inset-bottom))]">
      <MainAppHeader title="Hoooho" />
      <section className="first-member-front-desk__content" aria-labelledby="first-member-title">
        <div className="first-member-front-desk__copy">
          <p className="first-member-front-desk__eyebrow">家庭健康前台</p>
          <h1 id="first-member-title">先添加一位需要记录健康情况的人</h1>
          <div className="first-member-front-desk__intro">
            <p>为过敏儿童设计的健康连续记录</p>
            <p>孩子发生什么，就记录什么</p>
            <p>不用一次说完，有空了再补上</p>
          </div>
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
          <HohoButton fullWidth onClick={onAddMember} size="large">
            <UserRoundPlus aria-hidden="true" size={19} />
            添加孩子信息
          </HohoButton>
        </div>
      </section>
    </main>
  )
}
