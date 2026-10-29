export type NativeAttachmentResult = {files: File[]; origin: 'capture' | 'library'}
export type NativeAttachmentOptions = {mediaOnly?: boolean}
type NativeAttachmentPicker = ((options?: NativeAttachmentOptions) => Promise<NativeAttachmentResult>) & {supportsMediaOnly?: boolean}

declare global {
  interface Window { hooohoNativeAttachments?: NativeAttachmentPicker }
}

/** Absent in Safari and older containers: the caller opens its normal file input. */
export function nativeAttachmentPicker(options?: NativeAttachmentOptions) {
  const picker = window.hooohoNativeAttachments
  if (typeof picker !== 'function' || (options?.mediaOnly && !picker.supportsMediaOnly)) return undefined
  return picker
}
