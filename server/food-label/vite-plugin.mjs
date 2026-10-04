import { AuthService } from '../auth/auth-service.mjs'
import { BrowserSessionService } from '../auth/browser-session-service.mjs'
import { authConfig } from '../auth/config.mjs'
import { createFoodLabelService, foodLabelApi } from './api.mjs'
const sendJson=(response,status,data)=>{response.statusCode=status;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.end(JSON.stringify(data))}
const readJson=(request,limit)=>new Promise((resolve,reject)=>{let body='',settled=false;request.setEncoding('utf8');request.on('data',chunk=>{if(settled)return;body+=chunk;if(body.length>limit){settled=true;reject(Object.assign(new Error('照片总量过大'),{status:413,code:'FOOD_PHOTO_SIZE'}))}});request.on('end',()=>{if(settled)return;try{resolve(JSON.parse(body))}catch{reject(Object.assign(new Error('请求格式错误'),{status:400}))}});request.on('error',reject)})
export function foodLabelApiPlugin(options={}){
  const config={...authConfig,...options},auth=new AuthService(config),sessions=new BrowserSessionService(auth),service=createFoodLabelService(config)
  return {name:'hoooho-food-label-api',configureServer(server){server.middlewares.use(async(request,response,next)=>{
    if(new URL(request.url??'/','http://localhost').pathname!=='/api/food-label/check')return next()
    try{sessions.assertSameOrigin(request);const token=/^Bearer\s+(.+)$/i.exec(request.headers.authorization??'')?.[1],payload=token?auth.tokens.verify(token):null;if(!payload||!await auth.users.findById(payload.sub))throw Object.assign(new Error('使用状态已失效'),{status:401,code:'UNAUTHORIZED'});await foodLabelApi(request,response,{service,accountId:payload.sub,readJson,sendJson})}
    catch(error){sendJson(response,error.status??500,{error:{code:error.code??'FOOD_ANALYSIS_FAILED',message:error.status===401?'使用状态已失效，请返回后重试':'本次核对未完成'}})}
  })}}
}
