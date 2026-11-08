import path from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { AIBusinessService } from './business/service.mjs'
import { BusinessModel } from './business/model.mjs'
import { FrontDeskRecord } from './front-desk-record.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { createSeedCorrectionTrialProvider, seedCorrectionCase } from './providers/ark-provider.mjs'

export const seedTrialPath = '/api/account/seed-testflight'
const model = 'doubao-seed-2-1-pro-260915'
const revision = new Date('2026-11-07T05:00:00Z')
const fail = (status,code,message) => Object.assign(new Error(message),{status,code})
const hidden = () => fail(404,'SEED_TRIAL_NOT_FOUND','内测入口未开放')
const quiet={info(){},warn(){},error(){}}

export function createSeedTestflightTrial({env=process.env,fetchImpl,clock=Date.now}={}){
  const ownerId=env.HOOOHO_SEED_TRIAL_HOOOHO_ID?.trim()
  const apiKey=env.HOOOHO_SEED_TRIAL_API_KEY?.trim()
  const permitted=user=>Boolean(ownerId&&apiKey&&user?.hooohoId===ownerId&&!user.guest&&!user.mergedInto)
  let running=false, last=-Infinity, day=-1, runs=0
  return {
    status(user){return permitted(user)?{available:true,model,sample:seedCorrectionCase}:{available:false}},
    async run(user, input, parent){
      if(!permitted(user))throw hidden()
      if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length!==0)throw fail(400,'SEED_TRIAL_FIXED_CASE','只接受预置虚构案例，不接收任何输入资料')
      const now=clock(), epoch=Math.floor(now/86400000)
      if(running||now-last<60000)throw fail(429,'SEED_TRIAL_COOLDOWN','内测正在运行或刚结束，请一分钟后再试')
      if(day!==epoch){day=epoch;runs=0}
      if(runs>=6)throw fail(429,'SEED_TRIAL_DAILY_LIMIT','今天的内测次数已用完')
      parent?.throwIfAborted()
      running=true;last=now;runs++
      const deadline=AbortSignal.timeout(55000),signal=parent?AbortSignal.any([parent,deadline]):deadline
      let dir
      try {
        dir=await mkdtemp(path.join(tmpdir(),'hoooho-seed-fixture-'))
        const account='synthetic-seed-trial'
        const member=await new FamilyMemberRepository(dir).create({accountId:account,name:'虚构孩子',relationship:'child'})
        let fixtureTime=revision.getTime()
        const opts={dataDirectory:dir,now:()=>new Date(fixtureTime),logger:quiet,env:{AI_PROVIDER:'local',ASR_PROVIDER:'none',TTS_PROVIDER:'none'}}
        const business=new AIBusinessService(opts)
        const provider=createSeedCorrectionTrialProvider(apiKey,fetchImpl)
        const dialogue=new BusinessModel({...opts,provider,maxTokens:8000})
        const front=new FrontDeskRecord({...opts,business,events:business.events,model:dialogue})
        const first=await front.submit(account,member.id,{id:'seed-trial-first',kind:'text',text:seedCorrectionCase[0]},signal,{continuousRecord:true})
        fixtureTime+=1000
        const second=await front.submit(account,member.id,{id:'seed-trial-correction',kind:'text',text:seedCorrectionCase[1],contextId:first.context.id,expectedContextVersion:first.context.version},signal,{continuousRecord:true})
        signal.throwIfAborted()
        if(second.context.id!==first.context.id)throw fail(422,'SEED_TRIAL_CONTEXT_CHANGED','模型未能在原对话里处理更正')
        const readReply=(value)=>value.context.messages.find(m=>m.id===value.replyId&&m.kind==='assistant')?.text
        const replies=[readReply(first),readReply(second)]
        if(replies.some(reply=>typeof reply!=='string'||!reply.trim()))throw fail(422,'SEED_TRIAL_REPLY_UNAVAILABLE','模型没有生成可核对的护护回复')
        let card=await front.continuous(account,member.id,second.context.id)
        if(card.presentation.canGenerate)card=await front.continuous(account,member.id,second.context.id,{action:'generate_current',confirmed:true,expectedVersion:card.version,save:false})
        if(card.saved|| (await business.records.repository.findByAccountId(account)).length)throw fail(503,'SEED_TRIAL_INVALID_RECEIPT','内测意外触发保存，结果不显示')
        signal.throwIfAborted()
        return {model,sample:seedCorrectionCase,replies,card:{generated:card.presentation.generated===true,text:card.presentation.generated?card.text:null,occurredAt:card.occurredAt??null},elapsedMs:Math.max(0,clock()-now)}
      }catch(error){
        if(parent?.aborted)throw parent.reason
        if(deadline.aborted)throw fail(504,'SEED_TRIAL_TIMEOUT','内测超时，请稍后主动重试')
        if(error.code==='AI_ARK_RATE_LIMIT')throw fail(429,'SEED_TRIAL_UPSTREAM_LIMIT','方舟请求受限，请稍后重试')
        if(error.code?.startsWith('SEED_TRIAL_'))throw error
        throw fail(502,'SEED_TRIAL_FAILED','模型或整理结果未通过护护校验，本次没有生成可查看结果')
      }finally{
        try { if(dir)await rm(dir,{recursive:true,force:true}) } finally { running=false }
      }
    }
  }
}
