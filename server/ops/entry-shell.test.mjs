import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import vm from 'node:vm'
import { handleOpsEntry, OPS_NAVIGATION_EXCLUSION } from './entry-shell.mjs'

test('Ops uses a fresh public app shell without clearing storage or exposing protected data',async t=>{
  const index='<html><head><script type="module" src="/assets/current-release.js"></script></head><body><div id="root"></div></body></html>'
  const server=http.createServer(async(req,res)=>{if(!await handleOpsEntry(req,res,{readIndex:async()=>index})){res.statusCode=404;res.end()}})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
  const base=`http://127.0.0.1:${server.address().port}`
  const response=await fetch(base+'/api/console-entry?connect=railway-volume')
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.has('clear-site-data'),false)
  const html=await response.text();assert.ok(html.indexOf('/api/console-entry.js')<html.indexOf('/assets/current-release.js'))
  const code=await(await fetch(base+'/api/console-entry.js')).text();let destination
  const run=search=>vm.runInNewContext(code,{URL,URLSearchParams,location:{origin:'https://console.example.test',search},history:{replaceState:(_,__,value)=>destination=value}})
  run('?project=family&connect=railway-volume');assert.equal(destination,'/ops/billing?project=family&connect=railway-volume')
  run('?page=https://foreign.example.test&connect=%3Cscript%3E&token=secret');assert.equal(destination,'/ops/billing?project=hoooho')
  assert.doesNotMatch(code,/localStorage|sessionStorage|indexedDB|caches\.|serviceWorker\.unregister/)
  assert.equal((await fetch(base+'/api/console-entry',{method:'POST'})).status,405)
  assert.equal((await fetch(base+'/api/console-entry',{method:'HEAD'})).status,200)
  for(const path of ['/ops','/ops/billing','/ops/feedback'])assert.equal(OPS_NAVIGATION_EXCLUSION.test(path),true)
  for(const path of ['/health-events','/','/ops-other'])assert.equal(OPS_NAVIGATION_EXCLUSION.test(path),false)
})
