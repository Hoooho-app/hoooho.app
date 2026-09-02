import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { JsonStore } from '../auth/storage/json-store.mjs'
import { FamilyMemberRepository } from '../members/repositories/family-member-repository.mjs'
import { EventAttachmentRepository } from './repositories/event-attachment-repository.mjs'
import { validateHealthImage } from './image-attachment-policy.mjs'

const draftIdPattern = /^[A-Za-z0-9_-]{8,128}$/
const maxPhotos = 10
const draftTtlMs = 24 * 60 * 60 * 1000

export class QuickRecordPhotoError extends Error {
  constructor(message, status = 400, code = 'QUICK_RECORD_PHOTO_ERROR') {
    super(message)
    this.status = status
    this.code = code
  }
}

const publicPhoto = ({ storageKey: _storageKey, contentHash: _contentHash, accountId: _accountId, ...photo }) => photo

export class QuickRecordPhotoService {
  constructor(options = {}) {
    this.dataDirectory = options.dataDirectory
    this.filesDirectory = path.join(this.dataDirectory, 'quick-record-photo-files')
    this.store = options.store ?? new JsonStore(path.join(this.dataDirectory, 'quick-record-photo-drafts.json'), { photos: [] })
    this.members = options.members ?? new FamilyMemberRepository(this.dataDirectory)
    this.attachments = options.attachments ?? new EventAttachmentRepository(this.dataDirectory)
  }

  assertDraftId(draftId) {
    if (!draftIdPattern.test(draftId)) throw new QuickRecordPhotoError('照片草稿标识无效', 400, 'INVALID_PHOTO_DRAFT_ID')
  }

  async assertMemberOwnership(accountId, memberId) {
    const member = await this.members.findById(memberId)
    if (!member || member.accountId !== accountId) throw new QuickRecordPhotoError('未找到当前人物', 404, 'FAMILY_MEMBER_NOT_FOUND')
  }

  async cleanupExpired(now = new Date()) {
    const threshold = now.getTime() - draftTtlMs
    const expired = []
    await this.store.update((data) => ({
      ...data,
      photos: data.photos.filter((photo) => {
        const remove = new Date(photo.createdAt).getTime() < threshold
        if (remove) expired.push(photo)
        return !remove
      })
    }))
    await Promise.all(expired.map(async (photo) => {
      if (await this.attachments.hasStorageKey(photo.storageKey)) return
      await unlink(path.join(this.filesDirectory, path.basename(photo.storageKey))).catch(() => undefined)
    }))
  }

  async upload(accountId, draftId, input, now = new Date()) {
    this.assertDraftId(draftId)
    const memberId = typeof input?.memberId === 'string' ? input.memberId.trim() : ''
    await this.assertMemberOwnership(accountId, memberId)
    let prepared
    try { prepared = await validateHealthImage(input) } catch (error) {
      throw new QuickRecordPhotoError(error.message, error.status, error.code)
    }
    const id = randomUUID()
    const extension = prepared.mimeType === 'image/png' ? 'png' : prepared.mimeType === 'image/webp' ? 'webp' : 'jpg'
    const storageKey = `${id}.${extension}`
    const buffer = Buffer.from(prepared.dataUrl.slice(prepared.dataUrl.indexOf(',') + 1), 'base64')
    await mkdir(this.filesDirectory, { recursive: true })
    await writeFile(path.join(this.filesDirectory, storageKey), buffer, { flag: 'wx' })
    let saved
    try {
      await this.store.update((data) => {
        const foreignMemberPhoto = data.photos.find((photo) => photo.accountId === accountId && photo.draftId === draftId && photo.memberId !== memberId && !photo.consumedAt)
        if (foreignMemberPhoto) throw new QuickRecordPhotoError('照片草稿不属于当前人物', 404, 'QUICK_RECORD_PHOTO_NOT_FOUND')
        const current = data.photos.filter((photo) => photo.accountId === accountId && photo.draftId === draftId && !photo.consumedAt)
        if (current.length >= maxPhotos) throw new QuickRecordPhotoError('最多上传10张照片', 409, 'PHOTO_LIMIT_EXCEEDED')
        const requestedOrder = Number.isInteger(input?.sortOrder) ? input.sortOrder : current.length
        saved = {
          id, accountId, draftId, memberId, name: prepared.name, mimeType: prepared.mimeType,
          binarySize: prepared.binarySize, width: prepared.width, height: prepared.height,
          sortOrder: Math.max(0, requestedOrder), uploadStatus: 'uploaded', storageKey,
          contentHash: prepared.contentHash, createdAt: now.toISOString(), consumedAt: null
        }
        return { ...data, photos: [...data.photos, saved] }
      })
    } catch (error) {
      await unlink(path.join(this.filesDirectory, storageKey)).catch(() => undefined)
      throw error
    }
    await this.cleanupExpired(now).catch(() => undefined)
    return publicPhoto(saved)
  }

