import { useEffect } from 'react'

export function usePageScrollLock(locked: boolean, fixViewport = false) {
  useEffect(() => {
    if (!locked) return

    const page = document.querySelector<HTMLElement>('.app-shell')
    const previousBodyOverflow = document.body.style.overflow
    const previousPageOverflow = page?.style.overflow ?? ''

    const scrollX = window.scrollX, scrollY = window.scrollY
    const body = document.body, root = document.documentElement
    const previousViewport = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, rootOverflow: root.style.overflow, overscroll: root.style.overscrollBehavior }
    if (fixViewport) {
      body.style.position = 'fixed'
      body.style.top = `${-scrollY}px`
      body.style.left = `${-scrollX}px`
      body.style.width = '100%'
      root.style.overflow = 'hidden'
      root.style.overscrollBehavior = 'none'
    }
    document.body.style.overflow = 'hidden'
    if (page) page.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      if (page) page.style.overflow = previousPageOverflow
      if (fixViewport) {
        Object.assign(body.style, { position: previousViewport.position, top: previousViewport.top, left: previousViewport.left, width: previousViewport.width })
        root.style.overflow = previousViewport.rootOverflow
        root.style.overscrollBehavior = previousViewport.overscroll
        window.scrollTo(scrollX, scrollY)
      }
    }
  }, [locked, fixViewport])
}
