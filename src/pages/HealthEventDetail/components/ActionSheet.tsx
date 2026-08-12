import { ArrowLeft, ChevronRight, ClipboardList, FileText, HelpCircle, ListChecks, MessageCircle, Send, Share2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { BottomSheetSurface, HealthCard, HohoButton, Typography } from '../../../components/design-system'

type ActionCategory = 'hospital' | 'consultation' | 'help'

interface ActionFeature {
  actionLabel: string
  description: string
  id: string
  preview: string[]
  title: string
  icon: LucideIcon
  splitActions?: string[]
}

const categoryContent: Record<ActionCategory, { description: string; label: string; features: ActionFeature[] }> = {
  hospital: {
    label: '去医院',
    description: '为线下就医整理当前健康事件信息，方便挂号、候诊和现场沟通。',
    features: [
      { id: 'registration', title: '挂号前整理', description: '整理症状、既往情况、用药等基础信息。', actionLabel: '生成挂号信息', icon: ClipboardList, preview: ['主要症状与持续时间', '既往情况与当前用药', '需要补充的信息'] },
      { id: 'medical-summary', title: '生成就医摘要', description: '生成就医时间线和关键健康信息摘要。', actionLabel: '生成就医摘要', icon: FileText, preview: ['主要症状', '时间线', '体温与用药', '检查与状态变化'] },
      { id: 'doctor-questions', title: '整理想问医生的问题', description: '根据当前记录整理重点疑问和问题清单。', actionLabel: '生成问题清单', icon: HelpCircle, preview: ['症状持续多久', '哪些变化需要重点说明', '是否还需补充信息'] },
      { id: 'medical-list', title: '检查 / 用药清单', description: '整理当前事件中已经记录的检查和用药情况。', actionLabel: '生成清单', icon: ListChecks, preview: ['检查记录', '用药名称与时间', '待确认内容'] }
    ]
  },
  consultation: {
    label: '在线问诊',
    description: '整理当前健康事件，便于提供给 AI 或在线医生进行咨询。',
    features: [
      { id: 'consult-summary', title: '生成问诊摘要', description: '整理症状、时间线、体温、用药和重要变化。', actionLabel: '生成问诊摘要', icon: MessageCircle, preview: ['症状概况', '关键时间线', '体温与用药', '重要变化'] },
      { id: 'timeline-summary', title: '整理症状与时间线', description: '按时间顺序整理当前健康事件的关键变化。', actionLabel: '生成整理内容', icon: ClipboardList, preview: ['发生时间', '症状变化', '处理记录'] },
      { id: 'consult-questions', title: '整理想问的问题', description: '整理适合在线咨询时提出的问题。', actionLabel: '生成问题清单', icon: HelpCircle, preview: ['当前最担心的问题', '希望进一步了解的内容'] },
      { id: 'copy-export', title: '复制文字 / 导出 PDF', description: '将整理后的内容复制或导出，方便发送和保存。', actionLabel: '复制文字', splitActions: ['复制文字', '导出 PDF'], icon: Share2, preview: ['问诊摘要预览', '文字与 PDF 输出'] }
    ]
  },
  help: {
    label: '求助',
    description: '快速整理关键信息，方便向家人、朋友或其他人求助。',
    features: [
      { id: 'help-summary', title: '生成求助摘要', description: '整理当前健康事件的关键情况。', actionLabel: '生成求助摘要', icon: FileText, preview: ['发生了什么', '当前状态', '需要什么帮助'] },
      { id: 'help-poster', title: '生成求助海报', description: '将关键信息整理成便于转发的图文形式。', actionLabel: '生成求助海报', icon: Send, preview: ['关键信息卡片', '适合分享的图文布局'] },
      { id: 'key-information', title: '整理关键信息', description: '提炼当前事件中最重要的信息。', actionLabel: '整理关键信息', icon: ListChecks, preview: ['重要时间', '主要症状', '当前处理'] },
      { id: 'share-contact', title: '分享给家人 / 朋友', description: '将整理后的内容发送给指定联系人。', actionLabel: '分享', icon: Share2, preview: ['选择联系人', '分享内容预览'] }
    ]
  }
}

interface ActionSheetProps {
  onClose: () => void
  onComingSoon: () => void
  open: boolean
}

export function ActionSheet({ onClose, onComingSoon, open }: ActionSheetProps) {
  const [category, setCategory] = useState<ActionCategory>('hospital')
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const current = categoryContent[category]
  const selectedFeature = current.features.find((feature) => feature.id === selectedFeatureId) ?? null

  const selectCategory = (next: ActionCategory) => {
    setCategory(next)
    setSelectedFeatureId(null)
  }

  return (
    <BottomSheetSurface label="行动" onClose={onClose} open={open} title="行动" footer={selectedFeature && (
      <div className="grid gap-2">
        {(selectedFeature.splitActions ?? [selectedFeature.actionLabel]).map((label) => (
          <HohoButton fullWidth key={label} onClick={onComingSoon} variant={label === selectedFeature.actionLabel ? 'primary' : 'secondary'}>{label}</HohoButton>
        ))}
      </div>
    )}>
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="行动分类">
        {(Object.keys(categoryContent) as ActionCategory[]).map((key) => (
          <button aria-selected={category === key} className="health-action-tab" data-selected={category === key} key={key} onClick={() => selectCategory(key)} role="tab" type="button">
            {categoryContent[key].label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {selectedFeature ? (
          <div>
            <button className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary" onClick={() => setSelectedFeatureId(null)} type="button">
              <ArrowLeft size={17} />返回
            </button>
            <Typography className="mt-2" variant="sectionTitle">{selectedFeature.title}</Typography>
            <Typography className="mt-2" variant="body">{selectedFeature.description}</Typography>
            <HealthCard className="mt-5 shadow-none">
              <Typography variant="label">内容预览</Typography>
              <ul className="mt-3 grid gap-3">
                {selectedFeature.preview.map((item) => <li className="flex items-center gap-2 text-sm text-text-secondary" key={item}><span className="h-1.5 w-1.5 rounded-full bg-primary" />{item}</li>)}
              </ul>
            </HealthCard>
          </div>
        ) : (
          <div>
            <Typography variant="body">{current.description}</Typography>
            <div className="mt-4 overflow-hidden rounded-card border bg-surface">
              {current.features.map((feature) => {
                const Icon = feature.icon
                return (
                  <button className="hoho-surface-row" key={feature.id} onClick={() => setSelectedFeatureId(feature.id)} type="button">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon size={19} strokeWidth={1.8} /></span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{feature.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-text-secondary">{feature.description}</span>
                    </span>
                    <ChevronRight className="shrink-0 text-text-secondary" size={19} />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </BottomSheetSurface>
  )
}
