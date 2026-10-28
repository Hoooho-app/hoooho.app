export const recordDetailTitles:string[]
export function recordKeywords(text:string):string[]
export function recordReading(text:string,keywords?:string[]):{overview:string;keywords:string[];details:{title:string;text:string}[]}
export function refreshRecordKeywords(text:string):string
