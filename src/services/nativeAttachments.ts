export type NativeAttachmentResult = {files: File[]; origin: 'capture' | 'library'}

declare global {
  interface Window { hooohoNativeAttachments?: () => Promise<NativeAttachmentResult> }
}

/** Absent in Safari and older containers: the caller opens its normal file input. */
export function nativeAttachmentPicker() {
  return typeof window.hooohoNativeAttachments === 'function' ? window.hooohoNativeAttachments : undefined
}
