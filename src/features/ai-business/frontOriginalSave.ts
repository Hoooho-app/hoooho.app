import type {FrontContext} from './frontDeskRecord'

export interface RawSaveTarget {memberId:string;contextId:string;contextVersion:number;originalsVersion:number;state:'requested'|'saving'|'failed'}
export const frontHasOriginalFiles=(context?:FrontContext)=>Boolean(context?.messages.some(message=>message.kind!=='assistant'&&message.status!=='discarded'&&((message.originalFileCount??0)>0||message.files?.length||message.voices?.length)))
export function rawSaveTargetMatches(target:RawSaveTarget|undefined,context:FrontContext|undefined,memberId:string){
  return Boolean(target&&context&&target.memberId===memberId&&target.contextId===context.id&&target.contextVersion===context.version&&target.originalsVersion===(context.originalsVersion??0))
}
export function frontOriginalsConfirmed(context:FrontContext|undefined,memberId:string){
  const subject=context?.subject??context?.frontSubject
  return Boolean(context?.originalsSubjectConfirmed===true&&subject?.kind==='current'&&subject.memberId===memberId&&subject.confirmed===true)
}
export function retainRawSaveTarget(target:RawSaveTarget|undefined,context:FrontContext):RawSaveTarget|undefined {
  if(!target||target.contextId!==context.id||target.originalsVersion!==(context.originalsVersion??0))return
  // A persisted in-flight request can recover its exact receipt after refresh.
  if(context.saved&&['saving','failed'].includes(target.state))return {...target,state:'requested'}
  if(context.saved||target.contextVersion!==context.version)return
  return target.state==='saving'?{...target,state:'requested'}:target
}
export function confirmRawSaveTarget(target:RawSaveTarget|undefined,before:FrontContext|undefined,confirmed:FrontContext,memberId:string):RawSaveTarget|undefined {
  if(!rawSaveTargetMatches(target,before,memberId)||!frontOriginalsConfirmed(confirmed,memberId)||confirmed.id!==target!.contextId||(confirmed.originalsVersion??0)!==target!.originalsVersion||!confirmed.version)return
  return {...target!,contextVersion:confirmed.version,state:'requested'}
}
