import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeMonoWav } from './recordingAudio'
test('Safari实际解码采样编码为16k单声道PCM，字节正确且不篡改MIME',async()=>{
 const pcm=new Float32Array(48000).fill(0.5),blob=encodeMonoWav([pcm,pcm],48000),data=new DataView(await blob.arrayBuffer())
 assert.equal(blob.type,'audio/wav');assert.equal(blob.size,32044);assert.equal(data.getUint16(22,true),1);assert.equal(data.getUint32(24,true),16000);assert.equal(data.getUint16(34,true),16);assert.equal(data.getInt16(44,true),16384)
})
test('空音频和超90秒音频不提交；幅度安全钳制',async()=>{
 assert.throws(()=>encodeMonoWav([],16000));assert.throws(()=>encodeMonoWav([new Float32Array(16000*92)],16000),/90秒/)
 const wav=new DataView(await encodeMonoWav([new Float32Array([2,-2])],16000).arrayBuffer());assert.equal(wav.getInt16(44,true),32767);assert.equal(wav.getInt16(46,true),-32768)
})

test('解码使用独立缓冲区，原件快照在录音转写后仍可持久化与重试',async()=>{
 const {recordingToWav}=await import('./recordingAudio.ts'),{fileBytes}=await import('./draftFiles.ts')
 const Original=globalThis.AudioContext
 Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:class{
  async decodeAudioData(buffer:ArrayBuffer){structuredClone(buffer,{transfer:[buffer]});return {numberOfChannels:1,sampleRate:16000,getChannelData:()=>new Float32Array(16000)}}
  close(){return Promise.resolve()}
 }})
 try{const file=new File(['original-recording'],'录音.webm',{type:'audio/webm'});const before=await fileBytes(file);await recordingToWav(file);assert.equal(before.byteLength,18);assert.equal(new TextDecoder().decode(await fileBytes(file)),'original-recording')}
 finally{Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Original})}
})
