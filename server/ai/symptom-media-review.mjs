import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const ffmpeg=process.platform==='win32'?(await import('@ffmpeg-installer/ffmpeg')).default.path:'ffmpeg'
const probePath=process.platform==='win32'?(await import('ffprobe-static')).default.path:'ffprobe'
import sharp from 'sharp'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
const exec=promisify(execFile)
export const MEDIA_MAX_BYTES=100*1024*1024
export const VIDEO_MAX_SECONDS=120
export const sampleTimes=duration=>{const n=Math.min(6,Math.max(2,Math.ceil(duration/5)+1));return Array.from({length:n},(_,i)=>Math.round(Math.max(0,Math.min(duration-.05,i*duration/(n-1)))*100)/100)}
export async function runMedia(command,args){try{return await exec(command,args,{timeout:120000,maxBuffer:2*1024*1024,windowsHide:true})}catch(e){throw Object.assign(new Error(e.killed?'资料处理超时，请缩短视频后重选':'资料无法解码或转码，请在相册导出为 H.264 MP4 / JPG 后重选'),{code:e.killed?'MEDIA_PROCESS_TIMEOUT':'MEDIA_DECODE_FAILED',status:422})}}
export async function inspectVideo(file){const {stdout}=await runMedia(probePath,['-v','error','-show_format','-show_streams','-of','json',file]);const info=JSON.parse(stdout),video=info.streams.find(s=>s.codec_type==='video'),duration=Number(info.format.duration);if(!video||!Number.isFinite(duration)||duration<=0)throw Object.assign(new Error('未找到可读取的视频画面'),{code:'MEDIA_NO_VIDEO',status:422});if(duration>VIDEO_MAX_SECONDS)throw Object.assign(new Error('视频超过2分钟，请在相册裁剪后重新选择'),{code:'MEDIA_DURATION_LIMIT',status:413});return {duration,width:video.width,height:video.height,codec:video.codec_name,hasAudio:info.streams.some(s=>s.codec_type==='audio')}}
export async function prepareVideo(file,preview,poster){const info=await inspectVideo(file);await runMedia(ffmpeg,['-y','-v','error','-threads','1','-i',file,'-map','0:v:0','-map','0:a?','-vf','scale=\'trunc(min(720,iw)/2)*2\':-2','-c:v','libx264','-preset','veryfast','-crf','26','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',preview]);await runMedia(ffmpeg,['-y','-v','error','-i',preview,'-frames:v','1','-vf','scale=320:-2',poster]);return info}
export async function mediaInputs(file,video){
 const temp=await mkdtemp(path.join(tmpdir(),'hoooho-media-process-'))
 try{
  if(!video)return {image:await sharp(file,{limitInputPixels:40000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer(),times:[null],audio:null}
  const info=await inspectVideo(file),times=sampleTimes(info.duration)
  let audio=null,audioError=null,image=null,visionError=null
  if(info.hasAudio){try{const wav=path.join(temp,'audio.wav');await runMedia(ffmpeg,['-y','-v','error','-i',file,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',wav]);audio=await readFile(wav)}catch(e){audioError=e}}
  try{const frames=[]
   for(let i=0;i<times.length;i++){const frame=path.join(temp,i+'.jpg');await runMedia(ffmpeg,['-y','-v','error','-ss',String(times[i]),'-i',file,'-frames:v','1','-vf','scale=480:-2',frame]);const input=await sharp(frame).resize(480,360,{fit:'contain',background:'#fff'}).extend({top:28,bottom:0,left:0,right:0}).composite([{input:Buffer.from(`<svg width="480" height="28"><text x="8" y="20" font-size="18">Frame ${i} @ ${times[i]}s</text></svg>`),top:0,left:0}]).jpeg().toBuffer();frames.push({input,left:(i%2)*480,top:Math.floor(i/2)*388})}
   image=await sharp({create:{width:960,height:Math.ceil(times.length/2)*388,channels:3,background:'#fff'}}).composite(frames).jpeg({quality:85}).toBuffer()
  }catch(e){visionError=e}
  return {image,times,audio,audioError,visionError,duration:info.duration}
 }finally{await rm(temp,{recursive:true,force:true})}
}
export function validateObservations(value,count){if(!value||!Array.isArray(value.observations)||!Array.isArray(value.questions)||value.observations.length>24||value.questions.length>12||value.questions.some(q=>typeof q!=='string'||q.length>1000))throw new Error('整理结果格式异常');for(const o of value.observations)if(!Number.isInteger(o.frame)||o.frame<0||o.frame>=count||typeof o.text!=='string'||!o.text.trim()||o.text.length>1000)throw new Error('整理结果来源无法验证');return value}
