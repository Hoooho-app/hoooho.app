import test from 'node:test'
import assert from 'node:assert/strict'
import { RealtimeNurse } from './RealtimeNurse'
import { nurseApi } from './api'
import type { NurseTurn } from './types'
function fixture(t: any) {
 const restored: (()=>void)[] = []
 const patch = (key:string,value:any) => {const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true});restored.push(()=>old?Object.defineProperty(globalThis,key,old):Reflect.deleteProperty(globalThis,key))}
 const tracks:any[]=[];const track=()=>{const value={kind:'audio',stopped:false,stop(){this.stopped=true}};tracks.push(value);return value}
 class Stream { list:any[]=[];constructor(list:any[]=[]){this.list=list};getTracks(){return this.list};getAudioTracks(){return this.list};addTrack(t:any){this.list.push(t)} }
 let blocked=false, paused=false
 class Player {srcObject:any;autoplay=false;muted=false;play(){return blocked?Promise.reject(new Error('autoplay')):Promise.resolve()};pause(){paused=true};remove(){} }
 const sent:any[]=[], replaced:any[]=[], states:string[]=[], turns:NurseTurn[]=[], queued:NurseTurn[]=[], previews:string[]=[], errors:string[]=[], playStates:boolean[]=[]
 const channel:any={readyState:'open',send(v:string){sent.push(JSON.parse(v))},close(){this.readyState='closed'}}
 let pc:any
 class Peer {
  connectionState='connected';iceGatheringState='complete';localDescription={sdp:'v=0\nm=audio\nm=application'};closed=false
  sender={track:null,replaceTrack:async(t:any)=>{replaced.push(t);this.sender.track=t}}
  constructor(){pc=this};addTransceiver(){};getSenders(){return[this.sender]};createDataChannel(){return channel};createOffer(){return Promise.resolve({type:'offer',sdp:this.localDescription.sdp})};setLocalDescription(){return Promise.resolve()};setRemoteDescription(){return Promise.resolve()};addEventListener(){};removeEventListener(){};close(){this.closed=true}
 }
 patch('Audio',Player);patch('MediaStream',Stream);patch('RTCPeerConnection',Peer);patch('navigator',{mediaDevices:{getUserMedia:async()=>new Stream([track()])}})
 const old=nurseApi.sdp;nurseApi.sdp=async()=>({sdp:'v=0\nm=audio',model:'fixture',instructions:'fixture policy'})
 t.after(()=>{nurseApi.sdp=old;restored.reverse().forEach(r=>r())})
 const nurse=new RealtimeNurse({memberId:'fixture',token:'fixture',draftId:'fixture',queued:t=>queued.push(t),state:s=>states.push(s),turn:async t=>{turns.push(t)},preview:s=>previews.push(s),error:s=>errors.push(s),usage:()=>{},playbackBlocked:b=>playStates.push(b)})
 t.after(()=>nurse.stop())
 const emit=(value:object)=>channel.onmessage({data:JSON.stringify(value)})
 const ready=async()=>{await nurse.start();emit({type:'session.created'});emit({type:'session.updated'});await Promise.resolve()}
 return {nurse,ready,emit,sent,replaced,states,turns,queued,previews,errors,tracks,playStates,get pc(){return pc},get paused(){return paused},block(){blocked=true},unblock(){blocked=false},channel}
}
test('audio stays off sender until transport + session.updated; final only; pause releases all resources',async t=>{
 const f=fixture(t);await f.nurse.start();assert.equal(f.replaced.length,0)
 f.emit({type:'session.created'});assert.equal(f.sent[0].type,'session.update');assert.equal(f.replaced.length,0)
 f.emit({type:'session.updated'});await Promise.resolve();assert.equal(f.replaced.length,1)
 f.emit({type:'conversation.item.input_audio_transcription.delta',text:'临时结果'})
 await f.nurse.drain();assert.equal(f.turns.length,0)
 f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'user-1',transcript:'最终原话'})
 await f.nurse.drain();assert.equal(f.turns[0].text,'最终原话')
 f.nurse.stop();assert.ok(f.tracks.every(t=>t.stopped));assert.equal(f.pc.closed,true);assert.equal(f.channel.readyState,'closed');assert.equal(f.paused,true)
 f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'late',transcript:'迟到原话'})
 await f.nurse.drain();assert.equal(f.turns.length,1)
})
test('barge-in cancels old response, detaches player and preserves visible partial as interrupted',async t=>{
 const f=fixture(t);await f.ready()
 f.emit({type:'response.created',response:{id:'old'}})
 f.emit({type:'response.audio_transcript.delta',response_id:'old',delta:'已显示的片段'})
 f.emit({type:'input_audio_buffer.speech_started'})
 f.emit({type:'response.done',response:{id:'old',status:'completed',output:[{role:'assistant',content:[{text:'不能冒充完整回复'}]}]}})
 await f.nurse.drain();assert.ok(f.sent.some(e=>e.type==='response.cancel'));assert.equal(f.paused,true)
 assert.deepEqual(f.turns.map(t=>[t.text,t.status]),[['已显示的片段','interrupted']])
})
test('autoplay block stops microphone and requires explicit playback; no new SDP or reconnect',async t=>{
 const f=fixture(t);await f.ready();f.block()
 f.emit({type:'response.created',response:{id:'one'}});await Promise.resolve();assert.ok(f.tracks.every(t=>t.stopped));assert.ok(f.playStates.includes(true));assert.equal(f.replaced.at(-1),null)
 f.emit({type:'response.done',response:{id:'one',status:'completed',output:[{role:'assistant',content:[{text:'位置在哪里？'}]}]}})
 assert.equal(f.states.at(-1),'paused','reply completion cannot show listening while microphone is closed')
 f.unblock();await f.nurse.resumePlayback();assert.equal(f.tracks.length,2);assert.equal(f.playStates.at(-1),false)
 f.nurse.stop();assert.ok(f.tracks.every(t=>t.stopped))
})

test('cancelled old response completion cannot clear a newer reply or its speaking state',async t=>{
 const f=fixture(t);await f.ready();f.emit({type:'response.created',response:{id:'old'}});f.emit({type:'input_audio_buffer.speech_started'})
 f.emit({type:'response.created',response:{id:'new'}});f.emit({type:'response.audio_transcript.delta',response_id:'new',delta:'新回复'})
 f.emit({type:'response.done',response:{id:'old',status:'cancelled'}})
 assert.equal(f.states.at(-1),'speaking');assert.equal(f.previews.at(-1),'新回复')
 f.emit({type:'response.done',response:{id:'new',status:'completed',output:[{role:'assistant',content:[{transcript:'新回复'}]}]}})
 await f.nurse.drain();assert.equal(f.turns[0].text,'新回复')
})


test('final transcripts are stashed synchronously before async delivery so close need not wait for network',async t=>{
 const f=fixture(t);await f.ready()
 f.emit({type:'conversation.item.input_audio_transcription.completed',item_id:'final-before-close',transcript:'合成最终原话'})
 assert.equal(f.queued[0].text,'合成最终原话');assert.equal(f.turns.length,0)
 f.nurse.stop();assert.ok(f.tracks.every(track=>track.stopped));await f.nurse.drain()
 assert.equal(f.turns[0].id,'final-before-close')
})
