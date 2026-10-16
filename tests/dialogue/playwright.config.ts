import {defineConfig} from '@playwright/test'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {writeFileSync} from 'node:fs'
// A continuous known signal avoids the default fake microphone's silent intervals.
// Real MediaRecorder encoding, browser decoding and server upload remain exercised.
const sampleRate=16000,samples=sampleRate*2,tone=Buffer.alloc(44+samples*2)
tone.write('RIFF',0);tone.writeUInt32LE(tone.length-8,4);tone.write('WAVEfmt ',8);tone.writeUInt32LE(16,16);tone.writeUInt16LE(1,20);tone.writeUInt16LE(1,22);tone.writeUInt32LE(sampleRate,24);tone.writeUInt32LE(sampleRate*2,28);tone.writeUInt16LE(2,32);tone.writeUInt16LE(16,34);tone.write('data',36);tone.writeUInt32LE(samples*2,40)
for(let i=0;i<samples;i++)tone.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/sampleRate)*5000),44+i*2)
const tonePath=path.join(tmpdir(),`hoooho-dialogue-audio-${process.pid}.wav`);writeFileSync(tonePath,tone)
export default defineConfig({testDir:'.',workers:1,timeout:60000,expect:{timeout:12000},use:{baseURL:'http://127.0.0.1:4196',viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${tonePath}`]},screenshot:'only-on-failure'},webServer:{cwd:path.resolve(import.meta.dirname,'../..'),command:'node tests/visit-sheet/serve.mjs',env:{VISIT_AI_TEST:'1',VISIT_BAILIAN_TEST:'1',VISIT_ASR_TEST:'1',AI_MAX_CALLS_PER_ACCOUNT_HOUR:'1000'},url:'http://127.0.0.1:4196/api/health',timeout:60000}})
