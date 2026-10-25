import {clinicalContext} from '../../../shared/clinical-evidence.mjs'
const permitsNegative=new Set(['resp-effort','skin-sensation','fever-measurement','pain-impact','oral-observation','bowel-urine','urinary-change','sleep-consolation','nasal-impact','cough-impact','injury-function'])
export function nursingTriggerPresent(node,context){
 if(!node.trigger)return true
 for(const clause of context.clauses){
  if(!clause.eligible||!clause.domains.includes(node.domain))continue
  for(const match of clause.text.matchAll(new RegExp(node.trigger.source,'gu'))){
   const start=clause.start+match.index,scope=clinicalContext(context.text,start,start+match[0].length)
   if(scope.subject==='current'&&scope.polarity==='affirmed'&&scope.temporality==='current')return true
  }
 }
 return false
}
export function nursingSlotKnown(node,context){
 const associated=node.id==='bowel-urine'?['urinary']:node.id==='fever-state'?['behaviour']:[]
 for(const clause of context.clauses){
  if(!clause.eligible||!clause.domains.some(d=>d===node.domain||associated.includes(d)))continue
  const pattern=new RegExp(node.known.source,'gu')
  for(const match of clause.text.matchAll(pattern)){
   const start=clause.start+match.index,end=start+match[0].length,scope=clinicalContext(context.text,start,end)
   const before=context.text.slice(scope.clause.start,start),after=context.text.slice(end,scope.clause.end)
   if(scope.subject!=='current'||['historical','conditional','future'].includes(scope.temporality))continue
   if(/location|side/u.test(node.id)&&(/(?:用|亲|伸出|抬起)$/u.test(before)||/^动/u.test(after)))continue
   const negated=scope.polarity==='negated'||/(?:没|没有|未)(?:有)?(?:看到|看见|听到|听见|听说|听他(?:说)?).{0,8}$/u.test(before)
   if(negated&&!permitsNegative.has(node.id))continue
   if(scope.polarity==='uncertain'&&!/不知道|不清楚|没注意|没数|没看清|未观察/u.test(match[0]))continue
   return true
  }
 }
 return false
}
