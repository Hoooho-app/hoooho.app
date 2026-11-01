// Existing deployed workers exclude /api/ navigation from their cached app shell.
// This public shell carries no account data; protected APIs still verify the owner.
export const OPS_NAVIGATION_EXCLUSION = /^\/ops(?:\/|$)/
export const OPS_ENTRY_PATH = '/api/console-entry'
const script = `(() => {
  const query = new URLSearchParams(location.search);
  const pages = ['/ops','/ops/billing','/ops/feedback','/ops/services','/ops/versions','/ops/marketing','/ops/settings','/ops/login'];
  const requested = query.get('page');
  const target = new URL(pages.includes(requested) ? requested : '/ops/billing', location.origin);
  target.searchParams.set('project', /^[a-z0-9-]{1,64}$/.test(query.get('project') || '') ? query.get('project') : 'hoooho');
  for (const key of ['connect','source','event']) { const value = query.get(key); if (/^[a-z0-9-]{1,128}$/.test(value || '')) target.searchParams.set(key, value); }
  history.replaceState(null, '', target.pathname + target.search);
})();`

export async function handleOpsEntry(request, response, { readIndex }) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  if (![OPS_ENTRY_PATH, OPS_ENTRY_PATH + '.js'].includes(pathname)) return false
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  response.setHeader('Referrer-Policy', 'same-origin')
  if (!['GET','HEAD'].includes(request.method)) { response.statusCode=405; response.setHeader('Allow','GET, HEAD'); response.end(); return true }
  const javascript = pathname.endsWith('.js')
  const body = javascript ? script : (await readIndex()).replace(/<head(?:\s[^>]*)?>/i, match => `${match}<script src="${OPS_ENTRY_PATH}.js"></script>`)
  response.statusCode = 200
  response.setHeader('Content-Type', javascript ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8')
  response.end(request.method === 'HEAD' ? undefined : body)
  return true
}
