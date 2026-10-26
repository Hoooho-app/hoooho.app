import test from 'node:test'
import assert from 'node:assert/strict'
import {bindFrontDeskAnswerContext,frontDeskQuestionClaims} from './front-desk-answer-context.mjs'
import {buildFrontDeskFactSources} from './front-desk-source-context.mjs'

const source={id:'fact-answer',page:1,text:'39',questionContext:{id:'temperature',messageId:'asked',text:'刚量的体温是多少摄氏度？',target:'temperature_celsius'}}
const field=(name,value,id=source.id)=>({name,value,sources:[{sourceId:id,page:1,quote:value}],editedBy:'model'})
test('numeric and negative answers keep the actual question without fabricating a standalone symptom or medication',()=>{
 for(const value of ['39','没有','没注意']){
  const sources=[{...source,text:value}],items=[{id:'item',category:'symptom',fields:[field(value==='39'?'medicationName':'symptom',value)]}]
  bindFrontDeskAnswerContext(items,sources)
  assert.equal(items[0].category,'other')
  assert.equal(items[0].fields[0].name,'conclusion')
  assert.equal(items[0].fields[0].value,value)
  assert.deepEqual(frontDeskQuestionClaims(items[0],sources).map(c=>c.text),[`问：${source.questionContext.text}答：${value}`])
  assert.deepEqual(frontDeskQuestionClaims({...items[0],contextualAnswers:[{...items[0].contextualAnswers[0],questionText:'药吃了多少？'}]},sources),[])
 }
})
test('a source question alone cannot manufacture an answer or a current subject',()=>{
 const items=[{id:'item',category:'symptom',subject:'unknown',fields:[field('symptom','疼')]}]
 bindFrontDeskAnswerContext(items,[{...source,text:'疼'}])
 assert.equal(items[0].subject,'unknown')
 assert.equal(items[0].category,'symptom')
 assert.equal(items[0].fields[0].value,'疼')
 assert.deepEqual(frontDeskQuestionClaims(items[0],[]),[])
})
test('an added positive observation is not labelled a correction or hidden behind a negative finding',()=>{
 const sources=[{id:'negative',page:1,text:'没有发烧',polarity:'negated',changeType:'add'},{id:'positive',page:1,text:'咳得厉害',polarity:'affirmed',changeType:'add'}]
 const items=[{id:'item',category:'symptom',fields:[field('symptom','没有发烧','negative'),field('correction','咳得厉害','positive')]}]
 bindFrontDeskAnswerContext(items,sources)
 assert.equal(items[0].fields[0].name,'symptom')
 assert.equal(items[0].fields[0].value,'咳得厉害')
 assert.equal(items[0].fields[1].value,'没有发烧')
 const correction=[{id:'item',category:'symptom',fields:[field('correction','咳得厉害','positive')]}]
 bindFrontDeskAnswerContext(correction,[{...sources[1],changeType:'correct'}])
 assert.equal(correction[0].fields[0].name,'correction')
})

const correctedSources=(oldValue='咳嗽',newValue='打喷嚏')=>{
 const before=oldValue==='今天'?'孩子今天咳嗽':`孩子今天${oldValue}`,after=`不是${oldValue}，是${newValue}`
 return buildFrontDeskFactSources({facts:[{id:'old',contextId:'c',status:'superseded',text:before,polarity:'affirmed',subject:{kind:'unknown'},sources:[{messageId:'m1',quote:before}]},{id:'new',contextId:'c',status:'active',replaces:'old',text:after,polarity:'affirmed',subject:{kind:'unknown'},sources:[{messageId:'m2',quote:after}]}],messages:[{id:'m1',contextId:'c',kind:'text',status:'completed',text:before},{id:'m2',contextId:'c',kind:'text',status:'completed',text:after}]})
}
const correctionField=(name,value)=>({name,value,sources:[{sourceId:'new',page:1,quote:'不是咳嗽，是打喷嚏',start:0,end:9,valueStart:'不是咳嗽，是打喷嚏'.indexOf(value),valueEnd:'不是咳嗽，是打喷嚏'.indexOf(value)+value.length}],editedBy:'model'})
test('captured C05 drops a withdrawn negative label and projects only the literal replacement into facts',()=>{
 const sources=correctedSources(),original=structuredClone(sources)
 const items=[{id:'item',category:'symptom',fields:[correctionField('symptom','打喷嚏'),correctionField('symptom','不是咳嗽'),correctionField('statusRaw','不是咳嗽，是打喷嚏')]}]
 bindFrontDeskAnswerContext(items,sources)
 assert.deepEqual(items[0].fields.map(field=>field.value),['打喷嚏','打喷嚏'])
 for(const field of items[0].fields){assert.equal(field.sources[0].quote,'不是咳嗽，是打喷嚏');assert.equal(field.sources[0].valueStart,6);assert.equal(field.sources[0].valueEnd,9)}
 assert.deepEqual(sources,original,'full replacement wording remains the original source, not a newly assembled sentence')
})

test('a literal replacement can itself explicitly supply a negative observation',()=>{
 const sources=correctedSources('咳嗽','没有咳嗽')
 const item={id:'item',category:'symptom',fields:[{name:'symptom',value:'不是咳嗽，是没有咳嗽',sources:[{sourceId:'new',page:1,quote:'不是咳嗽，是没有咳嗽'}],editedBy:'model'}]}
 bindFrontDeskAnswerContext([item],sources)
 assert.deepEqual(item.fields.map(field=>field.value),['没有咳嗽'])
})

test('correction projection requires a real source role and leaves independent negatives and explicit user edits intact',()=>{
 const sources=correctedSources(),unbound=sources.map(({literalCorrection,...source})=>source)
 const bare={id:'item',category:'symptom',fields:[correctionField('symptom','不是咳嗽')]}
 bindFrontDeskAnswerContext([bare],unbound)
 assert.equal(bare.fields[0].value,'不是咳嗽','changeType alone cannot reinterpret a user source')
 const manual={id:'manual',category:'symptom',fields:[{...correctionField('statusRaw','不是咳嗽，是打喷嚏'),editedBy:'user',confirmed:true}]}
 bindFrontDeskAnswerContext([manual],sources)
 assert.equal(manual.fields[0].value,'不是咳嗽，是打喷嚏')
 const negative={id:'negative',page:1,text:'没有咳嗽',polarity:'negated',changeType:'add'}
 const item={id:'item',category:'symptom',fields:[correctionField('symptom','不是咳嗽'),field('symptom','没有咳嗽','negative')]}
 bindFrontDeskAnswerContext([item],[...sources,negative])
 assert.deepEqual(item.fields.map(field=>field.value),['没有咳嗽'])
})

for(const [oldValue,newValue] of [['今天','昨晚'],['400','800'],['左脚','右脚'],['牛奶','米粥']])test(`literal correction projects ${oldValue} to the exact new ${newValue} without converting or joining text`,()=>{
 const sources=correctedSources(oldValue,newValue),quote=`不是${oldValue}，是${newValue}`
 const item={id:'item',category:'other',fields:[{name:'conclusion',value:quote,sources:[{sourceId:'new',page:1,quote}],editedBy:'model'}]}
 bindFrontDeskAnswerContext([item],sources)
 assert.equal(item.fields[0].value,newValue)
 assert.equal(item.fields[0].sources[0].quote,quote)
})
