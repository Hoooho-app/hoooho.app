import { createHash } from 'node:crypto'
import { validateHealthImage } from './image-attachment-policy.mjs'

// Videos are retained as original evidence. This does not extract health facts.
export async function validateRecordMedia(input) {
  if (!String(input?.mimeType).startsWith('video/')) return validateHealthImage(input)
  const mimeType = input.mimeType.toLowerCase()
  const fail = (message, status = 415) => { throw Object.assign(new Error(message), { status, code: 'INVALID_RECORD_VIDEO' }) }
  if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(mimeType)) fail('视频仅支持 MP4、MOV 或 WebM')
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 160) : ''
  if (!name) fail('附件名称不能为空', 400)
  const prefix = `data:${mimeType};base64,`
  if (typeof input.dataUrl !== 'string' || !input.dataUrl.startsWith(prefix)) fail('视频内容格式错误', 400)
  const encoded = input.dataUrl.slice(prefix.length)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4) fail('视频内容格式错误', 400)
  const buffer = Buffer.from(encoded, 'base64')
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) fail('单个视频不能超过 5MB', 413)
  if (mimeType === 'video/webm') {
    if (!buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) || !buffer.subarray(0, 4096).includes(Buffer.from('webm'))) fail('视频格式与文件内容不一致')
  } else {
    const boxes = new Set()
    for (let offset = 0; offset + 8 <= buffer.length;) {
      let size = buffer.readUInt32BE(offset)
      const type = buffer.toString('ascii', offset + 4, offset + 8)
      let headerSize = 8
      if (size === 1) {
        if (offset + 16 > buffer.length) fail('视频文件损坏')
        const extended = buffer.readBigUInt64BE(offset + 8)
        if (extended > BigInt(buffer.length - offset)) fail('视频文件损坏')
        size = Number(extended); headerSize = 16
      }
      if (size !== 0 && (size < headerSize || offset + size > buffer.length)) fail('视频文件损坏')
      if (type === 'ftyp') {
        if (size < headerSize + 8) fail('视频文件损坏')
        const quicktime = buffer.toString('ascii', offset + headerSize, offset + headerSize + 4) === 'qt  '
        if ((mimeType === 'video/quicktime') !== quicktime) fail('视频格式与文件内容不一致')
      }
      boxes.add(type)
      offset += size || buffer.length - offset
    }
    if (!boxes.has('ftyp') || !boxes.has('moov') || !boxes.has('mdat')) fail('视频格式与文件内容不一致')
  }
  return { name, mimeType, dataUrl: input.dataUrl, binarySize: buffer.length, width: null, height: null, contentHash: createHash('sha256').update(buffer).digest('hex') }
}
