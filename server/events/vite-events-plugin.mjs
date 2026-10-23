import { resolveBusinessAssetInput } from '../ai/business/asset-input.mjs'
import { parseJsonObject } from '../json-input.mjs'
import { authConfig } from '../auth/config.mjs'
import { TokenService } from '../auth/token-service.mjs'
import { HealthEventError, HealthEventService } from './health-event-service.mjs'
import { HealthRecordOrganizationService } from '../ai/health-record-organization-service.mjs'
import { CaseContinuityService } from './case-continuity-service.mjs'
import { caseApiResult } from './case-api.mjs'
import { NurseService, nurseApiResult } from '../ai/nurse-service.mjs'
import {RecognitionJobs,recognitionRoute,recognitionApi} from '../ai/recognition-jobs.mjs'
import {AudioTranscriptionService} from '../ai/audio-transcription-service.mjs'
import {FrontDeskRecord} from '../ai/front-desk-record.mjs'

const readJson = (request, maxLength = 16_384) => new Promise((resolve, reject) => {
  let body = ''
  let settled = false
  request.setEncoding('utf8')
  request.on('data', (chunk) => {
    if (settled) return
    body += chunk
    if (body.length > maxLength) {
      settled = true
      reject(new HealthEventError('请求内容过大', 413, 'PAYLOAD_TOO_LARGE'))
    }
  })
  request.on('end', () => {
    if (settled) return
    try {
      settled = true
      resolve(parseJsonObject(body))
    } catch {
      settled = true
      reject(new HealthEventError('请求格式错误', 400, 'INVALID_JSON'))
    }
  })
  request.on('error', reject)
})

const sendJson = (response, status, data) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

function readAccountId(request, tokenService) {
  const authorization = request.headers.authorization ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  const payload = match ? tokenService.verify(match[1]) : null
  if (!payload) throw new HealthEventError('登录状态无效或已过期', 401, 'UNAUTHORIZED')
  return payload.sub
}

