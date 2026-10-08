import { Navigate } from 'react-router-dom'

// Preserve saved links, while current explanations live in one help center.
export function UsageGuidePage() { return <Navigate to="/help?tab=manual" replace /> }
