import { BillingBrowserWorker } from './core.mjs'
import { createBillingBrowserServer } from './http-server.mjs'
const secret=process.env.OPS_CAPTURE_WORKER_TOKEN||''
const worker=await new BillingBrowserWorker({directory:process.env.CAPTURE_DATA_DIRECTORY||'/profiles'}).init()
await worker.probe()
console.info('[billing-browser] isolated Chromium runtime verified')
const server=createBillingBrowserServer({worker,secret})
server.listen(Number(process.env.PORT||8080),'::',()=>console.info('[billing-browser] ready'))
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close();void worker.close().finally(()=>process.exit(0))})
