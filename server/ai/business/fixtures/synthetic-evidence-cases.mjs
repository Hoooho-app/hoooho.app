// Hand-authored comparisons, NOT the lost cdcd3b13 provider response.
import {syntheticText} from '../synthetic-contract.mjs'
export {syntheticFixtureId,syntheticText} from '../synthetic-contract.mjs'
const field=(value,quote=value)=>({name:'symptom',value,quote,sourceId:'input',page:1})
const item=fields=>({category:'symptom',title:'合成观察',timeText:null,archiveCategory:null,subject:'current',relationKey:null,fields})
const negative=()=>item([field('没有呕吐')])
const positive=()=>item([field('恶心')])
export function syntheticCases(){return [
 {id:'correct-tight-quotes',expected:'pass',output:{items:[negative(),positive()]}},
 {id:'broad-quote-scope',expected:'reject',output:{items:[negative(),item([field('恶心',syntheticText)])]}},
 {id:'wrong-source-quote',expected:'reject',output:{items:[negative(),item([field('呕吐','今天呕吐')])]}},
 {id:'negation-value-dropped',expected:'reject',output:{items:[item([field('呕吐','没有呕吐')]),positive()]}},
 {id:'negation-prefix-cropped',expected:'reject',output:{items:[item([field('呕吐')]),positive()]}},
 {id:'negated-fact-omitted',expected:'reject',output:{items:[positive()]}},
 {id:'model-new-fact',expected:'reject',output:{items:[negative(),positive(),item([field('发热',syntheticText)])]}}
]}
