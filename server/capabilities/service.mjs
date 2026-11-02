import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { capabilityInventory, capabilityVersion, recordingMethods, retrieveRecordingMethods, readCapabilitySource, searchCapabilityLibrary } from './library.mjs'

// These are method routing/integrity checks, intentionally named and reported
// as such. No synthetic assertion is called a real-provider or clinical exam.
export function evaluateRecordingMethods(){
 const cases=[
  ['不同人物','妈妈咳嗽，宝宝没有咳嗽','subject'],['未测不是正常','今天没测体温','uncertainty'],
  ['未知保留','不知道是不是疼，好像不舒服','clarification'],['用户纠正','刚才说错了，改成昨晚开始','correction'],
  ['先后经过','昨天开始，今天之后又补充了情况','chronology'],['数值记录','体温38.2度，药物2ml','numbers'],
  ['原件来源','医生说的报告在附件照片里','source'],['就诊交接','去医院给医生看就诊清单','handoff'],
  ['既往背景','既往病史、过敏与用药','history'],['就诊摘要','把症状情况整理成记录摘要','summary']
 ].map(([name,text,id])=>({name,kind:'method_routing',passed:retrieveRecordingMethods(text,{limit:6,budget:5000}).some(m=>m.id===id)}))
 cases.push({name:'全部方法有可核对的原文锚点',kind:'source_integrity',passed:recordingMethods.length>0&&recordingMethods.every(m=>readCapabilitySource(m.sourceId).paragraphs.some(p=>p.text.includes(m.quote)))})
 const bounded=retrieveRecordingMethods('孩子今天没测体温，昨天咳嗽，妈妈没有；更正药物2ml，给医生看报告',{budget:1500})
 cases.push({name:'模型上下文预算',kind:'retrieval_budget',passed:bounded.reduce((n,m)=>n+JSON.stringify(m).length,0)<=1500})
 cases.push({name:'资料与患者事实的命名空间隔离',kind:'scope_boundary',passed:bounded.every(m=>m.use==='recording_method_not_patient_fact'&&!Object.hasOwn(m,'factId')&&!Object.hasOwn(m,'evidenceId'))})
 return {version:capabilityVersion,kind:'deterministic_method_checks',cases,passed:cases.filter(c=>c.passed).length,total:cases.length,modelSemantics:'not_tested',clinicalReview:'not_tested'}
}
export class CapabilityService{
 constructor({dataDirectory}){this.store=new JsonStore(path.join(dataDirectory,'recording-capability-evaluations.json'),{reports:[]});this.running=null}
 async overview(){const saved=await this.store.read();return {...capabilityInventory(),reports:saved.reports.map(r=>({...r,current:r.version===capabilityVersion}))}}
 search(query){if(typeof query!=='string'||query.length>500)throw Object.assign(Error('请输入500字以内的合成检索内容'),{status:400});return {version:capabilityVersion,methods:retrieveRecordingMethods(query),results:searchCapabilityLibrary(query),queryStored:false}}
 async evaluate(){
  if(this.running)return this.running
  this.running=(async()=>{
   const report={id:randomUUID(),createdAt:new Date().toISOString(),...evaluateRecordingMethods()}
   await this.store.update(data=>({...data,reports:[report,...data.reports].slice(0,30)}))
   return {...report,current:true}
  })().finally(()=>{this.running=null})
  return this.running
 }
}
