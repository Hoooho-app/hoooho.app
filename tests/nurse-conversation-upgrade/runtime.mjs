import {spawnSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import path from 'node:path'
export const runtimeSources=['server/ai/front-desk-record.mjs','server/ai/front-desk-legacy-semantic-record.mjs','server/ai/front-desk-understanding.mjs','server/ai/front-desk-actions.mjs','server/ai/front-desk-reply-safety.mjs','server/ai/recognition-jobs.mjs','server/ai/business/service.mjs','server/ai/business/front-desk-source-context.mjs','server/ai/business/front-desk-source-time.mjs','server/ai/business/front-desk-original-text.mjs','server/ai/business/front-desk-answer-context.mjs','server/ai/business/front-desk-verbatim-questions.mjs','server/ai/business/professional-summary.mjs','server/ai/business/extraction-quality.mjs','server/ai/business/semantic-summary.mjs','server/ai/business/source-references.mjs','server/ai/business/front-desk-semantics.mjs','server/ai/business/model.mjs','server/ai/providers/dialogue-provider.mjs','server/ai/business/nursing-interview.mjs','src/features/ai-business/SmartRecordWorkspace.tsx','src/features/ai-business/SmartRecordReview.tsx','src/features/ai-business/RecognitionProgress.tsx','src/features/ai-business/frontDeskRecord.ts','src/features/ai-business/captureDraft.ts','src/features/ai-business/savedRecordGuide.ts','src/features/ai-business/smartRecordTypes.ts']
async function sourceHash(root,file){
 let bytes
 try{bytes=await readFile(path.join(root,file))}catch(cause){
  throw Object.assign(new Error(`Required evaluation runtime source is unreadable: ${file}`,{cause}),{code:cause.code==='ENOENT'?'RUNTIME_SOURCE_MISSING':'RUNTIME_SOURCE_UNREADABLE',sourcePath:file})
 }
 return [file,createHash('sha256').update(bytes).digest('hex')]
}
export async function captureRuntime(root){
 const git=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}),commit=git.stdout?.trim()
 return {baseCommit:git.status===0&&/^[a-f0-9]{40}$/u.test(commit??'')?commit:null,sources:Object.fromEntries(await Promise.all(runtimeSources.map(file=>sourceHash(root,file))))}
}
