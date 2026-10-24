import test from 'node:test'
import assert from 'node:assert/strict'
import {buildProfessionalSummary,normalizeObservation,validateProfessionalSummary} from './professional-summary.mjs'
import {interpretNursingAnswer} from './nursing-interview.mjs'

const fact=(name,value,quote=value)=>({name,value,sources:[{sourceId:'input',page:1,quote}],confirmed:false,editedBy:'model'})
const item=(fields,other={})=>({id:'item-1',category:'symptom',fields,timeText:null,...other})

test('a voice no remains bound to respiratory effort instead of becoming an isolated denial',()=>{
  const answer={...interpretNursingAnswer('resp-effort','没有'),sourceMessageId:'voice-2',questionId:'resp-effort',questionText:'呼吸有没有明显费力？',answerText:'没有'}
  const input=item([fact('symptom','孩子咳嗽\n没有')],{answerObservations:[answer]})
  const summary=buildProfessionalSummary(input,{sources:[{id:'input',page:1,text:'孩子咳嗽\n没有'}]})
  assert.equal(summary.text,'孩子咳嗽；家长未见孩子有明显呼吸费力。')
  assert.deepEqual(summary.claims.at(-1).factIds,['answer:voice-2'])
  assert.doesNotMatch(summary.text,/没有呕吐|呼吸正常|已排除/)
  assert.equal(validateProfessionalSummary(summary,input),true)
})
test('answer IDs cannot bless a changed interpretation or a diagnosis',()=>{
  const answer={...interpretNursingAnswer('resp-effort','没有'),sourceMessageId:'voice-2',questionId:'resp-effort',questionText:'呼吸有没有明显费力？',answerText:'没有',text:'已排除肺炎'}
  assert.equal(buildProfessionalSummary(item([fact('symptom','咳嗽')],{answerObservations:[answer]})),null)
})
test('behaviour and approximate list counts preserve their meaning',()=>{
  assert.equal(normalizeObservation('抓痒，但不确定是不是疼'),'抓挠，但不确定是不是疼')
  assert.equal(normalizeObservation('拉稀三、四次'),'排稀便三、四次')
})

