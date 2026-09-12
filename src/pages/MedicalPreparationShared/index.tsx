import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { StatusNotice } from '../../components/design-system'
import { VisitSummaryContent } from '../VisitSummary'
import { healthEventService } from '../../services/healthEvents'
import type { MedicalPreparationApiDto } from '../../types'
import './medicalPreparationShared.css'

export function MedicalPreparationSharedPage() {
  const { shareToken = '' } = useParams()
  const [state, setState] = useState<{ status: 'loading' } | { status: 'success'; data: MedicalPreparationApiDto } | { status: 'error' }>({ status: 'loading' })
  useEffect(() => { const controller = new AbortController(); healthEventService.getSharedMedicalPreparation(shareToken, controller.signal).then((data) => setState({ status: 'success', data })).catch(() => { if (!controller.signal.aborted) setState({ status: 'error' }) }); return () => controller.abort() }, [shareToken])
  return <main className="app-shell medical-preparation-shared"><div className="medical-preparation-shared__banner">Hoooho 只读情况单 · 分享版本不会自动更新</div><header className="medical-preparation-shared__header"><strong>{state.status === 'success' ? `${state.data.summary.memberName}的情况单` : '就诊情况单'}</strong></header><div className="medical-preparation-shared__body">
      {state.status === 'loading' ? <StatusNotice title="正在打开就诊情况单">请稍候…</StatusNotice>
        : state.status === 'error' ? <StatusNotice title="这份情况单链接已失效" tone="error">请联系分享者重新分享。</StatusNotice>
          : <VisitSummaryContent preparation={state.data} readOnly />}
    </div>
  </main>
}
