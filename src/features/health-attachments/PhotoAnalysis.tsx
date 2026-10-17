import { useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import type { SmartRecordItem } from '../ai-business/smartRecordTypes'
import { analyzePhotos, discardPhotoAnalysis, sourcedPhotoFields, type PhotoAnalysisStage } from './photoAnalysis'
import fieldLabels from '../../../shared/ai-business-field-labels.json'

const stageLabels = { preparing: '正在处理图片…', uploading: '正在上传图片…', analyzing: '正在识别图片…' }
const fileIdentities = new WeakMap<File, number>()
let nextFileIdentity = 0
function fileIdentity(file: File) {
  if (!fileIdentities.has(file)) fileIdentities.set(file, ++nextFileIdentity)
  return fileIdentities.get(file)
}
export function PhotoAnalysis({ files, memberId, token, fields, onApply }: { files: File[]; memberId: string; token: string; fields: string[]; onApply: (items: SmartRecordItem[]) => void }) {
  const [state, setState] = useState<PhotoAnalysisStage | 'ready' | 'failed' | 'applied'>('preparing')
  const [items, setItems] = useState<SmartRecordItem[]>([])
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const identity = files.map(fileIdentity).join('|')
  const filesRef = useRef(files); filesRef.current = files
  useEffect(() => {
    if (!filesRef.current.length) return
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('图片识别超时，请重试；图片仍保留')), 180000)
    let jobId: string | undefined, active = true
    setItems([]); setError(''); setState('preparing')
    void analyzePhotos(memberId, token, filesRef.current, controller.signal, stage => { if (active) setState(stage) }, id => { jobId = id }).then(next => { if (active) { setItems(next); setState('ready') } }).catch(cause => { if (active) { setError(cause instanceof Error ? cause.message : '图片识别未完成，请重试'); setState('failed') } }).finally(() => { clearTimeout(timeout); discardPhotoAnalysis(memberId, token, jobId) })
    return () => { active = false; clearTimeout(timeout); controller.abort(); discardPhotoAnalysis(memberId, token, jobId) }
  }, [identity, memberId, token, retry])
  if (!files.length) return null
  const candidates = sourcedPhotoFields(items, fields)
  return <section aria-label="图片识别" className="grid gap-2" aria-live="polite">
    {state in stageLabels && <p role="status">{stageLabels[state as PhotoAnalysisStage]}</p>}
    {state === 'failed' && <><p role="alert">{error}</p><HohoButton type="button" variant="text" onClick={() => setRetry(value => value + 1)}>重试图片识别</HohoButton></>}
    {state === 'ready' && <>
      <p>{candidates.length ? '识别结果待核对' : '未识别到可采用的内容，请按原图手动填写'}</p>
      {items.filter(item=>sourcedPhotoFields([item],fields).length>0).map(item=><div key={item.id} className="grid gap-2">
        {sourcedPhotoFields([item],fields).map((field,index)=><p key={`${field.name}:${index}`}>{(fieldLabels as Record<string,string>)[field.name]??field.name}：{field.value}<small className="block text-text-secondary">原文：{field.sources.map(source=>source.quote).join('；')}</small></p>)}
        <HohoButton type="button" variant="secondary" onClick={()=>{onApply([item]);setState('applied')}}>已核对，采用识别结果</HohoButton>
      </div>)}
    </>}
    {state === 'applied' && <p role="status">已采用，请核对后保存</p>}
  </section>
}
