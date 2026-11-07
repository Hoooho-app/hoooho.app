import { configurationError, requireDomesticTrial } from './provider-config.mjs'

export const paddleModel = 'PaddleOCR-VL-1.6'
const unavailable = () => configurationError('私有检查单识别暂不可用，原件保留；未转发给云模型', 'AI_OCR_UNAVAILABLE')
export const privateOCRSelected = env => (env ?? process.env).DOCUMENT_OCR_PROVIDER === 'paddle'

export async function readPrivateDocumentPage(page,{env=process.env,fetchImpl=fetch,signal}={}) {
  requireDomesticTrial(env)
  let url
  try { url=new URL(env.PADDLE_OCR_URL) } catch { throw unavailable() }
  // Require a local deployment or a loopback tunnel to an owned instance.
  // Never accept a public SaaS endpoint or let it redirect document bytes.
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.search||url.hash||url.pathname!=='/layout-parsing')throw unavailable()
  const match=/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(page.dataUrl??'')
  if(!match||match[1]!==page.mimeType)throw configurationError('原件格式无效，未发送资料','AI_OCR_INVALID_INPUT')
  const deadline=AbortSignal.timeout(45000), abort=signal?AbortSignal.any([signal,deadline]):deadline
  abort.throwIfAborted()
  try {
    const res=await fetchImpl(url.href,{method:'POST',redirect:'error',signal:abort,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({file:match[2],fileType:page.mimeType==='application/pdf'?0:1,visualize:false})})
    if(!res.ok)throw unavailable()
    const payload=await res.json(),pages=payload?.result?.layoutParsingResults
    if(payload.errorCode!==0||!Array.isArray(pages)||pages.length!==1||typeof pages[0]?.markdown?.text!=='string')throw unavailable()
    const text=pages[0].markdown.text.trim()
    if(text.length>60000)throw unavailable()
    abort.throwIfAborted()
    // OCR can produce markdown image references; reject instead of persisting a
    // public link or rendering untrusted OCR as HTML.
    if(/!\[[^\]]*\]\(|<img\b/i.test(text))throw unavailable()
    return {text,status:text?'uncertain':'blank',diagnostics:{provider:'paddleocr',model:paddleModel,success:true}}
  } catch(error) {
    if(signal?.aborted)throw signal.reason
    throw unavailable()
  }
}
