import type { ReactNode } from 'react'
import { CompleteImage } from '../../components/common/CompleteImage'
import nursePortrait from '../../assets/nurse-triage/nurses-idle-loop-1-poster.webp'
import { userInitial } from './userInitial'
import './NurseConversation.css'

export function NurseMessage({ role, recorderName, children, interrupted = false }: {
  role: 'assistant' | 'user'
  recorderName?: string
  children: ReactNode
  interrupted?: boolean
}) {
  return <div className={`nurse-turn nurse-turn--${role}`}>
    {role === 'user'
      ? <span className="nurse-avatar nurse-avatar--user" role="img" aria-label={`${recorderName || '用户'}的头像`}>{userInitial(recorderName)}</span>
      : <span className="nurse-avatar nurse-avatar--assistant" role="img" aria-label="值班护士"><CompleteImage src={nursePortrait} alt="" /></span>}
    <div className="nurse-turn-content">{children}{interrupted && <small>回复已打断</small>}</div>
  </div>
}
