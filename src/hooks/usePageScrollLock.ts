import { useEffect } from 'react'

export function usePageScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return

    const page = document.querySelector<HTMLElement>('.app-shell')
    const previousBodyOverflow = document.body.style.overflow
    const previousPageOverflow = page?.style.overflow ?? ''

    document.body.style.overflow = 'hidden'
    if (page) page.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      if (page) page.style.overflow = previousPageOverflow
    }
  }, [locked])
}
