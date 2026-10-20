import { useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { Upload, Download, ScanText, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { BottomSheetSurface } from '../../components/design-system/BottomSheetSurface'
import { ConfirmDialog } from '../../components/design-system/ConfirmDialog'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { FAMILY_WORKSPACE_PATH } from '../../../shared/family-workspace.mjs'
import type { AssetAttachment, FinanceSnapshot } from '../../../shared/family-finance.mjs'
import { api, FamilyApiError, messageOf } from './api'

const fileData = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'))
  reader.readAsDataURL(file)
})

export function AssetAttachments({ assetId, assetName, files, admin, disabled, onChange, onUnauthorized }: { assetId: string; assetName: string; files: AssetAttachment[]; admin: boolean; disabled: boolean; onChange: (snapshot: FinanceSnapshot) => void; onUnauthorized: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [previewId, setPreviewId] = useState('')
  const [removing, setRemoving] = useState<AssetAttachment>()
  const [zoom, setZoom] = useState(1)
  const [copying, setCopying] = useState(false)
  const route = `/finance/assets/${assetId}/attachments`
  const url = (id: string, variant: string) => `${FAMILY_WORKSPACE_PATH}/api${route}/${id}/${variant}`
  const fail = (cause: unknown) => { if (cause instanceof FamilyApiError && cause.status === 401) onUnauthorized(); setError(messageOf(cause)) }
  const operate = async (label: string, action: () => Promise<void>) => {
    if (pending.current || disabled) return
    pending.current = true; setBusy(label); setError(''); setNotice('')
    try { await action() } catch (cause) { fail(cause) }
    finally { pending.current = false; setBusy('') }
  }
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!selected.length) return
    void operate('上传中…', async () => {
      if (selected.length + files.length > 20) throw new Error('每项资产最多 20 张图片，请减少本次选择。')
      for (const file of selected) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`“${file.name}”格式不支持，请使用 JPG、PNG 或 WebP。`)
        if (file.size > 10 * 1024 * 1024 || !file.size) throw new Error(`“${file.name}”须为非空且不超过 10 MB 的图片。`)
      }
      let saved = 0
      for (const file of selected) {
        setBusy(`正在上传 ${saved + 1}/${selected.length}…`)
        try { onChange(await api<FinanceSnapshot>(route, { name: file.name, mimeType: file.type, dataUrl: await fileData(file) })); saved++ }
        catch (cause) { throw cause instanceof FamilyApiError && cause.status === 401 ? cause : new Error(`已保存 ${saved} 张，其余未上传。${messageOf(cause)} 请重新选择未上传图片重试。`) }
      }
      setNotice(`已上传 ${saved} 张，未自动解析。`)
    })
  }
  const parse = (file: AssetAttachment) => void operate('正在解析图片…', async () => { onChange(await api<FinanceSnapshot>(`${route}/${file.id}/parse`, {})); setPreviewId(file.id); setNotice('解析结果已保存，可核对和下载。') })
  const remove = () => { if (!removing) return; const file = removing; void operate('正在删除…', async () => { onChange(await api<FinanceSnapshot>(`${route}/${file.id}/remove`, {})); setRemoving(undefined); if (previewId === file.id) setPreviewId(''); setNotice('已删除附件。') }) }
  const download = (file: AssetAttachment, text = false) => void operate('准备下载…', async () => {
    const response = await fetch(url(file.id, text ? 'text' : 'download'), { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new FamilyApiError((await response.json()).error?.message || '下载失败，请重试。', response.status)
    const blobUrl = URL.createObjectURL(await response.blob()), link = document.createElement('a')
    link.href = blobUrl; link.download = text ? `${file.name.replace(/\.[^.]+$/, '')}-解析.txt` : file.name; link.click()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  })
  const show = (file: AssetAttachment) => { setError(''); setZoom(1); setPreviewId(file.id) }
  const preview = files.find(file => file.id === previewId)
  const index = files.findIndex(file => file.id === previewId)
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopying(true); setTimeout(() => setCopying(false), 1600) }
    catch { setError('复制失败，可选择下方文字手动复制或下载 TXT。') }
  }
  const issue = error ? <StatusNotice tone="error" title="附件操作未完成">{error}</StatusNotice> : null
  return <section className="family-asset-attachments" aria-label={`${assetName}附件资料`}>
    <details>
      <summary>附件资料 · {files.length} 张{files.length > 0 && <span className="hoho-text-caption"> · 点击查看</span>}</summary>
      <p className="hoho-text-caption">支持多张 JPG / PNG / WebP，每张最多 10 MB，每项资产最多 20 张。上传后按需点击解析。</p>
      <div className="family-asset-file-toolbar">{admin && <><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden aria-label={`上传${assetName}附件`} onChange={upload}/><HohoButton variant="secondary" size="small" disabled={Boolean(busy) || disabled} onClick={() => input.current?.click()}><Upload size={16}/>上传照片</HohoButton></>}{busy && <span role="status">{busy}</span>}</div>
      {!files.length && <p className="hoho-text-caption">尚无附件，可保存银行卡正反面、合同或其他资产凭证。</p>}
      <ul className="family-asset-file-list">{files.map(file => <li key={file.id}>
        <button type="button" className="family-asset-thumbnail" aria-label={`查看${file.name}`} onClick={() => show(file)}><img src={url(file.id, 'preview')} alt={file.name} loading="lazy"/><span>{file.name}</span></button>
        <span className="hoho-text-caption">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.analysis ? file.analysis.status === 'blank' ? '未发现可读文字' : file.analysis.status === 'uncertain' ? '已解析，需核对' : '已解析' : '未解析'}</span>
        <div className="family-asset-file-actions"><HohoButton variant="text" size="small" disabled={Boolean(busy) || disabled} onClick={() => download(file)}><Download size={15}/>下载原图</HohoButton><HohoButton variant="text" size="small" disabled={Boolean(busy) || disabled} onClick={() => file.analysis ? show(file) : parse(file)}><ScanText size={15}/>{file.analysis ? '查看解析' : '解析图片'}</HohoButton>{file.analysis && <HohoButton variant="text" size="small" disabled={Boolean(busy) || disabled} onClick={() => download(file, true)}>下载 TXT</HohoButton>}{admin && <HohoButton variant="text" size="small" aria-label={`删除附件${file.name}`} disabled={Boolean(busy) || disabled} onClick={() => setRemoving(file)}><Trash2 size={15}/></HohoButton>}</div>
      </li>)}</ul>
    </details>
    {!preview && issue}
    {notice && <p className="hoho-text-caption" role="status">{notice}</p>}
    {preview && createPortal(<BottomSheetSurface open label="资产附件预览" title={preview.name} size="workspace" onClose={() => { setPreviewId(''); setZoom(1) }}>
      <div className="family-asset-file-toolbar"><HohoButton variant="ghost" size="small" disabled={index <= 0} onClick={() => show(files[index - 1])}><ChevronLeft size={16}/>上一张</HohoButton><span>{index + 1} / {files.length}</span><HohoButton variant="ghost" size="small" disabled={index >= files.length - 1} onClick={() => show(files[index + 1])}>下一张<ChevronRight size={16}/></HohoButton><HohoButton variant="ghost" size="small" disabled={zoom >= 4} onClick={() => setZoom(value => Math.min(4, value + 0.5))}><ZoomIn size={16}/>放大</HohoButton><HohoButton variant="ghost" size="small" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}><ZoomOut size={16}/>缩小</HohoButton><span>{Math.round(zoom * 100)}%</span></div>
      <div className="family-asset-preview-scroll"><img src={url(preview.id, 'original')} alt={preview.name} style={{ width: `${zoom * 100}%`, maxHeight: zoom === 1 ? '50dvh' : 'none' }} onError={() => setError('原图载入失败，请关闭后重试或重新登录。')}/></div>
      <div className="family-asset-file-toolbar"><HohoButton variant="secondary" disabled={Boolean(busy) || disabled} onClick={() => download(preview)}><Download size={16}/>下载原图</HohoButton>{!preview.analysis && <HohoButton disabled={Boolean(busy) || disabled} onClick={() => parse(preview)}><ScanText size={16}/>{busy || '解析图片'}</HohoButton>}</div>
      {preview.analysis && <section className="family-asset-analysis" aria-label="图片解析结果"><h3 className="hoho-text-section-title">解析文字</h3><p className="hoho-text-caption">{preview.analysis.status === 'blank' ? '未发现可读文字。' : preview.analysis.status === 'uncertain' ? '部分内容不清楚，请对照原图核对。' : '请对照原图核对卡号、金额与日期。'} 解析不会自动修改资产资料。</p><textarea className="hoho-input" aria-label="解析文字" readOnly rows={8} value={preview.analysis.text}/><div className="family-asset-file-toolbar"><HohoButton variant="secondary" disabled={!preview.analysis.text} onClick={() => copy(preview.analysis!.text)}>{copying ? '已复制' : '复制文字'}</HohoButton><HohoButton variant="secondary" disabled={Boolean(busy) || disabled} onClick={() => download(preview, true)}><Download size={16}/>下载 TXT</HohoButton></div></section>}
      {busy && <p role="status">{busy}</p>}{issue}
    </BottomSheetSurface>, document.body)}
    <ConfirmDialog open={Boolean(removing)} title="删除资产附件" description={`确定删除“${removing?.name ?? ''}”及其解析结果？`} confirmLabel="确认删除附件" danger loading={Boolean(busy)} onCancel={() => { if (!busy) setRemoving(undefined) }} onConfirm={remove}/>
  </section>
}
