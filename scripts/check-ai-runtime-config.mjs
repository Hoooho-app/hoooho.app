import { spawn } from 'node:child_process'
import { mkdtemp,rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const directory=await mkdtemp(path.join(os.tmpdir(),'hoooho-config-readonly-')),root=fileURLToPath(new URL('../',import.meta.url))
const child=spawn(process.execPath,['--env-file-if-exists=.env.local','--import','./scripts/ai-runtime-config-check-preload.mjs','server/app.mjs'],{cwd:root,env:{...process.env,DATA_DIRECTORY:directory,PORT:'4128',HOST:'127.0.0.1',NODE_ENV:'development'},windowsHide:true,stdio:['ignore','pipe','pipe']})
let output='';child.stdout.on('data',data=>{output+=data});child.stderr.on('data',()=>{})
const closed=new Promise(resolve=>child.once('exit',resolve))
try{
  let healthy=false
  for(let i=0;i<40;i++){if(child.exitCode!==null)break;try{const response=await fetch('http://127.0.0.1:4128/api/health',{signal:AbortSignal.timeout(500)});if(response.ok){healthy=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  const safeLine=output.split(/\r?\n/).find(line=>line.startsWith('{"runtimeConfiguration":'))
  if(!safeLine||!healthy)throw new Error('Runtime configuration health check failed; raw logs omitted')
  console.info(JSON.stringify({...JSON.parse(safeLine),health:'PASS',dataIsolation:'temporary-empty-directory',externalRequestsAllowed:false}))
}finally{
  if(child.exitCode===null)child.kill('SIGTERM');await closed
  if(!path.basename(directory).startsWith('hoooho-config-readonly-')||path.dirname(directory)!==os.tmpdir())throw new Error('Temporary directory boundary check failed')
  await rm(directory,{recursive:true,force:true})
}
