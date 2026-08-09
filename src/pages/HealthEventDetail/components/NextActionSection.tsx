import { HeartHandshake, ImagePlus, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { HealthEventStatus } from '../../../types'
import { Button, Card } from '../../../components/common'

interface NextActionSectionProps {
  status: HealthEventStatus
  onMarkRecovered?: () => void | Promise<void>
}

export function NextActionSection({ status, onMarkRecovered }: NextActionSectionProps) {
  const navigate = useNavigate()

  if (status === 'empty') return null

  if (status === 'ongoing') {
    return (
      <section className="space-y-3">
        <h2 className="section-title">下一步行动</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="text-center">
            <HeartHandshake className="mx-auto text-primary" size={25} />
            <h3 className="mt-3 font-semibold">报平安</h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">告诉家人当前情况</p>
            <span className="mt-3 inline-flex rounded-pill bg-background px-2 py-1 text-[11px] text-text-secondary">后续开放</span>
          </Card>
          <Card className="text-center">
            <ImagePlus className="mx-auto text-primary" size={25} />
            <h3 className="mt-3 font-semibold">生成求助海报</h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">整理关键信息</p>
            <span className="mt-3 inline-flex rounded-pill bg-background px-2 py-1 text-[11px] text-text-secondary">后续开放</span>
          </Card>
        </div>
        <Button variant="secondary" fullWidth onClick={() => void onMarkRecovered?.()}>标记为已恢复</Button>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="section-title">下一步</h2>
      <Card>
        <Button fullWidth onClick={() => navigate('/health-events')}><ShieldCheck size={17} />继续管理健康</Button>
      </Card>
    </section>
  )
}
