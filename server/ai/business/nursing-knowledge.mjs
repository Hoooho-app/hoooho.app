import library from './nursing-question-library.json' with {type:'json'}
import registry from './nursing-source-registry.json' with {type:'json'}
import cards from './nursing-recording-knowledge.json' with {type:'json'}

export const NURSING_KNOWLEDGE_VERSION=library.version
export const NURSING_ANSWER_VERSION='observation-recording-20261024-v1'
export const nursingMethodSources=registry.sources
export const nursingRecordingKnowledge=cards
const sourceIds=new Set(registry.sources.map(s=>s.id)),ids=new Set()
export const nursingKnowledgeNodes=library.questions.map(node=>{
 if(ids.has(node.id)||!cards.domainCards[node.domain]||!node.options?.length||node.options.length>5||node.sourceIds.some(id=>!sourceIds.has(id)))throw new Error('Invalid nursing knowledge entry: '+node.id)
 ids.add(node.id)
 return {...node,known:new RegExp(node.knownPattern,'u'),...(node.triggerPattern?{trigger:new RegExp(node.triggerPattern,'u')}:{})}
})
export function nursingMethodEvidence(domains,variant){
 return registry.curatedEvidence.filter(e=>e.production_retrieval_enabled&&e.domains.some(d=>domains.includes(d))&&(!e.variant||e.variant===variant)).sort((a,b)=>Number(Boolean(b.variant))-Number(Boolean(a.variant))).slice(0,2).map(({sourceId,section,text,language,changes})=>({sourceId,section,text,language,changes,sourceUrl:registry.sources.find(s=>s.id===sourceId).url,license:'CC-BY-4.0',attribution:registry.policy.attribution}))
}
