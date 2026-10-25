import test from 'node:test'
import assert from 'node:assert/strict'
import suite from './fixtures/nursing-v2-scenarios.json' with {type:'json'}
import review from './fixtures/nursing-v2-adjudication.json' with {type:'json'}
import {nursingKnowledgeFor,nursingInterview} from './nursing-interview.mjs'
const overrides=new Map(review.caseOverrides.map(o=>[o.caseId,o.adjudicated]))
const aliases={
 'breathing-description':['resp-effort'],'fever-measurement-detail':['fever-site'],
 'general-response-detail':['behaviour-change'],'skin-change':['skin-appearance'],
 'defecation-impact':['bowel-impact'],'defecation-behaviour':['bowel-impact'],
 'urination-behaviour':['urinary-change'],'urination-course':['urinary-change'],
 'pain-observable-context':['cry-context','pain-location'],
 'sleep-observable-context':['sleep-settling','cry-context'],
 'behaviour-course':['behaviour-onset'],'behaviour-impact':['behaviour-change'],
 ...Object.fromEntries(Object.entries(review.semanticAliasMap).map(([name,value])=>[name,value.nodeIds]))
}
const expanded=(concept,domain)=>concept==='onset'?[`${domain}-onset`]:aliases[concept]??[concept]
for(const c of suite.cases)for(const ageMonths of [3,30,96])test(`observation narrative ${c.id}, age ${ageMonths}m`,()=>{
 const accepted=overrides.get(c.id),knowledge=nursingKnowledgeFor(c.text,{...c.member,ageMonths})
 const operationalStop=c.stop.expected&&c.stop.reason!=='sufficient_information'
 const interview=nursingInterview({text:c.text,latestText:c.latestText??c.text,previous:c.previous,member:{ageMonths},urgent:c.expectedAction==='important_observation_route'})
 const domains=accepted?.expectedDomains??[c.expectedDomain],ids=operationalStop?(interview.question?[interview.question.id]:[]):knowledge.nodes.map(n=>n.id)
 assert.ok(domains.includes(knowledge.domain),`domain ${knowledge.domain}; expected ${domains}`)
 const allowed=accepted?.requiredAnyQuestionIds??[]
 const forbidden=[...c.forbiddenQuestionConcepts.flatMap(x=>expanded(x,knowledge.domain)).filter(id=>!allowed.includes(id)),...(accepted?.forbiddenQuestionIds??[])]
 for(const id of forbidden)assert.ok(!ids.includes(id),`unfounded/repeated question ${id}; got ${ids}`)
 const required=accepted?.requiredAnyQuestionIds??c.requiredQuestionConcepts.flatMap(x=>expanded(x,knowledge.domain))
 if(c.expectedAction==='ask_one_focused_question'&&!accepted?.allowReady&&required.length)assert.ok(required.some(id=>ids.includes(id)),`missing useful question from ${required}; got ${ids}`)
 for(const q of knowledge.nodes){
  for(const phrase of suite.globalForbiddenQuestionText)assert.ok(!q.text.includes(phrase),q.id)
  if(ageMonths<18)assert.doesNotMatch(JSON.stringify(q.options),/孩子说|孩子自述|评分/)
 }
 // Explicit stop policies are checked without giving the provider a null ID.
 if(c.stop.expected&&['user_finished','question_budget','no_health_content','hypothetical','quoted_discussion','no_current_positive_concern','other_subject'].includes(c.stop.reason)){
  assert.equal(interview.question,null,`stop reason ${c.stop.reason}`)
 }
 if(c.expectedAction==='important_observation_route')assert.equal(nursingInterview({text:c.text,member:{ageMonths},urgent:true}).question,null)
})
