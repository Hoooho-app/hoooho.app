import { apiRequest } from '../../services/apiClient'
export interface HelpTurn { id:string; role:'assistant'|'user'; text:string; at:string; articleIds?:string[]; choices?:string[]; askResolved?:boolean; mode?:'ai'|'local'; imageAttached?:boolean }
export interface HelpSession { id:string; version:number; turns:HelpTurn[]; ratings:{turnId:string; solved:boolean; at:string}[]; notice?:string }
export const productHelpService = {
  start:(token:string,fresh=false)=>apiRequest<HelpSession>('/api/help/sessions',{method:'POST',token,body:{new:fresh}}),
  get:(token:string,id:string)=>apiRequest<HelpSession>(`/api/help/sessions/${id}`,{token}),
  turn:(token:string,id:string,body:{version:number; text:string; requestId:string; image?:string})=>apiRequest<HelpSession>(`/api/help/sessions/${id}/turns`,{method:'POST',token,body,signal:AbortSignal.timeout(35000)}),
  rate:(token:string,id:string,body:{version:number; turnId:string; solved:boolean})=>apiRequest<HelpSession>(`/api/help/sessions/${id}/ratings`,{method:'POST',token,body})
}
