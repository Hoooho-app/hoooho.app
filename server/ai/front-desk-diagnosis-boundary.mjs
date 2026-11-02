// Product authority boundary, not a diagnostic or triage classifier. The model
// supplies semantic intent; these patterns also cover common explicit requests.
export const diagnosisBoundaryReply = '护护只负责记录和整理健康信息，不负责诊断。可以先把这次情况整理成情况单，交给医生，或供可靠的医学 AI 辅助分析；诊断由医生确认。把症状经过和相关资料放在一起，能减少遗漏，方便对方了解完整情况。'

export const diagnosisBoundaryPolicy = ' 护护只负责记录和整理，不负责诊断。用户询问个人病情是什么病、病因、大概是什么情况、是否某病、概率或严重程度，或要求扮演医生、猜测诊断时，diagnosisRequested=true。仅明确职责边界，并建议先整理情况单交给医生或可靠医学AI辅助分析，理由是集中症状经过与相关资料可减少遗漏；诊断由医生确认。不得给病名推测、鉴别诊断、概率、专业意见或治疗建议，不使用“无法/不能仅凭这些确定病因”等资料不足式诊断话术，不开展诊断追问。此请求本身不是病情事实，不自动保存、导出或调用其他AI；混合输入里的实际观察仍按来源提取。仅诊断插话沿用当前事项，不把它当作上一症状问题的答案。转述医生已有诊断、术语释义、整理报告不算请求护护诊断。当前明确紧急异常仍优先使用既有求助提醒。'

export function requestsDiagnosis(text) {
  const input=String(text??'')
  if(/报错|按钮|页面|气泡|(?:保存|导出|上传|登录|录音|转写|加载)(?:失败|不了|不动|没反应)/u.test(input)&&!/病因|病情|症状|是什么病|诊断一下|帮.{0,4}诊断/u.test(input))return false
  const clauses=input.replace(/[“「『"][^”」』"\n]*[”」』"]/gu,'').split(/[，,。；;！!？?\n]/u)
  return clauses.some(original=>{
    const clause=original.replace(/(?:不用|不要|不必|无需)(?:你|您|护护)?(?:帮我|帮忙|来)?(?:诊断|判断病因|分析病因)/gu,'')
    if(/(?:诊断|病因)(?:是(?:什么)?意思|这个词|的定义)|(?:什么是|解释(?:一下)?)(?:诊断|病因)|(?:整理|记录|复制|保存|导出|翻译|解释).{0,8}(?:诊断报告|诊断书|诊断证明)/u.test(clause))return false
    if(/^(?:医生|医师|大夫).{0,8}(?:诊断|确诊)(?:为|是|了)/u.test(clause))return false
    if(/^(?:到底|大概|可能)?(?:是)?什么病|^(?:到底)?怎么回事/u.test(clause))return true
    return /(?:帮.{0,4}|请|你|给.{0,3}|做.{0,2}|来.{0,2}|能.{0,3}|想.{0,3})(?:诊断|确诊)|(?:诊断|确诊)(?:一下|下|看看|吗|吧)|(?:判断|分析|推断|猜|看看|看下|看一下).{0,24}(?:什么(?:病|情况|原因)|怎么回事|病因|是不是|是否)|(?:这|那|目前|现在|到底|大概|可能|究竟).{0,12}(?:是什么病|什么情况|怎么回事|什么原因|严重吗)|(?:是不是|是否|会不会|像不像|可能是).{0,12}(?:炎|病|感染|骨折|骨裂|过敏|湿疹|肿瘤|癌)|(?:患病|得病|骨折|感染).{0,8}(?:概率|几率|风险|可能性)|(?:病情|症状).{0,8}(?:严重吗|严重不严重)/u.test(clause)
  })
}

export function applyDiagnosisBoundary(value,{text,activeContextId,emergency=false}={}) {
  if(emergency||!(value?.diagnosisRequested===true||requestsDiagnosis(text)))return value
  // Discard only standalone requests misclassified as new observations. Mixed
  // observations and sourced concerns still pass through the normal fact guard.

  const recordChanges=value.recordChanges?.filter(change=>!(change.type==='add'&&isDiagnosisRequestOnly(change.text)))
  const sideTopic=!(recordChanges?.length)&&(!value.requestedAction||value.requestedAction.type==='none')
  return {...value,...(recordChanges?{recordChanges}:{}),diagnosisRequested:true,reply:diagnosisBoundaryReply,nextQuestion:null,questionId:null,
    ...(sideTopic&&activeContextId?{contextId:activeContextId,taskRelation:'side_topic'}:{}),responseMode:'consultation'}
}

export const isDiagnosisRequestOnly = text => {
  const clauses=String(text??'').split(/[，,。；;！!？?\n]/u).filter(s=>s.trim())
  return clauses.length>0&&clauses.every(s=>{
    const request=s.trim().replace(/^(?:(?:请问?|你|您|护护|帮我|帮忙|能不能|可以|麻烦|再|直接|扮演医生|给我|给个|做个|为我|替我|能|根据这些|根据我说的)\s*)+/u,'')
    return /^(?:(?:判断|分析|推断|猜|看看|看下|看一下)(?:一下|下|看看)?(?:这|这个|这种情况|这个病情|病情)?(?:大概|到底|可能|目前|现在|究竟|大致)?(?:是|属于)?(?:什么病|什么情况|什么原因|怎么回事|病因)|(?:诊断|确诊)(?:一下|下|看看)?|(?:这|这个|这种情况|这个病情|病情|大概|到底|可能|目前|现在|究竟|大致|是)*(?:什么病|什么情况|什么原因|怎么回事|严重吗|严重不严重)|(?:是不是|是否|会不会|像不像)[^\d，,。?？]{0,6}(?:病|炎|感染|骨折|骨裂|过敏|湿疹|癌))$/u.test(request)
  })
}
