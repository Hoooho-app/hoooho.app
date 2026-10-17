export interface ClinicalContext {clause:{start:number;end:number;text:string};polarity:'affirmed'|'negated'|'uncertain';qualifier:{start:number;end:number;text:string}|null;literal:boolean;subject:'other'|'current';temporality:'current'|'historical'|'conditional'|'future';historicalTime:string|null}
export function evidenceClause(text:string,start:number,end?:number):{start:number;end:number;text:string}
export function clinicalContext(text:string,start:number,end:number):ClinicalContext
export function clinicalAssertions(text:string):Array<ClinicalContext & {start:number;end:number;text:string;concept:string}>
export function literalBodyObservations(text:string):Array<ClinicalContext & {start:number;end:number;text:string;concept:string}>
