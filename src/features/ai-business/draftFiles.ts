/** Snapshot native picker/recorder files before the OS revokes their backing file. */
export interface StoredDraftFile { kind:'bytes-v1'; name:string; type:string; lastModified:number; bytes:ArrayBuffer }
const snapshots = new WeakMap<Blob, Promise<ArrayBuffer>>()
export function fileBytes(blob:Blob):Promise<ArrayBuffer> {
  const existing=snapshots.get(blob);if(existing)return existing
  const read=blob.arrayBuffer().catch(()=>new Promise<ArrayBuffer>((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=()=>reject(Object.assign(new Error('这份图片或录音无法读取，请重新选择图片或重新录音。已有文字仍可继续保存。'),{code:'FILE_READ_FAILED'}));reader.readAsArrayBuffer(blob)
  }))
  snapshots.set(blob,read);void read.catch(()=>snapshots.delete(blob));return read
}
export async function storeDraftFile(file:File):Promise<StoredDraftFile>{return {kind:'bytes-v1',name:file.name,type:file.type,lastModified:file.lastModified,bytes:await fileBytes(file)}}
export function restoreDraftFile(value:StoredDraftFile|File):File{return 'kind' in value&&value.kind==='bytes-v1'?new File([value.bytes],value.name,{type:value.type,lastModified:value.lastModified}):value as File}
export async function fileDataUrl(blob:Blob):Promise<string>{
  const bytes=new Uint8Array(await fileBytes(blob));let binary=''
  for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768))
  return `data:${blob.type||'application/octet-stream'};base64,${btoa(binary)}`
}
