import { ChevronRight } from 'lucide-react'
import { MainAppHeader } from '../../components/navigation'
import logoUrl from '../../assets/logo.svg'

const appVersion = import.meta.env.VITE_APP_VERSION
const updatedAt = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Shanghai'
}).format(new Date(import.meta.env.VITE_APP_UPDATED_AT))

export function AboutPage() {
  return (
    <main className="app-shell pb-0">
      <MainAppHeader compact title="关于" />
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        <div className="flex w-28 flex-col items-center py-4">
          <img className="h-20 w-20" src={logoUrl} alt="Hoooho Logo" />
          <strong className="hoho-text-page-title mt-2 text-primary">Hoooho</strong>
          <span className="mt-1 text-xs text-text-secondary">v{appVersion}</span>
        </div>
        <section className="w-full border-b p-4">
          <h2 className="text-sm font-medium">家庭健康随记与就诊准备工具</h2>
          <p className="mt-2 text-xs leading-6 text-text-secondary">帮助家庭记录健康随记、整理病情过程，并在就诊前准备清晰信息。</p>
        </section>
        <section className="w-full border-b px-4 py-3" aria-labelledby="about-version-title">
          <h2 className="text-sm font-medium" id="about-version-title">版本信息</h2>
          <dl className="mt-3 grid gap-2 text-xs leading-5">
            <div className="flex items-center justify-between gap-4"><dt className="text-text-secondary">当前版本</dt><dd className="font-medium text-text-primary">v{appVersion}</dd></div>
            <div className="flex items-center justify-between gap-4"><dt className="text-text-secondary">最近更新时间</dt><dd className="font-medium text-text-primary">{updatedAt}</dd></div>
          </dl>
        </section>
        <a className="flex h-16 w-full items-center justify-between border-b px-4 text-left" href="https://github.com/Hoooho-app/hoooho.app/releases" rel="noreferrer" target="_blank">
          <span className="text-sm font-medium">版本说明</span><ChevronRight size={18} className="text-text-secondary" />
        </a>
        {['用户协议', '隐私政策'].map((label) => (
          <button key={label} className="flex h-16 w-full items-center justify-between border-b px-4 text-left last:border-b-0" type="button">
            <span className="text-sm font-medium">{label}</span><ChevronRight size={18} className="text-text-secondary" />
          </button>
        ))}
      </div>
    </main>
  )
}
