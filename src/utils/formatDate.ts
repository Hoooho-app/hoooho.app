import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export function formatHealthDate(value: string) {
  return format(new Date(value), 'yyyy年M月d日 HH:mm', { locale: zhCN })
}
