import { ReceptionSurface } from '../../components/design-system/ReceptionSurface'
import welcomeNurse from '../../assets/nurse-triage/front-desk-welcome-20261025.webp'
import { SymptomFollowupCard } from './SymptomFollowupCard'

export function FrontDeskWelcome() {
  return <div className="front-desk-welcome">
    <ReceptionSurface media={<img className="front-desk-welcome__image" src={welcomeNurse} alt="黑发护士举手打招呼" width={640} height={640} loading="eager" decoding="async"/>} title={<>孩子的情况，<br/>慢慢说，我来记。</>} description="记清楚，也方便交给需要的人。"/>
    <SymptomFollowupCard/>
  </div>
}
