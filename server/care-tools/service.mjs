import path from 'node:path'
import {createHash} from 'node:crypto'
import {JsonStore} from '../auth/storage/json-store.mjs'
import {accountTransaction} from '../auth/storage/transaction.mjs'
import {FamilyMemberService} from '../members/family-member-service.mjs'
import {CareJourneyError} from '../care-journey/service.mjs'

const fail=(message,code='CARE_TOOL_INVALID',status=422)=>new CareJourneyError(message,status,code)
const text=(value,max=120)=>typeof value==='string'?value.trim().slice(0,max):''
const requestId=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(value))throw fail('请重新确认本次操作');return value}
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export class CareToolsService {
  constructor(options){this.options=options;this.care=options.care;this.food=options.food;this.members=options.members??new FamilyMemberService(options);this.directory=options.dataDirectory;this.profiles=new JsonStore(path.join(this.directory,'health-profile-sections.json'),{sections:[]});this.reminders=new JsonStore(path.join(this.directory,'medication-reminders.json'),{reminders:[]});this.templates=new JsonStore(path.join(this.directory,'care-tool-templates.json'),{templates:[]})}
  async compare(accountId,input,signal){
    await this.members.get(accountId,input.memberId)
    if(!Array.isArray(input.products)||input.products.length<2||input.products.length>3)throw fail('请选择2至3种不同食品；单件识别可继续免费使用')
    if(input.products.some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw fail('食品资料格式不完整，请重新添加')
    const products=input.products.map((p,index)=>({name:text(p.name)||`食品${index+1}`,photos:p.photos}))
    if(products.some(p=>!Array.isArray(p.photos)||p.photos.length<1||p.photos.length>6))throw fail('每种食品请添加1至6张同一包装的清晰标签')
    if(products.some(p=>p.photos.some(x=>!x||typeof x!=='object'||typeof x.dataUrl!=='string'||!x.dataUrl.startsWith('data:image/'))))throw fail('照片格式不完整，请重新添加')
    if(Buffer.byteLength(JSON.stringify(products))>27_000_000)throw fail('照片总量过大，请减少重复照片后重试','PHOTO_SIZE',413)
    const identities=products.flatMap((p,index)=>[...new Set(p.photos.map(x=>hash(x.dataUrl)))].map(value=>({value,index})))
    if(identities.some((x,i)=>identities.some((y,j)=>j<i&&x.value===y.value&&x.index!==y.index)))throw fail('两件食品使用了相同照片，请分别添加不同食品的标签')
    const key=requestId(input.requestId)
    return this.care.runService(accountId,{productId:'food-comparison',requestId:key,memberId:input.memberId,scope:hash(products)},async()=>{
      const readable=[],unreadable=[]
      for(const [i,p] of products.entries()){
        signal?.throwIfAborted()
        try {
          const result=await this.food.analyze(accountId,{taskId:`${key}-${i}`,memberId:input.memberId,photos:p.photos},signal)
          if(result.failure||result.assessmentComplete===false||!result.ingredients?.length||!result.labelEvidence?.length||result.labelEvidence.some(x=>!x.reliable))throw fail('请补拍完整清晰的配料与厂商警示')
          readable.push({name:p.name,ingredients:result.displayIngredients??result.ingredients,contains:result.contains??[],advisory:result.advisory??[],labelEvidence:result.labelEvidence,photos:p.photos,sourcePhotoCount:p.photos.length})
        } catch(error) {signal?.throwIfAborted();if(error.status===401||error.status===403||error.status===404||error.code==='FOOD_MEMBER_CHANGED')throw error;unreadable.push({name:p.name,message:'标签未完整读出，请补拍后单独核对'})}
      }
      signal?.throwIfAborted()
      if(readable.length<2)throw fail('至少两件食品完整可读才生成对照，本次不扣树芽；请补拍后重试','NO_VALID_RESULT',409)
      return {valid:true,id:key,kind:'food-comparison',memberId:input.memberId,createdAt:new Date().toISOString(),cost:5,products:readable,unreadable}
    })
  }
  async handoff(accountId,input){
    const member=await this.members.get(accountId,input.memberId)
    if(input.confirmed!==true)throw fail('请先核对当前忌口清单与交接内容')
    const titles={nursery:'托育忌口交接单',travel:'出行忌口交接单',temporary:'临时照顾忌口交接单'}
    const handoffChecklist={nursery:['供餐前由接收人核对当天配料与这份清单','临时更换食品或无法核对配料时，先联系家长确认','交接结束时补充当天实际饮食与需要继续留意的记录'],travel:['用餐前出示清单，确认对方理解各项食物名称','保留食品包装或配料照片，方便回看来源','记录本次地点与实际饮食，返回后一起核对'],temporary:['接收人确认本次照顾时段和家长联系方式','按家长已核对的食品与安排准备，不额外推断替代方案','照顾结束后交回实际发生的记录与未确认事项']}
    if(!titles[input.scenario])throw fail('请选择交接场景')
    const section=(await this.profiles.read()).sections.find(s=>s.accountId===accountId&&s.memberId===input.memberId&&s.sectionId==='dietary-card')
    const snapshot=section?.records?.find(s=>s.version===1&&s.memberId===input.memberId&&Array.isArray(s.items))
    const chosen=snapshot?.items?.filter(x=>x.visible===true&&!x.needsReview&&text(x.name)&&['avoid','temporary'].includes(x.group))??[]
    if(!chosen.length)throw fail('请先免费核对并保存忌口卡，再选择场景整理；本次不扣树芽','DIETARY_REVIEW_REQUIRED',409)
    const scope={scenario:input.scenario,note:text(input.note,1000),snapshotHash:hash(snapshot)}
    return this.care.runService(accountId,{productId:'handoff-enhanced',requestId:requestId(input.requestId),memberId:input.memberId,...scope},async()=>({valid:true,id:input.requestId,kind:'handoff-enhanced',memberId:input.memberId,memberName:member.name,createdAt:new Date().toISOString(),cost:10,scenario:input.scenario,title:titles[input.scenario],avoid:chosen.filter(x=>x.group==='avoid').map(x=>text(x.name)),temporary:chosen.filter(x=>x.group==='temporary').map(x=>text(x.name)),avoidCrossContact:snapshot.avoidCrossContact===true,note:scope.note,sourceSavedAt:snapshot.savedAt??null,handoffChecklist:handoffChecklist[input.scenario]}))
  }
  async results(accountId,id){
    await this.care.get(accountId)
    const account=(await this.care.store.read()).accounts.find(x=>x.accountId===accountId)
    const members=new Set((await this.members.list(accountId)).map(x=>x.id))
    const items=(account?.reservations??[]).filter(x=>x.status==='completed'&&['food-comparison','handoff-enhanced'].includes(x.productId)&&members.has(x.result?.memberId)).map(x=>x.result)
    if(id){const result=items.find(x=>x.id===id);if(!result)throw fail('未找到这份整理结果','RESULT_NOT_FOUND',404);return result}
    return {items:items.map(({products,...x})=>({...x,...(products?{productNames:products.map(p=>p.name)}:{})})).reverse()}
  }
  async templateAccess(accountId){const e=await this.care.entitlements(accountId);return e.products['medication-templates']?.owned||e.products['medication-templates']?.included}
  async listTemplates(accountId){const owned=Boolean(await this.templateAccess(accountId));return {owned,items:owned?(await this.templates.read()).templates.filter(x=>x.accountId===accountId).map(({accountId,fingerprint,requestId,...x})=>x):[]}}
  async saveTemplate(accountId,input){
    if(!await this.templateAccess(accountId))throw fail('先收藏常用用药安排模板包，再保存模板','TEMPLATE_NOT_OWNED',403)
    const source=(await this.reminders.read()).reminders.find(x=>x.id===input.reminderId&&x.accountId===accountId)
    if(!source)throw fail('未找到本人已核对的用药安排','REMINDER_NOT_FOUND',404)
    await this.members.get(accountId,source.memberId)
    const key=requestId(input.requestId),label=text(input.label,60)
    if(!label)throw fail('请为模板填写一个名称')
    const p=source.plan
    // Deliberately omit medicine, amount, dates and course duration.
    const structure={mode:p.mode,times:[...p.times],...(p.mode==='interval'?{intervalHours:p.intervalHours}:{}),reminderTargets:['我']}
    const fingerprint=hash({reminderId:source.id,label,structure})
    return accountTransaction(this.directory,async()=>{
      const data=structuredClone(await this.templates.read()),old=data.templates.find(x=>x.accountId===accountId&&x.requestId===key)
      if(old){if(old.fingerprint!==fingerprint)throw fail('模板来源已变化，请重新确认','REQUEST_CONFLICT',409);return this.listTemplates(accountId)}
      if(data.templates.filter(x=>x.accountId===accountId).length>=30)throw fail('已保存30个模板，请先整理不再使用的模板')
      data.templates.push({id:key,accountId,requestId:key,label,structure,fingerprint,createdAt:new Date().toISOString()});await this.templates.update(()=>data);return this.listTemplates(accountId)
    })
  }
  async deleteTemplate(accountId,id){if(!await this.templateAccess(accountId))throw fail('请先读取本人模板','TEMPLATE_NOT_OWNED',403);await this.templates.update(data=>({...data,templates:data.templates.filter(x=>!(x.accountId===accountId&&x.id===id))}));return this.listTemplates(accountId)}
}
