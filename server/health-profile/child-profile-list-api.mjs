import {authConfig} from '../auth/config.mjs'
import {TokenService} from '../auth/token-service.mjs'
import {ChildProfileListService,ProfileListError} from './child-profile-list-service.mjs'
export const profileListRoute=pathname=>/^\/api\/members\/([^/]+)\/profile-list\/(allergy|chronic|family-history|surgery|vaccination)$/.exec(pathname)
export async function profileListResult(service,accountId,match,method,input){
  const memberId=decodeURIComponent(match[1]),kind=match[2]
  if(method==='GET')return service.list(accountId,memberId,kind)
  if(method==='POST')return service.command(accountId,memberId,kind,input)
  throw new ProfileListError('请求方法不支持',405)
}
export function childProfileListApiPlugin(options={}){
  const config={...authConfig,...options},service=new ChildProfileListService(config),tokens=new TokenService(config.tokenSecret,config.tokenTtlMs)
  return {name:'hoooho-child-profile-list',configureServer(server){server.middlewares.use(async(request,response,next)=>{
    const match=profileListRoute(new URL(request.url??'/','http://localhost').pathname);if(!match)return next()
    let status=200,result
    try{
      const payload=tokens.verify(/^Bearer\s+(.+)$/i.exec(request.headers.authorization??'')?.[1]??'')
      if(!payload)throw new ProfileListError('登录状态无效',401)
      let input={};if(request.method==='POST'){
        let body='';for await(const chunk of request){body+=chunk;if(body.length>16384)throw new ProfileListError('请求过大',413)}
        try{input=JSON.parse(body)}catch{throw new ProfileListError('请求格式错误')}
      }
      result=await profileListResult(service,payload.sub,match,request.method,input)
    }catch(e){status=e.status??500;result={error:{code:e.code??'PROFILE_LIST_UNAVAILABLE',message:e.status?e.message:'暂时无法读取或保存，请重试'}}}
    response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(result))
  })}}
}
