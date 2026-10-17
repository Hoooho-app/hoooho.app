import { fail } from './contract.mjs'

// Adapt private asset references at the HTTP boundary. Business preparation
// still validates the exact original bytes and keeps its existing checkpoints.
export async function resolveBusinessAssetInput(jobs,accountId,memberId,input,signal) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('草稿内容格式无效',422,'AI_DRAFT_ASSET_INVALID')
  if(!Object.hasOwn(input,'assetIds'))return input
  const ids=input.assetIds
  if(Object.hasOwn(input,'files')||!Array.isArray(ids)||!ids.length||ids.length>12||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))||new Set(ids).size!==ids.length)throw fail('资料原件引用无效',422,'AI_DRAFT_ASSET_INVALID')
  signal?.throwIfAborted()
  await jobs.scope(accountId,memberId)
  signal?.throwIfAborted()
  const assets=ids.map(id=>jobs.asset(accountId,memberId,id))
  if(assets.some(asset=>!['application/pdf','image/jpeg','image/png','image/webp'].includes(asset.mimeType)))throw fail('请上传 PDF、JPEG、PNG 或 WebP',415,'AI_DRAFT_ASSET_INVALID')
  if(assets.some(asset=>!Number.isSafeInteger(asset.bytes)||asset.bytes<1)||assets.reduce((size,asset)=>size+asset.bytes,0)>15*1024*1024)throw fail('上传资料总大小不能超过 15 MB',413,'AI_DRAFT_ASSET_INVALID')
  const files=await jobs.materialize({accountId,memberId},ids)
  signal?.throwIfAborted()
  await jobs.scope(accountId,memberId)
  signal?.throwIfAborted()
  const {assetIds:_,...rest}=input
  return {...rest,files:files.map(({name,mimeType,dataUrl})=>({name,mimeType,dataUrl}))}
}
