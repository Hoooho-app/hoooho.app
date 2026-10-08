import { useRef, useState, type ImgHTMLAttributes } from 'react'

/** Reserve the image's box but reveal only a completely loaded and decoded frame. */
export function CompleteImage({ src, style, onLoad, onError, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [ready, setReady] = useState('')
  const [failed, setFailed] = useState('')
  const current = useRef(src)
  current.current = src
  return <img {...props} src={src} decoding="async" style={{ ...style, visibility: ready === src || failed === src ? style?.visibility : 'hidden' }} onLoad={async event => {
    const element = event.currentTarget
    const source = src
    onLoad?.(event)
    try { await element.decode?.() } catch { if (!element.complete || !element.naturalWidth) return }
    if (current.current !== source) return
    setReady(source ?? '')
  }} onError={event => { setFailed(src ?? ''); onError?.(event) }} />
}
