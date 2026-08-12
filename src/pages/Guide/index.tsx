import { WebPageHeader } from '../../components/common'
import { HohoSection } from '../../components/design-system'

const guideCards = [
  ['快速开始', '选择记录对象后创建健康事件，持续补充症状与时间线。'],
  ['整理就诊信息', '在事件详情中补充体温、附件和担心的问题。'],
  ['管理家庭健康', '切换家庭成员后，数据会归属于当前成员。'],
  ['重要说明', 'Hoooho 用于健康信息记录与就诊准备，不提供医疗诊断。']
]

export function UsageGuidePage() {
  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="使用说明" fallback="/health-events" />
      <div className="space-y-6 px-4 py-5">
        {guideCards.map(([title, description]) => (
          <HohoSection description={description} key={title} title={title}><div className="h-px bg-border" /></HohoSection>
        ))}
      </div>
    </main>
  )
}
