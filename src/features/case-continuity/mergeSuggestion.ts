import type { FollowedCase } from './types'
export function mergeSuggestion(items:FollowedCase[],focusIds?:string[]) {
  const symptoms=items.filter(i=>i.followup.hasSymptom&&!i.event.caseArchivedAt)
  for(const a of symptoms) for(const b of symptoms) {
    if(a===b||a.event.memberId!==b.event.memberId)continue
    if(focusIds&&!focusIds.some(id=>[...(a.sourceEventIds??[a.event.id]),...(b.sourceEventIds??[b.event.id])].includes(id)))continue
    if(a.event.caseSeparateIds?.includes(b.event.id)||b.event.caseSeparateIds?.includes(a.event.id))continue
    const at=Date.parse(a.followup.latestOccurredAt??''),bt=Date.parse(b.followup.latestOccurredAt??'')
    if(!Number.isFinite(at)||!Number.isFinite(bt)||Math.abs(at-bt)>7*86400000)continue
    const text=(i:FollowedCase)=>`${i.followup.title} ${i.followup.description??''}`
    const skin=/瘙痒|发痒|皮疹|红疹|疹子|湿疹/
    const sites=['颈部','脖子','头皮','脸颊','面部','腹部','胸部','背部','肘窝','膝窝','手部','脚部']
    const aSites=sites.filter(site=>text(a).includes(site)),bSites=sites.filter(site=>text(b).includes(site))
    const sameSite=aSites.some(site=>bSites.includes(site))||aSites.some(site=>['颈部','脖子'].includes(site))&&bSites.some(site=>['颈部','脖子'].includes(site))
    if(aSites.length&&bSites.length&&!sameSite)continue
    const sharedSymptom=['咳嗽','呕吐','腹泻','鼻塞','流涕','发热','头痛','腹痛'].some(word=>text(a).includes(word)&&text(b).includes(word))
    if(!(skin.test(text(a))&&skin.test(text(b)))&&!sameSite&&!sharedSymptom)continue
    const combined=text(a)+text(b),title=/瘙痒|发痒/.test(combined)&&/皮疹|红疹|疹子|湿疹/.test(combined)?'皮疹伴瘙痒':a.followup.title.slice(0,24)
    return {target:a,source:b,title}
  }
  return null
}
