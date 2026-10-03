export async function caseApiResult(service, accountId, method, pathname, readInput, search = new URLSearchParams()) {
  const list = /^\/api\/members\/([^/]+)\/cases$/.exec(pathname)
  const capture = /^\/api\/members\/([^/]+)\/case-records$/.exec(pathname)
  const action = /^\/api\/members\/([^/]+)\/cases\/([^/]+)\/(archive|observations|materials)(?:\/([^/]+))?$/.exec(pathname)
  if (!list && !capture && !action) return null
  const memberId = decodeURIComponent((list ?? capture ?? action)[1])
  if (list && method === 'GET') return { data: await service.list(accountId, memberId, search.get('timezone') ?? 'Asia/Shanghai') }
  if (capture && method === 'POST') return { data: await service.capture(accountId, memberId, await readInput(22 * 1024 * 1024)) }
  if (action && method === 'POST') {
    const eventId = decodeURIComponent(action[2]), input = await readInput(30000)
    if (action[3] === 'archive') return { data: await service.archive(accountId, memberId, eventId, input.archived === true) }
    if (action[3] === 'observations') return { data: await service.observation(accountId, memberId, eventId, input) }
    if (action[4]) return { data: await service.confirmMaterial(accountId, memberId, eventId, decodeURIComponent(action[4]), input) }
  }
  return { status: 405, data: { error: { message: '请求方法不支持' } } }
}
