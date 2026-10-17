import { fail } from './business/contract.mjs'

// Use the already private, validated quick-record original. The browser sends
// identifiers only; filesystem paths, cross-account photos and consumed drafts
// are never accepted. Recognition stores its own immutable, scoped checkpoint.
export async function reuseRecognitionPhoto(jobs,photos,accountId,memberId,input,signal) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['quickRecordDraftId','photoId'].includes(key))||typeof input.quickRecordDraftId!=='string'||typeof input.photoId!=='string'||input.photoId.length>128)throw fail('已上传图片引用无效',422,'RECOGNITION_ASSET_INVALID')
  signal?.throwIfAborted()
  await jobs.scope(accountId,memberId)
  const photo=await photos.getOwnedPhoto(accountId,memberId,input.quickRecordDraftId,input.photoId)
  if(photo.uploadStatus!=='uploaded'||!['image/jpeg','image/png','image/webp'].includes(photo.mimeType))throw fail('这份原件暂不能用于图片识别',422,'RECOGNITION_ASSET_INVALID')
  const original=await photos.read(accountId,memberId,input.quickRecordDraftId,input.photoId)
  signal?.throwIfAborted()
  // Recheck the source after reading too; deletion/consumption cannot turn a
  // stale reference into a new recognition asset.
  await photos.getOwnedPhoto(accountId,memberId,input.quickRecordDraftId,input.photoId)
  return jobs.upload(accountId,memberId,{...original,name:photo.name,lastModified:Date.parse(photo.createdAt)||0},{signal,beforeCommit:async()=>{signal?.throwIfAborted();await photos.getOwnedPhoto(accountId,memberId,input.quickRecordDraftId,input.photoId);signal?.throwIfAborted()}})
}
