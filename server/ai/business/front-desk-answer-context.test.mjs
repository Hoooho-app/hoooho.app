import test from 'node:test'
import assert from 'node:assert/strict'
import {bindFrontDeskAnswerContext,frontDeskQuestionClaims} from './front-desk-answer-context.mjs'

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
