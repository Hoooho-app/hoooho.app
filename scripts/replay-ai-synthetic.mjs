import {readFile,stat} from 'node:fs/promises'
import {resolve} from 'node:path'
import {replaySyntheticCapture} from '../server/ai/business/synthetic-replay.mjs'
const filename=process.argv[2]
if(!filename){console.error('Usage: node scripts/replay-ai-synthetic.mjs <ignored-synthetic-capture.json>');process.exitCode=2}
else try{
 const path=resolve(filename)
 if((await stat(path)).size>65536)throw new Error('artifact too large')
 const capture=JSON.parse(await readFile(path,'utf8'))
 const result=await replaySyntheticCapture(capture)
 console.log(JSON.stringify({status:result.status,...(result.validation?{code:result.code,validation:result.validation}:{}),itemCount:result.items?.length??null,originalResponseProof:'requires captured artifact plus matching provider request log; never inferred from the failure code',networkRequests:0}))
}catch{console.error('Invalid or non-synthetic replay artifact; raw contents omitted');process.exitCode=1}
