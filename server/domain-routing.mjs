const canonicalOrigin = 'https://hoooho.com'

function readHostname(request) {
  const forwardedHost = request.headers['x-forwarded-host']
  const rawHost = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    ?? request.headers.host
    ?? ''
  const firstHost = rawHost.split(',')[0].trim()

  try {
    return new URL(`http://${firstHost}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function getCanonicalDomainRedirect(request) {
  if (readHostname(request) !== 'www.hoooho.com') return null
  const requestTarget = typeof request.url === 'string' && request.url.startsWith('/') ? request.url : '/'
  return `${canonicalOrigin}${requestTarget}`
}
