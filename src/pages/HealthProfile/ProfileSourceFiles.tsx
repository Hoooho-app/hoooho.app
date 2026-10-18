import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, Paperclip, X } from 'lucide-react'
import { HohoButton } from '../../components/design-system'

export type ProfileFile = { id: string; fileName: string; mimeType: string; dataUrl: string }
const mimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export function profileFiles(value: unknown): ProfileFile[] {
  return Array.isArray(value) ? value.filter((v): v is ProfileFile => !!v && typeof v === 'object' && typeof v.id === 'string' && typeof v.fileName === 'string' && mimeTypes.includes(v.mimeType) && typeof v.dataUrl === 'string' && v.dataUrl.startsWith(`data:${v.mimeType};base64,`)) : []
}
async function readFile(file: File): Promise<ProfileFile> {
  if (!mimeTypes.includes(file.type) || file.size > 4 * 1024 * 1024) throw new Error('支持 JPEG、PNG、WebP 和 PDF，每份不超过4 MB')
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()), signature = String.fromCharCode(...bytes)
  const valid = file.type === 'application/pdf' ? signature.startsWith('%PDF-') : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : file.type === 'image/png' ? bytes[0] === 137 && signature.slice(1, 4) === 'PNG' : signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP'
  if (!valid) throw new Error('文件内容与格式不符，请重新选择')
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('文件读取失败，请重试')); reader.readAsDataURL(file) })
  return { id: crypto.randomUUID(), fileName: file.name, mimeType: file.type, dataUrl }
}
function OriginalLink({ file }: { file: ProfileFile }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    try {
      const bytes = Uint8Array.from(atob(file.dataUrl.split(',')[1]), c => c.charCodeAt(0)), value = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }))
      setUrl(value); return () => URL.revokeObjectURL(value)
    } catch { setUrl('') }
  }, [file.dataUrl, file.mimeType])
  return url ? <a className="profile-original-link" href={url} target="_blank" rel="noreferrer"><FileText aria-hidden size={18}/><span>{file.fileName}</span></a> : <span>原件暂不可读，请重新添加</span>
}
export function ProfileSourceFiles({ files, onChange, disabled = false, onReadingChange }: { files: ProfileFile[]; onChange?: (files: ProfileFile[]) => void; disabled?: boolean; onReadingChange?: (reading: boolean) => void }) {
  const picker = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null), [error, setError] = useState(''), [reading, setReading] = useState(false)
  const alive = useRef(true), locked = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function add(selected: File[]) {
    if (!onChange || disabled || locked.current || !selected.length) return
    locked.current = true; setReading(true); onReadingChange?.(true); setError('')
    try {
      if (files.length + selected.length > 6) throw new Error('每条记录最多保存6份原件')
      const added = await Promise.all(selected.map(readFile)), next = [...files, ...added]
      if (new TextEncoder().encode(JSON.stringify(next)).length > 12_000_000) throw new Error('本条原件合计过大，请减少文件后再添加')
      if (alive.current) onChange(next)
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '文件读取失败') }
    finally { locked.current = false; if (alive.current) { setReading(false); onReadingChange?.(false) } }
  }
  return <div className="profile-source-files">
    {files.map(file => <div className="profile-source-file" key={file.id}><OriginalLink file={file}/>{onChange && <HohoButton variant="text" size="icon" disabled={disabled || reading} aria-label={`移除${file.fileName}`} onClick={() => onChange(files.filter(f => f.id !== file.id))}><X size={18} aria-hidden/></HohoButton>}</div>)}
    {onChange && <><input hidden ref={picker} aria-label="选择档案原件" type="file" multiple accept={mimeTypes.join(',')} onChange={e => { const selected = Array.from(e.target.files ?? []); e.target.value = ''; void add(selected) }}/><input hidden ref={camera} aria-label="拍摄档案原件" type="file" capture="environment" accept="image/jpeg,image/png,image/webp" onChange={e => { const selected = Array.from(e.target.files ?? []); e.target.value = ''; void add(selected) }}/><div className="profile-actions"><HohoButton variant="secondary" disabled={disabled || reading} onClick={() => picker.current?.click()}><Paperclip size={18} aria-hidden/>{reading ? '正在读取…' : '添加原件'}</HohoButton><HohoButton variant="text" disabled={disabled || reading} onClick={() => camera.current?.click()}><Camera size={18} aria-hidden/>拍照</HohoButton></div></>}
    {error && <p role="alert">{error}</p>}
  </div>
}
