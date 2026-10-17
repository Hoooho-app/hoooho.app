import {authConfig} from '../auth/config.mjs'
import {AuthService} from '../auth/auth-service.mjs'
import {BrowserSessionService} from '../auth/browser-session-service.mjs'
import {parseJsonObject} from '../json-input.mjs'
import {CareJourneyService} from '../care-journey/service.mjs'
import {readCareAccountId} from '../care-journey/api.mjs'
import {createFoodLabelService} from '../food-label/api.mjs'
import {CareToolsService} from './service.mjs'
export const CARE_TOOLS_BODY_LIMIT=28_000_000
export function careToolsRoute(path){const m=/^\/api\/care-tools\/(food-comparison|handoff|results|medication-templates)(?:\/([A-Za-z0-9_-]{8,100}))?$/.exec(path);return m?{kind:m[1],id:m[2]}:null}
export async function careToolsResult(service,accountId,route,method,input,signal){
  if(method==='GET'&&route.kind==='results')return service.results(accountId,route.id)
  if(method==='GET'&&route.kind==='medication-templates'&&!route.id)return service.listTemplates(accountId)
  if(method==='POST'&&!route.id){if(route.kind==='food-comparison')return service.compare(accountId,input,signal);if(route.kind==='handoff')return service.handoff(accountId,input);if(route.kind==='medication-templates')return service.saveTemplate(accountId,input)}
  if(method==='DELETE'&&route.kind==='medication-templates'&&route.id)return service.deleteTemplate(accountId,route.id)
  throw Object.assign(new Error('请求方法不支持'),{status:405,code:'METHOD_NOT_ALLOWED'})
}
export function careToolsApiPlugin(options={}){const config={...authConfig,...options},auth=new AuthService(config),browser=new BrowserSessionService(auth),care=options.care??new CareJourneyService({...config,enabledProducts:['food-comparison','handoff-enhanced','medication-templates','growth-comparison']}),service=options.service??new CareToolsService({...config,care,food:options.food??createFoodLabelService(config)});return {name:'hoooho-care-tools',configureServer(server){server.middlewares.use(async(req,res,next)=>{const url=new URL(req.url??'/','http://localhost');const route=careToolsRoute(url.pathname);if(!route)return next();try{const accountId=await readCareAccountId(req,{tokens:auth.tokens,service:care,sessions:browser});let input={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>CARE_TOOLS_BODY_LIMIT)throw Object.assign(new Error('照片总量过大'),{status:413})}input=parseJsonObject(raw)}const controller=new AbortController();res.once('close',()=>{if(!res.writableEnded)controller.abort()});const result=await careToolsResult(service,accountId,route,req.method,input,controller.signal);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(result))}catch(e){res.writeHead(e.status??500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:{code:e.code??'CARE_TOOL_UNAVAILABLE',message:e.status?e.message:'整理未完成，请重试；未完成不消费树芽'}}))}})}}}
