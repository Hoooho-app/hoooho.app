import { useEffect, useState } from 'react'
export function useVisibleViewport() {
  const read = () => ({ top: window.visualViewport?.offsetTop ?? 0, height: window.visualViewport?.height ?? window.innerHeight, keyboard: (window.visualViewport?.height ?? window.innerHeight) < window.innerHeight - 120 })
  const [viewport, setViewport] = useState(read)
  useEffect(() => { const visual = window.visualViewport, resize = () => setViewport(read()); window.addEventListener('resize', resize); visual?.addEventListener('resize', resize); visual?.addEventListener('scroll', resize); return () => { window.removeEventListener('resize', resize); visual?.removeEventListener('resize', resize); visual?.removeEventListener('scroll', resize) } }, [])
  return viewport
}
