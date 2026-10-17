// Run the real HTTP app with synthetic provider responses in the same process.
// This is API acceptance; it does not constitute browser or device validation.
import {fileURLToPath} from 'node:url'
import {mkdtemp} from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
process.chdir(fileURLToPath(new URL('../..',import.meta.url)))
const base=new URL(process.env.HOOOHO_HTTP_BASE??'http://127.0.0.1:45485'),control=new URL(process.env.HOOOHO_FIXTURE_CONTROL??'http://127.0.0.1:45899')
if(base.hostname!=='127.0.0.1'||control.hostname!=='127.0.0.1')throw new Error('HTTP acceptance is restricted to isolated loopback fixtures')
process.env.VISIT_AI_TEST='1'
process.env.VISIT_BAILIAN_TEST='1'
process.env.VISIT_ASR_TEST='1'
process.env.VISIT_E2E_PORT=base.port
process.env.VISIT_CONTROL_PORT=control.port
process.env.VISIT_E2E_DEV_PORT=String(Number(base.port)+1)
process.env.VISIT_SHUTDOWN_FILE=path.join(await mkdtemp(path.join(os.tmpdir(),'hoooho-http-contract-')),'.shutdown')
process.env.AI_MAX_CALLS_PER_ACCOUNT_HOUR='1000'
try{
  await import('../visit-sheet/serve.mjs')
  await import('./http-contract.mjs')
  process.exit(0)
}catch(error){console.error(error);process.exit(1)}
