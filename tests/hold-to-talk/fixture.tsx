import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HoldToTalkButton } from '../../src/components/design-system/HoldToTalkButton'
import { DialogueComposer } from '../../src/components/design-system/DialogueComposer'
import '../../src/styles/index.css'
function Fixture() {
  const [state, setState] = useState('idle'), [counts, setCounts] = useState({ start: 0, stop: 0, discard: 0 }), [visible, setVisible] = useState(true)
  const generation = useRef(0)
  const start = () => { const version = ++generation.current; setCounts(c => ({ ...c, start: c.start + 1 })); setState('requesting'); setTimeout(() => { if (version === generation.current) setState(new URLSearchParams(location.search).has('denied') ? 'idle' : 'listening') }, 200) }
  const finish = (key: 'stop' | 'discard') => { ++generation.current; setCounts(c => ({ ...c, [key]: c[key] + 1 })); setState('idle') }
  const props = { onStart: start, onStop: () => finish('stop'), onDiscard: () => finish('discard'), listening: state === 'listening', requesting: state === 'requesting', audioLevel: .5 }
  return <main><output>{JSON.stringify(counts)}</output><button id="unmount" onClick={() => setVisible(false)}>卸载</button><div style={{ position: 'fixed', bottom: 24, left: 16, right: 16 }}>{visible && (new URLSearchParams(location.search).has('composer') ? <DialogueComposer {...props} text="" onTextChange={() => {}} onSend={() => {}} onPhoto={() => {}}/> : <HoldToTalkButton {...props} fullWidth/>)}</div></main>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>)
