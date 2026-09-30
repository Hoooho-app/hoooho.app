import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { SleepEditor, type SleepDraft } from '../../src/pages/HealthEvents/SleepRecordFlow'
import { BottomSheetSurface } from '../../src/components/design-system'
import '../../src/styles/tokens.css'
import '../../src/styles/index.css'
const initial: SleepDraft = { sleepAt: '2026-09-30T13:00:00+08:00', wakeAt: '2026-09-30T14:30:00+08:00', kind: 'nap', status: 'completed', durationMinutes: 90, timeZone: 'Asia/Shanghai' }
function App() {
  const [saved, setSaved] = useState(initial); const [error, setError] = useState(''); const [open, setOpen] = useState(true)
  const automatic = new URLSearchParams(location.search).has('automatic')
  const editor = <SleepEditor initial={saved} automatic={automatic} saving={false} error={error} onSave={value => { if (sessionStorage.getItem('fail')) { setError('保存失败，请重试'); sessionStorage.removeItem('fail') } else { setSaved(value); setError(''); sessionStorage.setItem('saved', JSON.stringify(value)) } }} onSkip={automatic ? () => { sessionStorage.setItem('skipped','true'); setOpen(false) } : undefined} />
  return automatic ? <><button onClick={() => setOpen(true)}>重新打开</button><BottomSheetSurface open={open} title="记录睡眠" label="记录睡眠" className="sleep-editor-sheet" onClose={() => setOpen(false)}>{editor}</BottomSheetSurface></> : <section className="sleep-record-page"><header><button>返回</button><h1>记录睡眠</h1></header><div className="sleep-record-scroll">{editor}</div></section>
}
createRoot(document.getElementById('root')!).render(<App />)
