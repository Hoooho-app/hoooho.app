import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CompleteImage } from '../../components/common/CompleteImage'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'

/** Shared original view for stored images and files that have not been submitted. */
export function PhotoPreview({ src, name, onRemove, disabled = false, compact = false }: { src: string; name: string; onRemove?: () => void; disabled?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  return <div className={`photo-preview grid min-w-0 gap-2 ${compact ? 'h-full' : ''}`}>
    <button type="button" aria-label={`查看图片：${name}`} className={`min-h-11 min-w-0 text-left ${compact ? 'h-full' : ''}`} onClick={() => setOpen(true)}>
      {!failed && <CompleteImage src={src} alt={name} className="max-h-40 max-w-full rounded-control object-contain" onError={() => setFailed(true)} />}
      {!compact && <span className="block break-words text-sm">{name}</span>}
    </button>
    {failed && <p role="alert" className="text-sm text-danger">图片无法显示，请移除后重新选择。</p>}
    {onRemove && <HohoButton type="button" variant="text" disabled={disabled} onClick={onRemove}>移除图片：{name}</HohoButton>}
    {open && createPortal(<BottomSheetSurface layerClassName="hoho-bottom-sheet-layer--nested" open={open} label={`图片预览：${name}`} title="图片预览" onClose={() => setOpen(false)}>
      <CompleteImage src={src} alt={`原图：${name}`} className="h-auto max-h-[75vh] w-full object-contain" />
      <a href={src} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-primary">查看完整原图</a>
    </BottomSheetSurface>, document.body)}
  </div>
}

export function SelectedFilePreviews({ files, onRemove, disabled = false }: { files: File[]; onRemove?: (file: File) => void; disabled?: boolean }) {
  const [entries, setEntries] = useState<{ file: File; url: string }[]>([])
  useEffect(() => {
    const next = files.map(file => ({ file, url: URL.createObjectURL(file) }))
    setEntries(next)
    return () => next.forEach(entry => URL.revokeObjectURL(entry.url))
  }, [files])
  return <ul className="grid min-w-0 gap-3" aria-label="已选择的原件">{entries.map(({ file, url }, index) => <li className="min-w-0" key={`${index}:${file.name}`}>
    {file.type.startsWith('image/') ? <PhotoPreview src={url} name={file.name} disabled={disabled} onRemove={onRemove ? () => onRemove(file) : undefined} /> : <>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center break-all text-primary">{file.name}</a>
      {onRemove && <HohoButton type="button" variant="text" disabled={disabled} onClick={() => onRemove(file)}>移除原件：{file.name}</HohoButton>}
    </>}
  </li>)}</ul>
}
