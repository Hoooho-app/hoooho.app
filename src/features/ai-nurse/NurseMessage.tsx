import type { ReactNode } from 'react'
import { CompleteImage } from '../../components/common/CompleteImage'
import nursePortrait from '../../assets/nurse-triage/nurses-idle-loop-1-poster.webp'
import { userInitial } from './userInitial'
import './NurseConversation.css'
import {Volume2,Square} from 'lucide-react'
import {HohoButton} from '../../components/design-system/HohoButton'

export function NurseMessage({ role, recorderName, children, assistantName = '值班护士', assistantAvatar, onRead, reading=false }: {
  role: 'assistant' | 'user'
  recorderName?: string
  children: ReactNode
  interrupted?: boolean
  assistantName?: string
  assistantAvatar?: ReactNode
  onRead?:()=>void
  reading?:boolean
}) {
  return <div className={`nurse-turn nurse-turn--${role}`}>
    {role === 'user'
      ? <span className="nurse-avatar nurse-avatar--user" role="img" aria-label={`${recorderName || '用户'}的头像`}>{userInitial(recorderName)}</span>
      : <span className="nurse-avatar nurse-avatar--assistant" role="img" aria-label={assistantName}>{assistantAvatar ?? <CompleteImage src={nursePortrait} alt="" />}</span>}
    <div className="nurse-turn-content">{children}{role==='assistant'&&onRead&&<HohoButton variant="text" size="icon" aria-label={reading?'停止朗读':'朗读护士回复'} onClick={onRead}>{reading?<Square size={16} aria-hidden/>:<Volume2 size={18} aria-hidden/>}</HohoButton>}</div>
  </div>
}
