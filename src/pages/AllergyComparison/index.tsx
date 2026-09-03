import { useParams } from 'react-router-dom'
import { HohoButton, ListSkeleton, StatusNotice } from '../../components/design-system'
import { WebPageHeader } from '../../components/common'
import { useHealthEventDetail } from '../../hooks/useHealthEventDetail'
import { useAppStore } from '../../store/useAppStore'

export function AllergyComparisonPage() {
  const { eventId = '' } = useParams(); const currentMemberId = useAppStore((s) => s.currentMemberId); const { state, retry } = useHealthEventDetail(eventId)
  if (state.status === 'loading') return <main className="app-shell"><WebPageHeader fallback={`/health-tracking/${eventId}`} title="过敏反应对比" /><ListSkeleton /></main>
  if (state.status !== 'success' || state.data.eventDto.memberId !== currentMemberId) return <main className="app-shell"><WebPageHeader fallback="/health-tracking" title="过敏反应对比" /><StatusNotice action={<HohoButton onClick={retry}>重试</HohoButton>} title="反应记录不可用" tone="error">请确认当前孩子后重试。</StatusNotice></main>
  return <main className="app-shell"><WebPageHeader fallback={`/health-tracking/${eventId}`} title="过敏反应对比" /><div className="child-page-stack"><p className="child-page-lead">对比家长观察到的多次反应，不自动断言食物或接触物与反应之间存在因果关系。</p><div className="reaction-comparison">{state.data.records.map((record, index) => { const photos = state.data.attachments.filter((item) => item.recordId === record.id); return <article key={record.id}><header><span>第 {index + 1} 次</span><time>{new Date(record.occurredAt).toLocaleString('zh-CN')}</time></header><p>{record.sourceText || record.content}</p><dl><div><dt>可能相关</dt><dd>{record.structuredData?.exposure?.toString() || '待确认'}</dd></div><div><dt>处理与缓解</dt><dd>{record.structuredData?.relief?.toString() || '按家长原话查看'}</dd></div></dl>{photos.length > 0 && <div className="reaction-photos">{photos.map((photo) => photo.dataUrl && <img alt="家长记录的身体反应" key={photo.id} src={photo.dataUrl} />)}</div>}</article> })}{!state.data.records.length && <StatusNotice title="还没有可比较的反应记录">继续补充同一个健康问题后，可在这里按发生时间比较。</StatusNotice>}</div></div></main>
}
