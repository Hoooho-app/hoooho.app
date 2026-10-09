import {useEffect,useRef,useState} from 'react'
/** Native speech is primed in a user gesture; model replies remain Qwen text. */
export function useDialogueSpeech(){
  const [readingId,setReadingId]=useState<string>(),seen=useRef(new Set<string>()),alive=useRef(true)
  const supported=typeof window!=='undefined'&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window
  const stop=()=>{if(supported)window.speechSynthesis.cancel();if(alive.current)setReadingId(undefined)}
  const activate=()=>{stop();if(!supported)return;const prime=new SpeechSynthesisUtterance(' ');prime.lang='zh-CN';prime.volume=0;window.speechSynthesis.speak(prime)}
  const speak=(text:string,id:string,force=false)=>{
    if(!supported||!text.trim()||(!force&&seen.current.has(id)))return
    stop();const speech=new SpeechSynthesisUtterance(text);speech.lang='zh-CN';speech.rate=1
    const voices=window.speechSynthesis.getVoices(),chinese=voices.filter(v=>/^zh[-_]CN/i.test(v.lang))
    speech.voice=chinese.find(v=>/Tingting|Xiaoxiao|Huihui|女|普通话/i.test(v.name))??chinese[0]??voices.find(v=>/^zh/i.test(v.lang))??null
    speech.onstart=()=>{seen.current.add(id);if(alive.current)setReadingId(id)}
    const done=()=>{if(alive.current)setReadingId(current=>current===id?undefined:current)}
    speech.onend=done;speech.onerror=done;window.speechSynthesis.speak(speech)
  }
  const read=(text:string,id:string)=>{if(readingId===id){stop();return}activate();speak(text,id,true)}
  useEffect(()=>{alive.current=true;const hidden=()=>{if(document.hidden)stop()};document.addEventListener('visibilitychange',hidden);return()=>{alive.current=false;if(supported)window.speechSynthesis.cancel();document.removeEventListener('visibilitychange',hidden)}},[])
  return {supported,readingId,stop,activate,speak,read}
}
