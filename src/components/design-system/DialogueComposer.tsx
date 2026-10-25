import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Camera, FileUp, Image, Keyboard, Mic, Send, Square, Video } from 'lucide-react'
import { HohoButton } from './HohoButton'
import { HoldToTalkButton } from './HoldToTalkButton'
import { BottomSheetSurface } from './BottomSheetSurface'
import './DialogueComposer.css'

export type DialoguePhotoSource = 'camera' | 'album' | 'video' | 'file'
/** A 44px row; choice and recording feedback float above it. */
export function DialogueComposer({ text, onTextChange, onSend, onStart, onStop, onDiscard, onPhoto, directPhoto = false, inputOnly = false, releaseLabel = '松开即结束', discardOnBlur = true, disabled = false, voiceDisabled = false, listening = false, requesting = false, audioLevel = 0, processing = false, allowTextWhileProcessing = false, initialTyping = false, onTypingChange, maxLength = 4000, placeholder = '说说你的情况…', expandedFeedback = false, feedbackHint, liveTranscript, liveStatus, variant = 'default', working=false, onPauseWork }: {
  text: string; onTextChange: (value: string) => void; onSend: () => void
  onStart: () => void; onStop: () => void; onDiscard?: () => void; onPhoto?: (source: DialoguePhotoSource) => void
  audioLevel?: number; disabled?: boolean; voiceDisabled?: boolean; listening?: boolean; requesting?: boolean; processing?: boolean
  maxLength?: number; placeholder?: string; initialTyping?: boolean; directPhoto?: boolean; allowTextWhileProcessing?:boolean; inputOnly?:boolean; releaseLabel?:string; discardOnBlur?:boolean
  onTypingChange?: (typing: boolean) => void
  expandedFeedback?:boolean; feedbackHint?:string; liveTranscript?:string; liveStatus?:string
  variant?: 'default' | 'conversation'
  working?:boolean; onPauseWork?:()=>void
}) {
  const [typing, setTyping] = useState(initialTyping), [photoOpen, setPhotoOpen] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null), root = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const hasText=Boolean(text.replace(/[\p{Cf}\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu,'').trim())
  const composing=useRef(false),textBlocked=disabled||(processing&&!allowTextWhileProcessing)
  useEffect(() => {
    if (!photoOpen || variant === 'conversation') return
    const outside = (e:PointerEvent) => { if (!root.current?.contains(e.target as Node)) setPhotoOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [photoOpen,variant])
  useEffect(()=>{if(variant==='conversation'&&hasText)setTyping(true)},[variant,text])
  useEffect(() => {
    if (variant !== 'conversation' || !input.current) return
    input.current.style.height = '24px'
    input.current.style.height = `${Math.min(96, Math.max(24, input.current.scrollHeight))}px`
  }, [text, typing, variant])
  if (variant === 'conversation') return <div ref={root} className={`hoho-dialogue-composer hoho-dialogue-composer--conversation${!onPhoto?' without-attachments':''}${(hasText&&typing)||(working&&onPauseWork)?' has-action':''}`}>
    {typing?<textarea ref={input} aria-label="对话输入" rows={1} maxLength={maxLength} value={text} placeholder={placeholder} disabled={textBlocked} onChange={e=>onTextChange(e.target.value)} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!composing.current&&e.keyCode!==229&&hasText){e.preventDefault();onSend()}}}/>:<HoldToTalkButton className="hoho-dialogue-hold" presentation="conversation" disabled={disabled||voiceDisabled} listening={listening} requesting={requesting} processing={processing} audioLevel={audioLevel} releaseLabel={releaseLabel} discardOnBlur={discardOnBlur} expandedFeedback={expandedFeedback} feedbackHint={feedbackHint} liveTranscript={liveTranscript} liveStatus={liveStatus} onStart={()=>{setPhotoOpen(false);onStart()}} onStop={onStop} onDiscard={onDiscard}/>}
    <HohoButton variant="ghost" size="icon" className="hoho-dialogue-mode" disabled={textBlocked||listening||requesting} onClick={()=>{setPhotoOpen(false);setTyping(!typing);onTypingChange?.(!typing);if(!typing)requestAnimationFrame(()=>input.current?.focus())}} aria-label={typing?'改用语音':'改用文字'}>{typing?<Mic size={21} aria-hidden/>:<Keyboard size={21} aria-hidden/>}</HohoButton>
    {onPhoto&&<HohoButton variant="ghost" size="icon" className="hoho-dialogue-photo" aria-label="添加照片、视频或文件" aria-haspopup="dialog" aria-expanded={photoOpen} disabled={disabled||listening||requesting||processing} onClick={()=>setPhotoOpen(true)}><Camera size={21} aria-hidden/></HohoButton>}
    {hasText&&typing?<HohoButton className="hoho-dialogue-add" size="icon" aria-label="发送" disabled={textBlocked} onClick={onSend}><ArrowUp size={20} aria-hidden/></HohoButton>:working&&onPauseWork?<HohoButton className="hoho-dialogue-add" variant="ghost" size="icon" aria-label="暂停整理" disabled={disabled||listening||requesting} onClick={onPauseWork}><Square size={18} aria-hidden/></HohoButton>:null}
    {photoOpen&&onPhoto&&createPortal(<BottomSheetSurface open label="添加附件" title="添加附件" viewportAware onClose={()=>setPhotoOpen(false)}><div className="hoho-dialogue-media-sources">{([{id:'album',label:'上传照片',icon:Image},{id:'camera',label:'拍照片',icon:Camera},{id:'video',label:'拍视频',icon:Video},{id:'file',label:'选择文件',icon:FileUp}] as const).map(({id,label,icon:Icon})=><HohoButton key={id} variant="ghost" onClick={()=>{setPhotoOpen(false);onPhoto(id)}}><Icon size={21} aria-hidden/>{label}</HohoButton>)}</div></BottomSheetSurface>,document.body)}
  </div>
  return <div ref={root} className={`hoho-dialogue-composer${inputOnly ? ' hoho-dialogue-composer--input-only' : ''}${!onPhoto?' without-attachments':''}`}>
    {!inputOnly && <HohoButton variant="ghost" size="icon" className="hoho-dialogue-mode" disabled={textBlocked || listening} onClick={() => {setPhotoOpen(false);setTyping(!typing);onTypingChange?.(!typing);if (!typing) requestAnimationFrame(() => input.current?.focus())}} aria-label={typing ? '改用语音' : '改用文字'}>
      {typing ? <Mic size={20} aria-hidden/> : <Keyboard size={20} aria-hidden/>}
    </HohoButton>}
    {typing ? <div className="hoho-dialogue-text"><textarea ref={input} aria-label="对话输入" rows={1} maxLength={maxLength} value={text} placeholder={placeholder} disabled={textBlocked} onChange={e => onTextChange(e.target.value)} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !composing.current && e.keyCode!==229 && hasText) {e.preventDefault();onSend()}}}/><HohoButton variant="text" size="icon" aria-label="发送" disabled={textBlocked || !hasText} onClick={onSend}><Send size={18} aria-hidden/></HohoButton></div> :
      <HoldToTalkButton className="hoho-dialogue-hold" disabled={disabled || voiceDisabled} listening={listening} requesting={requesting} processing={processing} audioLevel={audioLevel} releaseLabel={releaseLabel} discardOnBlur={discardOnBlur} expandedFeedback={expandedFeedback} feedbackHint={feedbackHint} liveTranscript={liveTranscript} liveStatus={liveStatus} onStart={() => {setPhotoOpen(false);onStart()}} onStop={onStop} onDiscard={onDiscard}/> }
    {onPhoto&&<HohoButton variant="ghost" size="icon" className="hoho-dialogue-photo" aria-label="拍照" aria-haspopup={directPhoto?undefined:'menu'} aria-expanded={directPhoto?undefined:photoOpen} aria-controls={photoOpen?menuId:undefined} disabled={disabled || listening || processing} onClick={() => directPhoto?onPhoto('album'):setPhotoOpen(!photoOpen)}><Camera size={21} aria-hidden/></HohoButton>}
    {photoOpen&&onPhoto&&<div id={menuId} role="menu" aria-label="添加图片" className="hoho-dialogue-photo-menu" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setPhotoOpen(false);root.current?.querySelector<HTMLButtonElement>('.hoho-dialogue-photo')?.focus()}}}>
      <HohoButton role="menuitem" variant="ghost" onClick={()=>{setPhotoOpen(false);onPhoto('camera')}}><Camera size={20} aria-hidden/>拍照</HohoButton>
      <HohoButton role="menuitem" variant="ghost" onClick={()=>{setPhotoOpen(false);onPhoto('album')}}><Image size={20} aria-hidden/>从相册选择</HohoButton>
    </div>}

  </div>
}
