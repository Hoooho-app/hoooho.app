import { AuthError } from '../auth/auth-service.mjs'

export const cardsAccountPrefix = '/api/cards/account/v1/'

const routes = {
  session: 'GET',
  capabilities: 'GET',
  logout: 'POST',
  'login/send-code': 'POST',
  'login/verify': 'POST',
  'apple/challenge': 'POST',
  'apple/verify': 'POST',
  'contacts/send-code': 'POST',
  'contacts/verify-current': 'POST',
  'contacts/bind': 'POST',
  'delete/send-code': 'POST',
  'delete/verify': 'POST',
  delete: 'POST'
}

export async function handleCardsAccount(request, response, pathname, { service, readJson, sendJson }) {
  if (!pathname.startsWith(cardsAccountPrefix)) return false
  if (!service) throw new AuthError('账号服务尚未开放', 503, 'CARDS_ACCOUNT_DISABLED')
  const action = pathname.slice(cardsAccountPrefix.length)
  if (!Object.hasOwn(routes, action)) throw new AuthError('接口不存在', 404, 'NOT_FOUND')
  if (request.method !== routes[action]) throw new AuthError('请求方法不支持', 405, 'METHOD_NOT_ALLOWED')
  const credential = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? ''
  if (action === 'capabilities') {
    sendJson(response, 200, service.capabilities())
    return true
  }
  if (action === 'session') {
    sendJson(response, 200, await service.restore(credential))
    return true
  }
  if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new AuthError('请求格式无效', 415, 'JSON_REQUIRED')
  }
  const input = await readJson(request, action === 'apple/verify' ? 12_288 : 4096)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AuthError('请求格式无效', 400, 'INVALID_ACCOUNT_INPUT')
  }
  const clientKey = String(request.headers['x-forwarded-for'] ?? request.socket?.remoteAddress ?? '').split(',')[0].trim()
  let result
  switch (action) {
    case 'logout': result = await service.logout(credential); break
    case 'login/send-code': result = await service.sendCode(input.kind, input.value, 'login', clientKey); break
    case 'login/verify': result = await service.login(input.kind, input.value, input.code); break
    case 'apple/challenge': result = await service.beginApple(credential, input); break
    case 'apple/verify': result = await service.finishApple(credential, input, clientKey); break
    case 'contacts/send-code': result = await service.sendBindingCode(credential, input, clientKey); break
    case 'contacts/verify-current': result = await service.verifyCurrent(credential, input); break
    case 'contacts/bind': result = await service.bind(credential, input); break
    case 'delete/send-code': result = await service.sendDeletionCode(credential, input, clientKey); break
    case 'delete/verify': result = await service.verifyDeletion(credential, input); break
    case 'delete': result = await service.delete(credential, input); break
  }
  sendJson(response, 200, result)
  return true
}
