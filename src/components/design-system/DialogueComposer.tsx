import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Image, Keyboard, Mic, Send } from 'lucide-react'
import { HohoButton } from './HohoButton'
import './DialogueComposer.css'

export type DialoguePhotoSource = 'camera' | 'album'
/** A 44px row; choice and recording feedback float above it. */
export function DialogueComposer({ text, onTextChange, onSend, onStart, onStop, onDiscard, onPhoto, disabled = false, voiceDisabled = false, listening = false, processing = false, initialTyping = false, maxLength = 4000, placeholder = '说说你的情况…' }: {
  text: string; onTextChange: (value: string) => void; onSend: () => void
  onStart: () => void; onStop: () => void; onDiscard?: () => void; onPhoto: (source: DialoguePhotoSource) => void
  disabled?: boolean; voiceDisabled?: boolean; listening?: boolean; processing?: boolean
  maxLength?: number; placeholder?: string; initialTyping?: boolean
}) {
  const [typing, setTyping] = useState(initialTyping), [photoOpen, setPhotoOpen] = useState(false)
  const [press, setPress] = useState<{x:number;y:number}>()
  const input = useRef<HTMLTextAreaElement>(null), root = useRef<HTMLDivElement>(null), holding = useRef(false)
  const menuId = useId()
  useEffect(() => {
    if (!photoOpen) return
    const outside = (e:PointerEvent) => { if (!root.current?.contains(e.target as Node)) setPhotoOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [photoOpen])
  const start = (x:number,y:number) => { if (holding.current) return; holding.current=true;setPhotoOpen(false);setPress({x:Math.max(100,Math.min(innerWidth-100,x)),y});onStart() }
  const finish = (discard=false) => { if (!holding.current) return;holding.current=false;setPress(undefined);(discard ? onDiscard??onStop : onStop)() }
  return <div ref={root} className="hoho-dialogue-composer">
    <HohoButton variant="ghost" size="icon" className="hoho-dialogue-mode" disabled={disabled || listening || processing} onClick={() => {setPhotoOpen(false);setTyping(!typing);if (!typing) requestAnimationFrame(() => input.current?.focus())}} aria-label={typing ? '改用语音' : '改用文字'}>
      {typing ? <Mic size={20} aria-hidden/> : <Keyboard size={20} aria-hidden/>}
    </HohoButton>
    {typing ? <div className="hoho-dialogue-text"><textarea ref={input} aria-label="对话输入" rows={1} maxLength={maxLength} value={text} placeholder={placeholder} disabled={disabled || processing} onChange={e => onTextChange(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {e.preventDefault();onSend()}}}/><HohoButton variant="text" size="icon" aria-label="发送" disabled={disabled || processing || !text.trim()} onClick={onSend}><Send size={18} aria-hidden/></HohoButton></div> :
      <HohoButton variant="secondary" className={`hoho-dialogue-hold${listening?' is-listening':''}`} aria-label={listening ? '正在录音，松手发送' : '按住说话'} disabled={disabled || voiceDisabled || processing} onPointerDown={e => {if (e.button !== 0) return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);start(e.clientX,e.clientY)}} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish()} onContextMenu={e => e.preventDefault()} onKeyDown={e => {if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {e.preventDefault();const r=e.currentTarget.getBoundingClientRect();start(r.left+r.width/2,r.top)}if (e.key === 'Escape') {e.stopPropagation();finish(true)}}} onKeyUp={e => {if (e.key === ' ' || e.key === 'Enter') {e.preventDefault();finish()}}}>
        <Mic size={18} aria-hidden/>{listening ? '正在听…' : processing ? '识别中…' : '按住说话'}
      </HohoButton>}
    <HohoButton variant="ghost" size="icon" className="hoho-dialogue-photo" aria-label="拍照" aria-haspopup="menu" aria-expanded={photoOpen} aria-controls={photoOpen?menuId:undefined} disabled={disabled || listening || processing} onClick={() => setPhotoOpen(!photoOpen)}><Camera size={21} aria-hidden/></HohoButton>
    {photoOpen&&<div id={menuId} role="menu" aria-label="添加图片" className="hoho-dialogue-photo-menu" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setPhotoOpen(false);root.current?.querySelector<HTMLButtonElement>('.hoho-dialogue-photo')?.focus()}}}>
      <HohoButton role="menuitem" variant="ghost" onClick={()=>{setPhotoOpen(false);onPhoto('camera')}}><Camera size={20} aria-hidden/>拍照</HohoButton>
      <HohoButton role="menuitem" variant="ghost" onClick={()=>{setPhotoOpen(false);onPhoto('album')}}><Image size={20} aria-hidden/>从相册选择</HohoButton>
    </div>}
    {press&&createPortal(<div role="status" className="hoho-dialogue-recording" style={{left:press.x,top:Math.max(110,press.y-24)}}>
      <svg viewBox="0 0 180 36" aria-hidden="true"><path d="M8 31 Q90 -20 172 31"/><path d="M22 34 Q90 -4 158 34"/></svg>
      <div className="hoho-dialogue-recording-wave" aria-hidden="true">{[0,1,2,3,4].map(i=><span key={i} style={{animationDelay:`${i*100}ms`}}/>)}</div>
      <span>{listening?'正在录音 · 松手发送':'正在打开麦克风…'}</span>
    </div>,document.body)}
  </div>
}
