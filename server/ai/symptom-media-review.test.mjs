import assert from 'node:assert/strict'
import test from 'node:test'
import {sampleTimes, validateObservations} from './symptom-media-review.mjs'
test('sampling spans the duration and never claims continuous coverage',()=>{assert.deepEqual(sampleTimes(60),[0,12,24,36,48,59.95]);assert.equal(sampleTimes(1).length,2)})
test('vision sources must reference supplied frames; diagnosis remains unconfirmed',()=>{assert.throws(()=>validateObservations({observations:[{frame:9,text:'anything'}],questions:[]},2));assert.deepEqual(validateObservations({observations:[],questions:['看不清']},2).observations,[])})
