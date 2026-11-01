import { createHash } from 'node:crypto'
export class CaptureWorkerClient {
  constructor({env=process.env,fetchImpl=fetch}={}){this.env=env;this.fetch=fetchImpl;this.cache={profiles:{},activeSource:null};this.available=false;this.checkedAt=0;this.pending=null}
  get configured(){return Boolean(this.env.OPS_CAPTURE_WORKER_URL&&this.env.OPS_CAPTURE_WORKER_TOKEN)}
  async request(path,{method='GET',body,binary=false,timeout=35000}={}){
    if(!this.configured)throw Object.assign(new Error('私有采集服务尚未连接'),{status:503,code:'CAPTURE_WORKER_UNAVAILABLE'})
    let response
    try{response=await this.fetch(new URL(path,this.env.OPS_CAPTURE_WORKER_URL),{method,headers:{Authorization:`Bearer ${this.env.OPS_CAPTURE_WORKER_TOKEN}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout),redirect:'error'})}catch{throw Object.assign(new Error('私有采集服务暂时无法连接，已保留原数据'),{status:503,code:'CAPTURE_WORKER_UNAVAILABLE'})}
    if(!response.ok){const value=await response.json().catch(()=>({}));throw Object.assign(new Error(response.status===401?'私有采集服务连接验证失败':value.error?.message||'采集服务暂时不可用'),{status:response.status===401?503:response.status,code:response.status===401?'CAPTURE_WORKER_UNAVAILABLE':value.error?.code||'CAPTURE_UNAVAILABLE'})}
    return binary?{buffer:Buffer.from(await response.arrayBuffer()),type:response.headers.get('content-type')||'image/jpeg'}:response.json()
  }
  async refreshMetadata(force=false){if(!force&&Date.now()-this.checkedAt<60000)return; if(this.pending)return this.pending;this.pending=(async()=>{try{this.cache=await this.request('/metadata',{timeout:5000});this.available=true}catch{this.available=false}finally{this.checkedAt=Date.now();this.pending=null}})();return this.pending}
  profile(id){return this.cache.profiles?.[id]??null}
  status(source){if(!this.configured)return{state:'authorization',label:'等待连接采集服务',detail:'通过控制台内授权窗口连接，不需要上传日常截图。'};if(!this.available)return{state:'unavailable',label:'采集服务暂时不可用',detail:'保留已有数据，恢复连接后继续读取。'};if(this.cache.activeSource)return{state:'busy',label:'正在授权平台',detail:'当前授权窗口结束后继续后台采集。'};if(!this.profile(source.id))return{state:'authorization',label:'等待首次登录授权',detail:'点击连接采集，在控制台完成一次平台登录和账单核对。'};return{state:'ready',label:'持续采集已连接',detail:'已保存独立授权和账单字段，后台自动读取。',fields:Object.keys(this.profile(source.id).fields||{})}}
  async capture(source){return this.request(`/capture/${encodeURIComponent(source.id)}`,{method:'POST',timeout:45000})}
}
export async function handleCaptureApi({request,response,pathname,readJson,send,vault,ops,actorId}){
  if(!pathname.startsWith('/api/ops/capture/'))return false
  const route=pathname.slice('/api/ops/capture'.length)
  if(route==='/runtime'&&request.method==='GET'){
    try{send(response,200,await vault.request('/runtime'))}catch(error){send(response,200,{installed:false,available:false,isolated:true,configuredSources:[],error:error.message})}return true
  }
  if(route==='/runtime/check'&&request.method==='POST'){send(response,200,await vault.request('/runtime/check',{method:'POST'}));return true}
  if(route==='/sessions'&&request.method==='POST'){const input=await readJson(request);const actor=createHash('sha256').update(String(actorId)).digest('hex');const data=await vault.request('/sessions',{method:'POST',body:{sourceId:input.sourceId,consent:input.consent,actor}});await vault.refreshMetadata(true);send(response,200,data);return true}
  const match=/^\/sessions\/([a-f0-9-]+)(?:\/(image|preview|frame|actions|analyze|commit))?$/.exec(route)
  if(!match){send(response,404,{error:{code:'NOT_FOUND',message:'接口不存在'}});return true}
  const[,id,action]=match
  if(['image','preview'].includes(action)&&request.method==='GET'){const file=await vault.request(`/sessions/${id}/${action}`,{binary:true});response.statusCode=200;response.setHeader('Content-Type',file.type);response.setHeader('Content-Length',String(file.buffer.length));response.setHeader('Cache-Control','private, no-store');response.end(file.buffer);return true}
  if(action==='frame'&&request.method==='GET'){send(response,200,await vault.request(`/sessions/${id}/frame`));return true}
  if(!action&&['GET','DELETE'].includes(request.method)){const data=await vault.request(`/sessions/${id}`,{method:request.method});if(request.method==='DELETE')await vault.refreshMetadata(true);send(response,200,data);return true}
  if(['actions','analyze','commit'].includes(action)&&request.method==='POST'){const input=await readJson(request),data=await vault.request(`/sessions/${id}/${action}`,{method:'POST',body:input});if(action==='commit'){await vault.refreshMetadata(true);const source=await ops.refresh(data.sourceId);send(response,200,{...data,source})}else send(response,200,data);return true}
  send(response,405,{error:{code:'METHOD_NOT_ALLOWED',message:'方法不支持'}});return true
}
