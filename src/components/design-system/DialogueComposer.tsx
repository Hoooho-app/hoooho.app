import { useRef, useState } from 'react'
import { Camera, Keyboard, Mic, Send } from 'lucide-react'
import { HohoButton } from './HohoButton'
import './DialogueComposer.css'

/** One-row composer shared by record, nurse and product conversations. */
export function DialogueComposer({ text, onTextChange, onSend, onStart, onStop, onDiscard, onPhoto, disabled = false, voiceDisabled = false, listening = false, processing = false, initialTyping = false, maxLength = 4000, placeholder = '说说你的情况…' }: {
  text: string; onTextChange: (value: string) => void; onSend: () => void
  onStart: () => void; onStop: () => void; onDiscard?: () => void; onPhoto: () => void
  disabled?: boolean; voiceDisabled?: boolean; listening?: boolean; processing?: boolean
  maxLength?: number; placeholder?: string; initialTyping?: boolean
}) {
  const [typing, setTyping] = useState(initialTyping)
  const input = useRef<HTMLTextAreaElement>(null)
  return <div className="hoho-dialogue-composer">
    <HohoButton variant="ghost" className="hoho-dialogue-mode" disabled={disabled || listening || processing} onClick={() => { setTyping(!typing); if (!typing) requestAnimationFrame(() => input.current?.focus()) }} aria-label={typing ? '改用语音' : '改用文字'}>
      {typing ? <Mic size={18} aria-hidden/> : <Keyboard size={18} aria-hidden/>}<span>{typing ? '语音' : '改用文字'}</span>
    </HohoButton>
    {typing ? <div className="hoho-dialogue-text"><textarea ref={input} aria-label="对话输入" rows={1} maxLength={maxLength} value={text} placeholder={placeholder} disabled={disabled || processing} onChange={e => onTextChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend() } }}/><HohoButton variant="text" size="icon" aria-label="发送" disabled={disabled || processing || !text.trim()} onClick={onSend}><Send size={18} aria-hidden/></HohoButton></div> :
      <HohoButton variant="secondary" className="hoho-dialogue-hold" aria-label={listening ? '正在录音，松手发送' : '按住说话'} disabled={disabled || voiceDisabled || processing} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onStart() }} onPointerUp={onStop} onPointerCancel={() => (onDiscard ?? onStop)()} onLostPointerCapture={onStop} onContextMenu={e => e.preventDefault()} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); onStart() } if (e.key === 'Escape') (onDiscard ?? onStop)() }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onStop() } }}>
        <Mic size={18} aria-hidden/>{listening ? '正在听…' : processing ? '识别中…' : '按住说话'}
      </HohoButton>}
    <HohoButton variant="ghost" className="hoho-dialogue-photo" aria-label="拍照" disabled={disabled || listening || processing} onClick={onPhoto}><Camera size={19} aria-hidden/><span>拍照</span></HohoButton>
  </div>
}
