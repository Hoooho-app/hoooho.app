import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { withAccountLock } from './account-lock.mjs'
import { withResponseAccountLock } from './vite-auth-plugin.mjs'

test('cancelled queued Vite response does not retain the account lock', {timeout:2000}, async () => {
  let release, acquired
  const gate=new Promise(resolve=>{release=resolve}), ready=new Promise(resolve=>{acquired=resolve})
  const first=withAccountLock('vite-cancel-regression',async()=>{acquired();await gate})
  await ready
  const request={aborted:false}, response=new EventEmitter()
  let called=0
  const queued=withResponseAccountLock('vite-cancel-regression',request,response,()=>{called++})
  request.aborted=true;response.destroyed=true;response.emit('close')
  release();await first;await queued
  assert.equal(called,0)
  assert.equal(response.listenerCount('close'),0)
  await withAccountLock('vite-cancel-regression',()=>{called++})
  assert.equal(called,1)
})

test('Vite account lock remains held until an active response finishes', {timeout:2000}, async () => {
  const response=new EventEmitter(),order=[]
  let started
  const ready=new Promise(resolve=>{started=resolve})
  const first=withResponseAccountLock('vite-active-regression',{},response,()=>{order.push('active');started()})
  await ready
  const second=withAccountLock('vite-active-regression',()=>{order.push('next')})
  assert.deepEqual(order,['active'])
  response.emit('finish');await first;await second
  assert.deepEqual(order,['active','next'])
  assert.equal(response.listenerCount('finish'),0)
  assert.equal(response.listenerCount('close'),0)
})
