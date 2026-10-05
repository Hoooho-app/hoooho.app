import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { AuthService } from '../auth/auth-service.mjs'
import { FamilyMemberService } from '../members/family-member-service.mjs'
import { FoodLabelService, foodFailureMessage } from './service.mjs'
import { activeAllergyRecords } from '../health-profile/profile-section-store.mjs'
const legacyStatus=value=>({'已明确':'confirmed','已确诊':'confirmed','医生确认':'confirmed','待排查':'investigating','疑似':'suspected','已排除':'excluded','曾经有，目前已耐受':'tolerated'}[value]??value)

export function createFoodLabelService(options){
  const sections=new JsonStore(path.join(options.dataDirectory,'health-profile-sections.json'),{sections:[]})
  const auth=new AuthService(options)
  return new FoodLabelService({...options,currentMember:async accountId=>(await auth.users.findById(accountId))?.currentMemberId,members:new FamilyMemberService(options),readRecords:async(accountId,memberId)=>{
    const section=(await sections.read()).sections.find(s=>s.accountId===accountId&&s.memberId===memberId&&s.sectionId==='allergy')
    // Outer archive ownership is authoritative, including legacy token-valued IDs.
    return activeAllergyRecords(section?.records??[],memberId).map(r=>({id:r.id,name:r.name??r.subject,conditionType:r.conditionType,reactionType:r.reactionType,category:r.category==='food'||String(r.category??r.type??'').includes('食')?'food':r.category,currentStatus:legacyStatus(r.currentStatus??r.certainty??''),ingredientRelations:Array.isArray(r.ingredientRelations)?r.ingredientRelations:[]}))
  }})
}

export async function foodLabelApi(request,response,{service,accountId,readJson,sendJson}){
  response.setHeader('Cache-Control','no-store, max-age=0')
  response.setHeader('Pragma','no-cache')
  if(request.method!=='POST'){sendJson(response,405,{error:{code:'METHOD_NOT_ALLOWED',message:'仅支持POST请求'}});return}
  const controller=new AbortController()
  const close=()=>{if(!response.writableEnded)controller.abort()}
  response.once('close',close)
  let input
  try{
    input=await readJson(request,43_000_000)
    const result=await service.analyze(accountId,input,controller.signal)
    if(!controller.signal.aborted)sendJson(response,200,result)
  }catch(error){
    if(!controller.signal.aborted)sendJson(response,error.status??503,{taskId:input?.taskId,error:{code:error.code??'FOOD_ANALYSIS_FAILED',message:foodFailureMessage(error)},...(error.foodDiagnostics?{diagnostics:error.foodDiagnostics}:{})})
  }finally{
    // No persisted photos, OCR, results, draft files or content logs.
    if(input?.photos)input.photos.length=0
    input=null
    response.removeListener('close',close)
  }
}
