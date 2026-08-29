export type DevicePermissionKind = 'camera' | 'microphone' | 'files'
export type DevicePermissionStatus = 'checking' | 'granted' | 'denied' | 'prompt' | 'unsupported'

export function mapBrowserPermissionState(value: PermissionState | string): DevicePermissionStatus {
  if (value === 'granted' || value === 'denied' || value === 'prompt') return value
  return 'unsupported'
}

export const permissionStatusLabels: Record<DevicePermissionStatus, string> = {
  checking: '正在查询',
  denied: '未允许',
  granted: '已允许',
  prompt: '需要询问',
  unsupported: '当前浏览器不支持查询'
}
