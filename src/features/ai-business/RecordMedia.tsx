import {useEffect,useState} from 'react'
import {HohoButton} from '../../components/design-system'
import {fileDataUrl} from './draftFiles'

/** Byte-backed thumbnails survive refresh; URLs live as long as their bubble. */
export function RecordMedia({file}:{file:File}){
  const [url,setUrl]=useState(''),[expanded,setExpanded]=useState(false)
  useEffect(()=>{let active=true;void fileDataUrl(file).then(value=>{if(active)setUrl(value)}).catch(()=>undefined);return()=>{active=false}},[file])
  if(file.type.startsWith('audio/'))return url?<audio controls preload="none" src={url} aria-label="语音原件"/>:<span>正在恢复录音…</span>
  return <div className="smart-record-media">{url?<button type="button" className="smart-record-thumbnail" aria-label={`查看图片：${file.name}`} onClick={()=>setExpanded(!expanded)}><img className={`dialogue-image${expanded?' is-expanded':''}`} src={url} alt={file.name}/></button>:<span>正在读取图片…</span>}{expanded&&<HohoButton variant="secondary" onClick={()=>setExpanded(false)}>收回大图</HohoButton>}</div>
}