export function eventsApiPlugin(options = {}) {
  const config = { ...authConfig, ...options }
  const summaryRefresher = options.summaryRefresher ?? new HealthRecordOrganizationService({ dataDirectory: config.dataDirectory, structuredMode: 'enabled' })
  const events = options.service ?? new HealthEventService({ dataDirectory: config.dataDirectory, summaryRefresher })
  const tokens = options.tokens ?? new TokenService(config.tokenSecret, config.tokenTtlMs)
  const cases = new CaseContinuityService(config)
  const nurse = new NurseService({ ...config, events })
  const frontDesk = new FrontDeskRecord({...config,events,business:cases.business})
  let recognition

  return {
    name: 'hoooho-local-events-api',
    configureServer(server) {
      recognition=new RecognitionJobs({...config,events,business:cases.business,frontDesk,audio:new AudioTranscriptionService(config)})
      cases.business.assertRecognitionCurrent=draft=>recognition.assertCurrent(draft)
      server.httpServer?.once('close',()=>void recognition.close())
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if(recognitionRoute(pathname)){try{const result=await recognitionApi(recognition,readAccountId(request,tokens),request,pathname,limit=>readJson(request,limit));return sendJson(response,result.status??200,result.data)}catch(error){return sendJson(response,error.status??500,{error:{code:error.code??'RECOGNITION_UNAVAILABLE',message:error.status?error.message:'识别服务暂不可用，原件保留'}})}}
        const draftRoute=/^\/api\/members\/([^/]+)\/ai-drafts(?:\/([^/]+))?(?:\/(save|undo|speech))?$/.exec(pathname)
        if(draftRoute){try{const accountId=readAccountId(request,tokens),memberId=decodeURIComponent(draftRoute[1]),id=draftRoute[2]?decodeURIComponent(draftRoute[2]):null,action=draftRoute[3],business=cases.business;let result;const controller=new AbortController();response.once('close',()=>{if(!response.writableEnded)controller.abort()});if(request.method==='GET')result=id?await business.read(accountId,memberId,id):await business.latest(accountId,memberId);else if(request.method==='POST'&&!id){const input=await resolveBusinessAssetInput(recognition,accountId,memberId,await readJson(request,22*1024*1024),controller.signal);result=await business.prepare(accountId,memberId,input,controller.signal);}else if(request.method==='POST'&&action==='save')result=await business.save(accountId,memberId,id,await readJson(request));else if(request.method==='POST'&&action==='undo')result=await business.undo(accountId,memberId,id);else if(request.method==='POST'&&action==='speech')result=await business.speak(accountId,memberId,id,controller.signal);else if(request.method==='PATCH'&&id)result=await business.edit(accountId,memberId,id,await readJson(request,80000));else if(request.method==='DELETE'&&id)result=await business.cancel(accountId,memberId,id);else throw Object.assign(new Error('请求方法不支持'),{status:405});return sendJson(response,200,result)}catch(error){return sendJson(response,error.status??500,{error:{code:error.code??'AI_BUSINESS_UNAVAILABLE',message:error.status?error.message:'整理暂不可用，原件保留'}})}}
        const failedFront=/^\/api\/members\/([^/]+)\/front-desk-record\/messages\/([^/]+)$/.exec(pathname)
        if(failedFront&&request.method==='DELETE'){try{return sendJson(response,200,await frontDesk.discard(readAccountId(request,tokens),decodeURIComponent(failedFront[1]),decodeURIComponent(failedFront[2])))}catch(error){return sendJson(response,error.status??500,{error:{code:error.code??'FRONT_RECORD_UNAVAILABLE',message:error.message}})}}
        const front=/^\/api\/members\/([^/]+)\/front-desk-record(?:\/contexts\/([^/]+))?$/.exec(pathname)
        if(front){
          try{const accountId=readAccountId(request,tokens),memberId=decodeURIComponent(front[1]);if(request.method==='GET'&&front[2])return sendJson(response,200,await frontDesk.snapshot(accountId,memberId,decodeURIComponent(front[2])));if(request.method==='GET'&&!front[2])return sendJson(response,200,await frontDesk.latest(accountId,memberId));if(request.method==='DELETE'&&!front[2])return sendJson(response,200,await frontDesk.closeSession(accountId,memberId));if(request.method==='POST'){const input=await readJson(request,22*1024*1024);return sendJson(response,200,front[2]?await frontDesk.checkpoint(accountId,memberId,decodeURIComponent(front[2]),input):input.kind==='legacy'?await frontDesk.retainLegacy(accountId,memberId,input):await frontDesk.submit(accountId,memberId,input))}return sendJson(response,405,{error:{code:'METHOD_NOT_ALLOWED',message:'请求方法不支持'}})}catch(error){return sendJson(response,error.status??500,{error:{code:error.code??'FRONT_RECORD_UNAVAILABLE',message:error.status?error.message:'智能记录暂不可用，内容保留'}})}
        }
        if (/^\/api\/members\/[^/]+\/nurse-drafts(?:\/|$)/.test(pathname)) {
          try { const result = await nurseApiResult(nurse, readAccountId(request, tokens), request.method, pathname, limit => readJson(request, limit)); return sendJson(response, result.status ?? 200, result.data) }
          catch (error) { return sendJson(response, error.status ?? 500, { error: { message: error.status ? error.message : '智能记录暂不可用，原内容保留', code: error.code ?? 'NURSE_ERROR' } }) }
        }
        if (/^\/api\/members\/[^/]+\/(cases|case-records)(?:\/|$)/.test(pathname)) {
          try {
            const result = await caseApiResult(cases, readAccountId(request, tokens), request.method, pathname, limit => readJson(request, limit), new URL(request.url, 'http://localhost').searchParams)
            if (result) return sendJson(response, result.status ?? 200, result.data)
          } catch (error) { return sendJson(response, error.status ?? 500, { error: { message: error.status ? error.message : '保存未完成，请重试', code: error.code ?? 'CASE_ERROR' } }) }
        }
        const sharedMatch = /^\/api\/medical-preparations\/shared\/([^/]+)$/.exec(pathname)
        const preparationMatch = /^\/api\/events\/([^/]+)\/medical-preparation$/.exec(pathname)
        const summaryMatch = /^\/api\/events\/([^/]+)\/summary$/.exec(pathname)
        const match = /^\/api\/events(?:\/([^/]+))?$/.exec(pathname)
        if (!match && !summaryMatch && !preparationMatch && !sharedMatch) return next()

        try {
          if (sharedMatch) {
            if (request.method === 'GET') return sendJson(response, 200, await events.getSharedMedicalPreparation(decodeURIComponent(sharedMatch[1])))
            return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
          }
          const accountId = readAccountId(request, tokens)
          if (preparationMatch) {
            const eventId = decodeURIComponent(preparationMatch[1])
            if (request.method === 'PUT') return sendJson(response, 200, await events.saveMedicalPreparation(accountId, eventId, await readJson(request, 100_000)))
            return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
          }
          if (summaryMatch) {
            const eventId = decodeURIComponent(summaryMatch[1])
            if (request.method === 'PATCH') return sendJson(response, 200, await events.correctSummary(accountId, eventId, await readJson(request)))
            return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
          }
          const eventId = match[1] ? decodeURIComponent(match[1]) : null

          if (!eventId && request.method === 'GET') return sendJson(response, 200, new URL(request.url, 'http://localhost').searchParams.get('view') === 'time' ? await events.listJournal(accountId) : await events.list(accountId))
          if (!eventId && request.method === 'POST') return sendJson(response, 201, await events.create(accountId, await readJson(request)))
          if (eventId && request.method === 'GET') return sendJson(response, 200, await events.get(accountId, eventId))
          if (eventId && request.method === 'PATCH') return sendJson(response, 200, await events.update(accountId, eventId, await readJson(request)))
          if (eventId && request.method === 'DELETE') return sendJson(response, 200, await events.delete(accountId, eventId))
          return sendJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: '请求方法不支持' } })
        } catch (error) {
          const status = error instanceof HealthEventError ? error.status : 500
          const code = error instanceof HealthEventError ? error.code : 'INTERNAL_ERROR'
          const message = error instanceof HealthEventError ? error.message : '服务器暂时不可用'
          if (!(error instanceof HealthEventError)) server.config.logger.error(error)
          return sendJson(response, status, { error: { code, message } })
        }
      })
    }
  }
}
