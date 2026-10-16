import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareVoiceOriginals} from './documents.mjs'

function original(mime, container) {
  const bytes=Buffer.alloc(1200)
  if(container==='mp4')bytes.write('ftyp',4)
  if(container==='webm')Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(bytes)
  if(container==='wav'){bytes.write('RIFF');bytes.write('WAVE',8)}
  return {name:container==='mp4'?'recording.m4a':`recording.${container}`,mimeType:mime,dataUrl:`data:${mime};base64,${bytes.toString('base64')}`}
}

test('Safari dotted AAC codec and Chromium Opus originals retain exact encoded bytes',()=>{
  for(const [mime,container] of [['audio/mp4;codecs=mp4a.40.2','mp4'],['audio/mp4;codecs="mp4a.40.2"','mp4'],['audio/webm;codecs=opus','webm'],['audio/wav','wav']]){
    const file=original(mime,container),[retained]=prepareVoiceOriginals([file])
    assert.equal(retained.dataUrl.split(',')[1],file.dataUrl.split(',')[1])
    assert.deepEqual(prepareVoiceOriginals([retained]),[retained])
    assert.equal(retained.mimeType,mime.split(';')[0])
    assert.equal(retained.name,file.name)
  }
})

test('changing WebM MIME/extension to WAV cannot pass original validation',()=>{
  assert.throws(()=>prepareVoiceOriginals([original('audio/wav','webm')]),{status:415,code:'VOICE_ORIGINAL_FORMAT_MISMATCH'})
  assert.throws(()=>prepareVoiceOriginals([{...original('audio/webm','webm'),mimeType:'audio/mp4'}]),{status:415,code:'VOICE_ORIGINAL_FORMAT_INVALID'})
})
