import { apiRequest } from './apiClient'

export interface CapabilitySource { id:string; title:string; book?:string|null; publisher?:string; url:string; license:string; licenseUrl?:string|null; attribution?:string; selection?:string; retrievedAt?:string|null; status?:string; integrity?:string; paragraphCount?:number; paragraphs?:{heading:string;text:string}[]; clinicalReview?:string }
export interface CapabilityProfile {
 version:string; name:string; role:string; summary:string; scope:string; notice:string;
 skills:{title:string;text:string}[];
 metrics:{books:number;sourceSelections:number;recordingMethods:number;observationTopics:number;questionRules:number};
 sources:CapabilitySource[];
 evidence:{recordingMethods:string;modelSemantics:string;clinicalReview:string};
}
export interface CapabilityReport { id:string;createdAt:string;version:string;current:boolean;passed:number;total:number;cases:{name:string;kind:string;passed:boolean}[];modelSemantics:string;clinicalReview:string }
export interface CapabilityInventory extends CapabilityProfile {
 materials:CapabilitySource[];targets:{id:string;title:string;track:string;applicable:boolean;status:string;connectedMethods:string[];boundary:string}[];
 methods:{id:string;title:string;text:string;sourceId:string;section:string;quote:string}[];
 reports:CapabilityReport[];importFailures:{id:string;error:string}[];
 counts:{targets:number;referenceOnly:number;unavailable:number};limits:Record<string,string>;
}
export interface CapabilitySearch {version:string;queryStored:false;methods:{id:string;title:string;method:string;sourceTitle:string;sourceUrl:string}[];results:{id:string;sourceId:string;title:string;book:string;url:string;license:string;section:string;text:string}[]}
export const getCapabilityProfile = (signal:AbortSignal) => apiRequest<CapabilityProfile>('/api/capabilities/profile',{signal})
