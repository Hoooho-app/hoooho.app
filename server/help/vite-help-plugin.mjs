import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HelpService } from './help-service.mjs'
import { helpApi } from './help-api.mjs'

export function helpApiPlugin(options={}) {
  const service=options.service??new HelpService({...options,dataDirectory:options.dataDirectory??authConfig.dataDirectory})
  const tokens=options.tokens??new TokenService(options.tokenSecret??authConfig.tokenSecret,authConfig.tokenTtlMs)
  return {name:'hoooho-help-api',configureServer(server){server.middlewares.use(async(req,res,next)=>{
    const pathname=new URL(req.url??'/','http://localhost').pathname
    if(!pathname.startsWith('/api/help/'))return next()
    try{
      const token=/^Bearer\s+(.+)$/i.exec(req.headers.authorization??'')?.[1],auth=token?tokens.verify(token):null
      if(!auth)throw Object.assign(new Error('登录状态无效或已过期'),{status:401,code:'UNAUTHORIZED'})
      const readBody=()=>new Promise((resolve,reject)=>{let body='',tooLarge=false;req.setEncoding('utf8');req.on('data',chunk=>{body+=chunk;if(body.length>3_000_000&&!tooLarge){tooLarge=true;reject(Object.assign(new Error('请求内容过大'),{status:413}))}});req.on('end',()=>{if(tooLarge)return;try{resolve(body?JSON.parse(body):{})}catch{reject(Object.assign(new Error('请求格式错误'),{status:400}))}});req.on('error',reject)})
      const result=await helpApi(service,auth.sub,pathname,req.method,readBody)
      res.statusCode=result.status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result.body))
    }catch(error){res.statusCode=error.status??500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({error:{code:error.code??'HELP_ERROR',message:res.statusCode>=500?'帮助服务暂时不可用，请重试':error.message}}))}
  })}}
}
