import {mkdir,writeFile} from 'node:fs/promises'
import {syntheticCases,syntheticFixtureId,syntheticText} from '../server/ai/business/fixtures/synthetic-evidence-cases.mjs'
import {captureSyntheticOutput,replaySyntheticCapture} from '../server/ai/business/synthetic-replay.mjs'
const directory=new URL('../outputs/bailian-ai/evidence-offline/',import.meta.url)
await mkdir(directory,{recursive:true})
const comparisons=[]
for(const c of syntheticCases()){
 const capture=captureSyntheticOutput({input:{text:syntheticText,syntheticReplay:syntheticFixtureId},context:{existingContext:[]},output:c.output,diagnostics:{},referenceNow:'2026-10-02T18:08:06.804Z',timezone:'Asia/Shanghai'})
 capture.captureOrigin='hand-authored-comparison'
 await writeFile(new URL(c.id+'.json',directory),JSON.stringify(capture,null,2),{mode:0o600})
 const replay=await replaySyntheticCapture(capture)
 comparisons.push({id:c.id,status:replay.status,validation:replay.validation??null})
}
const report={historicalRequestId:'cdcd3b13-0461-95f0-8dbb-141a58f6470a',historicalOutputAvailable:false,originalResponseReplayCount:0,fixtureKind:'hand-authored comparisons, not historical response reconstruction',networkRequests:0,comparisons}
await writeFile(new URL('comparison-results.json',directory),JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
