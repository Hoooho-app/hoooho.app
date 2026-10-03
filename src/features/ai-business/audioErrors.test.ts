import test from 'node:test'
import assert from 'node:assert/strict'
import {AudioRequestError,audioErrorMessage} from './audioErrors'
test('实际错误码区分网络、配置、额度、权限、转码、取消；不使用上游医疗原文',()=>{
 const cases=[['ASR_NOT_CONFIGURED','未配置'],['ASR_NETWORK_ERROR','连接失败'],['ASR_TIMEOUT','超时'],['ASR_BAILIAN_AUTHENTICATION','鉴权'],['ASR_BAILIAN_PERMISSION','不可访问'],['ASR_BAILIAN_FREE_QUOTA_EXHAUSTED','免费额度'],['ASR_BAILIAN_RATE_LIMIT','频繁'],['ASR_CALL_LIMIT','上限'],['ASR_BUSY','繁忙'],['AUDIO_DECODE_FAILED','转换失败'],['ASR_NO_SPEECH','没有识别'],['ASR_CANCELLED','停止转写'],['AUDIO_EMPTY','为空'],['AUDIO_TOO_LARGE','大小限制'],['ASR_OUTPUT_INVALID','无法读取']]
 for(const [code,word] of cases){const message=audioErrorMessage({code,message:'语音转写服务尚未配置 私有原文'});assert.ok(message.includes(word));if(code!=='ASR_NOT_CONFIGURED')assert.ok(!message.includes('未配置'));assert.ok(!message.includes('私有原文'))}
 assert.match(new AudioRequestError('ASR_NETWORK_ERROR',503).message,/连接失败/)
 assert.match(audioErrorMessage(new DOMException('Aborted','AbortError')),/停止转写/)
})
