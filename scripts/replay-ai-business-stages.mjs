// Offline only. Reads bounded, explicitly synthetic artifacts; never fetches.
import Ajv from 'ajv'
import {readFile,stat} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {ocrSchema} from '../server/ai/business/documents.mjs'
import {extractionSchema,validateExtraction,resolveItemTime,buildJournal} from '../server/ai/business/contract.mjs'
import {reconcileExtraction} from '../server/ai/business/extraction-quality.mjs'
import {syntheticFixtureId,syntheticText,syntheticImageFixtureId,syntheticImageHash} from '../server/ai/business/synthetic-contract.mjs'
import {safeSyntheticStage} from '../server/ai/business/synthetic-evidence-proof.mjs'
import {schemaFailureDiagnostic} from '../server/ai/providers/output-diagnostics.mjs'
const ajv=new Ajv({strict:false,allowUnionTypes:true})
const validators=new Map([[ocrSchema,ajv.compile(ocrSchema)],[extractionSchema,ajv.compile(extractionSchema)]])
export async function replayStages(artifact){
 const image=artifact?.fixtureId===syntheticImageFixtureId
 if(!(image||artifact?.fixtureId===syntheticFixtureId)||image&&artifact.imageHash!==syntheticImageHash||!Array.isArray(artifact.stages)||artifact.stages.length<1||artifact.stages.length>2||artifact.reference?.timezone!=='Asia/Shanghai'||!Number.isFinite(Date.parse(artifact.reference?.referenceNow)))throw new Error('Not a bounded synthetic artifact')
 let ocr,extraction
 for(const stage of artifact.stages){
  if(!safeSyntheticStage({...stage,content:stage.structuredText}))throw new Error('Unsafe stage')
  if(!image&&stage.task!=='draft-extraction')throw new Error('Wrong synthetic task')
  let value;try{value=JSON.parse(stage.structuredText)}catch{return {status:'reject',code:'AI_OUTPUT_INVALID',validation:{stage:'json_parse',fieldPath:'/choices/0/message/content',reason:'invalid_json'},task:stage.task}}
  const schema=stage.task==='document-page'?ocrSchema:extractionSchema,validate=validators.get(schema)
  if(!validate(value))return {status:'reject',code:'AI_OUTPUT_INVALID',validation:schemaFailureDiagnostic(schema,validate.errors[0]),task:stage.task}
  if(stage.task==='document-page')ocr=value;else extraction=value
 }
 const sources=artifact.reference.sources
 if(!Array.isArray(sources)||sources.length>1||sources.some(s=>typeof s.text!=='string'||s.text.length>60000))throw new Error('Invalid sources')
 if(!image&&(sources.length!==1||sources[0].id!=='input'||sources[0].page!==1||sources[0].text!==syntheticText))throw new Error('Non-synthetic source')
 if(image&&extraction&&(!ocr||sources.length!==1||sources[0].page!==1||sources[0].text!==ocr.text))throw new Error('OCR provenance mismatch')
 if(!extraction)return {status:'ocr-pass-extraction-not-executed',itemCount:0}
 try{
  const items=await reconcileExtraction(validateExtraction(extraction,sources),sources,artifact.reference)
  for(const [index,item] of items.entries())try{buildJournal({...item,time:resolveItemTime(item,artifact.reference)})}catch(error){return {status:'reject',code:error.code,validation:{stage:'semantic_validation',fieldPath:`/items/${index}/journal`,reason:'invalid_extraction'}}}
  return {status:'pass',itemCount:items.length}
 }catch(error){return {status:'reject',code:error.code,validation:error.validation}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const filename=process.argv[2];if(!filename||(await stat(filename)).size>100000)throw new Error('Invalid artifact');const result=await replayStages(JSON.parse(await readFile(filename,'utf8')));console.log(JSON.stringify({...result,networkRequests:0,provenance:'original supplier proof requires matching real request log; fixture label alone is not proof'}))}catch{console.error('Replay refused; raw contents omitted');process.exitCode=1}
}
