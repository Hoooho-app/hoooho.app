export interface FeedbackDeviceInfo { type: 'mobile' | 'desktop' | 'tablet' | 'unknown'; os: string; browser: string; screen: string }

export function collectFeedbackDevice(): FeedbackDeviceInfo {
  const ua = navigator.userAgent
  const type = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobile|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop'
  const os = /iPhone|iPad/i.test(ua) ? 'iOS/iPadOS' : /Android/i.test(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '未知'
  const browser = /Edg\//i.test(ua) ? 'Edge' : /CriOS|Chrome\//i.test(ua) ? 'Chrome' : /FxiOS|Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : '未知'
  return { type, os, browser, screen: `${window.screen.width}×${window.screen.height}` }
}

export const appVersion = String(import.meta.env.VITE_APP_VERSION ?? 'web')
