import { ChevronRight } from 'lucide-react'
import { WebPageHeader } from '../../components/common'
import logoUrl from '../../assets/logo.svg'

export function AboutPage() {
  return (
    <main className="app-shell pb-0">
      <WebPageHeader title="关于" fallback="/health-events" />
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        <div className="flex w-28 flex-col items-center py-4">
          <img className="h-20 w-20" src={logoUrl} alt="Hoooho Logo" />
          <strong className="hoho-text-page-title mt-2 text-primary">Hoooho</strong>
          <span className="mt-1 text-xs text-text-secondary">v1.0.0</span>
        </div>
        <section className="w-full border-b p-4">
          <h2 className="text-sm font-medium">家庭健康事件管理与就诊准备工具</h2>
          <p className="mt-2 text-xs leading-6 text-text-secondary">帮助家庭记录健康事件、整理病情过程，并在就诊前准备清晰信息。</p>
        </section>
        {['用户协议', '隐私政策'].map((label) => (
          <button key={label} className="flex h-16 w-full items-center justify-between border-b px-4 text-left last:border-b-0" type="button">
            <span className="text-sm font-medium">{label}</span><ChevronRight size={18} className="text-text-secondary" />
          </button>
        ))}
      </div>
    </main>
  )
}
