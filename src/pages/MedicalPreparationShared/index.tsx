import { FileHeart, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { StatusNotice } from '../../components/design-system'
import { SummaryDocument, formatUpdatedAt } from '../HealthEvents/NurseNextAction'
import { healthEventService } from '../../services/healthEvents'
import type { MedicalPreparationApiDto } from '../../types'
import './medicalPreparationShared.css'

export function MedicalPreparationSharedPage() {
  const { shareToken = '' } = useParams()
  const [state, setState] = useState<{ status: 'loading' } | { status: 'success'; data: MedicalPreparationApiDto } | { status: 'error' }>({ status: 'loading' })
  useEffect(() => { const controller = new AbortController(); healthEventService.getSharedMedicalPreparation(shareToken, controller.signal).then((data) => setState({ status: 'success', data })).catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) }); return () => controller.abort() }, [shareToken])
  return <main className="app-shell medical-preparation-shared"><MainAppHeader title="就诊情况单" />
    <div className="medical-preparation-shared__body">
      {state.status === 'loading' ? <StatusNotice title="正在打开就诊情况单">请稍候…</StatusNotice>
        : state.status === 'error' ? <StatusNotice title="这份情况单链接已失效" tone="error">请联系分享者重新分享。</StatusNotice>
          : <><header><FileHeart /><div><strong>{state.data.summary.memberName}的就诊情况单</strong><span>固定版本 v{state.data.version} · 资料截至 {formatUpdatedAt(state.data.updatedAt)}</span></div></header><SummaryDocument summary={state.data.summary} /><p><ShieldCheck />只读快照，请注意保护健康信息。</p></>}
    </div>
  </main>
}
