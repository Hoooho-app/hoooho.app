import { ArrowLeft, House } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, HohoButton } from '../../components/design-system'

export function NotFoundPage() {
  const navigate = useNavigate()
  return <main className="app-shell grid place-items-center px-5 pb-0">
    <EmptyState
      action={<div className="flex flex-wrap justify-center gap-2"><HohoButton variant="secondary" onClick={() => navigate(-1)}><ArrowLeft size={17} />返回上一页</HohoButton><HohoButton onClick={() => navigate('/health-events')}><House size={17} />回到健康随记</HohoButton></div>}
      description="链接可能已失效，或页面已经移动。你的健康记录不会因此受到影响。"
      title="没有找到这个页面"
    />
  </main>
}
