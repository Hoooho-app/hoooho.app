import { forwardRef } from 'react'
import type { IconProps } from './MaterialIcon'

// Owner-requested circular conversation symbols; shared by history and both new-chat entries.
function conversationIcon(plus: boolean) {
  return forwardRef<SVGSVGElement, IconProps>(function ConversationIcon({size=24,className='',strokeWidth:_weight,selected:_selected,...props},ref){
    return <svg {...props} ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`hoho-conversation-icon ${className}`.trim()} data-icon={plus?'conversation_bubble_add':'conversation_bubble'} aria-hidden="true" focusable="false">
      <path d="M20.5 11.5a8.5 8.5 0 0 1-12.25 7.63L3 20.5l1.37-5.25A8.5 8.5 0 1 1 20.5 11.5Z" />
      {plus&&<path d="M8 11.5h8m-4-4v8" />}
    </svg>
  })
}
export const ConversationBubble=conversationIcon(false)
export const ConversationBubblePlus=conversationIcon(true)
