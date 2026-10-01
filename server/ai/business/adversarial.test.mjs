import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { FamilyMemberRepository } from '../../members/repositories/family-member-repository.mjs'
import { AIBusinessService } from './service.mjs'
import { BusinessModel } from './model.mjs'
import { bodyLocations,validateExtraction,mergeItems,resolveItemTime,buildJournal } from './contract.mjs'
import { prepareDocuments,recognizePage } from './documents.mjs'
import { archiveItem } from './archive.mjs'
import { memberInsights } from './insights.mjs'
const source={id:'input',page:1,text:'2026-09-29 测试机构 红细胞 4.2 mmol/L 参考3.5-5.5 阳性；疑似过敏，无呕吐。'}
const make=(category,fields,timeText='2026-09-29')=>({category,title:'不得采用的无依据诊断',subject:'current',archiveCategory:null,relationKey:null,timeText,fields:fields.map(([name,value])=>({name,value,quote:value,sourceId:'input',page:1}))})
test('缩短引文不能删掉相邻的否定或疑似前缀',()=>{
  for(const [raw,value] of [['疑似哮喘','哮喘'],['无呕吐','呕吐'],['未确诊过敏','过敏']])assert.throws(()=>validateExtraction({items:[make('symptom',[['symptom',value]],null)]},[{id:'input',page:1,text:raw}]),{code:'AI_EVIDENCE_MISMATCH'})
  assert.equal(validateExtraction({items:[make('symptom',[['symptom','恶心']],null)]},[{id:'input',page:1,text:'没有呕吐，只有恶心'}]).length,1)
})
test('不明确病史保留来源记录，不错误新增住院或确诊栏目',()=>{
  const item={...make('other',[['historyName','旧资料']]),archiveCategory:'medical-history'},context={accountId:'synthetic',memberId:'member',eventId:'event',recordId:'record',attachmentIds:[],now:new Date('2026-09-30')}
  assert.deepEqual(archiveItem([],item,context),[])
  const med=archiveItem([],{...item,archiveCategory:'medication',fields:[{name:'medicationName',value:'药名原文'},{name:'doseOriginal',value:'5 mg'}]},context)[0].records[0]
  assert.equal(med.name,'药名原文');assert.equal(med.dose,'5 mg');assert.equal(med.frequency,'')
})
test('混合食物、耐受量和日常药不填入诱发剂量或当次处理',()=>{
  const base={id:'synthetic',eventId:'event',type:'symptom',content:'原始观察',aiProvenance:{fields:[{name:'ABC_C',value:'牛奶、鸡蛋'},{name:'amount',value:'120'},{name:'ABC_B',value:'每日维持用药'}]}}
  const result=memberInsights([base]);assert.equal(result.abc,undefined);assert.equal(result.score,undefined);assert.equal(base.aiProvenance.fields.length,3)
})
test('保留否定、不确定性和原数值，标题不采用模型虚构内容，其他主体忽略',()=>{
  const items=validateExtraction({items:[make('symptom',[['symptom','无呕吐']]),{...make('symptom',[['symptom','疑似过敏']]),subject:'other'}]},[source]);assert.equal(items.length,1);assert.equal(items[0].title,'无呕吐')
  for(const f of [{name:'symptom',value:'呕吐',quote:'无呕吐'},{name:'symptom',value:'过敏',quote:'疑似过敏'},{name:'result',value:'4.8',quote:'4.2 mmol/L'}])assert.throws(()=>validateExtraction({items:[{...make('symptom',[]),fields:[{...f,sourceId:'input',page:1}]}]},[source]),{code:'AI_EVIDENCE_MISMATCH'})
})
test('日期按输入时区解析，发生范围不变精确时刻，不借用其他页日期',()=>{const t=resolveItemTime({timeText:'2026-09-29'},{referenceNow:new Date('2026-09-30T10:00Z'),timezone:'Asia/Shanghai'});assert.equal(t.resolvedStart,'2026-09-28T16:00:00.000Z');assert.equal(t.precision,'day');assert.throws(()=>validateExtraction({items:[make('symptom',[['symptom','无呕吐']],'2026-09-28')]},[source,{id:'other',page:2,text:'2026-09-28'}]))})
test('定位器仅匹配冻结词表，未知或含糊原话保留文本但不发明编号；活动分钟不补量',()=>{assert.deepEqual(bodyLocations('一个不确定的部位'),[]);const activity=buildJournal({category:'activity',fields:[{name:'activity',value:'散步'},{name:'durationMinutes',value:'15'}]});assert.equal(activity.outdoorActivity.durationMinutes,15);assert.deepEqual(activity.outdoorActivity.activities,['walking']);assert.equal(activity.outdoorActivity.activityOtherText,undefined)})
test('同日期同机构同检查的互补字段合并，所有原引用保留，结果冲突和异日并列',()=>{const a={id:'a',category:'examination',time:{resolvedStart:'2026-09-29T00:00Z'},fields:[{name:'institution',value:'测试机构',sources:[{sourceId:'a',page:1,quote:'测试机构'}]},{name:'testName',value:'红细胞',sources:[{sourceId:'a',page:1,quote:'红细胞'}]}]},b={...a,id:'b',fields:[...a.fields,{name:'result',value:'4.2',sources:[{sourceId:'b',page:2,quote:'4.2'}]}]};assert.equal(mergeItems([a,b]).length,1);assert.equal(mergeItems([a,b])[0].fields.length,3);const conflict={...b,id:'c',fields:b.fields.map(f=>f.name==='result'?{...f,value:'4.8'}:f)};assert.equal(mergeItems([b,conflict]).length,2);assert.equal(mergeItems([a,{...b,time:{resolvedStart:'2026-09-28T00:00Z'}}]).length,2)})
test('检测阳性只归档待排查，不扩大忌口；关联记录和原值保留',()=>{const item={...make('examination',[]),archiveCategory:'allergy',fields:[{name:'allergen',value:'牛奶'},{name:'result',value:'阳性'},{name:'testName',value:'特异性IgE'}],time:{resolvedStart:'2026-09-29T00:00Z'}};const saved=archiveItem([],item,{accountId:'synthetic',memberId:'synthetic-member',eventId:'event',recordId:'record',attachmentIds:['file'],now:new Date('2026-09-30')})[0].records[0];assert.equal(saved.currentStatus,'investigating');assert.equal(saved.dietaryAction,'');assert.equal(saved.tests[0].result,'positive');assert.equal(saved.evidenceLinks[0].healthRecordId,'record')})
test('食品时间关联不写成因果，ABC未知不补0，日常用药不放入同次处理',()=>{const result=memberInsights([{id:'food',eventId:'food-event',content:'合成食品记录',occurredAt:'2026-09-29T10:00Z',journal:{categories:['diet'],timePrecision:'exact',diet:{foods:['牛奶','鸡蛋'],amount:'不清楚'}}},{id:'med',eventId:'med-event',content:'每日维护用药',occurredAt:'2026-09-29T10:10Z',journal:{categories:['medication']}},{id:'sym',eventId:'sym-event',type:'symptom',content:'原反应',occurredAt:'2026-09-29T10:20Z',journal:{categories:['symptom'],timePrecision:'exact',symptom:{narrative:'原反应'}}}]);assert.equal(result.foodAssociations.length,1);assert.equal(result.foodAssociations[0].relation,'仅时间邻近，未确认关联');assert.equal(result.abc,undefined);assert.equal(result.score,undefined)})
test('多页PDF逐页输入，重复文件不重复识别，页数和格式错误不静默通过',async()=>{
  const pdf=await PDFDocument.create();pdf.addPage([300,200]);pdf.addPage([300,200])
  const dataUrl=`data:application/pdf;base64,${Buffer.from(await pdf.save()).toString('base64')}`,file={name:'synthetic.pdf',mimeType:'application/pdf',dataUrl}
  const prepared=await prepareDocuments([file,file]);assert.equal(prepared.documents.length,1);assert.deepEqual(prepared.pages.map(p=>p.page),[1,2])
  for(const p of prepared.pages)assert.equal((await PDFDocument.load(Buffer.from(p.dataUrl.split(',')[1],'base64'))).getPageCount(),1)
  let input
  const output=await recognizePage(prepared.pages[1],{structured:async task=>{input=task.input;return{value:{text:'合成原文',status:'readable'},diagnostics:{}}}})
  assert.equal(output.page,2);assert.equal(input[0].content[1].type,'input_file')
  await assert.rejects(()=>prepareDocuments([{...file,dataUrl:'data:application/pdf;base64,YmFk'}]))
  const large=await PDFDocument.create();for(let i=0;i<13;i++)large.addPage()
  const largeData=`data:application/pdf;base64,${Buffer.from(await large.save()).toString('base64')}`
  await assert.rejects(()=>prepareDocuments([{...file,dataUrl:largeData}]))
})
test('图片真实解码后才进入视觉输入，伪造或不支持文件拒绝',async()=>{const image=await sharp({create:{width:100,height:80,channels:3,background:'#ffffff'}}).png().toBuffer(),dataUrl=`data:image/png;base64,${image.toString('base64')}`;assert.equal((await prepareDocuments([{name:'synthetic.png',mimeType:'image/png',dataUrl}])).pages.length,1);await assert.rejects(()=>prepareDocuments([{mimeType:'image/png',dataUrl:'data:image/png;base64,YmFk'}]));await assert.rejects(()=>prepareDocuments([{mimeType:'image/svg+xml',dataUrl:'data:image/svg+xml;base64,YmFk'}]))})
test('429、拒绝、截断、无效JSON关闭重试，错误与日志无密钥、请求内容或原始响应',async()=>{for(const response of [new Response(JSON.stringify({error:{type:'insufficient_quota',code:'insufficient_quota',message:'SECRET_INPUT'}}),{status:429,headers:{'x-request-id':'req_synthetic','retry-after':'30'}}),Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'}}),Response.json({output:[{content:[{type:'refusal',refusal:'SECRET_INPUT'}]}]}),Response.json({output:[{content:[{type:'output_text',text:'SECRET_INPUT'}]}]})]){let calls=0,logs=[];const model=new BusinessModel({provider:{apiKey:'SYNTHETIC_SECRET_KEY',baseUrl:'https://api.openai.com/v1',model:'test',fetch:async()=>{calls++;return response}},logger:{info:(...v)=>logs.push(v),warn:(...v)=>logs.push(v)}});await assert.rejects(()=>model.structured({task:'synthetic',schema:{type:'object'},instructions:'test',input:'SECRET_INPUT'}),error=>{assert.doesNotMatch(JSON.stringify(error),/SECRET_INPUT|SYNTHETIC_SECRET_KEY/);return true});assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(logs),/SECRET_INPUT|SYNTHETIC_SECRET_KEY/)}})
test('批量保存中途失败全量回滚；用户之后修改的记录不能被撤销删除',async t=>{const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-ai-atomic-'));t.after(()=>rm(directory,{recursive:true,force:true}));const member=await new FamilyMemberRepository(directory).create({accountId:'synthetic',name:'合成人物',relationship:'self'});const model={structured:async()=>({value:{items:[make('symptom',[['symptom','无呕吐']])]},diagnostics:{}})},svc=new AIBusinessService({dataDirectory:directory,model}),d=await svc.prepare('synthetic',member.id,{text:'2026-09-29 无呕吐'});const duplicate={...d.items[0],id:'second',category:'other'};await svc.store.update(data=>({...data,drafts:data.drafts.map(x=>x.id===d.id?{...x,items:[...x.items,duplicate]}:x)}));const original=svc.records.create.bind(svc.records);let count=0;svc.records.create=async(...args)=>{if(++count===2)throw new Error('Synthetic save failure');return original(...args)};await assert.rejects(()=>svc.save('synthetic',member.id,d.id,{version:d.version,confirmed:true}));assert.equal((await svc.events.repository.findByAccountId('synthetic')).length,0);assert.equal((await svc.records.repository.findByAccountId('synthetic')).length,0);svc.records.create=original;const saved=await svc.save('synthetic',member.id,d.id,{version:d.version,confirmed:true});await svc.records.update('synthetic',saved.result.records[0].recordId,{content:'用户之后修改的合成内容'});await assert.rejects(()=>svc.undo('synthetic',member.id,d.id),{status:409});assert.equal((await svc.records.getOwnedRecord('synthetic',saved.result.records[0].recordId)).content,'用户之后修改的合成内容')})
