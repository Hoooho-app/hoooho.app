import {createHash} from 'node:crypto'
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24)
// Read only existing saved archive attachments. Never inspect arbitrary user URLs.
export function profileResources(profiles,memberId,includeData=false){
  const result=[]
  for(const archive of profiles)for(const row of archive.records??[])for(const item of row._allergyArchive?.items??row.items??[row]){
    if(item.memberId&&item.memberId!==memberId)continue
    const parentId=`profile:${archive.sectionId}:${item.id??createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0,16)}`
    const walk=(value,path=[],allowed=false)=>{
      if(value&&typeof value==='object'){
        if(value.memberId&&value.memberId!==memberId)return
        for(const [key,child] of Object.entries(value))walk(child,[...path,key],allowed||['imageDataUrl','dataUrl','reportFiles','photos'].includes(key))
      }else if(allowed&&typeof value==='string'){
        const match=/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(value)
        if(!match)return
        const resourceId=hash(parentId+':'+path.join('.')+':'+value)
        result.push({resourceId,parentId,sectionId:archive.sectionId,title:item.imageName||`${item.name||'健康档案'} · 原件 ${result.length+1}`,mimeType:match[1],uploadedAt:item._savedAt||item.updatedAt||null,...(includeData?{data:match[2]}:{})})
      }
    }
    walk(item)
  }
  return result
}
