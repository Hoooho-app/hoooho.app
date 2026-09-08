import { frontendBuild, readGuestDiagnostic } from '../../services/guestDiagnostics'

export function GuestDiagnosticBadge() {
  const id = readGuestDiagnostic()
  if (!id) return null
  return <aside className="fixed bottom-1 right-1 z-[100] max-w-[calc(100vw-8px)] rounded bg-black/80 px-2 py-1 font-mono text-[9px] leading-3 text-white" aria-label="游客诊断版本">
    诊断 {id.slice(0, 8)} · {frontendBuild.commit.slice(0, 8)} · {frontendBuild.authProtocolVersion}
  </aside>
}
