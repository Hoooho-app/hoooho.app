import { ReceptionSurface } from '../../components/design-system/ReceptionSurface'
import welcomeNurse from '../../assets/nurse-triage/front-desk-welcome-masked-20261025.webp'

export function FrontDeskWelcome({memberName}:{memberName:string}) {
  return <div className="front-desk-welcome">
    <ReceptionSurface media={<img className="front-desk-welcome__image" src={welcomeNurse} alt="戴口罩的护士举手打招呼" width={531} height={640} loading="eager" decoding="async"/>} title={`${memberName}的情况，慢慢说过来记`}/>
  </div>
}
