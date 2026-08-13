import type { EventAttachmentApiDto, ImageAnalysisCategory } from '../types'

const titleByCategory: Record<ImageAnalysisCategory, string> = {
  temperature: '体温记录',
  report: '检查结果',
  medication: '用药记录',
  prescription: '处方记录',
  receipt: '就诊单据',
  body_photo: '身体照片',
  other: '图片记录'
}

export function getImageRecordTitle(attachments: readonly EventAttachmentApiDto[]) {
  const completed = attachments.find((attachment) => attachment.analysis?.status === 'completed')
  return completed ? titleByCategory[completed.analysis!.category] : '图片记录'
}

export function getImageRecordSummary(attachments: readonly EventAttachmentApiDto[]) {
  const summaries = attachments
    .map((attachment) => attachment.analysis?.summary?.trim())
    .filter((summary): summary is string => Boolean(summary && summary !== '图片记录'))
  return [...new Set(summaries)].slice(0, 2).join('；') || null
}

export function isLegacyAttachmentTitle(title: string) {
  return title === '健康附件' || title === '待补充健康情况'
}
