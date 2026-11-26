// Public documents share the origin with the existing health app.
const documents = new Map([
  ['/', 'family'],
  ['/id-cards', 'cards'],
  ['/id-cards/support', 'support'],
  ['/id-cards/privacy', 'privacy']
])

export function familySiteDocument(pathname) {
  const key = pathname === '/' ? '/' : pathname.replace(/\/$/, '')
  const name = documents.get(key)
  return name ? `/family-site/${name}.html` : null
}

function serveFamilyPages(server) {
  server.middlewares.use((request, _response, next) => {
    const url = new URL(request.url || '/', 'http://localhost')
    const document = familySiteDocument(url.pathname)
    if (document && (request.method === 'GET' || request.method === 'HEAD')) {
      request.url = document + url.search
    }
    next()
  })
}

export const familySitePlugin = {
  name: 'family-product-pages',
  configureServer: serveFamilyPages,
  configurePreviewServer: serveFamilyPages
}
