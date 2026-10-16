export async function caseApiResult(service, accountId, method, pathname, readInput, search = new URLSearchParams()) {
  const list = /^\/api\/members\/([^/]+)\/cases$/.exec(pathname)
  const capture = /^\/api\/members\/([^/]+)\/case-records$/.exec(pathname)
  const detail = /^\/api\/members\/([^/]+)\/cases\/([^/]+)$/.exec(pathname)
  const action = /^\/api\/members\/([^/]+)\/cases\/([^/]+)\/(archive|recovery|observations|materials|merge|records)(?:\/([^/]+))?$/.exec(pathname)
  if (!list && !capture && !action && !detail) return null
  const memberId = decodeURIComponent((list ?? capture ?? action ?? detail)[1])
  if (list && method === 'GET') return { data: await service.list(accountId, memberId, search.get('timezone') ?? 'Asia/Shanghai') }
  if (capture && method === 'POST') return { data: await service.capture(accountId, memberId, await readInput(22 * 1024 * 1024)) }
  if (detail && ['PATCH','DELETE'].includes(method)) return { data: await service.manage(accountId,memberId,decodeURIComponent(detail[2]),await readInput(30000),method==='DELETE') }
  if (action && action[3] === 'records' && method === 'GET') return { data: await service.groupedRecords(accountId, memberId, decodeURIComponent(action[2])) }
  if (action && method === 'POST') {
    const eventId = decodeURIComponent(action[2]), input = await readInput(30000)
    if (action[3] === 'merge') return { data: await service.merge(accountId, memberId, eventId, input) }
    if (action[3] === 'archive') return { data: await service.archive(accountId, memberId, eventId, input.archived === true) }
    if (action[3] === 'recovery') return { data: await service.recovery(accountId, memberId, eventId, input) }
    if (action[3] === 'observations') return { data: await service.observation(accountId, memberId, eventId, input) }
    if (action[4]) return { data: await service.confirmMaterial(accountId, memberId, eventId, decodeURIComponent(action[4]), input) }
  }
  return { status: 405, data: { error: { message: '请求方法不支持' } } }
}
