import {expect,type Page,type Route} from '@playwright/test'

/** An explicitly old client request exercises the retained protocol2 contract.
 * This does not replace responses, candidates or persistence acknowledgements. */
export async function useLegacyFrontProtocol(page:Page){
  let memberPath='',authorization='',forced=0
  const route=async(value:Route)=>{
    const request=value.request()
    if(request.method()!=='POST')return value.continue()
    const body=request.postDataJSON()
    if(body.mode!=='front')return value.continue()
    memberPath=new URL(request.url()).pathname.replace(/\/recognition-jobs$/,'')
    authorization=request.headers().authorization??'';forced++
    await value.continue({postData:JSON.stringify({...body,options:{...body.options,semanticVersion:2}})})
  }
  await page.route('**/recognition-jobs',route)
  return {
    release:()=>page.unroute('**/recognition-jobs',route),
    async assertContext(){
      expect(forced).toBeGreaterThan(0)
      const response=await page.request.get(`${memberPath}/front-desk-record`,{headers:{Authorization:authorization}})
      expect(response.ok()).toBe(true)
      const context=await response.json();expect(context.semanticVersion).toBe(2)
      return context
    }
  }
}
