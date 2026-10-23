import {useEffect,useState} from 'react'
import {HohoButton} from '../../components/design-system'
import {fileBytes,fileDataUrl} from './draftFiles'
import {FileText} from 'lucide-react'

/** Byte-backed thumbnails survive refresh; URLs live as long as their bubble. */
export function RecordMedia({file}:{file:File}){
  const [url,setUrl]=useState(''),[expanded,setExpanded]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true,objectUrl='';setUrl('');setError('')
    void (async()=>{
      const value=file.type==='application/pdf'?URL.createObjectURL(new Blob([await fileBytes(file)],{type:'application/pdf'})):await fileDataUrl(file)
      if(file.type==='application/pdf')objectUrl=value
      if(active)setUrl(value);else if(objectUrl)URL.revokeObjectURL(objectUrl)
    })().catch(()=>{if(active)setError('原件暂时无法读取，请重新选择；对话文字仍然保留。')})
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[file])
  if(file.type.startsWith('audio/'))return url?<audio controls preload="none" src={url} aria-label="语音原件"/>:<span>正在恢复录音…</span>
  if(file.type==='application/pdf')return <div className="smart-record-document" role="group" aria-label={`PDF原件：${file.name}`}><FileText size={24} aria-hidden/><strong>{file.name}</strong>{url?<div><a className="hoho-button" data-variant="secondary" href={url} target="_blank" rel="noopener noreferrer">查看原件</a><a className="hoho-button" data-variant="text" href={url} download={file.name}>下载PDF</a></div>:<span role={error?'alert':'status'}>{error||'正在恢复PDF原件…'}</span>}</div>
  return <div className="smart-record-media">{url?<button type="button" className="smart-record-thumbnail" aria-label={`查看图片：${file.name}`} onClick={()=>setExpanded(!expanded)}><img className={`dialogue-image${expanded?' is-expanded':''}`} src={url} alt={file.name}/></button>:<span>正在读取图片…</span>}{expanded&&<HohoButton variant="secondary" onClick={()=>setExpanded(false)}>收回大图</HohoButton>}</div>
}
