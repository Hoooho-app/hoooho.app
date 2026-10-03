// Decode the actual MediaRecorder bytes (Safari: MP4/AAC; Chrome: WebM/Opus)
// and encode mono PCM WAV. Never change only the MIME label of encoded audio.
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
export async function recordingToWav(blob:Blob):Promise<Blob> {
  let context:AudioContext|undefined
  try {
    context=new AudioContext()
    const decoded=await context.decodeAudioData(await blob.arrayBuffer())
    return encodeMonoWav(Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i)),decoded.sampleRate)
  }catch(error){if(error instanceof Error&&'code' in error&&typeof error.code==='string'&&error.code.startsWith('AUDIO_'))throw error;throw Object.assign(new Error('录音格式无法读取，请重新录音或继续输入文字'),{code:'AUDIO_DECODE_FAILED'})}
  finally {await context?.close().catch(()=>undefined)}
}
