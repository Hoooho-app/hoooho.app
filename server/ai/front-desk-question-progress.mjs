// Progress describes information obtained, never a medical exclusion.
export function questionTopic(question) {
  const text = `${question?.target ?? ''} ${question?.text ?? ''}`
  if (/体温|温度|temperature|fever.measurement/iu.test(text)) return {key:'temperature',label:'体温数值'}
  if (/开始|持续|多久|onset|duration/iu.test(text)) return {key:'onset',label:'发生与变化'}
  if (/处理|用药|服药|效果|反应.{0,5}(?:如何|怎样)|handling|treatment/iu.test(text)) return {key:'handling',label:'已做处理及反应'}
  if (/洗(?:完|过)?澡|洗浴|沐浴/u.test(text) && /之前|之后|前后|更|比较|变化/u.test(text)) return {key:'bath-comparison',label:'洗浴前后变化'}
  if (/部位|位置|哪里|location|body[_ -]?part/iu.test(text)) return {key:'location',label:'症状部位'}
  if (/新.{0,6}(?:食物|衣物|洗护|接触)|接触.{0,6}新|exposure/iu.test(text)) {
    const parts=[[/食物/u,'food'],[/衣物/u,'clothes'],[/洗护|沐浴露|护肤/u,'skin']].filter(([pattern])=>pattern.test(text)).map(([,key])=>key)
    return {key:`exposure:${parts.join('+')||'general'}`,label:'环境与接触'}
  }
  if (/精神|进食|食欲|吃饭|活动|睡眠|impact|general[_ -]?condition/iu.test(text)) {
    const parts=[[/精神/u,'spirit'],[/进食|食欲|吃饭/u,'intake'],[/活动/u,'activity'],[/睡眠/u,'sleep']].filter(([pattern])=>pattern.test(text)).map(([,key])=>key)
    return {key:`impact:${parts.join('+')||'general'}`,label:'精神与生活表现'}
  }
  if (/痒|疼|痛|抓挠|sensation/iu.test(text)) {
    const parts=[[/痒|抓挠/u,'itch'],[/疼|痛/u,'pain']].filter(([pattern])=>pattern.test(text)).map(([,key])=>key)
    return {key:`sensation:${parts.join('+')||'general'}`,label:'伴随感受'}
  }
  if (/外观|形态|什么样|appearance/iu.test(text)) return {key:'appearance',label:'症状外观'}
  const target=String(question?.target??'')
  return {key:String(target&&!/^(?:observation|record|context|question)$/iu.test(target)?target:question?.text??question?.id??'').toLowerCase().replace(/[\s，,。？?：:_-]/gu,''),label:'补充观察'}
}
const uncertain = text => /不确定|不清楚|说不清|讲不清|不知道|没(?:有)?(?:(?:看|观察)(?!到)|留意)|没注意|(?:还|尚)?(?:没(?:有)?|未)(?:量|测)|无法(?:确认|比较|判断)/u.test(text)
export function questionAnswerState(question,text){
  if(uncertain(text))return 'uncertain'
  if(questionTopic(question).key==='temperature'){
    if(/估计|估算|猜测|猜的/u.test(text))return 'uncertain'
    // Knowing whether someone measured is not knowing the temperature. A
    // clock time or measurement count must not complete this numeric slot.
    const numeric=/^\s*\d{2}(?:\.\d+)?\s*[。！!]?\s*$/u.test(text)||/(?:体温|温度|测得|量了|测了|量到|测到)[^\d。；;\n]{0,6}\d{2}(?:\.\d+)?(?![\d.])(?!\s*[点分时次岁])/u.test(text)||/(?:\d{2}(?:\.\d+)?|[三四]十[零一二两三四五六七八九]?(?:点[零一二两三四五六七八九]+)?)\s*(?:℃|°C|摄氏度|度)/u.test(text)
    return numeric?'answered':'uncertain'
  }
  return 'answered'
}
const locationSupplement = text => /^(?:补充症状部位[：:]|暂时无法确认具体症状部位。?$)/u.test(text??'')
const pickerQuestion={id:'body-location-selection',text:'具体症状部位',target:'location'}
export function frontDeskAnswerQuestion(question,message) {
  const key=questionTopic(question).key,text=String(message?.text??'')
  if(locationSupplement(text)&&key!=='location')return null
  // A new observation is allowed while a numeric question is on screen. It is
  // not an answer to that question and must not mark its value as obtained.
  if(key==='temperature'&&!/(?:\d{2}(?:\.\d+)?|[三四]十[零一二两三四五六七八九]?|体温|温度|量|测|不知道|不清楚|没注意)/u.test(text))return null
  return question
}
const withoutQuestion = (reply, question) => {
  let text = reply.replace(question.text,'').trim()
  if (/[？?]/u.test(text)) text = text.split(/(?<=[。！？!?])/u).filter(part=>!/[？?]/u.test(part)).join('').trim()
  return text || '可以继续补充实际观察到的情况，也可以先整理目前的记录。'
}

export function guideFrontDeskReply(value,{previous,messages=[],latest,effectiveQuestion,knowledge=[]}={}) {
  const checks = [...previous?.checks ?? []].filter(check=>messages.some(message=>message.id===check.answerMessageId&&message.text===check.answerText&&message.kind!=='assistant'&&message.status==='completed'&&!message.retracted))
  const remember=(question,message)=>{
    const topic=questionTopic(question),answer={...topic,questionId:question.id,question:question.text,answerMessageId:message.id,answerText:message.text,state:questionAnswerState(question,message.text)}
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
    // Controls must capture a missing value, not ask whether one exists.
    // Concrete subjective descriptions can remain choices; generic yes/no or
    // unknown gateways are handled through ordinary conversation instead.
    const inputKind=topic.key==='temperature'?'temperature':topic.key==='location'?'location':topic.key.startsWith('sensation:')||topic.key.startsWith('impact:')?'choices':'text'
    const options=inputKind==='choices'?(node?.options??[]).filter(option=>!/^(?:没注意|暂不确定|还没量|已经量过|有变化|没有发现变化|有|没有)$/u.test(option.label)):[]
    if(inputKind==='temperature'){
      const text='有体温数值的话，可以在这里填写，也可以直接说。'
      reply=reply.replace(question.text,text)
      question={...question,text,target:'temperature'}
    }
    question={...question,inputKind,options,sourceIds:node?.sourceIds??[]}

  }
  const lastLocation=[...checks].reverse().find(check=>check.key==='location')
  const locationUnclear=lastLocation?.state==='uncertain'||uncertain(latest?.text??'')&&/部位|位置|哪里|哪儿|哪一块/u.test(latest?.text??'')||previous?.bodyLocationSuggested&&!lastLocation
  return {reply,question,interview:{version:'front-desk-question-progress-v1',status:question?'asking':'ready',domain:previous?.domain??'record',question,turnCount,askedQuestionIds,checks:checks.slice(-20),bodyLocationSuggested:questionTopic(question).key==='location'||locationUnclear,stopReason:question?null:'no_necessary_question'}}
}
