import test from 'node:test'
import assert from 'node:assert/strict'
import { createAppCacheStorage } from './appCacheStorage.ts'

test('a full app cache retains its previous bytes and cannot turn an authenticated memory update into a network failure',()=>{
 const existing = new Map([['hoooho-app','previous-metadata'],['health-original','immutable-original']])
 const removed:string[]=[]
 const cache=createAppCacheStorage(()=>({getItem:key=>existing.get(key)??null,setItem(){throw new DOMException('full','QuotaExceededError')},removeItem(key){removed.push(key)}}))
 assert.doesNotThrow(()=>cache.storage.setItem('hoooho-app','new-metadata'))
 assert.equal(cache.isWritable(),false)
 assert.equal(cache.storage.getItem('hoooho-app'),'previous-metadata')
 assert.equal(existing.get('health-original'),'immutable-original');assert.deepEqual(removed,[])
})

test('blocked storage access and unavailable browser storage still permit a memory-only app session',()=>{
 for(const access of [()=>undefined,()=>{throw new DOMException('blocked','SecurityError')}]){
  const cache=createAppCacheStorage(access)
  assert.equal(cache.storage.getItem('hoooho-app'),null)
  assert.doesNotThrow(()=>cache.storage.setItem('hoooho-app','verified metadata'))
  assert.doesNotThrow(()=>cache.storage.removeItem('hoooho-app'))
  assert.equal(cache.isWritable(),false)
 }
})

test('a later successful cache write recovers persistence without clearing other data',()=>{
 let full=true;const saved=new Map<string,string>()
 const cache=createAppCacheStorage(()=>({getItem:key=>saved.get(key)??null,setItem(key,value){if(full)throw new DOMException('full','QuotaExceededError');saved.set(key,value)},removeItem:key=>saved.delete(key)}))
 cache.storage.setItem('hoooho-app','first');assert.equal(cache.isWritable(),false)
 full=false;cache.storage.setItem('hoooho-app','second')
 assert.equal(cache.isWritable(),true);assert.equal(saved.get('hoooho-app'),'second')
})

test('programming errors are not silently reclassified as browser storage restrictions',()=>{
 const cache=createAppCacheStorage(()=>{throw new TypeError('invalid cache integration')})
 assert.throws(()=>cache.storage.getItem('hoooho-app'),TypeError)
 assert.throws(()=>cache.storage.setItem('hoooho-app','value'),TypeError)
})
