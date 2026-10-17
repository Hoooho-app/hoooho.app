// Decode the actual MediaRecorder bytes (Safari: MP4/AAC; Chrome: WebM/Opus)
// and encode mono PCM WAV. Never change only the MIME label of encoded audio.
import {fileBytes} from './draftFiles'
export function encodeMonoWav(channels:Float32Array[],sampleRate:number):Blob {
  if(!channels.length||!channels[0].length||sampleRate<8000||sampleRate>192000)throw Object.assign(new Error('录音内容无法读取，请重新录音或输入文字'),{code:'AUDIO_DECODE_FAILED'})
  const sourceLength=channels[0].length,targetRate=16000,length=Math.floor(sourceLength*targetRate/sampleRate)
  if(length>90*targetRate+targetRate)throw Object.assign(new Error('录音超过90秒，请缩短后重试'),{code:'AUDIO_TOO_LARGE'})
  const buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer)
  const write=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))}
  write(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,targetRate,true);view.setUint32(28,targetRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,length*2,true)
  for(let i=0;i<length;i++){
    // Average source frames/channels rather than dropping high-rate frames.
    const from=Math.floor(i*sampleRate/targetRate),to=Math.min(sourceLength,Math.max(from+1,Math.floor((i+1)*sampleRate/targetRate)))
    let sum=0;for(const channel of channels)for(let j=from;j<to;j++)sum+=channel[j]??0
    const value=Math.max(-1,Math.min(1,sum/(channels.length*(to-from))))
    view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true)
  }
  return new Blob([buffer],{type:'audio/wav'})
}
// Trim only quiet edges; keep 400ms padding, interior pauses and the original.
export function trimSearchSilence(channels:Float32Array[],sampleRate:number):Float32Array[] {
  if(!channels.length||!channels[0].length)return channels
  const size=Math.max(1,Math.floor(sampleRate*.02)),length=channels[0].length,padding=Math.ceil(sampleRate*.4)
  const audible=(start:number)=>channels.some(channel=>{let sum=0;const end=Math.min(length,start+size);for(let i=start;i<end;i++)sum+=(channel[i]??0)**2;return Math.sqrt(sum/(end-start))>=.001})
  let first=0,last=Math.floor((length-1)/size)*size
  while(first<length&&!audible(first))first+=size
  if(first>=length)return channels
  while(last>first&&!audible(last))last-=size
  const from=Math.max(0,first-padding),to=Math.min(length,last+size+padding)
  return channels.map(channel=>channel.subarray(from,to))
}
export const recordingToSearchWav=(blob:Blob)=>recordingToWav(blob,true)
export async function recordingToWav(blob:Blob,trimSilence=false):Promise<Blob> {
  let context:AudioContext|undefined
  try {
    context=new AudioContext()
    // decodeAudioData takes ownership of (and detaches) its buffer. Keep the
    // immutable snapshot usable for IDB writes, original upload and retries.
    const decoded=await context.decodeAudioData((await fileBytes(blob)).slice(0))
    const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i))
    return encodeMonoWav(trimSilence?trimSearchSilence(channels,decoded.sampleRate):channels,decoded.sampleRate)
  }catch(error){if(error instanceof Error&&'code' in error&&typeof error.code==='string'&&(error.code.startsWith('AUDIO_')||error.code==='FILE_READ_FAILED'))throw error;throw Object.assign(new Error('录音格式无法读取，请重新录音或继续输入文字'),{code:'AUDIO_DECODE_FAILED'})}
  finally {await context?.close().catch(()=>undefined)}
}
