import { useEffect } from 'react'
import { getCareRootAttributes } from '../../features/settings/preferences'
import { useSettingsStore } from '../../store/useSettingsStore'

export function SettingsEffects() {
  const care = useSettingsStore((state) => state.care)

  useEffect(() => {
    const root = document.documentElement
    const attributes = getCareRootAttributes(care)
    root.lang = 'zh-CN'
    root.dataset.careMode = attributes.careMode
    root.dataset.careContrast = attributes.careContrast
    root.dataset.careHints = attributes.careHints
    root.dataset.careMotion = attributes.careMotion
    root.dataset.carePlain = attributes.carePlain
    root.dataset.careSimplify = attributes.careSimplify
    root.dataset.careTargets = attributes.careTargets
    root.dataset.careTerms = attributes.careTerms
    root.dataset.careText = attributes.careText
  }, [care])

  return null
}
