import { FileText, HeartHandshake, ImagePlus, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { HealthEventStatus } from '../../../types'
import { Button, Card } from '../../../components/common'

export function NextActionSection({ status }: { status: HealthEventStatus }) {
  const navigate = useNavigate()

  if (status === 'empty') return null

  if (status === 'ongoing') {
    return (
      <section className="space-y-3">
        <h2 className="section-title">下一步行动</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card interactive className="text-center">
            <HeartHandshake className="mx-auto text-primary" size={25} />
            <h3 className="mt-3 font-semibold">报平安</h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">告诉家人当前情况</p>
          </Card>
          <Card interactive className="text-center">
            <ImagePlus className="mx-auto text-primary" size={25} />
            <h3 className="mt-3 font-semibold">生成求助海报</h3>
            <p className="mt-1 text-xs leading-5 text-text-secondary">整理关键信息</p>
          </Card>
        </div>
        <Button variant="secondary" fullWidth onClick={() => navigate('/health-events/event-recovered')}>标记为已恢复</Button>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h2 className="section-title">下一步</h2>
      <Card className="space-y-3">
        <Button variant="secondary" fullWidth><FileText size={17} />查看完整记录</Button>
        <Button fullWidth onClick={() => navigate('/health-events')}><ShieldCheck size={17} />继续管理健康</Button>
      </Card>
    </section>
  )
}
