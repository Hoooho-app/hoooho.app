import type { ReactNode } from 'react'
import { CompleteImage } from '../../components/common/CompleteImage'
import nursePortrait from '../../assets/nurse-triage/nurses-idle-loop-1-poster.webp'
import { userInitial } from './userInitial'
import './NurseConversation.css'
import {Volume2,Square} from 'lucide-react'
import {HohoButton} from '../../components/design-system/HohoButton'

export function NurseMessage({ messageId, role, recorderName, children, assistantName = '值班护士', assistantAvatar, onRead, reading=false,readDisabled=false, conversation=false }: {
  messageId?:string
  role: 'assistant' | 'user'
  recorderName?: string
  children: ReactNode
  interrupted?: boolean
  assistantName?: string
  assistantAvatar?: ReactNode
  onRead?:()=>void
  reading?:boolean
  readDisabled?:boolean
  conversation?:boolean
}) {
  return <div data-message-id={messageId} className={`nurse-turn nurse-turn--${role}${conversation?' nurse-turn--conversation':''}`} role={conversation?'group':undefined} aria-label={conversation?(role==='user'?'我的消息':'护护的回复'):undefined}>
    {!conversation&&(role === 'user'
      ? <span className="nurse-avatar nurse-avatar--user" role="img" aria-label={`${recorderName || '用户'}的头像`}>{userInitial(recorderName)}</span>
      : <span className="nurse-avatar nurse-avatar--assistant" role="img" aria-label={assistantName}>{assistantAvatar ?? <CompleteImage src={nursePortrait} alt="" />}</span>)}
    <div className="nurse-turn-content">{conversation&&<span className={`nurse-avatar nurse-avatar--inline nurse-avatar--${role}`} role="img" aria-label={role==='assistant'?assistantName:`${recorderName||'用户'}的头像`}>{role==='assistant'?(assistantAvatar??<CompleteImage src={nursePortrait} alt=""/>):userInitial(recorderName)}</span>}{children}{role==='assistant'&&onRead&&<HohoButton variant="text" size="icon" disabled={readDisabled} aria-label={reading?'停止朗读':'朗读护士回复'} onClick={onRead}>{reading?<Square size={16} aria-hidden/>:<Volume2 size={18} aria-hidden/>}</HohoButton>}</div>
  </div>
}
