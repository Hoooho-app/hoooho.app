import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { WebPageHeader } from '../../components/common'
import { HohoSurfaceRow } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'

const appVersion = import.meta.env.VITE_APP_VERSION
const updatedAt = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Shanghai'
}).format(new Date(import.meta.env.VITE_APP_UPDATED_AT))

const entries = [
  { id: 'updates', label: '更新记录' },
  { id: 'terms', label: '用户协议' },
  { id: 'privacy', label: '隐私政策' },
  { id: 'children', label: '儿童信息保护' },
  { id: 'boundaries', label: '产品边界' },
  { id: 'permissions', label: '数据与权限' },
  { id: 'legal', label: '版权与法律声明' },
  { id: 'business', label: '商业合作' }
] as const

// Keep each published version here; future releases must preserve earlier entries.
const releases = [{
  version: '1.0.0',
  date: '2026年10月9日',
  changes: [
    '关于页使用英文文字标识，更新过敏人群的产品介绍。',
    '整理协议、儿童信息保护、产品边界、数据与权限及版权相关入口。',
    '更新记录改为应用内查看，商业合作使用独立入口。'
  ]
}]

const pendingCopy: Record<string, string> = {
  terms: '用户协议正在整理，正式文本发布后将在这里展示。',
  privacy: '隐私政策正在整理，正式文本发布后将在这里展示。',
  children: '儿童信息保护内容正在整理，正式文本发布后将在这里展示。',
  boundaries: '产品边界说明正在整理，正式文本发布后将在这里展示。',
  permissions: '数据处理与权限使用说明正在整理，正式文本发布后将在这里展示。',
  legal: '版权与法律声明正在整理，正式文本发布后将在这里展示。',
  business: '商业合作联系方式正在整理，发布后将在这里展示。'
}

export function AboutPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeEntry = entries.find((entry) => entry.id === searchParams.get('section'))

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [activeEntry?.id])

  if (activeEntry) {
    return (
      <main className="app-shell pb-0">
        <WebPageHeader title={activeEntry.label} fallback="/about" />
        <div className="px-4 py-6">
          {activeEntry.id === 'updates' ? (
            <>
              <p className="hoho-text-caption mb-6">当前版本 v{appVersion} · 本次构建更新于 {updatedAt}</p>
              {releases.map((release) => (
                <section key={release.version} className="mb-6" aria-label={`v${release.version} 更新内容`}>
                  <h2 className="hoho-text-section-title">v{release.version}</h2>
                  <p className="hoho-text-caption mt-2">{release.date} · 正式版本起点</p>
                  <ul className="hoho-text-body mt-4 list-disc space-y-3 pl-5">
                    {release.changes.map((change) => <li key={change}>{change}</li>)}
                  </ul>
                </section>
              ))}
            </>
          ) : (
            <p className="hoho-text-body leading-7 text-text-secondary">{pendingCopy[activeEntry.id]}</p>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell pb-0">
      <MainAppHeader compact title="关于" />
      <div className="settings-content">
        <section className="flex flex-col items-center px-4 py-6 text-center" aria-label="产品介绍">
          <strong className="hoho-text-page-title text-primary">HOO</strong>
          <span className="hoho-text-caption mt-2">v{appVersion}</span>
          <p className="hoho-text-body mt-4 leading-7 text-text-secondary">帮助过敏人群及其家庭，记录日常变化、整理过敏相关信息，做好就医准备。</p>
        </section>
        <section className="settings-list" aria-label="关于页入口">
          {entries.map((entry) => (
            <HohoSurfaceRow key={entry.id} title={entry.label} onActivate={() => setSearchParams({ section: entry.id })} />
          ))}
        </section>
      </div>
    </main>
  )
}
