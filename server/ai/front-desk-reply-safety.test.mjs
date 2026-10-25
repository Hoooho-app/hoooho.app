import test from 'node:test'
import assert from 'node:assert/strict'
import {assertFrontDeskReplySafety as check} from './front-desk-reply-safety.mjs'
const user=text=>({id:'source-1',kind:'text',text,status:'completed'})
const reject=reply=>assert.throws(()=>check({reply,responseMode:'consultation'}),{code:'FRONT_REPLY_SAFETY_INVALID'})

test('the real Q02 unsafe conditional cannot downgrade severe signs to home observation',()=>{
 reject('右足小趾碰伤且触碰疼痛，若外观无明显畸形、肿胀严重或无法负重行走，通常可先居家观察。')
})
test('home triage and dismissal of care are rejected across unrelated subjects and conditions',()=>{
 for(const reply of ['发热可以先在家观察。','摔伤后建议在家休息。','胸口不舒服先居家观察。','居家观察即可。','孩子咳嗽不用就医。','无须马上看医生。','不必做检查。','不用拍片。','无需再就诊。','不需要立即去医院。','不建议进行检查。'])reject(reply)
})
test('an unknown visit or assistant assertion cannot establish exclusion or certainty',()=>{
 for(const reply of ['已经排除骨折。','可以排除脑出血。','不是骨折。','骨折已经排除。','肯定无碍。','一定没事。','绝对没有问题。']){
  assert.throws(()=>check({reply,messages:[user('去过医院，但还没说检查结论。')]}),{code:'FRONT_REPLY_SAFETY_INVALID'})
 }
 assert.throws(()=>check({reply:'医生说可以排除骨折。',messages:[{...user('医生说可以排除骨折。'),kind:'assistant'}]}),{code:'FRONT_REPLY_SAFETY_INVALID'})
})
test('pending diagnostic purpose is not an assertion of an already excluded injury',()=>{
 const actual='碰伤后能走但触痛，建议挂骨科或足踝外科。若出现明显肿胀、淤青加重或活动受限，需尽快就医排除骨折。目前是否有明显肿胀或淤青？'
 assert.equal(check({reply:actual,responseMode:'consultation'}),actual)
 for(const reply of ['需要到医院检查以排除骨折。','请就诊排除骨裂。','进一步检查以排除骨折。'])assert.equal(check({reply}),reply)
})
test('diagnostic purpose does not authorize completed exclusions or adjacent unsafe advice',()=>{
 for(const reply of ['已经就医排除骨折。','检查后已排除骨折。','目前已检查排除骨折。','需要检查排除了骨折。','需尽快就医排除骨折，但可以在家观察。','需就医排除骨折，因此无需检查。','请就医排除骨折，肯定无碍。','需就医排除骨折，建议每次服用5mL。'])reject(reply)
})
test('explicit pending exclusion is distinct from a completed exclusion',()=>{
 for(const reply of ['触痛仍需排除骨裂。','骨折待排除。','待排除骨折，尚未确诊。','需要进一步排除骨折。','不能仅凭能走就排除骨折。'])assert.equal(check({reply}),reply)
 for(const reply of ['已经排除骨裂。','需说明已经排除骨折。','骨折已经排除。','待排除骨折，但肯定无碍。'])reject(reply)
})
test('preserved function cannot become an unsourced personalized low-risk inference',()=>{
 const actual='建议挂骨科或足踝外科。能行走说明骨折风险相对较低，但触痛明显仍需排除骨裂。若出现持续肿胀、淤血加重或无法负重，请及时就医检查。'
 assert.throws(()=>check({reply:actual}),error=>error.code==='FRONT_REPLY_SAFETY_INVALID'&&error.reason==='UNREVIEWED_RISK_INFERENCE')
 for(const reply of ['能吃饭说明肺炎风险低。','仍可活动因此严重问题风险不高。','可以走路意味着骨裂风险很小。'])reject(reply)
 for(const reply of ['不能仅凭能行走说明骨折风险低。','不能因为能走路就判断骨折风险较低。'])assert.equal(check({reply}),reply)
 const quoted='你提供的医生原话是：“能行走说明骨折风险相对较低。”'
 assert.equal(check({reply:quoted,messages:[user('医生说：“能行走说明骨折风险相对较低。”')]}),quoted)
 assert.throws(()=>check({reply:quoted,messages:[user('孩子今天能走路。')]}),{code:'FRONT_REPLY_SAFETY_INVALID'})
})
test('cautious negation keeps its own clause without granting later unsafe advice',()=>{
 for(const reply of ['不能排除骨折。','尚未排除骨折。','不能完全排除骨折。','不能据此判断可居家观察。','不应直接建议在家观察。','不能仅凭能走就判断不用检查。','不能说肯定无碍。','并不是无需检查。','“可居家观察”不能只凭能走就下结论。','“无需检查”这个说法不成立。','“不能排除骨折”不代表已经确诊。'])assert.equal(check({reply}),reply)
 reject('不能排除骨折，但可以在家观察。')
 reject('不能据此判断可居家观察，仍无需就医。')
 reject('不能走就先在家观察。')
})
test('individual medication quantities cannot be recommended by the model',()=>{
 for(const reply of ['建议每次服用5mL。','你可以口服10mg。','给孩子每次5毫升。','按体重每公斤10毫克。','推荐一次两片。','您可以每天服用2粒。','每天5mL。','你可以按药盒每次5ml服用。'])reject(reply)
 for(const reply of ['不要给孩子每次5mL。','不能按说明书给孩子每次5mL。','不建议每次服用5mL。','给孩子喝奶120mL，先保留原话。'])assert.equal(check({reply}),reply)
})
test('packaging numbers remain attributed, without becoming instructions to take them',()=>{
 for(const reply of ['图片药盒标签注明“5 mL twice daily”。这只是包装说明。','药盒上写着每次5mL，不代表适合当前孩子。','说明书建议每次5mL；实际用药情况还未知。'])assert.equal(check({reply}),reply)
 reject('药盒上写着“每次5mL”，你可以照此给孩子服用。')
})
test('doctor quotations require an actual active user source and remain attributed',()=>{
 const messages=[user('医生说：“可先在家观察，每次服用5mL。”')]
 const reply='你提供的医生原话是：“可先在家观察，每次服用5mL。”'
 assert.equal(check({reply,messages}),reply)
 assert.equal(check({reply:'您描述的医生当时说可先在家观察。',messages}), '您描述的医生当时说可先在家观察。')
 for(const invalidSources of [[],[{...messages[0],kind:'assistant'}],[{...messages[0],status:'discarded'}],[user('医生说：“每次服用3mL。”')]])assert.throws(()=>check({reply,messages:invalidSources}),{code:'FRONT_REPLY_SAFETY_INVALID'})
 assert.throws(()=>check({reply:'医生说可先在家观察，你可以在家观察。',messages}),{code:'FRONT_REPLY_SAFETY_INVALID'})
})
test('attributed doctor exclusion and already performed medication preserve original wording',()=>{
 const reply='您提供的医生原话是：“已经排除骨折。”',messages=[user('昨天医生说：“已经排除骨折。”')]
 assert.equal(check({reply,messages}),reply)
 const dose='您记录的是昨天给孩子服用了5mL。';assert.equal(check({reply:dose,messages:[user('昨天给孩子服用了5mL。')]}),dose)
})
test('doctor attribution cannot remove source negation or manufacture a new safe conclusion',()=>{
 for(const [source,reply] of [
  ['医生说不能排除骨折。','医生原话：“排除骨折。”'],
  ['医生说不能完全排除骨折。','医生原话：“排除骨折。”'],
  ['医生说不要每次服用5mL。','医生原话：“每次服用5mL。”'],
  ['医生说：“别每次服用5mL。”','医生原话：“每次服用5mL。”']
 ])assert.throws(()=>check({reply,messages:[user(source)]}),{code:'FRONT_REPLY_SAFETY_INVALID'})
})
test('a matching amount alone does not authorize altered doctor instructions or frequency',()=>{
 const messages=[user('医生说每次服用5mL，每天2次。')]
 for(const reply of ['医生说每次服用5mL每天4次。','医生说每次服用5mL，每天4次。','医生说我建议每次服用5mL。'])assert.throws(()=>check({reply,messages}),{code:'FRONT_REPLY_SAFETY_INVALID'})
 const quoted='您提供的医生原话是：“每次服用5mL，每天2次。”';assert.equal(check({reply:quoted,messages}),quoted)
})
test('rejected replies have one safe error code, do not rewrite input or introduce advice',()=>{
 const input={reply:'可以在家观察。',messages:[user('哪里不舒服还不清楚。')],responseMode:'record'},before=structuredClone(input)
 let error;try{check(input)}catch(caught){error=caught}
 assert.equal(error.code,'FRONT_REPLY_SAFETY_INVALID');assert.equal(error.status,503);assert.equal(error.reason,'UNREVIEWED_HOME_TRIAGE');assert.deepEqual(input,before)
 assert.equal(check({reply:'可以继续说已经观察到的情况。',responseMode:'conversation'}),'可以继续说已经观察到的情况。')
})
