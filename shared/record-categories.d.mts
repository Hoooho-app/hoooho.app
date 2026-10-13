export function hasSymptomObservation(value: unknown): boolean
export function itemRecordCategories(item: {category:string;visibilityCategories?:string[];fields?:{name:string;value:string}[]}): string[]
export function visibleRecordCategories(record: {type?:string;content?:string;sourceText?:string|null;journal?:{categories?:string[];diet?:{note?:string;reactions?:string[]}};aiProvenance?:{visibilityCategories?:string[];fields?:{name:string;value:string}[]}|null;caseContext?:{identity?:string}|null}, includeOriginal?: boolean): string[]
