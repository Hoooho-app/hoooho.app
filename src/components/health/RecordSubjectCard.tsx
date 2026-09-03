import type { ReactNode } from 'react'
import { Avatar } from '../common'

interface RecordSubjectCardProps {
  action?: ReactNode
  age?: string
  avatarSize?: 'sm' | 'md' | 'lg' | 'xl'
  expanded?: boolean
  avatar?: string
  className?: string
  gender?: string
  label?: string
  name: string
  onClick?: () => void
}

export function RecordSubjectCard({
  action,
  age,
  avatar,
  avatarSize = 'sm',
  className = '',
  expanded,
  gender,
  label = '记录对象',
  name,
  onClick,
}: RecordSubjectCardProps) {
  const meta = [gender, age].filter(Boolean).join(' · ')
  const content = (
    <>
      <Avatar name={name} src={avatar} size={avatarSize} />
      <span className="min-w-0 flex-1">
        <span className="hoho-text-caption block truncate text-text-secondary">{label}</span>
        <span className="mt-0.5 block min-w-0 truncate leading-5">
          <strong className="text-[15px] font-semibold">{name}</strong>
          {meta && <span className="text-sm text-text-secondary">　{meta}</span>}
        </span>
      </span>
      {action && <span className="flex shrink-0 items-center">{action}</span>}
    </>
  )
  const classes = `record-subject-card flex min-h-[64px] min-w-0 items-center gap-3 rounded-card border bg-surface px-4 py-2.5 text-left ${className}`

  if (onClick) {
    return <button aria-expanded={expanded} aria-label={`${label}：${name}`} className={`${classes} w-full transition hover:bg-primary-soft/40`} onClick={onClick} type="button">{content}</button>
  }

  return <div aria-label={label} className={classes}>{content}</div>
}
