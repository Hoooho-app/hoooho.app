export async function helpApi(service,accountId,pathname,method,readBody) {
  if(!pathname.startsWith('/api/help/'))return null
  if(pathname==='/api/help/sessions'&&method==='POST')return {status:200,body:await service.start(accountId,await readBody())}
  const match=/^\/api\/help\/sessions\/([a-zA-Z0-9-]+)(?:\/(turns|ratings))?$/.exec(pathname)
  if(match&&method==='GET'&&!match[2])return {status:200,body:service.public(await service.owned(accountId,match[1]))}
  if(match&&method==='POST'&&match[2])return {status:200,body:await service[match[2]==='turns'?'turn':'rate'](accountId,match[1],await readBody())}
  throw Object.assign(new Error('帮助接口不存在或请求方法不支持'),{status:404,code:'HELP_ROUTE_NOT_FOUND'})
}
