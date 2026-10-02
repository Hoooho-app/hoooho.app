import Ajv from 'ajv'
import {createHash} from 'node:crypto'
import {extractionSchema,fail,validateExtraction} from './contract.mjs'
import {reconcileExtraction} from './extraction-quality.mjs'
import {syntheticFixtureId,syntheticText} from './synthetic-contract.mjs'
const validate=new Ajv({strict:false,allowUnionTypes:true}).compile(extractionSchema)
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const denied=()=>fail('合成回放只接受固定验收原文、空上下文和无附件的新草稿',422,'AI_SYNTHETIC_REPLAY_DENIED')

// Explicit request opt-in is not authority to log medical text. It can only
// return this fixed synthetic input/output to the already authorized owner.
export function assertSyntheticRequest(input,context){
 if(input.syntheticReplay===undefined)return false
 if(input.syntheticReplay!==syntheticFixtureId||input.text!==syntheticText||input.id||input.files?.length||input.task&&input.task!=='record'||input.timezone&&input.timezone!=='Asia/Shanghai')throw denied()
 if(context&&(!Array.isArray(context.existingContext)||context.existingContext.length))throw denied()
 return true
}
export function captureSyntheticOutput({input,context,output,diagnostics,referenceNow,timezone}){
 if(!context)throw denied()
 if(!assertSyntheticRequest(input,context))return null
 // No HTTP envelope, headers, credential/config objects, account/member IDs or
 // clinical context enter an artifact. Schema validation bounds its fields.
 const serialized=JSON.stringify(output)
 if(!validate(output)||serialized.length>24000||/\bBearer\s+\S+|\bsk-[A-Za-z0-9_-]{8,}|-----BEGIN/.test(serialized))return null
 if(timezone!=='Asia/Shanghai'||!Number.isFinite(Date.parse(referenceNow)))return null
 const requestId=typeof diagnostics?.requestId==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(diagnostics.requestId)?diagnostics.requestId:null
 const sources=[{id:'input',page:1,text:syntheticText,status:'readable'}]
 return {version:1,fixtureId:syntheticFixtureId,captureOrigin:'application-structured-output',provider:diagnostics?.provider==='bailian'?'bailian':null,model:diagnostics?.model==='qwen3.7-plus'?'qwen3.7-plus':null,requestId,referenceNow,timezone,sources,output:JSON.parse(serialized),outputHash:hash(output),schemaHash:hash(extractionSchema)}
}
export async function replaySyntheticCapture(capture){
 if(capture?.version!==1||capture.fixtureId!==syntheticFixtureId||capture.timezone!=='Asia/Shanghai'||!Number.isFinite(Date.parse(capture.referenceNow))||JSON.stringify(capture.sources)!==JSON.stringify([{id:'input',page:1,text:syntheticText,status:'readable'}])||JSON.stringify(capture.output).length>24000||capture.outputHash!==hash(capture.output)||capture.schemaHash!==hash(extractionSchema)||!validate(capture.output))throw denied()
 try{
  const items=await reconcileExtraction(validateExtraction(capture.output,capture.sources),capture.sources,{referenceNow:capture.referenceNow,timezone:capture.timezone})
  return {status:'pass',items}
 }catch(error){return {status:'reject',code:error.code,validation:error.validation}}
}
