import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareVideo,mediaInputs,inspectVideo,runMedia} from './symptom-media-review.mjs'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
test('real MP4 decodes, transcodes, extracts cover and six chronological frames',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'hoooho-media-test-'));try{const info=await prepareVideo('src/assets/nurse-triage/nurses-idle-loop-1-mobile.mp4',path.join(dir,'preview.mp4'),path.join(dir,'poster.jpg'));assert.ok(info.duration>0);const result=await mediaInputs(path.join(dir,'preview.mp4'),true);assert.ok(result.image.length>1000);assert.equal(result.times[0],0);assert.ok(result.times.at(-1)>info.duration*.9)}finally{await rm(dir,{recursive:true,force:true})}})
test('corrupt data is rejected before any supplier invocation',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'hoooho-media-corrupt-'));try{const file=path.join(dir,'fake.mp4');await writeFile(file,'not a video');await assert.rejects(()=>inspectVideo(file),{code:'MEDIA_DECODE_FAILED'})}finally{await rm(dir,{recursive:true,force:true})}})
test('HEVC MOV and odd-width VP9 WebM produce even-width H264 compatible previews',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hoooho-codec-test-'));try{for(const [codec,extension] of [['libx265','mov'],['libvpx-vp9','webm']]){const original=path.join(dir,'original.'+extension);await promisify(execFile)(ffmpeg.path,['-y','-v','error','-f','lavfi','-i','color=c=red:s=374x200:r=2:d=1','-vf','pad=375:201','-threads','1','-c:v',codec,original],{windowsHide:true,maxBuffer:2000000});const result=await prepareVideo(original,path.join(dir,'preview.mp4'),path.join(dir,'poster.jpg'));assert.ok(['hevc','vp9'].includes(result.codec));const preview=await inspectVideo(path.join(dir,'preview.mp4'));assert.equal(preview.codec,'h264');assert.equal(preview.width%2,0);assert.equal(preview.height%2,0)}}finally{await rm(dir,{recursive:true,force:true})}
})
test('duration boundary accepts 120 seconds and rejects longer clips before paid processing',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'hoooho-duration-test-'));try{for(const seconds of [120,121]){const file=path.join(dir,seconds+'.mp4');await promisify(execFile)(ffmpeg.path,['-y','-v','error','-f','lavfi','-i',`color=c=gray:s=64x64:r=1:d=${seconds}`,'-threads','1','-c:v','libx264',file],{windowsHide:true});if(seconds===120)assert.equal((await inspectVideo(file)).duration,120);else await assert.rejects(()=>inspectVideo(file),{code:'MEDIA_DURATION_LIMIT'})}}finally{await rm(dir,{recursive:true,force:true})}})
test('static low-rate clips use real frame timestamps and compressed independent audio',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'hoooho-static-test-'));try{for(const audio of [false,true]){const original=path.join(dir,'source.mp4');await promisify(execFile)(ffmpeg.path,['-y','-v','error','-f','lavfi','-i','color=c=red:s=96x96:r=2:d=3',...(audio?['-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=3','-c:a','aac']:['-an']),'-threads','1','-c:v','libx264',original],{windowsHide:true});const input=await mediaInputs(original,true);assert.ok(input.image.length>100);assert.equal(input.visionError,null);assert.equal(input.times.at(-1),2.5);assert.ok(input.times.every((t,i)=>i===0||t>input.times[i-1]));if(audio){assert.equal(input.audioMimeType,'audio/mpeg');assert.ok(input.audio.length>1000&&input.audio.length<30000)}else assert.equal(input.audio,null)}}finally{await rm(dir,{recursive:true,force:true})}})

test('video sampling uses one ffmpeg decode for all frames and skips unrequested stages',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'hoooho-one-pass-test-'))
 try{
  const file=path.join(dir,'source.mp4')
  await promisify(execFile)(ffmpeg.path,['-y','-v','error','-f','lavfi','-i','testsrc2=s=96x96:r=4:d=3','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=3','-threads','1','-c:v','libx264','-c:a','aac',file],{windowsHide:true})
  const commands=[],run=async(command,args,options)=>{commands.push(args);return runMedia(command,args,options)}
  const all=await mediaInputs(file,true,{run})
  assert.equal(all.visionError,null);assert.equal(all.audioError,null);assert.ok(all.times.length>=2)
  assert.equal(commands.filter(args=>args.at(-1).endsWith('.jpg')).length,1)
  assert.equal(commands.filter(args=>args.includes('-vn')).length,1)
  commands.length=0
  const audio=await mediaInputs(file,true,{part:'audio',run})
  assert.ok(audio.audio.length>0);assert.equal(audio.image,null);assert.deepEqual(audio.times,[])
  assert.equal(commands.length,1);assert.ok(commands[0].includes('-vn'))
  commands.length=0
  const vision=await mediaInputs(file,true,{part:'vision',run})
  assert.ok(vision.image.length>0);assert.equal(vision.audio,null)
  assert.equal(commands.filter(args=>args.includes('-vn')).length,0)
  assert.equal(commands.filter(args=>args.at(-1).endsWith('.jpg')).length,1)
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('cancelled media processing stops before spawning a command',async()=>{
 const controller=new AbortController();controller.abort()
 await assert.rejects(()=>runMedia('does-not-exist',[],{signal:controller.signal}),{code:'MEDIA_CANCELLED',status:499})
})
