import { ReceptionSurface } from '../../components/design-system/ReceptionSurface'
import welcomeNurse from '../../assets/nurse-triage/front-desk-welcome-masked-20261025.webp'
import { SymptomFollowupCard } from './SymptomFollowupCard'

export function FrontDeskWelcome({compact=false}:{compact?:boolean}) {
  return <div className={`front-desk-welcome${compact?' front-desk-welcome--compact':''}`}>
    <ReceptionSurface media={<img className="front-desk-welcome__image" src={welcomeNurse} alt="戴口罩的护士举手打招呼" width={531} height={640} loading="eager" decoding="async"/>} title={<>孩子的情况，<br/>慢慢说，我来记。</>} description="记清楚，也方便交给需要的人。"/>
    <SymptomFollowupCard/>
  </div>
}
