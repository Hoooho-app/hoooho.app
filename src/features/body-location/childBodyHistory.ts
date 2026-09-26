// A window-targeted popstate invokes listeners in registration order, even with
// capture=true. Install before the router so an open locator owns only its entries.
let owner: ((event: PopStateEvent) => boolean) | undefined
let installed = false
export function installChildBodyHistory() {
  if (installed) return
  installed = true
  window.addEventListener('popstate', event => {
    if (owner?.(event)) event.stopImmediatePropagation()
  })
}
export function ownChildBodyHistory(handler: (event: PopStateEvent) => boolean) {
  owner = handler
  return () => { if (owner === handler) owner = undefined }
}
