import { randomUUID } from 'node:crypto'

// Only focus metadata crosses the private API. Never read an input's contents.
export async function focusedControl(lease) {
  let frame=lease.page.mainFrame(), element
  try {
    for(let depth=0;frame&&depth<8;depth++) {
      const active=await frame.evaluateHandle(()=>{let el=document.activeElement;while(el?.shadowRoot?.activeElement)el=el.shadowRoot.activeElement;return el})
      element=active.asElement()
      if(!element){await active.dispose();break}
      const child=await element.contentFrame()
      if(child){await element.dispose();element=null;frame=child;continue}
      break
    }
    const info=element&&await element.evaluate(el=>{
      const input=el instanceof HTMLInputElement, multiline=el instanceof HTMLTextAreaElement||el.isContentEditable
      if((!input&&!multiline)||el.disabled||el.readOnly)return null
      const type=input?el.type:'textarea'
      if(!['text','email','password','search','tel','url','number','textarea'].includes(type))return null
      return{type,label:String(el.getAttribute('aria-label')||el.labels?.[0]?.textContent||el.getAttribute('placeholder')||el.getAttribute('name')||'平台输入框').trim().slice(0,80),hasValue:input||el instanceof HTMLTextAreaElement?el.value.length>0:Boolean(el.textContent),multiline}
    })
    const rect=info&&await element.boundingBox()
    if(!info||!rect||rect.width<2||rect.height<2){await element?.dispose().catch(()=>{});await lease.focused?.element.dispose().catch(()=>{});lease.focused=null;return null}
    let same=false
    if(lease.focused)try{same=await lease.focused.element.evaluate((old,current)=>old===current,element)}catch{}
    if(same)await element.dispose()
    else{await lease.focused?.element.dispose().catch(()=>{});lease.focused={id:randomUUID(),element}}
    return{id:lease.focused.id,...info,rect}
  } catch {
    await element?.dispose().catch(()=>{});await lease.focused?.element.dispose().catch(()=>{});lease.focused=null;return null
  }
}
