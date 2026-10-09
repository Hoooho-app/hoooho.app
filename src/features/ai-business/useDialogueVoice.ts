import { useEffect, useState } from 'react'
import { captureDraft } from './captureDraft'
import { useSmartRecordVoice } from './useSmartRecordVoice'
import { localDateTimeValue } from '../../utils/healthOccurredAt'

export function useDialogueVoice(key: string, token: string, onTranscript: (text: string) => Promise<void>) {
  const [pendingVoice, setPendingVoice] = useState<File>()
  const [storageError, setStorageError] = useState('')
  useEffect(() => { let active = true; void captureDraft(key).then(saved => { if (active) setPendingVoice(saved?.pendingVoice) }).catch(() => { if (active) setStorageError('刚才的录音没有恢复，请再试一次。') }); return () => { active = false } }, [key])
  const voice = useSmartRecordVoice({ memberId: '', token, pendingVoice, onRecorded: async file => {
    await captureDraft(key, { text: '', files: [file], pendingVoice: file, occurredAt: localDateTimeValue(), timeUnknown: false, requestId: crypto.randomUUID() })
    setPendingVoice(file)
  }, onTranscript: async text => { await onTranscript(text); await captureDraft(key, null); setPendingVoice(undefined) } })
  return { ...voice, error: voice.error || storageError, pendingVoice }
}
