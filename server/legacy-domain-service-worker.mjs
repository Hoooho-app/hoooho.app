// Keep the old script URL reachable: service worker updates reject redirects.
// This replacement retires only the obsolete www worker, not browser data.
export const legacyDomainServiceWorker = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window' });
    await self.registration.unregister();
    await Promise.all(windows.map(async client => {
      const url = new URL(client.url);
      // Do not interrupt unfinished forms on other legacy pages. Their next
      // navigation goes to the network because this worker has no fetch handler.
      if (url.origin === self.location.origin && ['/', '/login'].includes(url.pathname)) {
        try { await client.navigate(client.url); } catch { /* Retry on next navigation. */ }
      }
    }));
  })());
});
`

export function serveLegacyDomainServiceWorker(request, response, canonicalRedirect) {
  if (!canonicalRedirect || !['GET', 'HEAD'].includes(request.method)) return false
  if (new URL(request.url, 'https://www.hoooho.com').pathname !== '/sw.js') return false
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('Service-Worker-Allowed', '/')
  response.setHeader('X-Hoooho-Legacy-Worker', 'retire-www-v1')
  response.end(request.method === 'HEAD' ? undefined : legacyDomainServiceWorker)
  return true
}
