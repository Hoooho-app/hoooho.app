import { CirclePlus } from 'lucide-react'
import type { PersonalizedHealthModule } from '../../../services/healthEventPersonalization'
import { Card } from '../../../components/common'

export function PersonalizedModulesSection({ modules }: { modules: PersonalizedHealthModule[] }) {
  if (!modules.length) return null

  return (
    <section className="space-y-3">
      <div>
        <h2 className="section-title">推荐补充信息</h2>
        <p className="mt-1 text-xs text-text-secondary">根据当前记录对象推荐，可按需补充</p>
      </div>
      <Card className="divide-y p-0">
        {modules.map((module) => (
          <div className="flex min-h-16 w-full items-center gap-3 px-4" key={module.id}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><CirclePlus size={17} /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm">{module.title}</strong><span className="mt-1 block truncate text-xs text-text-secondary">{module.description}</span></span>
            <span className="shrink-0 rounded-pill bg-background px-2 py-1 text-[11px] text-text-secondary">后续开放</span>
          </div>
        ))}
      </Card>
    </section>
  )
}
