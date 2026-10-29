import test from 'node:test'
import assert from 'node:assert/strict'
import {captureConversationDeleted,markCaptureConversationsDeleted,lastConversationDeletionAt} from './conversationDeletion'
import type {CaptureDraft} from './captureDraft'

test('device deletion guards cover every copy of the selected conversation, account/member isolation and stale autosaves',()=>{
 const storage=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}})
 Object.defineProperty(globalThis,'window',{configurable:true,value:{dispatchEvent:()=>true}})
 const key='home-smart:owner:child:new',draft:CaptureDraft={requestId:'request',frontContextId:'continued',text:'发烧',files:[],occurredAt:'',timeUnknown:true}
 assert.equal(captureConversationDeleted(key,draft),false)
 markCaptureConversationsDeleted(key,['root','continued'],['request'])
 const at=lastConversationDeletionAt(key);assert.ok(at>0);markCaptureConversationsDeleted(key,['root','continued'],['request']);assert.equal(lastConversationDeletionAt(key),at)
 assert.equal(captureConversationDeleted(key,draft),true)
 assert.equal(captureConversationDeleted(key+':retained:1:request',draft),true)
 assert.equal(captureConversationDeleted(key,{...draft,frontContextId:undefined}),true)
 assert.equal(captureConversationDeleted('home-smart:other:child:new',draft),false)
 assert.equal(captureConversationDeleted('home-smart:owner:other:new',draft),false)
 assert.equal(captureConversationDeleted(key,{...draft,requestId:'new',frontContextId:'new-context'}),false)
})
