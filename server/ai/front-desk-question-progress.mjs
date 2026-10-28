// Progress describes questions asked, never a diagnosis or a medical exclusion.
export function questionTopic(question) {
  const text = `${question?.target ?? ''} ${question?.text ?? ''}`
  if (/洗(?:完|过)?澡|洗浴|沐浴/u.test(text) && /之前|之后|前后|更|比较|变化/u.test(text)) return {key:'bath-comparison',label:'洗浴前后变化'}
  if (/部位|位置|哪里|location|body[_ -]?part/iu.test(text)) return {key:'location',label:'症状部位'}
  if (/新.{0,6}(?:食物|衣物|洗护|接触)|接触.{0,6}新|exposure/iu.test(text)) {
    const parts=[[/食物/u,'food'],[/衣物/u,'clothes'],[/洗护|沐浴露|护肤/u,'skin']].filter(([pattern])=>pattern.test(text)).map(([,key])=>key)
    return {key:`exposure:${parts.join('+')||'general'}`,label:'环境与接触'}
  }
  if (/精神|进食|食欲|吃饭|活动|睡眠|impact|general[_ -]?condition/iu.test(text)) {
    const parts=[[/精神/u,'spirit'],[/进食|食欲|吃饭/u,'intake'],[/活动/u,'activity'],[/睡眠/u,'sleep']].filter(([pattern])=>pattern.test(text)).map(([,key])=>key)
    return {key:`impact:${parts.join('+')||'general'}`,label:'日常表现'}
  }
  if (/痒|疼|痛|抓挠|sensation/iu.test(text)) {
    const parts=[[/痒|抓挠/u,'itch'],[/疼|痛/u,'pain']].filter(([pattern])=>pattern.test(text)).map(([,key])=>key)
    return {key:`sensation:${parts.join('+')||'general'}`,label:'伴随感受'}
  }
  if (/外观|形态|什么样|appearance/iu.test(text)) return {key:'appearance',label:'症状外观'}
  const target=String(question?.target??'')
  return {key:String(target&&!/^(?:observation|record|context|question)$/iu.test(target)?target:question?.text??question?.id??'').toLowerCase().replace(/[\s，,。？?：:_-]/gu,''),label:'补充观察'}
}
const uncertain = text => /不确定|不清楚|说不清|讲不清|不知道|没(?:有)?(?:(?:看|观察)(?!到)|留意)|没注意|无法(?:确认|比较|判断)/u.test(text)
const locationSupplement = text => /^(?:补充症状部位[：:]|暂时无法确认具体症状部位。?$)/u.test(text??'')
const pickerQuestion={id:'body-location-selection',text:'具体症状部位',target:'location'}
export function frontDeskAnswerQuestion(question,message) {
  return locationSupplement(message?.text)&&questionTopic(question).key!=='location'?null:question
}
const withoutQuestion = (reply, question) => {
  let text = reply.replace(question.text,'').trim()
  if (/[？?]/u.test(text)) text = text.split(/(?<=[。！？!?])/u).filter(part=>!/[？?]/u.test(part)).join('').trim()
  return text || '可以继续补充实际观察到的情况，也可以先整理目前的记录。'
}

export function guideFrontDeskReply(value,{previous,messages=[],latest,effectiveQuestion,knowledge=[]}={}) {
  const checks = [...previous?.checks ?? []].filter(check=>messages.some(message=>message.id===check.answerMessageId&&message.text===check.answerText&&message.kind!=='assistant'&&message.status==='completed'&&!message.retracted))
  const remember=(question,message)=>{
    const topic=questionTopic(question),answer={...topic,questionId:question.id,question:question.text,answerMessageId:message.id,answerText:message.text,state:uncertain(message.text)?'uncertain':'answered'}
    const index=checks.findIndex(check=>check.key===topic.key)
    if(index<0)checks.push(answer);else checks[index]=answer
  }
  // Reconstruct older conversations from server-captured question bindings too;
  // an upgrade must not make an already-unknown dimension seem unasked again.
  for(const message of messages){
    if(message.kind==='assistant'||message.status!=='completed'||message.retracted||!message.text?.trim())continue
    const question=message.contextQuestion
    if(question?.text&&question.target!=='unresolved'&&frontDeskAnswerQuestion(question,message))remember(question,message)
    if(locationSupplement(message.text))remember(pickerQuestion,message)
  }
  if (effectiveQuestion && value.taskRelation==='continue' && effectiveQuestion.target!=='unresolved' && latest?.text?.trim() && frontDeskAnswerQuestion(effectiveQuestion,latest)) {
    remember(effectiveQuestion,latest)
  }
  if(locationSupplement(latest?.text)&&['continue','new'].includes(value.taskRelation))remember(pickerQuestion,latest)
  let question=value.nextQuestion,reply=value.reply
  if (question && checks.some(check=>check.key===questionTopic(question).key || check.questionId===question.id)) {
    reply=withoutQuestion(reply,question);question=null
  }
  const askedQuestionIds=[...new Set([...(previous?.askedQuestionIds??[]),...(question?[question.id]:[])])]
  const turnCount=Math.max(previous?.turnCount??previous?.askedQuestionIds?.length??0,new Set(checks.map(check=>check.questionId)).size)+(question?1:0)
  if(question){
    const topic=questionTopic(question)
    const node=knowledge.find(node=>node.id===question.id)??knowledge.find(node=>questionTopic(node).key===topic.key)
    const options=node?.options?.length?node.options:topic.key.startsWith('exposure:')?[{label:'没发现新接触',value:'刚才询问的接触因素，目前没有发现新的接触。'},{label:'有新接触',value:'最近有新接触的物品，我再补充具体情况。'},{label:'暂不确定',value:'暂时不确定刚才询问的接触因素。'}]:topic.key.startsWith('impact:')?[{label:'没有发现变化',value:'刚才询问的这些日常表现没有发现变化。'},{label:'有变化',value:'刚才询问的日常表现有变化，我再补充具体情况。'},{label:'暂不确定',value:'暂时不确定这些日常表现有没有变化。'}]:[]
    question={...question,options,sourceIds:node?.sourceIds??[]}
  }
  const lastLocation=[...checks].reverse().find(check=>check.key==='location')
  const locationUnclear=lastLocation?.state==='uncertain'||uncertain(latest?.text??'')&&/部位|位置|哪里|哪儿|哪一块/u.test(latest?.text??'')||previous?.bodyLocationSuggested&&!lastLocation
  return {reply,question,interview:{version:'front-desk-question-progress-v1',status:question?'asking':'ready',domain:previous?.domain??'record',question,turnCount,askedQuestionIds,checks:checks.slice(-20),bodyLocationSuggested:questionTopic(question).key==='location'||locationUnclear,stopReason:question?null:'no_necessary_question'}}
}
