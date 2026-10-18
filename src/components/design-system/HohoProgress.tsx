import './HohoProgress.css';
/** Progress of a duration or count, without implying a business outcome. */
export function HohoProgress({ value, max, label, segmented = false, tone = 'primary', className = '' }: {
  value: number; max: number; label: string; segmented?: boolean; tone?: 'primary' | 'sprout'; className?: string;
}) {
  const total = Number.isFinite(max) ? Math.max(1, max) : 1;
  const current = Number.isFinite(value) ? Math.max(0, Math.min(value, total)) : 0;
  if (!segmented || !Number.isInteger(total) || total > 14) return <progress aria-label={label} className={`hoho-progress ${className}`} data-tone={tone} value={current} max={total}/>;
  return <div role="progressbar" aria-label={label} aria-valuenow={current} aria-valuemin={0} aria-valuemax={total} className={`hoho-progress hoho-progress--segments ${className}`} data-tone={tone}>
    {Array.from({ length: total }, (_, i) => <span aria-hidden="true" key={i}><span style={{ width: `${Math.min(1, Math.max(0, current - i)) * 100}%` }}/></span>)}
  </div>;
}
