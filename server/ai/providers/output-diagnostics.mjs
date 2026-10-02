import { configurationError } from './provider-config.mjs'

const stages=new Set(['response_unpack','json_parse','schema_validation','source_validation','semantic_validation','output_truncation'])
const reasons=new Set(['invalid_json','invalid_envelope','missing_content','required','type','enum','additionalProperties','maxItems','minItems','maxLength','minLength','maximum','minimum','anyOf','oneOf','schema_mismatch','source_mismatch','time_conflict','invalid_extraction','length_limit'])
export function outputFailure(message,stage,fieldPath,reason,code='AI_OUTPUT_INVALID'){
 const error=configurationError(message,code)
 error.validation={stage:stages.has(stage)?stage:'schema_validation',fieldPath,reason:reasons.has(reason)?reason:'schema_mismatch'}
 return error
}
// Only schema-owned names and array indexes can enter a diagnostic. Never log
// Ajv messages, data, enum values, unexpected property names or JSON errors.
export function schemaFailureDiagnostic(schema,error){
 const allowed=new Set()
 const walk=s=>{if(!s||typeof s!=='object')return;for(const [k,v] of Object.entries(s.properties??{})){allowed.add(k);walk(v)};walk(s.items);for(const s2 of [...(s.anyOf??[]),...(s.oneOf??[])])walk(s2)}
 walk(schema)
 const parts=(error?.instancePath??'').split('/').filter(Boolean).map(s=>allowed.has(s)||/^\d{1,4}$/.test(s)?s:'[redacted]')
 if(error?.keyword==='required'){const name=error.params?.missingProperty;parts.push(allowed.has(name)?name:'[redacted]')}
 return {stage:'schema_validation',fieldPath:'/'+parts.join('/'),reason:reasons.has(error?.keyword)?error.keyword:'schema_mismatch'}
}
