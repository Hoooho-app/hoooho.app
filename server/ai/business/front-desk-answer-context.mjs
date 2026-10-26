import {symptomItemCorePhrase} from '../../../shared/symptom-core-phrase.mjs'
import {frontDeskLiteralCorrection} from './front-desk-source-context.mjs'
// An answer retains the actual question as context. Neither the question nor
// the currently selected member supplies a new clinical fact or medication.
const bareAnswer=/^(?:(?:暂时|还|不太)?(?:不知道|不清楚|没注意|没留意|没有|没|有|嗯|好|是|不是)|[+\-]?\d+(?:[.．]\d+)?\s*(?:[a-zA-Z℃°%]+)?)[。！!\s]*$/u
const questionFor=source=>source?.questionContext&&typeof source.questionContext.text==='string'&&source.questionContext.text.trim()&&typeof source.questionContext.id==='string'&&typeof source.questionContext.messageId==='string'?source.questionContext:null
const matchingSources=(field,sources)=>(field.sources??[]).flatMap(ref=>sources.filter(source=>source.id===ref.sourceId&&source.page===ref.page&&source.text?.includes(ref.quote)&&ref.quote.includes(field.value)))

function correctionFields(fields,sources){
 return fields.flatMap(field=>{
  if(field.editedBy==='user')return [field]
  const matches=matchingSources(field,sources),roles=matches.map(frontDeskLiteralCorrection)
  if(!roles.length||roles.some(role=>!role)||new Set(roles.map(role=>JSON.stringify(role))).size!==1)return [field]
  const role=roles[0],value=field.value.trim().replace(/[。；;！!？?]+$/u,'')
  // “不是old” withdraws the earlier label. It does not observe “没有old”.
  if(value.replace(/^(?:并)?(?:不是|非)\s*/u,'')===role.oldValue&&value!==role.oldValue)return []
  if(value!==role.quote)return [field]
  return [{...field,value:role.newValue,nameResolution:{original:field.name,source:'literal_replacement'},sources:field.sources.map(ref=>{
   const source=sources.find(source=>source.id===ref.sourceId&&source.page===ref.page),start=source?.text.indexOf(ref.quote),at=ref.quote.lastIndexOf(role.newValue)
   const {valueStart,valueEnd,...original}=ref
   return {...original,...(start>=0&&at>=0?{valueStart:start+at,valueEnd:start+at+role.newValue.length}:{})}
  })}]
 })
}

export function bindFrontDeskAnswerContext(items,sources=[]){
 for(const item of items){
  item.fields=correctionFields(item.fields,sources)
  const answers=new Map()
  item.fields=item.fields.map(field=>{
   const refs=matchingSources(field,sources)
   for(const source of refs){
    const question=questionFor(source)
    if(question&&bareAnswer.test(source.text.trim())&&source.text.trim()===field.value.trim())answers.set(source.id,{sourceId:source.id,page:source.page,questionId:question.id,questionMessageId:question.messageId,questionText:question.text,answerText:source.text.trim()})
   }
   if(field.name==='correction'&&field.editedBy!=='user'&&['symptom','injury'].includes(item.category)&&refs.length&&refs.every(source=>source.changeType==='add'&&source.polarity==='affirmed'))return {...field,name:'symptom',nameResolution:{original:'correction',source:'new_observation_source'}}
   if([...answers.values()].some(answer=>answer.answerText===field.value.trim()&&refs.some(source=>source.id===answer.sourceId)))return {...field,name:'conclusion',nameResolution:{original:field.name,source:'contextual_answer'}}
   return field
  })
  const allAnswers=item.fields.length>0&&item.fields.every(field=>matchingSources(field,sources).some(source=>answers.has(source.id)))
  if(allAnswers){
   item.category='other';item.archiveCategory=null;item.title='问答记录'
   item.fields=item.fields.map(field=>({...field,name:'conclusion',nameResolution:{original:field.name,source:'contextual_answer'}}))
  }
  if(answers.size)item.contextualAnswers=[...answers.values()]
  else delete item.contextualAnswers
  if(item.category==='symptom')item.fields.sort((left,right)=>{
   const affirmed=field=>field.name==='symptom'&&matchingSources(field,sources).some(source=>source.polarity==='affirmed')?1:0
   return affirmed(right)-affirmed(left)
  })
  const positive=item.category==='symptom'?item.fields.filter(field=>field.name==='symptom'&&matchingSources(field,sources).some(source=>source.polarity==='affirmed')):[]
  if(positive.length&&item.titleEditedBy!=='user')item.title=symptomItemCorePhrase({fields:positive})
 }
 return items
}

export function frontDeskQuestionClaims(item,sources){
 if(!Array.isArray(item?.contextualAnswers))return []
 return item.contextualAnswers.flatMap(answer=>{
  // After persistence the program-owned provenance retains the question/answer
  // pair. Model schemas and client edit endpoints cannot supply this metadata.
  if(sources===undefined){
   if(![answer.questionId,answer.questionMessageId,answer.questionText,answer.answerText].every(value=>typeof value==='string'&&value.trim())||!bareAnswer.test(answer.answerText)||!item.fields.some(field=>field.value.trim()===answer.answerText&&(field.sources??[]).some(ref=>ref.sourceId===answer.sourceId&&ref.page===answer.page&&ref.quote.includes(answer.answerText))))return []
   return [{text:`问：${answer.questionText}答：${answer.answerText}`,factIds:[`question:${answer.questionMessageId}`,`answer:${answer.sourceId}`],answerText:answer.answerText,sourceId:answer.sourceId}]
  }
  if(!Array.isArray(sources))return []
  const source=sources.find(source=>source.id===answer.sourceId&&source.page===answer.page),question=questionFor(source)
  if(!question||question.id!==answer.questionId||question.messageId!==answer.questionMessageId||question.text!==answer.questionText||source.text.trim()!==answer.answerText||!bareAnswer.test(answer.answerText)||!item.fields.some(field=>field.value.trim()===answer.answerText&&matchingSources(field,sources).some(ref=>ref.id===source.id)))return []
  return [{text:`问：${question.text}答：${answer.answerText}`,factIds:[`question:${question.messageId}`,`answer:${source.id}`],answerText:answer.answerText,sourceId:source.id}]
 })
}
