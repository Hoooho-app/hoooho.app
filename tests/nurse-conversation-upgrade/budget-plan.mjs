import {pathToFileURL} from 'node:url'
import path from 'node:path'
import {regressionCases,holdoutCases} from './scenarios.mjs'
import {fixtureRequirement} from './assets.mjs'
// 52 regression + 8 untouched holdout. This is a bounded subset, not acceptance.
const selectedRegression='T01 T02 T03 T06 T07 T08 T09 T10 T11 T13 T14 T15 T17 T18 T19 T22 T24 T25 T27 T29 T30 T31 C01 C02 C04 C05 C07 C08 C10 C11 C13 C15 Q02 Q05 Q06 I03 I04 I05 I06 I07 I08 I11 I12 I13 I14 I15 I17 I23 Q03 Q04 V01 V12'.split(' ')
const selectedHoldout='H02 H04 H05 H07 H08 H09 H10 H11'.split(' ')
export const recommendedBatches=[]
for(let start=0;start<selectedRegression.length;start+=8){const ids=selectedRegression.slice(start,start+8);recommendedBatches.push({id:`regression-${String(recommendedBatches.length+1).padStart(2,'0')}`,split:'regression',ids,maxModelRequests:ids.length*3})}
recommendedBatches.push({id:'holdout-01',split:'holdout',ids:selectedHoldout,maxModelRequests:32})
export function budgetPlan(){
 const lookup=new Map([...regressionCases,...holdoutCases].map(sample=>[sample.id,sample]))
 return {status:'NOT_RUN',cases:60,maximumRequests:recommendedBatches.reduce((sum,batch)=>sum+batch.maxModelRequests,0),reserveFrom200:12,realModelExecuted:false,goalsMeasured:false,needsExistingASR:true,batches:recommendedBatches.map(batch=>({...batch,eligible:batch.ids.every(id=>{const sample=lookup.get(id);return sample&&!sample.requires.length&&!sample.latestInput.attachments.some(asset=>fixtureRequirement(asset.fixtureId))}),command:`node tests/nurse-conversation-upgrade/run-live.mjs --live --split=${batch.split} '--ids=${batch.ids.join(',')}' --max-cases=${batch.ids.length} --max-model-requests=${batch.maxModelRequests} --output=tests/nurse-conversation-upgrade/results/bounded-60/${batch.id}`}))}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){console.log(JSON.stringify(budgetPlan(),null,2))}
