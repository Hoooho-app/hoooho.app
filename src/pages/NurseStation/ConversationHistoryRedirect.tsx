import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'

/** Old bookmarks restore the same conversation in the home composer. */
export function ConversationHistoryRedirect() {
  const { contextId } = useParams(), [params] = useSearchParams(), location = useLocation()
  const next = new URLSearchParams()
  if (contextId) next.set('conversation', contextId)
  else if (params.get('draft')) next.set('draft', params.get('draft')!)
  return <Navigate to={'/nurse-station' + (next.size ? '?' + next : '')} state={location.state} replace />
}
