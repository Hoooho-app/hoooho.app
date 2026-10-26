import test from 'node:test'
import assert from 'node:assert/strict'
import {frontDeskOriginalText} from './front-desk-original-text.mjs'

const scope={accountId:'account',memberId:'child',contextId:'matter'}
function fixture(text,clauses){
 const messages=[{...scope,id:'message',kind:'text',status:'completed',text,inputAt:1}]
 const sources=clauses.map((text,index)=>({id:`source-${index}`,page:1,text,originalReferences:[{messageId:'message',quote:messages[0].text}]}))
 const item={fields:sources.map(source=>({value:source.text,sources:[{sourceId:source.id,page:1,quote:source.text}]}))}
 return {item,options:{...scope,sources,messages}}
}
test('complete selected clauses preserve the exact original punctuation, spacing and newline',()=>{
 for(const text of ['昨天小腿起了红点，老挠','昨天小腿起了红点；\n  老挠。']){
  const f=fixture(text,['昨天小腿起了红点','老挠']);assert.equal(frontDeskOriginalText(f.item,f.options),text)
 }
})
test('partial selection and a broad model citation cannot pull another person or omitted words into the record',()=>{
 const f=fixture('孩子咳嗽，妈妈头疼。',['孩子咳嗽'])
 assert.equal(frontDeskOriginalText(f.item,f.options),'孩子咳嗽')
 const omitted=fixture('昨天小腿起了红点，老挠',['红点'])
 assert.equal(frontDeskOriginalText(omitted.item,omitted.options),'红点')
})
test('a full literal correction stays an original quote without rewriting the withdrawn label',()=>{
 const f=fixture('不是咳嗽，是打喷嚏。',['不是咳嗽，是打喷嚏'])
 f.item.fields[0].value='打喷嚏';f.item.fields[0].sources[0].quote='打喷嚏'
 assert.equal(frontDeskOriginalText(f.item,f.options),'不是咳嗽，是打喷嚏。')
})
test('foreign, withdrawn, ambiguous or missing messages do not supply original surrounding text',()=>{
 for(const patch of [{memberId:'another'},{accountId:'another'},{contextId:'another'},{kind:'assistant'},{retracted:true},{status:'failed'}]){
  const f=fixture('孩子咳嗽。',['咳嗽']);Object.assign(f.options.messages[0],patch)
  assert.equal(frontDeskOriginalText(f.item,f.options),'咳嗽')
 }
 const f=fixture('咳嗽，咳嗽。',['咳嗽']);assert.equal(frontDeskOriginalText(f.item,f.options),'咳嗽')
})
test('identical wording from distinct actual messages remains two original occurrences',()=>{
 const f=fixture('咳嗽。',['咳嗽'])
 f.options.messages.push({...f.options.messages[0],id:'second-message',inputAt:2})
 f.options.sources.push({...f.options.sources[0],id:'second-source',originalReferences:[{messageId:'second-message',quote:'咳嗽。'}]})
 f.item.fields.push({value:'咳嗽',sources:[{sourceId:'second-source',page:1,quote:'咳嗽'}]})
 assert.equal(frontDeskOriginalText(f.item,f.options),'咳嗽。\n咳嗽。')
})
