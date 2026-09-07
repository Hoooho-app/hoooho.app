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
  return <main className="app-shell medical-preparation-shared"><MainAppHeader title="病情摘要" />
    <div className="medical-preparation-shared__body">
      {state.status === 'loading' ? <StatusNotice title="正在打开病情摘要">请稍候…</StatusNotice>
        : state.status === 'error' ? <StatusNotice title="病情摘要不可用" tone="error">私密链接不存在或已失效。</StatusNotice>
          : <><header><FileHeart /><div><strong>{state.data.summary.memberName}的病情摘要</strong><span>最后更新：{formatUpdatedAt(state.data.updatedAt)} · 第 {state.data.version} 版</span></div></header><SummaryDocument summary={state.data.summary} /><p><ShieldCheck />此页面通过私密链接查看，请注意保护健康信息。</p></>}
    </div>
  </main>
}
