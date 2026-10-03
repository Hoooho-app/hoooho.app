// Use the application code, never a provider's arbitrary/raw response text.
const messages:Record<string,string>={
 ASR_NOT_CONFIGURED:'语音转写服务未配置，文字和图片仍可使用',
 ASR_CONFIGURATION_INVALID:'语音服务配置异常，请稍后重试或使用文字',
 ASR_BAILIAN_AUTHENTICATION:'语音服务鉴权失败，请稍后重试或使用文字',
 ASR_BAILIAN_PERMISSION:'语音模型暂不可访问，请稍后重试或使用文字',
 ASR_BAILIAN_MODEL_NOT_FOUND:'语音模型不可用，请稍后重试或使用文字',
 ASR_BAILIAN_FREE_QUOTA_EXHAUSTED:'语音免费额度已用尽，已停止转写；可继续文字记录',
 ASR_BAILIAN_CREDIT_BALANCE:'语音可用额度不足，已停止转写；可继续文字记录',
 ASR_BAILIAN_QUOTA_UNKNOWN:'语音额度已达限制，可继续文字记录',
 ASR_BAILIAN_RATE_LIMIT:'语音请求过于频繁，请稍后主动重试',
 ASR_BUSY:'语音服务繁忙，请稍后主动重试',
 ASR_CALL_LIMIT:'本小时语音次数已达上限，可继续文字记录',
 ASR_TIMEOUT:'语音转写超时，录音仍在当前窗口，可主动重试',
 ASR_NETWORK_ERROR:'语音服务连接失败，录音仍在当前窗口，可主动重试',
 ASR_CANCELLED:'已停止转写，录音仍在当前窗口，可主动重试',
 ASR_NO_SPEECH:'没有识别到语音，请重新录音或输入文字',
 ASR_OUTPUT_INVALID:'语音服务返回内容无法读取，请主动重试或输入文字',
 ASR_OUTPUT_INCOMPLETE:'语音转写没有完整返回，请缩短后重新录音',
 AUDIO_FORMAT_UNSUPPORTED:'录音格式不支持，请重新录音或输入文字',
 ASR_AUDIO_FORMAT_UNSUPPORTED:'录音格式不支持，请重新录音或输入文字',
 AUDIO_DECODE_FAILED:'录音转换失败，请重新录音或输入文字',
 INVALID_AUDIO_DATA:'录音内容无法读取，请重新录音或输入文字',
 AUDIO_EMPTY:'录音为空，请重新录音',
 AUDIO_TOO_LARGE:'录音超过大小限制，请缩短后重新录音',
 ASR_AUDIO_TOO_LARGE:'录音超过大小限制，请缩短后重新录音',
 UNAUTHORIZED:'登录已过期，请重新登录后使用语音',
}
export class AudioRequestError extends Error {
 code:string
 status:number
 requestId:string|null
 constructor(code:string,status:number,requestId:string|null=null){super(audioErrorMessage({code}));this.code=code;this.status=status;this.requestId=requestId}
}
export function audioErrorMessage(error:unknown):string {
 const code=typeof error==='object'&&error!==null&&'code' in error?String(error.code):''
 if(messages[code])return messages[code]
 if(error instanceof DOMException&&error.name==='AbortError')return messages.ASR_CANCELLED
 if(error instanceof TypeError)return '网络连接中断，录音仍在当前窗口，可主动重试'
 return '语音转写暂不可用，原内容仍保留；可主动重试或输入文字'
}
