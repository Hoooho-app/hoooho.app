import { type RefObject, useEffect } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

export function useDialogFocus<T extends HTMLElement>(open: boolean, containerRef: RefObject<T>) {
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = containerRef.current
    if (!container) return

    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
    const first = focusable()[0] ?? container
    window.requestAnimationFrame(() => first.focus({ preventScroll: true }))

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) {
        event.preventDefault()
        container.focus()
        return
      }
      const firstElement = elements[0]
      const lastElement = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    container.addEventListener('keydown', trapFocus)
    return () => {
      container.removeEventListener('keydown', trapFocus)
      previous?.focus({ preventScroll: true })
    }
  }, [containerRef, open])
}
