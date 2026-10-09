import { useEffect, useState } from 'react'
import { captureDraft } from './captureDraft'
import { useSmartRecordVoice } from './useSmartRecordVoice'
import { localDateTimeValue } from '../../utils/healthOccurredAt'

export function useDialogueVoice(key: string, token: string, onTranscript: (text: string,recordingId:string) => Promise<void>) {
  const [pendingVoice, setPendingVoice] = useState<File>()
  const [pendingTranscript,setPendingTranscript]=useState<string>()
  const [storageError, setStorageError] = useState('')
  useEffect(() => { let active = true; void captureDraft(key).then(saved => { if (active){setPendingVoice(saved?.pendingVoice);setPendingTranscript(saved?.voiceTranscript)} }).catch(() => { if (active) setStorageError('刚才的录音没有恢复，请再试一次。') }); return () => { active = false } }, [key])
  const retained=(file:File,voiceTranscript?:string)=>({text:'',files:[file],pendingVoice:file,voiceTranscript,occurredAt:localDateTimeValue(),timeUnknown:false,requestId:`voice:${file.name}:${file.lastModified}`})
  const voice = useSmartRecordVoice({ memberId: '', token, pendingVoice,pendingTranscript, onRecorded: async file => {
    await captureDraft(key, { text: '', files: [file], pendingVoice: file, occurredAt: localDateTimeValue(), timeUnknown: false, requestId: crypto.randomUUID() })
    setPendingVoice(file)
    setPendingTranscript(undefined);setStorageError('')
  }, onTranscript: async (text,file) => {await captureDraft(key,retained(file,text));setPendingTranscript(text);await onTranscript(text,`voice:${file.name}:${file.lastModified}`);await captureDraft(key,null);setPendingVoice(undefined);setPendingTranscript(undefined)} })
  return { ...voice, error: voice.error || storageError, pendingVoice,discardPending:async()=>{await captureDraft(key,null);setPendingVoice(undefined);setPendingTranscript(undefined);setStorageError('');voice.clearError()} }
}
