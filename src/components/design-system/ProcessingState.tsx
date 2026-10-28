import { Check, LoaderCircle } from '../icons'
import './ProcessingState.css'

/** A real workflow stage; progress counts completed work units, never elapsed time. */
export function ProcessingState({ title, steps, step, progress }: { title: string; steps: string[]; step: number; progress?: { completed: number; total: number } }) {
  const value = progress && progress.total > 0 ? Math.min(100, Math.max(0, progress.completed / progress.total * 100)) : undefined
  return <section className="hoho-processing-state" role="status" aria-live="polite" aria-busy="true">
    <LoaderCircle className="hoho-processing-state__spinner" size={32} aria-hidden="true" />
    <h2 className="hoho-text-section-title">{title}</h2><p className="hoho-text-body-small">{steps[step] ?? steps.at(-1)}</p>
    <div className="hoho-processing-state__bar" role="progressbar" aria-label="资料读取进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={progress ? `已读取${progress.completed}/${progress.total}类资料` : '正在处理'}><span data-indeterminate={value === undefined || undefined} style={value === undefined ? undefined : { width: `${value}%` }} /></div>
    {progress && <small className="hoho-text-caption">已读取 {progress.completed}/{progress.total} 类资料</small>}
    <ol className="hoho-processing-state__steps" aria-hidden="true">{steps.map((label, i) => <li key={label} data-state={i < step ? 'done' : i === step ? 'active' : 'pending'}>{i < step ? <Check size={16} /> : i === step ? <LoaderCircle size={16} /> : <span className="hoho-processing-state__dot" />}<span>{label}</span></li>)}</ol>
  </section>
}
