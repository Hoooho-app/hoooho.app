import {outputFailure} from '../providers/output-diagnostics.mjs'
const rules=new Set(['source_missing','quote_missing','value_missing','quote_not_in_source','value_not_in_quote','negation_scope','negation_prefix','negated_fact_coverage'])
// Fixed rule names and numeric positions only. No fact names, values or quotes.
export function evidenceFailure(message,path,rule,positions={}){
 const error=Object.assign(outputFailure(message,'source_validation',path,'source_mismatch','AI_EVIDENCE_MISMATCH'),{status:422})
 error.validation.rule=rules.has(rule)?rule:'source_mismatch'
 for(const key of ['sourceIndex','factIndex','page'])if(Number.isInteger(positions[key])&&positions[key]>=0&&positions[key]<100000)error.validation[key]=positions[key]
 return error
}