  async list(accountId, memberId, draftId) {
    this.assertDraftId(draftId)
    await this.assertMemberOwnership(accountId, memberId)
    const data = await this.store.read()
    return data.photos.filter((photo) => photo.accountId === accountId && photo.memberId === memberId && photo.draftId === draftId && !photo.consumedAt)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
      .map(publicPhoto)
  }

  async getOwnedPhoto(accountId, memberId, draftId, photoId) {
    this.assertDraftId(draftId)
    await this.assertMemberOwnership(accountId, memberId)
    const data = await this.store.read()
    const photo = data.photos.find((item) => item.id === photoId && item.draftId === draftId && item.accountId === accountId && item.memberId === memberId && !item.consumedAt)
    if (!photo) throw new QuickRecordPhotoError('未找到这张照片', 404, 'QUICK_RECORD_PHOTO_NOT_FOUND')
    return photo
  }

  async read(accountId, memberId, draftId, photoId) {
    const photo = await this.getOwnedPhoto(accountId, memberId, draftId, photoId)
    return { mimeType: photo.mimeType, buffer: await readFile(path.join(this.filesDirectory, path.basename(photo.storageKey))) }
  }

  async delete(accountId, memberId, draftId, photoId) {
    const photo = await this.getOwnedPhoto(accountId, memberId, draftId, photoId)
    await this.store.update((data) => ({ ...data, photos: data.photos.filter((item) => item.id !== photo.id) }))
    if (!(await this.attachments.hasStorageKey(photo.storageKey))) await unlink(path.join(this.filesDirectory, path.basename(photo.storageKey))).catch(() => undefined)
    return { deleted: true }
  }

  async cancel(accountId, memberId, draftId) {
    this.assertDraftId(draftId)
    await this.assertMemberOwnership(accountId, memberId)
    const removed = []
    await this.store.update((data) => ({
      ...data,
      photos: data.photos.filter((photo) => {
        const match = photo.accountId === accountId && photo.memberId === memberId && photo.draftId === draftId && !photo.consumedAt
        if (match) removed.push(photo)
        return !match
      })
    }))
    await Promise.all(removed.map(async (photo) => {
      if (!(await this.attachments.hasStorageKey(photo.storageKey))) await unlink(path.join(this.filesDirectory, path.basename(photo.storageKey))).catch(() => undefined)
    }))
    return { deleted: removed.length }
  }

  async prepareForSave(accountId, memberId, draftId, photoIds) {
    if (!draftId && !photoIds.length) return []
    this.assertDraftId(draftId)
    if (photoIds.length > maxPhotos || new Set(photoIds).size !== photoIds.length) throw new QuickRecordPhotoError('照片列表无效', 400, 'INVALID_PHOTO_LIST')
    const data = await this.store.read()
    const byId = new Map(data.photos.filter((photo) => photo.accountId === accountId && photo.draftId === draftId && !photo.consumedAt).map((photo) => [photo.id, photo]))
    const photos = photoIds.map((id) => byId.get(id))
    if (photos.some((photo) => !photo || photo.memberId !== memberId || photo.uploadStatus !== 'uploaded')) {
      throw new QuickRecordPhotoError('照片尚未全部上传，请重试或删除失败照片', 409, 'PHOTOS_NOT_READY')
    }
    return photos.map((photo, sortOrder) => ({ ...photo, sortOrder }))
  }

  async attach(accountId, eventId, recordId, memberId, photos, now = new Date()) {
    if (!photos.length) return []
    return this.attachments.createFromPhotoDrafts(accountId, eventId, recordId, memberId, photos, now)
  }

  async rollback(photos) {
    if (photos.length) await this.attachments.deleteByDraftPhotoIds(photos.map((photo) => photo.id))
  }

  async consume(accountId, draftId, photos, now = new Date()) {
    if (!photos.length) return
    const ids = new Set(photos.map((photo) => photo.id))
    await this.store.update((data) => ({
      ...data,
      photos: data.photos.map((photo) => photo.accountId === accountId && photo.draftId === draftId && ids.has(photo.id)
        ? { ...photo, consumedAt: now.toISOString() }
        : photo)
    }))
  }
}