test('colloquial stool description becomes a short observation without cause or absent findings',()=>{
  const input=item([fact('symptom','拉稀两回')]),before=structuredClone(input)
  const summary=buildProfessionalSummary(input)
  assert.equal(summary.text,'排稀便2次。')
  assert.deepEqual(summary.claims,[{text:'排稀便2次',factIds:['item-1:field:0']}])
  assert.doesNotMatch(summary.text,/感染|脱水|没有呕吐/)
  assert.deepEqual(input,before)
})
test('skin location and manifestation combine while itch and explicit start time remain sourced',()=>{
  const input=item([fact('symptom','起了红点，老挠','昨晚右小腿起了红点，老挠'),fact('location','右小腿')],{timeText:'昨晚'})
  const summary=buildProfessionalSummary(input)
  assert.equal(summary.text,'昨晚右小腿出现红点，反复抓挠。')
  assert.deepEqual(summary.claims[1].factIds,['item-1:field:0','item-1:field:1'])
  assert.doesNotMatch(summary.text,/过敏|湿疹|无破皮/)
})
test('unknown urine output remains unknown and an explicit denial is not reversed',()=>{
  const summary=buildProfessionalSummary(item([fact('symptom','尿尿时哭，尿量没注意，没有呕吐')]))
  assert.equal(summary.text,'排尿时哭，尿量未观察，没有呕吐。')
  assert.doesNotMatch(summary.text,/尿量正常|无脱水|尿路感染/)
})
test('ear pulling stays an observed action rather than pain or otitis',()=>{
  const summary=buildProfessionalSummary(item([fact('symptom','老扯右耳朵')]))
  assert.equal(summary.text,'反复牵拉右耳。')
  assert.doesNotMatch(summary.text,/耳痛|中耳炎/)
})
test('avoiding hard food does not imply toothache or caries',()=>{
  const summary=buildProfessionalSummary(item([fact('symptom','不肯吃硬的，也没说疼')]))
  assert.equal(summary.text,'不肯吃硬的，也没说疼。')
  assert.doesNotMatch(summary.text,/龋齿|牙痛|口腔疼痛/)
})
test('approximate counts do not become exact numbers',()=>{
  for(const raw of ['拉稀两三回','拉稀一两次','拉稀三到四次','拉稀十多次']){
    const text=normalizeObservation(raw)
    assert.doesNotMatch(text,/23次|12次|34次/)
    assert.match(text,/两三|一两|三到四|十多/)
  }
})
test('concrete time, uncertainty and attributed symptoms survive literal normalization',()=>{
  const summary=buildProfessionalSummary(item([fact('symptom','昨天晚上可能肚子疼，没有发痒')]))
  assert.equal(summary.text,'昨晚可能腹痛，没有瘙痒。')
  assert.doesNotMatch(summary.text,/确诊|腹痛已确认/)
})
test('temperature touch does not become a measured value or fever diagnosis',()=>{
  const summary=buildProfessionalSummary(item([fact('symptom','摸着有点热，体温没量')]))
  assert.equal(summary.text,'触感略热，未测体温。')
  assert.doesNotMatch(summary.text,/38|高热|体温正常/)
})
test('medication names and original dose and route remain literal',()=>{
  const summary=buildProfessionalSummary(item([fact('medicationName','合成药名'),fact('doseOriginal','0.5 mg'),fact('route','口服')],{category:'medication'}))
  assert.equal(summary.text,'药品：合成药名；原剂量：0.5 mg；使用途径：口服。')
})
test('a loose or mismatched source falls back rather than being promoted to a professional summary',()=>{
  assert.equal(buildProfessionalSummary(item([{name:'symptom',value:'咳嗽',sources:[]}])),null)
  assert.equal(buildProfessionalSummary(item([fact('symptom','咳嗽','鼻塞')])),null)
  assert.equal(buildProfessionalSummary(item([fact('symptom','咳嗽')]),{sources:[{id:'different',page:1,text:'咳嗽'}]}),null)
})
test('a short value may not drop a source negation or change the person',()=>{
  assert.equal(buildProfessionalSummary(item([fact('symptom','咳嗽','没有咳嗽')])),null)
  assert.equal(buildProfessionalSummary(item([fact('symptom','咳嗽','妈妈咳嗽')])),null)
  assert.equal(buildProfessionalSummary(item([fact('symptom','过敏','不确定是不是过敏')])),null)
  assert.equal(buildProfessionalSummary(item([fact('symptom','红点','没有红点')])),null)
})
test('only the exact deterministic projection is accepted, not a free diagnosis with valid IDs',()=>{
  const input=item([fact('symptom','老扯右耳朵')]),summary=buildProfessionalSummary(input)
  assert.equal(validateProfessionalSummary(summary,input),true)
  assert.equal(validateProfessionalSummary({...summary,text:'右耳疼痛。'},input),false)
  assert.equal(validateProfessionalSummary({...summary,text:'中耳炎。',claims:[{text:'中耳炎',factIds:['item-1:field:0']}]},input),false)
})
test('explicit user corrections regenerate the summary even when old quotes remain for audit',()=>{
  const first=item([fact('symptom','咳嗽')]),old=buildProfessionalSummary(first)
  const changed=item([{name:'symptom',value:'不是咳嗽，是喝水时呛了一下',sources:first.fields[0].sources,confirmed:true,editedBy:'user'}])
  assert.equal(validateProfessionalSummary(old,changed),false)
  assert.equal(buildProfessionalSummary(changed).text,'不是咳嗽，是喝水时呛了一下。')
})
test('an unsourced time is not invented, while a fully bound source may support its original phrase',()=>{
  const input=item([fact('symptom','咳嗽')],{timeText:'昨晚'})
  assert.equal(buildProfessionalSummary(input),null)
  const summary=buildProfessionalSummary(input,{sources:[{id:'input',page:1,text:'昨晚咳嗽'}]})
  assert.equal(summary.text,'昨晚咳嗽。')
})
test('different explicit numbers remain separate facts instead of substring deduplication',()=>{
  const summary=buildProfessionalSummary(item([fact('symptom','拉稀2次'),fact('reaction','拉稀12次')]))
  assert.equal(summary.text,'排稀便2次；排稀便12次。')
})
test('large input is never silently truncated into apparently complete professional text',()=>{
  assert.equal(buildProfessionalSummary(item([fact('symptom','咳'.repeat(4001))])),null)
  assert.equal(buildProfessionalSummary(item([fact('symptom','咳'.repeat(3000)),fact('reaction','痒'.repeat(2000))])),null)
})

test('quick unknown retains uncertainty while removing recording instructions',()=>{
  assert.equal(normalizeObservation('暂时没注意具体外观，先按已经说过的情况记录。'),'具体外观未观察')
  assert.equal(normalizeObservation('右腿出现红点\n先按已经说过的情况记录，不再追问。'),'右腿出现红点')
})
test('bound unknown has a named target, emptied answer fields have no labels, and sleep observations are not clock times',()=>{
 const unknown={...interpretNursingAnswer('skin-appearance','没注意'),sourceMessageId:'a',questionId:'skin-appearance',questionText:'变化看起来是什么样？',answerText:'没注意'}
 const skin=buildProfessionalSummary(item([fact('symptom','小腿红点'),fact('doctorStatement','没注意')],{answerObservations:[unknown]}))
 assert.equal(skin.text,'小腿红点；变化的具体外观暂不清楚。')
 assert.doesNotMatch(skin.text,/医生意见|；没注意/)
 const sleep=buildProfessionalSummary(item([fact('quality','睡觉时哭闹'),fact('sleepAt','没有观察到醒来')],{category:'sleep'}))
 assert.equal(sleep.text,'睡觉时哭闹；睡眠观察：没有观察到醒来。')
})
