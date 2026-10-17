import test from 'node:test'
import assert from 'node:assert/strict'
import {AudioTranscriptionService} from './audio-transcription-service.mjs'
function wav({channels=1,rate=16000,bits=16,format=1,junk=false,streaming=false}={}){
 const block=channels*Math.ceil(bits/8),samples=Buffer.alloc(block*160),fmtSize=format===0xfffe?40:16,fmt=Buffer.alloc(8+fmtSize)
 fmt.write('fmt ');fmt.writeUInt32LE(fmtSize,4);fmt.writeUInt16LE(format,8);fmt.writeUInt16LE(channels,10);fmt.writeUInt32LE(rate,12);fmt.writeUInt32LE(rate*block,16);fmt.writeUInt16LE(block,20);fmt.writeUInt16LE(bits,22)
 if(format===0xfffe){fmt.writeUInt16LE(22,24);fmt.writeUInt16LE(bits,26);Buffer.from('0100000000001000800000aa00389b71','hex').copy(fmt,32)}
 const data=Buffer.alloc(8);data.write('data');data.writeUInt32LE(streaming?0xffffffff:samples.length,4)
 const ancillary=Buffer.from('JUNK\x03\x00\x00\x00abc\x00','binary'),body=Buffer.concat([fmt,...(junk?[ancillary]:[]),data,samples]),head=Buffer.alloc(12);head.write('RIFF');head.writeUInt32LE(streaming?0xffffffff:body.length+4,4);head.write('WAVE',8)
 return Buffer.concat([head,body])
}
function setup(){let calls=0;const service=new AudioTranscriptionService({logger:{info(){},warn(){}},provider:{name:'fixture',transcribeAudio:async()=>{calls++;return {transcript:'合成转写'}}}});return {service,calls:()=>calls}}
const input=(bytes,mimeType='audio/wav')=>({mimeType,dataUrl:`data:${mimeType};base64,${bytes.toString('base64')}`})
test('valid browser PCM, stereo/24bit, float/extensible, ancillary chunks and streaming sizes reach ASR once each',async()=>{
 const f=setup(),cases=[wav(),wav({channels:2,rate:48000,bits:24}),wav({format:3,bits:32}),wav({format:0xfffe}),wav({junk:true}),wav({streaming:true})]
 for(const [index,bytes] of cases.entries()){assert.equal((await f.service.transcribe(input(bytes,index===0?'audio/x-wav':'audio/wav'))).transcript,'合成转写');assert.equal(f.calls(),index+1)}
})
test('magic-only, missing/empty data, invalid format and truncated chunks never call ASR',async()=>{
 const f=setup(),magic=Buffer.alloc(300);magic.write('RIFF');magic.write('WAVE',8)
 const valid=wav(),truncated=valid.subarray(0,valid.length-2),empty=Buffer.from(valid);empty.writeUInt32LE(0,40)
 const noFmt=Buffer.from(valid);noFmt.write('JUNK',12)
 const invalidFmt=Buffer.from(valid);invalidFmt.writeUInt16LE(0,22)
 const invalidSubtype=wav({format:0xfffe});invalidSubtype.fill(0,44,60)
 for(const bytes of [magic,truncated,empty,noFmt,invalidFmt,invalidSubtype])await assert.rejects(()=>f.service.transcribe(input(bytes)),{code:'AUDIO_DECODE_FAILED',status:422})
 assert.equal(f.calls(),0)
})
