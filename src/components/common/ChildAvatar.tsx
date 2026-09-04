import { useEffect, useRef, useState } from 'react'
import { childAvatarVariants, resolveChildAvatar, type ChildAvatarSelection } from '../../utils/childAvatar'
import { decodeImageAsset } from '../../utils/decodeImageAsset'

interface ChildAvatarProps {
  className?: string
  language?: string
  name: string
  selection: ChildAvatarSelection
}

export function ChildAvatar({ className = '', language, name, selection }: ChildAvatarProps) {
  const resolvedLanguage = language ?? (typeof document === 'undefined' ? 'zh' : document.documentElement.lang || navigator.language || 'zh')
  const ariaLabel = resolvedLanguage.toLowerCase().startsWith('ar')
    ? `صورة ${name} الكرتونية ثلاثية الأبعاد`
    : resolvedLanguage.toLowerCase().startsWith('en')
      ? `${name}'s 3D cartoon avatar`
      : `${name}的3D卡通头像`
  const source = resolveChildAvatar(selection)
  const requestRef = useRef(0)
  const [displayedSource, setDisplayedSource] = useState<string | null>(null)

  useEffect(() => {
    const request = ++requestRef.current
    let idleHandle: number | undefined
    let timeoutHandle: number | undefined

    void decodeImageAsset(source, 'high').then(() => {
      if (request !== requestRef.current) return
      setDisplayedSource(source)
      const siblingSources = childAvatarVariants
        .filter((variant) => variant !== selection.variant)
        .map((variant) => resolveChildAvatar({ ...selection, variant }))
      const preloadSiblings = () => {
        for (const siblingSource of siblingSources) void decodeImageAsset(siblingSource, 'low').catch(() => undefined)
      }
      const idleWindow = window as unknown as {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
        cancelIdleCallback?: (handle: number) => void
      }
      if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(preloadSiblings, { timeout: 1500 })
      else timeoutHandle = window.setTimeout(preloadSiblings, 250)
    }).catch(() => {
      // Keep the last completely decoded avatar (or the stable white frame).
    })

    return () => {
      requestRef.current += 1
      const idleWindow = window as unknown as { cancelIdleCallback?: (handle: number) => void }
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle)
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
    }
  }, [selection.age, selection.gender, selection.variant, source])

  return (
    <span aria-busy={!displayedSource} className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-white ${className}`} role="img" aria-label={ariaLabel}>
      {displayedSource && <img alt="" aria-hidden="true" className="h-full w-full object-cover" decoding="async" draggable={false} fetchPriority="high" src={displayedSource} />}
    </span>
  )
}
